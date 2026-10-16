const { BrowserWindow, protocol, session } = require('electron');
const { createHash } = require('node:crypto');

const scheme = 'sentinel-preview';
const csp = "sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'";

protocol.registerSchemesAsPrivileged([{ scheme, privileges: { standard: true, secure: true } }]);

function parseAddress(address) {
  try {
    const url = new URL(address);
    if (url.protocol !== `${scheme}:` || url.host !== 'artifact' || url.username || url.password || url.search) return null;
    const match = /^\/([^/]{1,600})\/(\d{1,3})$/.exec(url.pathname);
    return match ? { roundId: decodeURIComponent(match[1]), index: Number(match[2]) } : null;
  } catch { return null; }
}
function previewAddress(roundId, index) { return `${scheme}://artifact/${encodeURIComponent(roundId)}/${index}`; }

function protectSession(ses, thumbnails = false) {
  ses.setPermissionCheckHandler(() => false);
  ses.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  ses.on('will-download', event => event.preventDefault());
  ses.webRequest.onBeforeRequest((details, callback) => {
    const preview = details.url.startsWith(`${scheme}:`);
    const allowed = thumbnails
      ? preview || /^(?:data:|blob:|about:blank)/.test(details.url)
      : preview || /^(?:file:|data:|blob:|about:blank)/.test(details.url);
    callback({ cancel: !allowed });
  });
}

class HtmlPreview {
  constructor(getHtml) {
    this.getHtml = getHtml;
    this.queue = Promise.resolve();
    this.waiting = new Map();
    this.cache = new Map();
    this.windows = new Set();
    this.viewers = new Map();
    this.closed = false;
    this.captureSession = session.fromPartition('sentinel-thumbnails');
    for (const ses of [session.defaultSession, this.captureSession]) {
      protectSession(ses, ses === this.captureSession);
      ses.protocol.handle(scheme, request => {
        const identity = request.method === 'GET' ? parseAddress(request.url) : null;
        const html = identity && this.artifact(identity.roundId, identity.index);
        return new Response(html || 'HTML unavailable', {
          status: html ? 200 : 404,
          headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': csp, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' },
        });
      });
    }
  }
  artifact(roundId, index) {
    if (typeof roundId !== 'string' || roundId.length > 200 || !Number.isInteger(index) || index < 0 || index > 999) return '';
    const html = this.getHtml(roundId, index);
    return typeof html === 'string' && html.length <= 262144 ? html : '';
  }
  thumbnail(roundId, index) {
    const html = this.artifact(roundId, index);
    if (!html || this.closed) return Promise.resolve('');
    const key = createHash('sha256').update(html).digest('hex');
    if (this.cache.has(key)) return Promise.resolve(this.cache.get(key));
    if (this.waiting.has(key)) return this.waiting.get(key);
    if (this.waiting.size >= 64) return Promise.resolve('');
    const job = this.queue.then(async () => {
      if (this.closed) return '';
      const image = await this.capture(previewAddress(roundId, index));
      if (image) {
        this.cache.set(key, image);
        if (this.cache.size > 128) this.cache.delete(this.cache.keys().next().value);
      }
      return image;
    }).catch(() => '').finally(() => this.waiting.delete(key));
    this.waiting.set(key, job);
    this.queue = job;
    return job;
  }
  async capture(address) {
    const win = new BrowserWindow({
      width: 960, height: 600, useContentSize: true, show: false, skipTaskbar: true,
      webPreferences: { session: this.captureSession, sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, offscreen: true },
    });
    this.windows.add(win);
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', event => event.preventDefault());
    win.webContents.on('will-frame-navigate', event => event.preventDefault());
    let timer, paintTimer;
    try {
      return await Promise.race([
        (async () => {
          await win.loadURL(address);
          await new Promise(resolve => { paintTimer = setTimeout(resolve, 280); });
          if (win.isDestroyed()) return '';
          const image = await win.webContents.capturePage(undefined, { stayHidden: true });
          return image.isEmpty() ? '' : image.resize({ width: 192, height: 120 }).toDataURL();
        })(),
        new Promise(resolve => { timer = setTimeout(() => resolve(''), 5000); }),
      ]);
    } finally {
      clearTimeout(timer); clearTimeout(paintTimer);
      this.windows.delete(win);
      if (!win.isDestroyed()) win.destroy();
    }
  }
  async open(roundId, index, title) {
    if (this.closed || !this.artifact(roundId, index)) throw new Error('HTML unavailable');
    const address = previewAddress(roundId, index);
    const prior = this.viewers.get(address);
    if (prior && !prior.isDestroyed()) {
      if (prior.isMinimized()) prior.restore();
      prior.show(); prior.focus();
      return true;
    }
    if (this.viewers.size >= 8) this.viewers.values().next().value.close();
    const win = new BrowserWindow({
      width: 960, height: 680, minWidth: 400, minHeight: 300, show: false,
      title, autoHideMenuBar: true,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
    });
    this.viewers.set(address, win);
    win.on('closed', () => this.viewers.delete(address));
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', event => event.preventDefault());
    win.webContents.on('will-frame-navigate', event => event.preventDefault());
    try {
      await win.loadURL(address);
      if (!win.isDestroyed()) { win.setTitle(title); win.show(); }
      return true;
    } catch (error) {
      if (!win.isDestroyed()) win.destroy();
      throw error;
    }
  }
  close() {
    this.closed = true;
    for (const win of this.windows) if (!win.isDestroyed()) win.destroy();
    this.windows.clear();
    for (const win of this.viewers.values()) if (!win.isDestroyed()) win.destroy();
    this.viewers.clear();
    this.cache.clear();
  }
}

module.exports = { HtmlPreview, parseAddress };
