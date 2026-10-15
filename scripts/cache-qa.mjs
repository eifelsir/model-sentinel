import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createMockServer } from './mock-server.mjs';
import { verifyCacheControls } from './cache-checks.mjs';

const profile = await mkdtemp(join(tmpdir(), 'model-sentinel-cache-'));
await mkdir('artifacts/screenshots', { recursive: true });
const fixture = await createMockServer();
const errors = [], checks = [];
let app;
try {
  app = await electron.launch({ args: [resolve('.'), `--profile=${profile}`], timeout: 30000 });
  let page = await app.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  await expect(page.getByLabel('提示词', { exact: true })).toBeVisible();
  checks.push(...await verifyCacheControls(page, {
    baseUrl: fixture.baseUrl, requests: fixture.requests, screenshot: resolve('artifacts/screenshots/cache-toggle.png'),
  }));
  const before = await page.evaluate(() => window.sentinel.getState());
  await app.close();
  app = await electron.launch({ args: [resolve('.'), `--profile=${profile}`], timeout: 30000 });
  page = await app.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  const control = page.getByRole('switch', { name: '绕过缓存', exact: true });
  await expect(control).toBeChecked();
  expect((await page.evaluate(() => window.sentinel.getState())).config).toEqual(before.config);
  const start = fixture.requests.length;
  await page.evaluate(() => window.sentinel.run());
  await expect.poll(async () => (await page.evaluate(() => window.sentinel.getState())).activeTargetIds.length, { timeout: 15000 }).toBe(0);
  expect(fixture.requests.slice(start)).toHaveLength(4);
  expect(fixture.requests.slice(start).every(request => request.cacheControl === 'no-cache, no-store')).toBe(true);
  checks.push('graceful restart retains the switch and uses bypass for the next round');
  expect(errors).toEqual([]);
  await writeFile('artifacts/cache-results.json', JSON.stringify({ passed: true, checks, profile, errors }, null, 2));
  console.log(JSON.stringify({ passed: true, checks }, null, 2));
} catch (error) {
  await writeFile('artifacts/cache-results.json', JSON.stringify({ passed: false, profile, errors, error: error.stack }, null, 2));
  throw error;
} finally {
  if (app) await app.close();
  await fixture.close();
}
