import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createMockServer } from './mock-server.mjs';
import { narrativeReply, verifyAnswerAndFloat } from './answer-float-checks.mjs';

const profile = await mkdtemp(join(tmpdir(), 'model-sentinel-answer-float-'));
await mkdir('artifacts/screenshots', { recursive: true });
const fixture = await createMockServer({ textForRequest: narrativeReply });
const errors = [];
let app;
try {
  app = await electron.launch({ args: [resolve('.'), `--profile=${profile}`], timeout: 30000 });
  const page = await app.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  await expect(page.getByLabel('提示词', { exact: true })).toBeVisible();
  const checks = await verifyAnswerAndFloat(page, {
    baseUrl: fixture.baseUrl,
    getFloating: async () => {
      await expect.poll(() => app.windows().length).toBe(2);
      const floating = app.windows().find(window => window !== page);
      floating.on('pageerror', error => errors.push(error.message));
      return floating;
    },
    screenshots: {
      compact: resolve('artifacts/screenshots/11-fix-compact.png'),
      expanded: resolve('artifacts/screenshots/12-fix-expanded.png'),
      many: resolve('artifacts/screenshots/13-fix-many-models.png'),
    },
  });
  expect(errors).toEqual([]);
  await writeFile('artifacts/answer-float-results.json', JSON.stringify({ passed: true, checks, profile, errors }, null, 2));
  console.log(JSON.stringify({ passed: true, checks }, null, 2));
} catch (error) {
  await writeFile('artifacts/answer-float-results.json', JSON.stringify({ passed: false, profile, errors, error: error.stack }, null, 2));
  throw error;
} finally {
  if (app) await app.close();
  await fixture.close();
}
