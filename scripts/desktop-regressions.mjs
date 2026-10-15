import { _electron as electron, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createMockServer } from './mock-server.mjs';

const selected = process.argv[2] || 'all';
const profile = await mkdtemp(join(tmpdir(), 'model-sentinel-regression-'));
const checks = [];
const wants = name => selected === 'all' || selected === name;
async function closeApp(app) {
  let timer;
  try {
    await Promise.race([
      app.close(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Desktop shutdown exceeded 8 seconds')), 8000);
      }),
    ]);
  } catch (error) {
    app.process().kill();
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
if (wants('startup')) {
  const dialogFile = join(profile, 'startup-dialog.json');
  const binary = createRequire(import.meta.url)('electron');
  const child = spawn(binary, ['-r', resolve('scripts/qa-startup-hook.cjs'), resolve('.'), `--profile=${profile}`], {
    env: { ...process.env, SENTINEL_QA_DIALOG: dialogFile },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let timer, output = '';
  child.stderr.on('data', chunk => { output += chunk.toString(); });
  child.stdout.on('data', chunk => { output += chunk.toString(); });
  try {
    const code = await Promise.race([
      new Promise((resolve, reject) => { child.once('exit', resolve); child.once('error', reject); }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Startup quit exceeded 8 seconds')), 8000); }),
    ]);
    expect(code, output).toBe(0);
    const dialog = await readFile(dialogFile, 'utf8').catch(error => {
      if (error.code === 'ENOENT') return '';
      throw error;
    });
    expect(dialog, 'Closing during startup must not open a blocking error dialog').toBe('');
    checks.push('quitting during floating startup suppresses late startup error dialog');
  } finally {
    clearTimeout(timer);
    if (child.exitCode === null) child.kill();
  }
}
if (['all', 'rotation', 'stop', 'navigation'].includes(selected)) {
  const fixture = await createMockServer();
  let app;
  try {
    app = await electron.launch({ args: [resolve('.'), `--profile=${profile}`], timeout: 30000 });
    const page = await app.firstWindow();
    await page.waitForFunction(() => Boolean(window.sentinel));
    await expect(page.getByLabel('提示词', { exact: true })).toBeVisible();
    await page.evaluate(async baseUrl => {
      const { config } = await window.sentinel.getState();
      config.connections = [{ id: 'c', name: '验证连接', provider: 'custom', baseUrl, apiKey: 'old-regression-credential', protocol: 'chat', models: [] }];
      config.prompts = [{ id: 'p', name: '验证题目', prompt: '6*7?', expected: '42', mode: 'auto', pattern: '' }];
      config.targets = [{ id: 't', connectionId: 'c', model: 'test-normal', protocol: 'chat', enabled: true, promptIds: ['p'], intervalMinutes: 30, timeoutSeconds: 180, maxOutputTokens: null, extraBody: {} }];
      config.settings.floatVisible = false;
      await window.sentinel.saveConfig(config);
    }, fixture.baseUrl);
    if (wants('rotation')) {
      await page.evaluate(async () => {
        const { config } = await window.sentinel.getState();
        config.targets[0].model = 'test-echo-key';
        await window.sentinel.saveConfig(config);
        await window.sentinel.run();
      });
      await expect.poll(async () => (await page.evaluate(() => window.sentinel.getState())).history[0]?.completedAt).toBeTruthy();
      expect(JSON.stringify(await page.evaluate(() => window.sentinel.getState()))).not.toContain('old-regression-credential');
      await page.evaluate(async () => {
        const { config } = await window.sentinel.getState();
        config.targets[0].model = 'test-slow-echo-key';
        await window.sentinel.saveConfig(config);
        await window.sentinel.run();
      });
      await expect.poll(() => fixture.requests.length).toBe(2);
      await page.evaluate(async () => {
        const { config } = await window.sentinel.getState();
        config.connections[0].apiKey = 'replacement-regression-credential';
        await window.sentinel.saveConfig(config);
      });
      await expect.poll(async () => (await page.evaluate(() => window.sentinel.getState())).activeTargetIds.length).toBe(0);
      const publicState = JSON.stringify(await page.evaluate(() => window.sentinel.getState()));
      expect(publicState).not.toContain('old-regression-credential');
      expect(publicState).not.toContain('replacement-regression-credential');
      await page.evaluate(async () => {
        const { config } = await window.sentinel.getState();
        config.connections = [];
        config.targets = [];
        await window.sentinel.saveConfig(config);
      });
      const disk = await readFile(join(profile, 'state.json'), 'utf8');
      expect(disk).not.toContain('old-regression-credential');
      expect(disk).not.toContain('replacement-regression-credential');
      checks.push('rotated and removed keys stay hidden in history, disk and late responses');
    }
    if (wants('stop')) {
      await page.evaluate(() => window.sentinel.setAuto(true));
      await app.evaluate(async () => {
        const fs = process.getBuiltinModule('node:fs/promises');
        const original = fs.rename;
        globalThis.__qaSaveBlocked = false;
        fs.rename = async (...args) => {
          if (String(args[1]).endsWith('state.json')) {
            fs.rename = original;
            process.getBuiltinModule('node:module').syncBuiltinESMExports();
            globalThis.__qaSaveBlocked = true;
            await new Promise(resolve => { globalThis.__qaReleaseSave = resolve; });
          }
          return original(...args);
        };
        process.getBuiltinModule('node:module').syncBuiltinESMExports();
      });
      const saving = page.evaluate(async () => {
        const { config } = await window.sentinel.getState();
        config.prompts[0].name = '保存期间停止';
        await window.sentinel.saveConfig(config);
      });
      await expect.poll(() => app.evaluate(() => Boolean(globalThis.__qaSaveBlocked))).toBe(true);
      const stopping = page.evaluate(() => window.sentinel.stop());
      await app.evaluate(() => globalThis.__qaReleaseSave());
      await Promise.all([saving, stopping]);
      expect((await page.evaluate(() => window.sentinel.getState())).config.settings.autoRun).toBe(false);
      checks.push('Stop All remains authoritative when a configuration write is pending');
    }
    if (wants('navigation')) {
      await page.getByRole('button', { name: '检测历史', exact: true }).click();
      await page.getByRole('button', { name: '连接与模型', exact: true }).click();
      await page.locator('.page-content').evaluate(element => { element.scrollTop = 300; });
      await page.getByRole('button', { name: '检测工作台', exact: true }).click();
      await expect.poll(() => page.locator('.page-content').evaluate(element => element.scrollTop)).toBe(0);
      await expect(page.getByRole('heading', { name: '检测工作台', exact: true })).toBeInViewport();
      checks.push('navigation restores the top of the destination page');
    }
  } finally {
    if (app) await closeApp(app);
    await fixture.close();
  }
}
await writeFile('artifacts/regression-results.json', JSON.stringify({ passed: true, checks, profile }, null, 2));
console.log(JSON.stringify({ passed: true, checks }, null, 2));
