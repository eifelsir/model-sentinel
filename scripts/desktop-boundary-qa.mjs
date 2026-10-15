import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createMockServer } from './mock-server.mjs';

const profile = await mkdtemp(join(tmpdir(), 'model-sentinel-boundary-'));
const fixture = await createMockServer();
const fixtureB = await createMockServer();
const secret = 'boundary-secret-value';
let app;
const checks = [];
try {
  app = await electron.launch({ args: [resolve('.'), `--profile=${profile}`], timeout: 30000 });
  const page = await app.firstWindow();
  await page.waitForFunction(() => Boolean(window.sentinel));
  await page.evaluate(async ({ baseUrl, secret }) => {
    const { config } = await window.sentinel.getState();
    config.connections = [{ id: 'c', name: '边界验证', provider: 'custom', baseUrl, apiKey: secret, protocol: 'chat', models: [] }];
    config.prompts = [{ id: 'p', name: '原样提示词', prompt: '6*7?\n\nReturn the answer.', expected: '42', mode: 'auto', pattern: '' }];
    config.targets = [{ id: 't', connectionId: 'c', model: 'test-normal', protocol: 'chat', promptIds: ['p'], enabled: true, intervalMinutes: 30, timeoutSeconds: 180, maxOutputTokens: null, extraBody: {} }];
    await window.sentinel.saveConfig(config);
    const editing = await window.sentinel.getState();
    editing.config.connections[0].name = '已重命名';
    editing.config.connections[0].apiKey = '';
    await window.sentinel.saveConfig(editing.config);
    await window.sentinel.run();
  }, { baseUrl: fixture.baseUrl, secret });
  await expect.poll(async () => (await page.evaluate(() => window.sentinel.getState())).history[0]?.status).toBe('normal');
  expect(fixture.requests[0].authorization).toBe(`Bearer ${secret}`);
  expect(fixture.requests[0].body.messages[0].content).toBe('6*7?\n\nReturn the answer.');
  expect(JSON.stringify(fixture.requests[0].body)).not.toContain('expected');
  expect(JSON.stringify(await page.evaluate(() => window.sentinel.getState()))).not.toContain(secret);
  checks.push('editing saved connection preserves encrypted key, request prompt is unchanged, renderer cannot read key');
  const exportPath = join(profile, 'export.json');
  await app.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }); }, exportPath);
  await page.evaluate(() => window.sentinel.exportData());
  const exported = await readFile(exportPath, 'utf8');
  expect(exported).not.toContain(secret);
  expect(JSON.parse(exported).config.connections[0].apiKey).toBeUndefined();
  checks.push('export writes usable config/history without credentials');
  await page.evaluate(async baseUrl => {
    const { config } = await window.sentinel.getState();
    config.connections.push({ ...config.connections[0], id: 'c2', name: '第二个 URL', baseUrl, apiKey: '', protocol: 'responses' });
    config.targets.push({ ...config.targets[0], id: 't2', connectionId: 'c2', protocol: 'responses' });
    await window.sentinel.saveConfig(config);
    await window.sentinel.run();
  }, fixtureB.baseUrl);
  await expect.poll(async () => (await page.evaluate(() => window.sentinel.getState())).history.filter(r => r.completedAt).length).toBe(3);
  expect(fixtureB.requests).toHaveLength(1);
  const connections = (await page.evaluate(() => window.sentinel.getState())).history.slice(0, 2).map(r => r.connectionName).sort();
  expect(connections).toEqual(['已重命名', '第二个 URL'].sort());
  checks.push('same model across two Base URLs and protocols produces independent rounds');
  await page.evaluate(async () => {
    const { config } = await window.sentinel.getState();
    config.prompts.push({ id: 'p2', name: '并发保存题目', prompt: 'test', expected: '42', mode: 'auto', pattern: '' });
    await Promise.all([window.sentinel.saveConfig(config), window.sentinel.setFloatVisible(false)]);
  });
  const merged = await page.evaluate(() => window.sentinel.getState());
  expect(merged.config.prompts.map(p => p.id)).toContain('p2');
  expect(merged.config.settings.floatVisible).toBe(false);
  checks.push('simultaneous configuration save and floating toggle retain both changes');
  await writeFile('artifacts/boundary-results.json', JSON.stringify({ passed: true, checks, profile }, null, 2));
  console.log(JSON.stringify({ passed: true, checks }, null, 2));
} catch (error) {
  await writeFile('artifacts/boundary-results.json', JSON.stringify({ passed: false, checks, profile, error: error.stack }, null, 2));
  throw error;
} finally {
  if (app) await app.close();
  await fixture.close();
  await fixtureB.close();
}
