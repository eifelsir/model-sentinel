import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createMockServer } from './mock-server.mjs';
import { usageFixture, verifyUsage } from './usage-checks.mjs';

const profile = await mkdtemp(join(tmpdir(), 'model-sentinel-usage-'));
const fixture = await createMockServer({ usageForRequest: usageFixture });
const checks = [], errors = [];
let app;
try {
  await mkdir('artifacts/screenshots', { recursive: true });
  app = await electron.launch({ args: [resolve('.'), `--profile=${profile}`], timeout: 30000 });
  let page = await app.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  await expect(page.getByLabel('提示词', { exact: true })).toBeVisible();
  checks.push(...await verifyUsage(page, {
    baseUrl: fixture.baseUrl,
    getFloating: async () => app.windows().find(w => w.url().includes('view=float')),
    screenshotPrefix: resolve('artifacts/screenshots/token'),
  }));
  const before = await page.evaluate(() => window.sentinel.getState());
  await app.close(); app = null;
  const disk = await readFile(join(profile, 'state.json'), 'utf8');
  expect(disk).not.toContain('usage-fixture-private-key');
  app = await electron.launch({ args: [resolve('.'), `--profile=${profile}`], timeout: 30000 });
  page = await app.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  await expect(page.getByLabel('提示词', { exact: true })).toBeVisible();
  const after = await page.evaluate(() => window.sentinel.getState());
  expect(after.config).toEqual(before.config);
  expect(after.history).toEqual(before.history);
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await expect(page.getByTestId('token-summary')).toContainText('1,600');
  checks.push('graceful relaunch preserves Token history and identical summaries with encrypted keys');
  expect(errors).toEqual([]);
  await writeFile('artifacts/usage-results.json', JSON.stringify({ passed: true, profile, checks, errors }, null, 2));
  console.log(JSON.stringify({ passed: true, checks }, null, 2));
} catch (error) {
  await writeFile('artifacts/usage-results.json', JSON.stringify({ passed: false, profile, checks, errors, error: error.stack }, null, 2));
  throw error;
} finally {
  await app?.close();
  await fixture.close();
}
