import { expect } from '@playwright/test';
import { contextualAnswers } from '../tests/fixtures/narrative-answers.mjs';
import { builtinPrompts } from '../core/builtins.mjs';

const promptFrom = body => body.input || body.messages?.[0]?.content || body.contents?.[0]?.parts?.[0]?.text || '';
export function judgementFixture() {
  let release;
  return {
    beforeReply: ({ body }) => promptFrom(body) === 'judge-html-wait' ? new Promise(resolve => { release = resolve; }) : undefined,
    release: () => release?.(),
    textForRequest: ({ body }) => {
      const prompt = promptFrom(body);
      const sample = contextualAnswers.find(sample => builtinPrompts.find(p => p.id === sample.builtinId).prompt === prompt);
      if (sample) return sample.text;
      if (prompt === 'judge-source') return 'You will need a grand total of **21 pieces** to guarantee it.';
      if (prompt === 'judge-html-wait') return 'No HTML was generated.';
      if (prompt.startsWith('Extract the final answer from an existing model reply.')) {
        const payload = JSON.parse(prompt.split('\n').at(-1));
        const sample = contextualAnswers.find(sample => sample.text === payload.reply);
        return JSON.stringify(sample ? { answer: sample.expected, evidence: sample.evidence } : { answer: '21', evidence: 'a grand total of **21 pieces**' });
      }
    },
  };
}

