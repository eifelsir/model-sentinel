import { expect } from '@playwright/test';
import { narrativeAnswers } from '../tests/fixtures/narrative-answers.mjs';

export function narrativeReply({ body }) {
  const index = /^narrative-(\d+)$/.exec(body.input)?.[1];
  return index === undefined ? undefined : narrativeAnswers[Number(index)]?.text;
}

export async function verifyAnswerAndFloat(page, { baseUrl, getFloating, screenshots }) {
  const checks = [];
  const model = 'test-slow-shared-grok-gemini-claude-model-' + 'long-model-name-'.repeat(4);
  await page.evaluate(async ({ baseUrl, model, answers }) => {
    const { config } = await window.sentinel.getState();
    config.settings.autoRun = false;
    config.settings.floatVisible = true;
    config.connections = [
      { id: 'primary', name: '主连接', baseUrl, apiKey: 'narrative-test-key', protocol: 'responses', models: [] },
      { id: 'secondary', name: '备用连接', baseUrl: `${baseUrl}/secondary`, apiKey: 'narrative-test-key', protocol: 'responses', models: [] },
    ];
    config.prompts = answers.map((answer, index) => ({
      id: `p-${index}`, name: `实际回复 ${index + 1}`, prompt: `narrative-${index}`,
      expected: answer, mode: 'auto', pattern: '',
    }));
    config.targets = ['primary', 'secondary'].map(id => ({
      id, connectionId: id, model, protocol: 'responses', enabled: true, promptIds: answers.map((_answer, index) => `p-${index}`),
      intervalMinutes: 30, timeoutSeconds: 180, maxOutputTokens: null, extraBody: {},
    }));
    await window.sentinel.saveConfig(config);
    await window.sentinel.expandFloat(false);
  }, { baseUrl, model, answers: narrativeAnswers.map(fixture => fixture.expected) });
  const floating = await getFloating();
  await expect(floating.locator('[data-testid="float-compact"]')).toBeVisible();
  const rows = floating.locator('.float-compact-row');
  await expect(rows).toHaveCount(2);
  for (const [index, connection] of ['主连接', '备用连接'].entries()) {
    await expect(rows.nth(index).getByText(model, { exact: true })).toBeVisible();
    await expect(rows.nth(index).locator('.float-compact-identity strong')).toHaveAttribute('title', new RegExp(connection));
    await expect(rows.nth(index).locator('.compact-bars-empty')).toHaveCount(1);
    await expect(rows.nth(index).getByText('未检测', { exact: true })).toBeVisible();
  }
  const smallHeight = await floating.evaluate(() => innerHeight);
  expect(smallHeight).toBeGreaterThan(150);
  expect(smallHeight).toBeLessThan(300);
  expect(await floating.evaluate(() => innerWidth)).toBeLessThan(400);
  checks.push('compact float identifies same-name models with connection tooltips and history-bar placeholders');

  await page.evaluate(() => window.sentinel.run());
  await expect(rows.nth(0).getByText('检测中', { exact: true })).toBeVisible();
  await expect.poll(async () => (await page.evaluate(() => window.sentinel.getState())).activeTargetIds.length, { timeout: 15000 }).toBe(0);
  let state = await page.evaluate(() => window.sentinel.getState());
  for (const id of ['primary', 'secondary']) {
    const round = state.history.find(round => round.targetId === id);
    expect(round.status).toBe('normal');
    expect(round.results.map(result => result.answer)).toEqual(narrativeAnswers.map(fixture => fixture.expected));
  }
  await expect(rows.nth(0).getByText('正常', { exact: true })).toBeVisible();
  await expect(rows.nth(1).getByText('正常', { exact: true })).toBeVisible();
  await expect(rows.nth(0).locator('.float-compact-answers')).toContainText('46.24');
  await expect(rows.nth(0).locator('.history-bar')).toHaveCount(1);
  checks.push('all actual narrative responses including the screenshot height reply pass over local Responses HTTP');

  await page.evaluate(async () => {
    const { config } = await window.sentinel.getState();
    config.prompts.push({ ...config.prompts[0], id: 'wrong', expected: '22' });
    config.targets[1].promptIds = ['wrong'];
    await window.sentinel.saveConfig(config);
    await window.sentinel.run(['secondary']);
  });
  await expect(rows.nth(1).getByText('检测中', { exact: true })).toBeVisible();
  await expect(rows.nth(0).getByText('正常', { exact: true })).toBeVisible();
  await expect.poll(async () => (await page.evaluate(() => window.sentinel.getState())).activeTargetIds.length, { timeout: 15000 }).toBe(0);
  state = await page.evaluate(() => window.sentinel.getState());
  expect(state.history.find(round => round.targetId === 'secondary').results[0].answer).toBe(narrativeAnswers[0].expected);
  await expect(rows.nth(1).getByText('降智', { exact: true })).toBeVisible();
  await floating.screenshot({ path: screenshots.compact });
  expect(await rows.nth(0).locator('.float-compact-identity strong').evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
  expect(await floating.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  checks.push('same-name targets keep distinct normal/degraded results and long names fit compact layout');

  await floating.getByRole('button', { name: '展开悬浮窗', exact: true }).click();
  await expect(floating.locator('.float-model-row')).toHaveCount(2);
  await expect.poll(() => floating.evaluate(() => innerWidth)).toBeGreaterThan(600);
  await floating.screenshot({ path: screenshots.expanded });
  await floating.getByRole('button', { name: '收起悬浮窗', exact: true }).click();
  await expect.poll(() => floating.evaluate(() => innerHeight)).toBe(smallHeight);
  checks.push('expand and collapse preserve per-model answers and compact sizing');

  await page.evaluate(async () => {
    const { config } = await window.sentinel.getState();
    for (let index = 0; index < 10; index++) {
      config.targets.push({ ...config.targets[0], id: `extra-${index}`, model: `other-model-${index}`, enabled: false });
    }
    await window.sentinel.saveConfig(config);
  });
  await expect(rows).toHaveCount(12);
  await expect.poll(() => floating.evaluate(() => innerHeight)).toBeGreaterThan(smallHeight);
  expect(await floating.evaluate(() => innerHeight)).toBeLessThanOrEqual(660);
  const scroller = floating.locator('.float-compact-models');
  expect(await scroller.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
  await rows.last().scrollIntoViewIfNeeded();
  await expect(rows.last().getByText('other-model-9', { exact: true })).toBeInViewport();
  await expect(rows.last().getByText('未检测', { exact: true })).toBeInViewport();
  await floating.screenshot({ path: screenshots.many });
  checks.push('compact height grows for model count and bounds a scrollable twelve-model list');

  await page.evaluate(async () => {
    const { config } = await window.sentinel.getState();
    config.targets = config.targets.slice(0, 1);
    await window.sentinel.saveConfig(config);
  });
  await expect(rows).toHaveCount(1);
  await expect.poll(() => floating.evaluate(() => innerHeight)).toBeLessThan(smallHeight);
  checks.push('removing models shrinks an already open compact window');
  return checks;
}
