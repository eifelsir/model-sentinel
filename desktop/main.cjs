const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, safeStorage, screen, dialog } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { HtmlPreview, parseAddress } = require('./html-preview.cjs');
const { monitorBounds, snapPlacement } = require('./float-layout.cjs');

const root = path.join(__dirname, '..');
const profileArg = process.argv.find(a => a.startsWith('--profile='));
app.setName('Model Sentinel');
app.setPath('userData', profileArg ? path.resolve(profileArg.slice('--profile='.length)) : path.join(app.getPath('appData'), 'Model Sentinel'));
let mainWindow, floatWindow, tray, engine, store, htmlPreview, quitting = false, exitReady = false;
let expanded = false, placement = {}, savePlacementTimer, stateError = '', selectedRoundId = null, selectedRoundNonce = 0;
let configQueue = Promise.resolve();
const knownSecrets = new Set();
const iconPath = path.join(root, 'assets', 'app.png');

function secretsFor(config = engine?.config) {
  for (const connection of config?.connections || []) if (connection.apiKey) knownSecrets.add(connection.apiKey);
  return [...knownSecrets].sort((a, b) => b.length - a.length);
}
function redact(value, secrets) {
  if (typeof value === 'string') return secrets.reduce((s, key) => s.split(key).join('[已隐藏]'), value);
  if (Array.isArray(value)) return value.map(v => redact(v, secrets));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, /api.?key|authorization|secret|password/i.test(key) ? '[已隐藏]' : redact(v, secrets)]));
  return value;
}
function snapshot() {
  const state = engine.snapshot();
  const secrets = secretsFor(state.config);
  state.config.connections = state.config.connections.map(({ apiKey, ...connection }) => ({ ...connection, hasKey: Boolean(apiKey) }));
  state.history = redact(state.history, secrets);
  for (const target of state.config.targets) target.extraBody = redact(target.extraBody, secrets);
  return { ...state, error: stateError, floatExpanded: expanded, selectedRoundId, selectedRoundNonce, appInfo: { version: app.getVersion(), dataDirectory: app.getPath('userData') } };
}
function broadcast() {
  if (!engine) return;
  const state = snapshot();
  if (floatWindow && !floatWindow.isDestroyed()) {
    const bounds = floatWindow.getContentBounds(), desired = floatBounds(expanded);
    if (bounds.width !== desired.width || bounds.height !== desired.height) floatWindow.setContentBounds(desired);
  }
  for (const win of [mainWindow, floatWindow]) if (win && !win.isDestroyed()) win.webContents.send('sentinel:state', state);
  updateTray();
}
function errorText(error) {
  const raw = String(error?.message || '');
  const translations = {
    'Invalid connection URL': 'Base URL 无效，请填写完整的 http 或 https 地址。',
    'Invalid API key': 'KEY 格式无效。',
    'Invalid target prompts': '模型关联的题目不存在，请重新选择。',
    'API request failed': '连接失败，请检查地址、网络和协议。',
    'Request timed out': '请求超时。',
    'Request cancelled': '请求已停止。',
    'Unsupported reasoning setting for this model/protocol; choose service default or a supported level': '该模型或协议不支持所选推理强度，请选择“由服务决定”或可用档位。',
  };
  if (translations[raw]) return translations[raw];
  if (/^HTTP \d{3}$/.test(raw)) return `服务返回 ${raw}，请检查 KEY、地址及访问权限。`;
  if (raw.startsWith('Invalid ') || raw.startsWith('Duplicate ') || raw.startsWith('Target ')) return `配置无效：${raw}`;
  if (raw.startsWith('Unable to') || raw.includes('Storage') || raw.includes('storage')) return '本地数据读写失败，原文件已保留。请检查磁盘权限和可用空间。';
  return redact(raw || '操作失败，请重试。', secretsFor());
}
function protect(win) {
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.webContents.on('will-frame-navigate', event => {
    if (event.isMainFrame || !parseAddress(event.url) || event.initiator?.url?.startsWith('sentinel-preview:')) event.preventDefault();
  });
  win.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
}
function options() {
  return { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false };
}
async function showMain(roundId) {
  if (quitting) return;
  if (roundId && typeof roundId === 'string') { selectedRoundId = roundId; selectedRoundNonce++; }
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = new BrowserWindow({ width: 1180, height: 800, minWidth: 860, minHeight: 620, title: '模型检测', icon: iconPath, backgroundColor: '#f7f9f8', show: false, autoHideMenuBar: true, webPreferences: options() });
    mainWindow.setMenu(null);
    protect(mainWindow);
    mainWindow.on('close', event => { if (!quitting) { event.preventDefault(); mainWindow.hide(); } });
    await mainWindow.loadFile(path.join(root, 'dist', 'index.html'));
  }
  if (quitting || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show(); mainWindow.focus(); broadcast();
}
function floatBounds(big) {
  const display = Number.isFinite(placement.x) && Number.isFinite(placement.y) ? screen.getDisplayNearestPoint({ x: placement.x, y: placement.y }) : screen.getPrimaryDisplay();
  return monitorBounds(display.workArea, placement, engine?.config.targets.length || 0, big);
}
function rememberFloat() {
  clearTimeout(savePlacementTimer);
  savePlacementTimer = setTimeout(() => {
    if (!expanded && floatWindow && !floatWindow.isDestroyed()) {
      const bounds = floatWindow.getBounds();
      const area = screen.getDisplayMatching(bounds).workArea;
      const snapped = snapPlacement(bounds, area);
      placement = { ...placement, ...snapped };
      if (snapped.x !== bounds.x || snapped.y !== bounds.y) floatWindow.setPosition(snapped.x, snapped.y);
    }
    void writePlacement();
  }, 200);
}
async function writePlacement() {
  try {
    const file = path.join(app.getPath('userData'), 'window.json');
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(`${file}.tmp`, JSON.stringify(placement));
    await fs.rename(`${file}.tmp`, file);
  } catch { /* Window placement is optional; configuration is persisted separately. */ }
}
async function showFloat(visible) {
  if (quitting) return;
  if (!visible) { floatWindow?.hide(); return; }
  if (!floatWindow || floatWindow.isDestroyed()) {
    floatWindow = new BrowserWindow({ ...floatBounds(expanded), useContentSize: true, frame: false, resizable: false, maximizable: false, minimizable: false, skipTaskbar: true, alwaysOnTop: true, backgroundColor: '#ffffff', show: false, icon: iconPath, title: '模型检测 · 悬浮窗', webPreferences: options() });
    protect(floatWindow);
    floatWindow.on('move', () => {
      if (!expanded && floatWindow && !floatWindow.isDestroyed()) {
        const bounds = floatWindow.getBounds(); placement = { ...placement, x: bounds.x, y: bounds.y };
        rememberFloat();
      }
    });
    floatWindow.on('resize', () => {
      if (!expanded || !floatWindow || floatWindow.isDestroyed()) return;
      const { width, height } = floatWindow.getContentBounds();
      placement = { ...placement, detailWidth: width, detailHeight: height };
      rememberFloat();
    });
    floatWindow.on('close', event => { if (!quitting) { event.preventDefault(); void changeFloat(false); } });
    await floatWindow.loadFile(path.join(root, 'dist', 'index.html'), { query: { view: 'float' } });
  }
  if (quitting || floatWindow.isDestroyed()) return;
  floatWindow.showInactive(); broadcast();
}
async function expandFloat(value) {
  if (quitting) return;
  if (typeof value !== 'boolean') throw new Error('Invalid floating window state');
  if (!floatWindow || floatWindow.isDestroyed()) await showFloat(true);
  if (!expanded) { const { x, y } = floatWindow.getBounds(); placement = { ...placement, x, y }; }
  const bounds = floatBounds(value);
  expanded = value;
  if (!expanded) floatWindow.setMinimumSize(0, 0);
  floatWindow.setContentBounds(bounds);
  if (expanded) floatWindow.setMinimumSize(Math.min(360, bounds.width), Math.min(320, bounds.height));
  floatWindow.setResizable(expanded);
  broadcast();
}
function queueConfig(work) {
  const result = configQueue.then(work);
  configQueue = result.catch(() => {});
  return result;
}
async function saveConfig(input) {
  return queueConfig(() => commitConfig(input));
}
async function commitConfig(input) {
    const { validateConfig } = await import(pathToFileURL(path.join(root, 'core', 'config.mjs')).href);
    if (JSON.stringify(input).length > 2_000_000) throw new Error('配置过大。');
    const config = structuredClone(input);
    for (const c of config.connections || []) {
      const prior = engine.config.connections.find(old => old.id === c.id);
      if (!c.apiKey) c.apiKey = prior?.apiKey || '';
      delete c.hasKey;
    }
    const valid = validateConfig(config);
    if (valid.connections.some(c => c.apiKey) && !safeStorage.isEncryptionAvailable()) throw new Error('Windows 密钥加密不可用，未保存 KEY。');
    const autoChanged = valid.settings.autoRun !== engine.config.settings.autoRun;
    const loginChanged = valid.settings.launchAtLogin !== engine.config.settings.launchAtLogin;
    const secrets = secretsFor(valid);
    await store.save(valid, redact(engine.history, secrets));
    engine.updateConfig(valid);
    if (autoChanged && valid.settings.autoRun) void engine.run().catch(fail);
    if (loginChanged && !profileArg) app.setLoginItemSettings({ openAtLogin: valid.settings.launchAtLogin, path: process.env.PORTABLE_EXECUTABLE_FILE || app.getPath('exe'), args: ['--hidden'] });
    await showFloat(valid.settings.floatVisible);
    stateError = ''; broadcast(); return snapshot();
}
function fail(error) { stateError = errorText(error); broadcast(); }
async function changeFloat(visible) {
  return queueConfig(async () => {
    const config = structuredClone(engine.config); config.settings.floatVisible = Boolean(visible);
    return commitConfig(config);
  });
}
async function changeAuto(enabled) {
  return queueConfig(async () => { engine.setAuto(Boolean(enabled)); await engine.persistence; broadcast(); return snapshot(); });
}
function updateTray() {
  if (!tray || !engine) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开模型检测', click: () => void showMain() },
    { label: '立即检测', click: () => void engine.run().catch(fail) },
    { label: '自动检测', type: 'checkbox', checked: engine.config.settings.autoRun, click: item => void changeAuto(item.checked).catch(fail) },
    { label: '显示悬浮窗', type: 'checkbox', checked: engine.config.settings.floatVisible, click: item => void changeFloat(item.checked).catch(fail) },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() },
  ]));
}
function registerIpc() {
  const handle = (name, fn) => ipcMain.handle(`sentinel:${name}`, async (event, ...args) => {
    try {
      if (![mainWindow, floatWindow].some(win => win && !win.isDestroyed() && win.webContents === event.sender && event.senderFrame === win.webContents.mainFrame)) throw new Error('请求来源无效。');
      return { ok: true, value: await fn(...args) };
    } catch (error) { return { ok: false, error: errorText(error) }; }
  });
  handle('getState', () => snapshot());
  handle('saveConfig', saveConfig);
  handle('listModels', async connection => {
    const c = structuredClone(connection);
    if (!c.apiKey) c.apiKey = engine.config.connections.find(old => old.id === c.id)?.apiKey || '';
    const secrets = secretsFor({ connections: [c] });
    const { listModels } = await import(pathToFileURL(path.join(root, 'core', 'api.mjs')).href);
    return redact(await listModels(c), secrets);
  });
  handle('run', ids => {
    if (ids !== undefined && (!Array.isArray(ids) || !ids.every(id => typeof id === 'string'))) throw new Error('模型选择无效。');
    void engine.run(ids).catch(fail); return snapshot();
  });
  handle('stop', id => {
    if (id !== undefined && typeof id !== 'string') throw new Error('模型选择无效。');
    return queueConfig(async () => { engine.stop(id); await engine.persistence; broadcast(); return snapshot(); });
  });
  handle('setAuto', changeAuto);
  handle('setFloatVisible', changeFloat);
  handle('expandFloat', expandFloat);
  handle('openMain', showMain);
  handle('exportData', async () => {
    const result = await dialog.showSaveDialog(mainWindow, { title: '导出检测数据', defaultPath: '模型检测数据.json', filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (result.canceled || !result.filePath) return false;
    const state = snapshot();
    const config = redact(state.config, secretsFor());
    for (const c of config.connections) { delete c.hasKey; delete c.apiKey; c.baseUrl = c.baseUrl.split('?')[0]; }
    await fs.writeFile(result.filePath, JSON.stringify({ exportedAt: new Date().toISOString(), config, history: state.history }, null, 2));
    return true;
  });
  handle('htmlThumbnail', (roundId, index) => htmlPreview.thumbnail(roundId, index));
  handle('openHtml', (roundId, index) => {
    const round = engine.history.find(round => round.id === roundId);
    const result = Number.isInteger(index) && round?.results[index];
    if (!result || result.type !== 'html' || result.status !== 'generated') throw new Error('HTML 页面不可用。');
    return htmlPreview.open(roundId, index, `${round.connectionName} · ${round.model} · ${result.promptName}`);
  });
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => void showMain());
  app.on('window-all-closed', () => {});
  app.on('before-quit', event => {
    if (exitReady) return;
    event.preventDefault();
    if (quitting) return;
    quitting = true;
    void (async () => {
      clearTimeout(savePlacementTimer);
      htmlPreview?.close();
      await configQueue;
      await engine?.close();
      await store?.pending;
      await writePlacement();
      tray?.destroy(); exitReady = true; app.quit();
    })().catch(() => { exitReady = true; app.quit(); });
  });
  app.whenReady().then(async () => {
    if (quitting) return;
    const [{ Engine }, { Store }, { includeBuiltinPrompts }] = await Promise.all([
      import(pathToFileURL(path.join(root, 'core', 'engine.mjs')).href),
      import(pathToFileURL(path.join(root, 'core', 'store.mjs')).href),
      import(pathToFileURL(path.join(root, 'core', 'builtins.mjs')).href),
    ]);
    if (quitting) return;
    store = new Store(app.getPath('userData'), {
      encrypt: text => { if (!safeStorage.isEncryptionAvailable()) throw new Error('密钥加密不可用。'); return safeStorage.encryptString(text).toString('base64'); },
      decrypt: text => { if (!safeStorage.isEncryptionAvailable()) throw new Error('密钥解密不可用。'); return safeStorage.decryptString(Buffer.from(text, 'base64')); },
    });
    const data = await store.load();
    const withBuiltins = includeBuiltinPrompts(data.config);
    if (withBuiltins !== data.config) { await store.save(withBuiltins, data.history); data.config = withBuiltins; }
    if (quitting) return;
    try {
      const saved = JSON.parse(await fs.readFile(path.join(app.getPath('userData'), 'window.json'), 'utf8'));
      if (Number.isFinite(saved.x) && Number.isFinite(saved.y)) placement = { x: saved.x, y: saved.y };
      for (const key of ['detailWidth', 'detailHeight']) if (Number.isFinite(saved[key]) && saved[key] > 0) placement[key] = saved[key];
    } catch {}
    if (quitting) return;
    secretsFor(data.config);
    engine = new Engine({ ...data, persist: (config, history) => store.save(config, redact(history, secretsFor(config))) });
    htmlPreview = new HtmlPreview((roundId, index) => {
      const result = engine.history.find(round => round.id === roundId)?.results[index];
      return result?.type === 'html' && result.status === 'generated' ? redact(result.html || '', secretsFor()) : '';
    });
    engine.on('change', broadcast); engine.on('persistenceError', fail);
    registerIpc();
    tray = new Tray(nativeImage.createFromPath(iconPath).resize({ width: 20, height: 20 }));
    tray.setToolTip('模型检测'); tray.on('double-click', () => void showMain()); updateTray();
    if (!process.argv.includes('--hidden')) await showMain();
    if (quitting) return;
    await showFloat(engine.config.settings.floatVisible);
    if (quitting) return;
    screen.on('display-metrics-changed', () => { if (floatWindow && !floatWindow.isDestroyed()) floatWindow.setContentBounds(floatBounds(expanded)); });
    screen.on('display-removed', () => { if (floatWindow && !floatWindow.isDestroyed()) floatWindow.setContentBounds(floatBounds(expanded)); });
  }).catch(error => { if (!quitting) { dialog.showErrorBox('模型检测无法启动', errorText(error)); app.quit(); } });
}
