import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createMockServer } from './mock-server.mjs';
import { judgementFixture, verifyJudgement } from './judgement-checks.mjs';

const profile = await mkdtemp(join(tmpdir(), 'model-sentinel-judgement-'));
const gate = judgementFixture();
const fixture = await createMockServer(gate);
const checks = [], errors = [];
let app;
try {
  await mkdir('artifacts/screenshots', { recursive: true });
  app = await electron.launch({ args: [resolve('.'), `--profile=${profile}`], timeout: 30000 });
  let page = await app.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  await expect(page.getByLabel('提示词', { exact: true })).toBeVisible();
  checks.push(...await verifyJudgement(page, {
    baseUrl: fixture.baseUrl, gate,
    getFloating: async () => app.windows().find(w => w.url().includes('view=float')),
    screenshotPrefix: resolve('artifacts/screenshots/judgement'),
  }));
  const before = await page.evaluate(() => window.sentinel.getState());
  await app.close(); app = null;
  expect(await readFile(join(profile, 'state.json'), 'utf8')).not.toContain('judgement-test-key');
  app = await electron.launch({ args: [resolve('.'), `--profile=${profile}`], timeout: 30000 });
  page = await app.firstWindow();
  await expect(page.getByLabel('提示词', { exact: true })).toBeVisible();
  const after = await page.evaluate(() => window.sentinel.getState());
  expect(after.config).toEqual(before.config);
  expect(after.history).toEqual(before.history);
  checks.push('graceful relaunch preserves judge choice, evidence, Token accounting and independent text verdicts');
  expect(errors).toEqual([]);
  await writeFile('artifacts/judgement-results.json', JSON.stringify({ passed: true, profile, checks, errors }, null, 2));
  console.log(JSON.stringify({ passed: true, checks }, null, 2));
} catch (error) {
  await writeFile('artifacts/judgement-results.json', JSON.stringify({ passed: false, profile, checks, errors, error: error.stack }, null, 2));
  throw error;
} finally {
  gate.release();
  await app?.close();
  await fixture.close();
}
