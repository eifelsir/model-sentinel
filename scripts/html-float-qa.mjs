import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createMockServer } from './mock-server.mjs';
import { htmlReply, verifyHtmlAndFloat } from './html-float-checks.mjs';

const profile = await mkdtemp(join(tmpdir(), 'model-sentinel-html-'));
const fixture = await createMockServer({ textForRequest: htmlReply });
const checks = [], errors = [];
let app;
const launch = async () => {
  app = await electron.launch({ args: [resolve('.'), `--profile=${profile}`], timeout: 30000 });
  const page = await app.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  await expect(page.getByLabel('提示词', { exact: true })).toBeVisible();
  return page;
};
try {
  await mkdir('artifacts/screenshots', { recursive: true });
  let page = await launch();
  checks.push(...await verifyHtmlAndFloat(page, {
    baseUrl: fixture.baseUrl,
    requests: fixture.requests,
    getFloating: async () => app.windows().find(w => w.url().includes('view=float')),
    screenshotPrefix: resolve('artifacts/screenshots/html'),
  }));
  const before = await page.evaluate(() => window.sentinel.getState());
  await app.close(); app = null;
  const serialized = await readFile(join(profile, 'state.json'), 'utf8');
  expect(serialized).not.toContain('html-fixture-private-key');
  expect(JSON.parse(serialized).config.targets[0].reasoningEffort).toBe('high');
  page = await launch();
  const after = await page.evaluate(() => window.sentinel.getState());
  expect(after.config).toEqual(before.config);
  expect(after.history).toEqual(before.history);
  expect(after.appInfo.dataDirectory).toBe(profile);
  await expect(page.getByLabel('提示词', { exact: true })).toHaveValue('candy-fixture');
  await page.evaluate(() => window.sentinel.run(['text-html']));
  await expect.poll(async () => (await page.evaluate(() => window.sentinel.getState())).activeTargetIds.length).toBe(0);
  expect(fixture.requests.at(-1).authorization).toBe('Bearer html-fixture-private-key');
  checks.push('graceful desktop relaunch retains all configuration, assignments, reasoning, encrypted key and HTML history');
  expect(errors).toEqual([]);
  await writeFile('artifacts/html-float-results.json', JSON.stringify({ passed: true, profile, checks, errors }, null, 2));
  console.log(JSON.stringify({ passed: true, checks }, null, 2));
} catch (error) {
  await writeFile('artifacts/html-float-results.json', JSON.stringify({ passed: false, profile, checks, errors, error: error.stack }, null, 2));
  throw error;
} finally {
  await app?.close();
  await fixture.close();
}
