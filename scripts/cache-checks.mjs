import { expect } from '@playwright/test';

const promptIn = body => body.input || body.messages?.[0]?.content || body.contents?.[0]?.parts?.[0]?.text;
export function cacheUsageFixture({ body, path }) {
  if (body.model !== 'gpt-6.1-sol' || !promptIn(body)?.endsWith('cache-fixture')) return;
  return path.endsWith('/responses')
    ? { input_tokens: 100, output_tokens: 12, input_tokens_details: { cached_tokens: 25 } }
    : { prompt_tokens: 100, completion_tokens: 12, prompt_tokens_details: { cached_tokens: 0 } };
}
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
  await page.evaluate(async () => {
    const { config } = await window.sentinel.getState();
    for (const target of config.targets.filter(target => ['responses', 'chat'].includes(target.protocol))) target.model = 'gpt-6.1-sol';
    await window.sentinel.saveConfig(config);
  });
  start = requests.length;
  await run();
  const nativeRequests = requests.slice(start).filter(request => ['responses', 'chat'].some(protocol => request.path.endsWith(protocol === 'responses' ? '/responses' : '/chat/completions')));
  expect(nativeRequests).toHaveLength(2);
  for (const { body } of nativeRequests) expect(body.prompt_cache_options).toEqual({ mode: 'explicit' });
  state = await page.evaluate(() => window.sentinel.getState());
  const responsesRound = state.history.find(round => round.targetId === 'cache-responses');
  expect(responsesRound.results[0].cacheBypass.strategy).toBe('openai-explicit');
  expect(responsesRound.results[0].usage.cacheReadTokens).toBe(25);
  await page.evaluate(id => window.sentinel.openMain(id), responsesRound.id);
  const dialog = page.getByRole('dialog', { name: '检测详情' });
  await expect(dialog.locator('.cache-report')).toContainText('已请求原生禁用提示词缓存');
  await expect(dialog.locator('.cache-report')).toContainText('服务仍报告读取缓存 25 Token');
  if (screenshot) await page.screenshot({ path: screenshot.replace(/\.png$/, '-native.png') });
  await page.getByRole('button', { name: '关闭详情', exact: true }).click();
  const chatRound = state.history.find(round => round.targetId === 'cache-chat');
  await page.evaluate(id => window.sentinel.openMain(id), chatRound.id);
  await expect(dialog.locator('.cache-report')).toContainText('服务返回缓存读取 0 Token');
  await page.getByRole('button', { name: '关闭详情', exact: true }).click();
  checks.push('supported OpenAI models send native cache control and details distinguish nonzero cache reads from zero');
  if (screenshot) await page.screenshot({ path: screenshot });
  return checks;
}
