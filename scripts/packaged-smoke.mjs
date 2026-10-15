import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { createMockServer } from './mock-server.mjs';

const executablePath = resolve(process.argv[2] || 'release/win-unpacked/Model Sentinel.exe');
const profile = await mkdtemp(join(tmpdir(), 'model-sentinel-package-'));
const fixture = await createMockServer();
await mkdir('artifacts/screenshots', { recursive: true });
let app;
try {
  app = await electron.launch({ executablePath, args: [`--profile=${profile}`], timeout: 45000 });
  const page = await app.firstWindow();
  await page.waitForFunction(() => Boolean(window.sentinel));
  await expect(page.getByLabel('提示词', { exact: true })).toBeVisible();
  const key = 'package-test-secret';
  await page.evaluate(async ({ baseUrl, key }) => {
    const { config } = await window.sentinel.getState();
    config.connections = [{ id: 'local', name: '打包验证', provider: 'custom', baseUrl, apiKey: key, protocol: 'responses', models: [] }];
    config.prompts = [{ id: 'p', name: '正则提取', prompt: '6*7?', expected: '42', mode: 'regex', pattern: '最终答案：(\\d+)' }];
    config.targets = [{ id: 't', connectionId: 'local', model: 'test-normal', protocol: 'responses', enabled: true, promptIds: ['p'], intervalMinutes: 30, timeoutSeconds: 180, maxOutputTokens: null, extraBody: {} }];
    await window.sentinel.saveConfig(config);
    await window.sentinel.run();
  }, { baseUrl: fixture.baseUrl, key });
  await expect.poll(async () => (await page.evaluate(() => window.sentinel.getState())).history[0]?.status, { timeout: 15000 }).toBe('normal');
  await page.evaluate(() => window.sentinel.expandFloat(true));
  const floating = app.windows().find(w => w !== page);
  await expect(floating.locator('[data-testid="float-expanded"]')).toBeVisible();
  await page.screenshot({ path: resolve('artifacts/screenshots/07-packaged-main.png') });
  await floating.screenshot({ path: resolve('artifacts/screenshots/08-packaged-float.png') });
  await page.evaluate(() => window.sentinel.setAuto(true));
  await expect.poll(async () => (await page.evaluate(() => window.sentinel.getState())).activeTargetIds.length).toBe(0);
  await app.close(); app = null;
  const data = await readFile(join(profile, 'state.json'), 'utf8');
  expect(data).not.toContain(key);
  expect(JSON.parse(data).config.settings.autoRun).toBe(true);
  await writeFile('artifacts/packaged-results.json', JSON.stringify({ passed: true, executablePath, profile, checks: ['packaged startup', 'real HTTP Responses', 'regex worker inside asar', 'floating expansion', 'safeStorage encryption', 'shutdown preserves auto preference'] }, null, 2));
  console.log('Packaged smoke verification passed.');
} finally {
  if (app) await app.close();
  await fixture.close();
}