export async function verifyJudgement(page, { baseUrl, gate, getFloating, screenshotPrefix }) {
  const checks = [];
  await page.evaluate(async baseUrl => {
    const { config } = await window.sentinel.getState();
    config.settings.autoRun = false;
    config.settings.answerJudgeTargetId = '';
    config.connections = [{ id: 'judge-local', name: '辅助验证', baseUrl, apiKey: 'judgement-test-key', protocol: 'responses', models: [] }];
    config.prompts = [
      { id: 'p', name: '文字题', prompt: 'judge-source', expected: '21' },
      { id: 'h', type: 'html', name: '人工查看 HTML', prompt: 'judge-html-wait' },
    ];
    config.targets = [
      { id: 'tested', connectionId: 'judge-local', model: 'test-normal', promptIds: ['p', 'h'], timeoutSeconds: 180 },
      { id: 'judge', connectionId: 'judge-local', model: 'judge-model', promptIds: [], enabled: false },
    ];
    await window.sentinel.saveConfig(config);
    await window.sentinel.expandFloat(false);
  }, baseUrl);
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByLabel('答案辅助判定模型', { exact: true }).selectOption('judge');
  await expect.poll(async () => (await page.evaluate(() => window.sentinel.getState())).config.settings.answerJudgeTargetId).toBe('judge');
  checks.push('settings can select an existing model for optional answer extraction');
  await page.getByRole('button', { name: '检测工作台', exact: true }).click();
  const pending = page.evaluate(() => window.sentinel.run(['tested']));
  try {
    await expect.poll(async () => (await page.evaluate(() => window.sentinel.getState())).history[0]?.status, { timeout: 10000 }).toBe('normal');
    const state = await page.evaluate(() => window.sentinel.getState());
    expect(state.activeTargetIds).toEqual(['tested']);
    expect(state.history[0].completedAt).toBeNull();
    expect(state.history[0].results[1].status).toBe('detecting');
    expect(state.history[0].results[0].judgement.model).toBe('judge-model');
    const floating = await getFloating();
    const compact = floating.locator('.float-compact-row').first();
    await expect(compact.locator('.status')).toHaveText('正常');
    await expect(compact.locator('.history-bar.normal')).toHaveCount(1);
    await expect(compact.locator('.float-compact-answers')).toContainText('21');
    await page.locator('.target-row').first().locator('.answer-link').click();
    await expect(page.locator('.result-judgement')).toContainText('judge-model');
    await expect(page.locator('.result-judgement')).toContainText('a grand total of **21 pieces**');
    await page.screenshot({ path: `${screenshotPrefix}-details.png` });
    await page.getByRole('button', { name: '关闭详情', exact: true }).click();
    await floating.screenshot({ path: `${screenshotPrefix}-compact.png` });
    await floating.getByRole('button', { name: '展开悬浮窗', exact: true }).click();
    await expect(floating.locator('.float-model-row').first().locator('.float-result .status')).toHaveText('正常');
    checks.push('text verdict, compact/expanded status and green history bar appear before pending HTML completes');
  } finally { gate.release(); await pending; }
  const after = await page.evaluate(() => window.sentinel.getState());
  expect(after.history[0].status).toBe('normal');
  expect(after.history[0].results[1].status).toBe('insufficient');
  expect(after.history[0].results[0].judgement.usage.totalTokens).toBe(22);
  expect(after.history[0].completedAt).toBeTruthy();
  checks.push('failed HTML remains available for human inspection without changing the text verdict');
  await page.locator('.target-row').first().locator('.answer-link').click();
  await expect(page.locator('.round-usage')).toContainText('66');
  await page.getByRole('button', { name: '关闭详情', exact: true }).click();
  await page.getByRole('button', { name: '设置', exact: true }).click();
  const table = page.getByTestId('token-models');
  await expect(table.locator('tbody tr').filter({ hasText: 'judge-model' }).filter({ hasText: '辅助验证' })).toContainText('22');
  await expect(table.locator('tbody tr').filter({ hasText: 'test-normal' }).filter({ hasText: '辅助验证' })).toContainText('44');
  checks.push('auxiliary usage is included once in round totals and attributed to the actual judging model');
  await page.getByRole('button', { name: '检测工作台', exact: true }).click();
  await page.evaluate(() => window.sentinel.expandFloat(false));
  await page.evaluate(async questions => {
    const { config } = await window.sentinel.getState();
    config.prompts = questions;
    config.targets[0].promptIds = questions.map(p => p.id);
    await window.sentinel.saveConfig(config);
    await window.sentinel.run(['tested']);
  }, builtinPrompts.filter(p => p.type === 'text'));
  await expect.poll(async () => (await page.evaluate(() => window.sentinel.getState())).activeTargetIds.length).toBe(0);
  let state = await page.evaluate(() => window.sentinel.getState());
  expect(state.history[0].status).toBe('normal');
  expect(state.history[0].results.map(result => result.answer)).toEqual(['46.24', '21']);
  for (const result of state.history[0].results) expect(result.judgement.localReason).toBe('Context-dependent answer needs interpretation');
  const floating = await getFloating();
  await expect(floating.locator('.float-compact-row').first().locator('.float-compact-answers')).toContainText('46.24');
  await expect(floating.locator('.float-compact-row').first().locator('.float-compact-answers')).toContainText('21');
  await page.locator('.target-row').first().locator('.answer-link').click();
  await expect(page.locator('.result-judgement').first()).toContainText('不同条件或题意');
  await page.screenshot({ path: `${screenshotPrefix}-screenshot-replies.png` });
  await page.getByRole('button', { name: '关闭详情', exact: true }).click();
  checks.push('both screenshot replies use contextual auxiliary extraction and show 46.24 / 21 in the compact float');
  await page.evaluate(async () => {
    const { config } = await window.sentinel.getState();
    config.prompts[1].expected = '22';
    await window.sentinel.saveConfig(config);
    await window.sentinel.run(['tested']);
  });
  await expect.poll(async () => (await page.evaluate(() => window.sentinel.getState())).activeTargetIds.length).toBe(0);
  state = await page.evaluate(() => window.sentinel.getState());
  expect(state.history[0].status).toBe('degraded');
  expect(state.history[0].results[1].answer).toBe('21');
  await expect(floating.locator('.float-compact-row').first().locator('.status')).toHaveText('降智');
  checks.push('a changed fixed answer produces degraded while preserving the literal extracted 21');
  await page.evaluate(async () => {
    const { config } = await window.sentinel.getState();
    config.prompts.find(prompt => prompt.id === 'builtin-candy').expected = '21';
    await window.sentinel.saveConfig(config);
  });
  return checks;
}
