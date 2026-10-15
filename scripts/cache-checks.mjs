import { expect } from '@playwright/test';

const promptIn = body => body.input || body.messages?.[0]?.content || body.contents?.[0]?.parts?.[0]?.text;
export async function verifyCacheControls(page, { baseUrl, requests, screenshot }) {
  const checks = [];
  async function run() {
    await page.evaluate(() => window.sentinel.run());
    await expect.poll(async () => (await page.evaluate(() => window.sentinel.getState())).activeTargetIds.length, { timeout: 15000 }).toBe(0);
  }
  await page.getByRole('button', { name: '检测工作台', exact: true }).click();
  const control = page.getByRole('switch', { name: '绕过缓存', exact: true });
  await expect(control).toBeVisible();
  await expect(control).not.toBeChecked();
  await expect(page.getByText('提示词缓存通常不影响结果，不放心可开启绕过。', { exact: true })).toBeVisible();
  await expect(page.getByText('整条回复缓存可能影响检测；绕过效果取决于服务商。', { exact: true })).toBeVisible();
  await page.evaluate(async baseUrl => {
    const { config } = await window.sentinel.getState();
    config.settings.autoRun = false;
    config.settings.answerJudgeTargetId = '';
    config.connections = [{ id: 'cache', name: '缓存开关验证', baseUrl, protocol: 'responses', apiKey: 'cache-fixture-key' }];
    config.prompts = [{ id: 'cache-p', name: '固定问题', prompt: 'cache-fixture', expected: '42' }];
    config.targets = ['responses', 'chat', 'gemini', 'anthropic'].map(protocol => ({
      id: `cache-${protocol}`, connectionId: 'cache', model: 'test-normal', protocol, enabled: true, promptIds: ['cache-p'],
    }));
    await window.sentinel.saveConfig(config);
  }, baseUrl);
  let start = requests.length;
  await run();
  expect(requests.slice(start).map(request => promptIn(request.body))).toEqual(Array(4).fill('cache-fixture'));
  checks.push('cache bypass defaults off and ordinary tests send the original question');

  await control.click();
  await expect.poll(async () => (await page.evaluate(() => window.sentinel.getState())).config.settings.bypassCache).toBe(true);
  start = requests.length;
  await run();
  await run();
  const bypassed = requests.slice(start);
  expect(bypassed).toHaveLength(8);
  const prefixes = [];
  for (const request of bypassed) {
    const prompt = promptIn(request.body);
    expect(prompt).toMatch(/^\[Model Sentinel request: [0-9a-f-]{36}\]\n/);
    expect(prompt.endsWith('\n\ncache-fixture')).toBe(true);
    expect(request.cacheControl).toBe('no-cache, no-store');
    expect(request.pragma).toBe('no-cache');
    prefixes.push(prompt.split('\n')[0]);
  }
  expect(new Set(prefixes).size).toBe(8);
  let state = await page.evaluate(() => window.sentinel.getState());
  expect(state.history.slice(0, 8).every(round => round.bypassCache && round.status === 'normal')).toBe(true);
  checks.push('switch enables distinct random prefixes and cache directives for repeated requests across all four protocols');
  await page.evaluate(id => window.sentinel.openMain(id), state.history[0].id);
  await expect(page.getByRole('dialog', { name: '检测详情' }).getByText('已请求绕过缓存', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '关闭详情', exact: true }).click();
  checks.push('round details retain whether cache bypass was requested');
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await expect(control).toBeChecked();
  await control.click();
  await expect.poll(async () => (await page.evaluate(() => window.sentinel.getState())).config.settings.bypassCache).toBe(false);
  await page.getByRole('button', { name: '检测工作台', exact: true }).click();
  await expect(control).not.toBeChecked();
  start = requests.length;
  await run();
  for (const request of requests.slice(start)) {
    expect(promptIn(request.body)).toBe('cache-fixture');
    expect(request.cacheControl).toBeUndefined();
  }
  state = await page.evaluate(() => window.sentinel.getState());
  expect(state.history.slice(0, 4).every(round => round.bypassCache === false)).toBe(true);
  checks.push('workbench and Settings switches stay synchronized and disabling restores the original request');
  await control.click();
  await expect.poll(async () => (await page.evaluate(() => window.sentinel.getState())).config.settings.bypassCache).toBe(true);
  if (screenshot) await page.screenshot({ path: screenshot });
  return checks;
}
