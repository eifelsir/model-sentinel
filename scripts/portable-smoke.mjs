import { chromium, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createMockServer } from './mock-server.mjs';
import { narrativeReply, verifyAnswerAndFloat } from './answer-float-checks.mjs';
import { htmlReply, verifyHtmlAndFloat } from './html-float-checks.mjs';
import { usageFixture, verifyUsage } from './usage-checks.mjs';

async function freePort() {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await new Promise(resolve => server.close(resolve));
  return port;
}
async function waitJSON(url, timeout = 45000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try { return await (await fetch(url, { signal: AbortSignal.timeout(1000) })).json(); }
    catch { await delay(200); }
  }
  throw new Error(`Portable application did not expose ${url}`);
}
async function quitThroughInspector(url) {
  const targets = await waitJSON(url, 5000);
  const ws = new WebSocket(targets[0].webSocketDebuggerUrl);
  let timer;
  try {
    await new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error('Portable inspector shutdown timed out')), 5000);
      ws.onopen = () => ws.send(JSON.stringify({
        id: 1,
        method: 'Runtime.evaluate',
        params: { expression: 'require("electron").app.quit()', includeCommandLineAPI: true },
      }));
      ws.onmessage = event => {
        const message = JSON.parse(event.data);
        if (message.id !== 1) return;
        if (message.error || message.result?.exceptionDetails) reject(new Error(JSON.stringify(message)));
        else resolve();
      };
      ws.onerror = reject;
    });
  } finally {
    clearTimeout(timer);
    ws.close();
  }
}

