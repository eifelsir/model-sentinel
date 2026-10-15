import { expect } from '@playwright/test';

export function usageFixture({ model, path }) {
  if (model.includes('usage-missing')) return undefined;
  if (model.includes('usage-partial')) return { prompt_tokens: 30 };
  if (path.endsWith(':generateContent')) return {
    promptTokenCount: 100, candidatesTokenCount: 40, thoughtsTokenCount: 20,
    totalTokenCount: 160, cachedContentTokenCount: 25,
  };
  if (path.endsWith('/messages')) return {
    input_tokens: 10, cache_creation_input_tokens: 30, cache_read_input_tokens: 60,
    output_tokens: 60, output_tokens_details: { thinking_tokens: 20 },
  };
  return path.endsWith('/responses') ? {
    input_tokens: 100, output_tokens: 60, total_tokens: 160,
    input_tokens_details: { cached_tokens: 25 }, output_tokens_details: { reasoning_tokens: 20 },
  } : {
    prompt_tokens: 100, completion_tokens: 60, total_tokens: 160,
    prompt_tokens_details: { cached_tokens: 25 }, completion_tokens_details: { reasoning_tokens: 20 },
  };
}

export async function verifyUsage(page, { baseUrl, getFloating, screenshotPrefix }) {
  const checks = [];
  await page.evaluate(async baseUrl => {
    const { config } = await window.sentinel.getState();
    await window.sentinel.stop();
    config.settings.autoRun = false;
    config.settings.floatVisible = true;
    config.connections = [{ id: 'usage-local', name: 'Token 用量验证', provider: 'custom', baseUrl, apiKey: 'usage-fixture-private-key', protocol: 'chat', models: [] }];
    config.prompts = ['one', 'two'].map(id => ({ id, name: `题目 ${id}`, prompt: '6*7?', expected: '42', mode: 'auto' }));
    config.targets = ['responses', 'chat', 'gemini', 'anthropic', 'missing', 'partial', 'incomplete'].map(id => ({
      id: `usage-${id}`, connectionId: 'usage-local', model: `usage-${id}`,
      protocol: ['missing', 'partial', 'incomplete'].includes(id) ? 'chat' : id,
      promptIds: ['one', 'two'], enabled: true, intervalMinutes: 30, timeoutSeconds: 180, extraBody: {},
    }));
    await window.sentinel.saveConfig(config);
    await window.sentinel.expandFloat(false);
    await window.sentinel.run();
  }, baseUrl);
  await expect.poll(async () => (await page.evaluate(() => window.sentinel.getState())).activeTargetIds.length, { timeout: 20000 }).toBe(0);
  await page.getByRole('button', { name: '检测工作台', exact: true }).click();
  const rows = page.locator('.target-row');
  await expect(rows.first().locator('.usage-brief')).toContainText('320');
  await expect(rows.nth(4).locator('.usage-brief')).toContainText('未提供');
  await expect(rows.nth(5).locator('.usage-brief')).toContainText('未提供');
  const state = await page.evaluate(() => window.sentinel.getState());
  for (const id of ['responses', 'chat', 'gemini', 'anthropic', 'incomplete']) {
    const round = state.history.find(r => r.targetId === `usage-${id}`);
    expect(round.results[0].usage.inputTokens).toBe(100);
    expect(round.results[0].usage.outputTokens).toBe(60);
    expect(round.results[0].usage.totalTokens).toBe(160);
  }
  expect(state.history.find(r => r.targetId === 'usage-incomplete').status).toBe('insufficient');
  checks.push('real HTTP usage across all four protocols is normalized and retained even for truncated answers');
  const floating = await getFloating();
  await expect(floating.locator('.float-compact-row').first().locator('.usage-brief')).toContainText('320');
  await expect(floating.locator('iframe')).toHaveCount(0);
  await floating.screenshot({ path: `${screenshotPrefix}-compact.png` });
  await floating.getByRole('button', { name: '展开悬浮窗', exact: true }).click();
  await expect(floating.locator('.float-model-row').first().locator('.usage-brief')).toContainText('320');
  checks.push('compact and expanded floating windows identify current-round Token totals by model');
  await page.getByRole('button', { name: '检测历史', exact: true }).click();
  const historyRow = page.locator('.history-table-row').filter({ has: page.locator('.history-model strong', { hasText: /^usage-responses$/ }) }).first();
  await historyRow.getByRole('button', { name: '查看详情' }).click();
  const dialog = page.getByRole('dialog', { name: '检测详情' });
  await expect(dialog.locator('.round-usage')).toContainText('320');
  await expect(dialog.locator('.result').first().locator('.usage-breakdown')).toContainText('160');
  await expect(dialog.locator('.result').first().locator('.usage-breakdown')).toContainText('25');
  await expect(dialog.locator('.result').first().locator('.usage-breakdown')).toContainText('20');
  await page.getByRole('button', { name: '关闭详情', exact: true }).click();
  await page.getByRole('button', { name: '设置', exact: true }).click();
  const summary = page.getByTestId('token-summary');
  await expect(summary).toContainText('1,600');
  await expect(summary).toContainText('1,060');
  await expect(summary).toContainText('部分');
  await expect(page.getByTestId('token-models').locator('tbody tr').filter({ hasText: 'usage-missing' })).toContainText('未提供');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `${screenshotPrefix}-settings.png` });
  checks.push('question and round details show cache/reasoning breakdowns; history/model summaries mark missing and partial metrics');
  return checks;
}
