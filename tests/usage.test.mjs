import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeUsage, aggregateUsage, roundUsage } from '../core/usage.mjs';

const empty = { inputTokens: null, outputTokens: null, totalTokens: null, cacheReadTokens: null, cacheWriteTokens: null, reasoningTokens: null };

test('Responses includes cache and reasoning only once and preserves reported totals', () => {
  assert.deepEqual(normalizeUsage({
    input_tokens: 100, output_tokens: 60, total_tokens: 160,
    input_tokens_details: { cached_tokens: 40, cache_write_tokens: 10 },
    output_tokens_details: { reasoning_tokens: 20 },
  }, 'responses'), {
    inputTokens: 100, outputTokens: 60, totalTokens: 160,
    cacheReadTokens: 40, cacheWriteTokens: 10, reasoningTokens: 20,
  });
});

test('Chat and Grok usage derives a total only from two known counters', () => {
  assert.deepEqual(normalizeUsage({
    prompt_tokens: 100, completion_tokens: 60,
    prompt_tokens_details: { cached_tokens: 0 },
    completion_tokens_details: { reasoning_tokens: 12 },
  }, 'chat'), {
    inputTokens: 100, outputTokens: 60, totalTokens: 160,
    cacheReadTokens: 0, cacheWriteTokens: null, reasoningTokens: 12,
  });
  assert.deepEqual(normalizeUsage({ prompt_tokens: 100 }, 'chat'), { ...empty, inputTokens: 100 });
});

test('Gemini adds thoughts to candidate output and tool prompts to input', () => {
  assert.deepEqual(normalizeUsage({
    promptTokenCount: 100, candidatesTokenCount: 30, thoughtsTokenCount: 20,
    toolUsePromptTokenCount: 5, totalTokenCount: 155, cachedContentTokenCount: 40,
  }, 'gemini'), {
    inputTokens: 105, outputTokens: 50, totalTokens: 155,
    cacheReadTokens: 40, cacheWriteTokens: null, reasoningTokens: 20,
  });
  assert.equal(normalizeUsage({ promptTokenCount: 100, candidatesTokenCount: 30, thoughtsTokenCount: 20 }, 'gemini').totalTokens, 150);
});

test('Claude adds cache creation and reads to input without duplicating inclusive output', () => {
  assert.deepEqual(normalizeUsage({
    input_tokens: 10, cache_creation_input_tokens: 30, cache_read_input_tokens: 100,
    output_tokens: 50, output_tokens_details: { thinking_tokens: 20 },
  }, 'anthropic'), {
    inputTokens: 140, outputTokens: 50, totalTokens: 190,
    cacheReadTokens: 100, cacheWriteTokens: 30, reasoningTokens: 20,
  });
  assert.deepEqual(normalizeUsage({ input_tokens: 10, output_tokens: 50 }, 'anthropic'),
    { ...empty, inputTokens: 10, outputTokens: 50, totalTokens: 60 });
});

test('missing or malformed metrics remain unknown while real zero is retained', () => {
  for (const usage of [null, undefined, {}, [], { other: 1 }, { input_tokens: -1, output_tokens: '50', total_tokens: Infinity }]) {
    assert.equal(normalizeUsage(usage, 'responses'), null);
  }
  assert.deepEqual(normalizeUsage({ input_tokens: 0, output_tokens: 0 }, 'responses'),
    { ...empty, inputTokens: 0, outputTokens: 0, totalTokens: 0 });
  assert.deepEqual(normalizeUsage({ input_tokens: 1.2, output_tokens: 10, total_tokens: Number.MAX_SAFE_INTEGER + 1, secret: 'private' }, 'responses'),
    { ...empty, outputTokens: 10 });
});

test('unknown and overflowing totals are never fabricated', () => {
  assert.equal(normalizeUsage({ input_tokens: Number.MAX_SAFE_INTEGER, output_tokens: 1 }, 'responses').totalTokens, null);
  assert.equal(normalizeUsage({ prompt_tokens: 10, completion_tokens: 20, total_tokens: 31 }, 'chat').totalTokens, 31);
});

test('aggregates distinguish missing samples, missing metrics and true zero', () => {
  const summary = aggregateUsage([
    { ...empty, inputTokens: 100, outputTokens: 60, totalTokens: 160, cacheReadTokens: 0 },
    null,
    { ...empty, inputTokens: 30 },
  ]);
  assert.equal(summary.samples, 3);
  assert.equal(summary.reported, 2);
  assert.equal(summary.inputTokens, 130);
  assert.equal(summary.outputTokens, 60);
  assert.equal(summary.totalTokens, 160);
  assert.equal(summary.cacheReadTokens, 0);
  assert.equal(summary.reasoningTokens, null);
  assert.equal(summary.counts.inputTokens, 2);
  assert.equal(summary.counts.totalTokens, 1);
  assert.equal(summary.counts.reasoningTokens, 0);
  assert.equal(aggregateUsage([null, undefined]).totalTokens, null);
  assert.equal(aggregateUsage([]).totalTokens, null);
});

test('round summaries include usage from insufficient results but exclude the no-question placeholder', () => {
  const summary = roundUsage({ results: [
    { promptId: 'p', status: 'normal', usage: { ...empty, inputTokens: 10, outputTokens: 20, totalTokens: 30 } },
    { promptId: 'q', status: 'insufficient', usage: { ...empty, inputTokens: 5, outputTokens: 10, totalTokens: 15 } },
    { promptId: '', status: 'insufficient' },
  ] });
  assert.equal(summary.totalTokens, 45);
  assert.equal(summary.samples, 2);
});

test('large retained histories aggregate without argument overflow and reject unsafe sums', () => {
  const values = Array(150000).fill({ ...empty, totalTokens: 1 });
  assert.equal(aggregateUsage(values).totalTokens, 150000);
  assert.equal(aggregateUsage([{ ...empty, totalTokens: Number.MAX_SAFE_INTEGER }, { ...empty, totalTokens: 1 }]).totalTokens, null);
});