const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const executablePath = resolve(process.argv[2] || `release/Model-Sentinel-${version}-Windows-x64.exe`);
const profile = await mkdtemp(join(tmpdir(), 'model-sentinel-portable-'));
const port = await freePort(), inspectorPort = await freePort();
const fixture = await createMockServer({ textForRequest: input => htmlReply(input) ?? narrativeReply(input), usageForRequest: usageFixture });
const checks = [], errors = [];
let child, exited, browser, passed = false;
function launch() {
  child = spawn(executablePath, [`--remote-debugging-port=${port}`, `--inspect=${inspectorPort}`, `--profile=${profile}`], { windowsHide: true, stdio: 'ignore' });
  exited = new Promise((resolve, reject) => { child.once('exit', code => resolve(code)); child.once('error', reject); });
}
async function shutdown() {
  await quitThroughInspector(`http://127.0.0.1:${inspectorPort}/json/list`);
  let timer;
  const code = await Promise.race([
    exited,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Portable launcher did not exit')), 15000); }),
  ]).finally(() => clearTimeout(timer));
  expect(code).toBe(0);
  await browser?.close().catch(() => {});
  browser = null;
}
launch();
try {
  await waitJSON(`http://127.0.0.1:${port}/json/version`);
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const context = browser.contexts()[0];
  await expect.poll(() => context.pages().find(page => page.url().includes('index.html') && !page.url().includes('view=float'))?.url()).toBeTruthy();
  const page = context.pages().find(page => !page.url().includes('view=float'));
  page.on('pageerror', error => errors.push(error.message));
  await expect(page.getByLabel('提示词', { exact: true })).toBeVisible();
  await expect(page.getByLabel('固定答案', { exact: true })).toBeVisible();
  expect((await page.evaluate(() => window.sentinel.getState())).appInfo.version).toBe(version);
  checks.push('exact portable executable extracts and opens a clean configuration');
  await mkdir('artifacts/screenshots', { recursive: true });
  checks.push(...await verifyUsage(page, {
    baseUrl: fixture.baseUrl,
    getFloating: async () => context.pages().find(w => w.url().includes('view=float')),
    screenshotPrefix: resolve('artifacts/screenshots/portable-token'),
  }));
  await page.evaluate(() => window.sentinel.expandFloat(false));
  await page.getByRole('button', { name: '检测工作台', exact: true }).click();
  const key = 'portable-fixture-secret';
  const requestsBefore = fixture.requests.length;
  await page.evaluate(async ({ baseUrl, key }) => {
    const { config } = await window.sentinel.getState();
    config.connections = [{ id: 'local', name: '便携版验证', provider: 'custom', baseUrl, apiKey: key, protocol: 'responses', models: [] }];
    config.prompts = [
      { id: 'auto', name: '自动提取', prompt: '6*7?', expected: '42', mode: 'auto', pattern: '' },
      { id: 'regex', name: '正则提取', prompt: '6*7?', expected: '42', mode: 'regex', pattern: '最终答案：(\\d+)' },
    ];
    config.targets = ['responses', 'chat', 'gemini', 'anthropic'].map(protocol => ({
      id: protocol, connectionId: 'local', model: 'test-normal', protocol, enabled: true,
      promptIds: ['auto', 'regex'], intervalMinutes: 30, timeoutSeconds: 180, maxOutputTokens: null, extraBody: {},
    }));
    await window.sentinel.saveConfig(config);
    await window.sentinel.run();
  }, { baseUrl: fixture.baseUrl, key });
  const baseTargetIds = ['responses', 'chat', 'gemini', 'anthropic'];
  await expect.poll(async () => (await page.evaluate(() => window.sentinel.getState())).history.filter(round => baseTargetIds.includes(round.targetId) && round.completedAt && round.status === 'normal').length, { timeout: 20000 }).toBe(4);
  expect(fixture.requests.length - requestsBefore).toBe(8);
  expect(JSON.stringify(await page.evaluate(() => window.sentinel.getState()))).not.toContain(key);
  checks.push('all four protocols and two prompts pass through the actual packaged HTTP and regex worker');
  const floating = context.pages().find(page => page.url().includes('view=float'));
  await expect(floating.locator('[data-testid="float-compact"]')).toBeVisible();
  await floating.getByRole('button', { name: '展开悬浮窗', exact: true }).click();
  await expect(floating.locator('[data-testid="float-expanded"]')).toBeVisible();
  await expect(floating.locator('.float-model-row')).toHaveCount(4);
  await page.screenshot({ path: resolve('artifacts/screenshots/09-portable-main.png') });
  await floating.screenshot({ path: resolve('artifacts/screenshots/10-portable-float.png') });
  await floating.getByRole('button', { name: '收起悬浮窗', exact: true }).click();
  await expect(floating.locator('[data-testid="float-compact"]')).toBeVisible();
  checks.push('native compact/expanded floating window shows all four target histories');
  await page.evaluate(() => window.sentinel.setAuto(true));
  await expect.poll(async () => (await page.evaluate(() => window.sentinel.getState())).history.filter(round => baseTargetIds.includes(round.targetId) && round.completedAt).length, { timeout: 20000 }).toBe(8);
  checks.push('automatic detection starts an immediate additional round');
  checks.push(...await verifyAnswerAndFloat(page, {
    baseUrl: fixture.baseUrl,
    getFloating: async () => floating,
    screenshots: {
      compact: resolve('artifacts/screenshots/14-portable-fixed-compact.png'),
      expanded: resolve('artifacts/screenshots/15-portable-fixed-expanded.png'),
      many: resolve('artifacts/screenshots/16-portable-fixed-many.png'),
    },
  }));
  checks.push(...await verifyHtmlAndFloat(page, {
    baseUrl: fixture.baseUrl,
    requests: fixture.requests,
    getFloating: async () => floating,
    screenshotPrefix: resolve('artifacts/screenshots/portable-html'),
  }));
  const beforeRestart = await page.evaluate(() => window.sentinel.getState());
  await shutdown();
  const disk = await readFile(join(profile, 'state.json'), 'utf8');
  expect(disk).not.toContain(key);
  expect(disk).not.toContain('html-fixture-private-key');
  expect(JSON.parse(disk).config.targets[0].reasoningEffort).toBe('high');
  checks.push('graceful portable shutdown preserves encrypted credentials, reasoning, HTML and Token records');
  launch();
  await waitJSON(`http://127.0.0.1:${port}/json/version`);
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const restartedContext = browser.contexts()[0];
  await expect.poll(() => restartedContext.pages().some(w => w.url().includes('index.html') && !w.url().includes('view=float'))).toBe(true);
  const restartedPage = restartedContext.pages().find(w => !w.url().includes('view=float'));
  restartedPage.on('pageerror', error => errors.push(error.message));
  await expect(restartedPage.getByLabel('提示词', { exact: true })).toHaveValue('candy-fixture');
  const afterRestart = await restartedPage.evaluate(() => window.sentinel.getState());
  expect(afterRestart.config).toEqual(beforeRestart.config);
  expect(afterRestart.history).toEqual(beforeRestart.history);
  await restartedPage.evaluate(() => window.sentinel.run(['text-html']));
  await expect.poll(async () => (await restartedPage.evaluate(() => window.sentinel.getState())).activeTargetIds.length, { timeout: 20000 }).toBe(0);
  expect(fixture.requests.at(-1).authorization).toBe('Bearer html-fixture-private-key');
  expect(fixture.requests.at(-1).body.reasoning).toEqual({ effort: 'high' });
  expect((await restartedPage.evaluate(() => window.sentinel.getState())).history[0].status).toBe('normal');
  await shutdown();
  checks.push('exact portable relaunch retains identical models/questions/assignments/history and can reuse encrypted key');
  expect(errors).toEqual([]);
  passed = true;
  await writeFile('artifacts/portable-results.json', JSON.stringify({ passed, executablePath, profile, checks, errors }, null, 2));
  console.log(JSON.stringify({ passed, checks }, null, 2));
} catch (error) {
  await writeFile('artifacts/portable-results.json', JSON.stringify({ passed: false, executablePath, profile, checks, errors, error: error.stack }, null, 2));
  throw error;
} finally {
  if (!passed && child?.exitCode === null) {
    await quitThroughInspector(`http://127.0.0.1:${inspectorPort}/json/list`).catch(() => {});
    if (child.exitCode === null) child.kill();
  }
  await browser?.close().catch(() => {});
  await fixture.close();
}
