import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAnswer, evaluateSafely } from '../core/answer.mjs';

for (const [text, expected, status] of [
  ['21', '21', 'normal'], ['**２１**', '21', 'normal'],
  ['210', '21', 'degraded'], ['不是21，是22', '21', 'degraded'],
  ['答案可能是21或22', '21', 'insufficient'],
  ['Final answer: 21\nFinal answer: 22', '21', 'insufficient'],
  ['I cannot answer this question.', '21', 'insufficient'],
  ['<think>The answer is 21</think>', '21', 'insufficient'],
  ['<think>22</think>\n答案：21', '21', 'normal'],
  ['9007199254740993', '9007199254740992', 'degraded'],
  ['2.100e1', '21', 'normal'],
  ['I calculated 7 * 3.\n21', '21', 'normal'],
  ['答案：21\n22', '21', 'insufficient'],
  ['答案：21；最终答案：22', '21', 'insufficient'],
  ['21 or 22', '21', 'insufficient'],
  ['I think the calculation might work', '21', 'insufficient'],
  ['9007199254740993.0000000000000001', '9007199254740993.0000000000000002', 'degraded'],
  ['21.', '21', 'normal'],
  ['.5', '0.50', 'normal'],
  ['-.0', '0', 'normal'],
  ['最终答案：42，因为6乘7等于42。', '42', 'normal'],
  ['The answer is 42. This follows from multiplication.', '42', 'normal'],
  ['Final answer: 210, because it is correct.', '21', 'degraded'],
  ['Final answer: 21. But the result is 22.', '21', 'insufficient'],
  ['Final answer: 21 / 22', '21', 'insufficient'],
  ['最终答案：**21 / 46.24**', '21 / 46.24', 'normal'],
  ['Final answer: 21 * 2', '21', 'insufficient'],
  ['Final answer: 21 + 2', '21', 'insufficient'],
  ['Final answer: 21 - 2', '21', 'insufficient'],
  ['Final answer: 21 / 2', '21', 'insufficient'],
  ['Final answer: 21 ^ 2', '21', 'insufficient'],
  ['Final answer: 21 = 42', '21', 'insufficient'],
  ['最终答案：21\n不是21，是22', '21', 'insufficient'],
  ['Final answer: 21\nNo, 22.', '21', 'insufficient'],
  ['Final answer: Paris\nLondon', 'Paris', 'insufficient'],
  ['Final answer: Paris\nParis', 'Paris', 'normal'],
  ['Final answer: Paris\nThis follows from its role as the capital of France.', 'Paris', 'normal'],
  ['Final answer: 21\nBecause 7 * 3 equals 21.', '21', 'normal'],
]) test(`auto ${JSON.stringify(text)} => ${status}`, () => {
  assert.equal(evaluateAnswer(text, { expected, mode: 'auto' }).status, status);
});

test('exact compares complete normalized text', () => {
  assert.equal(evaluateAnswer('**Hello**\n world', { expected: 'Hello world', mode: 'exact' }).status, 'normal');
  assert.equal(evaluateAnswer('Hello world extra', { expected: 'Hello world', mode: 'exact' }).status, 'degraded');
  assert.equal(evaluateAnswer('foo_bar', { expected: 'foobar', mode: 'exact' }).status, 'degraded');
  assert.equal(evaluateAnswer('2*1', { expected: '21', mode: 'exact' }).status, 'degraded');
});
test('regex uses first capture and isolates pathological execution', async () => {
  assert.equal((await evaluateSafely('answer=21', { expected: '21', mode: 'regex', pattern: 'answer=(\\d+)' })).status, 'normal');
  assert.equal((await evaluateSafely('abc', { expected: '21', mode: 'regex', pattern: '[' })).status, 'insufficient');
  const started = Date.now();
  assert.equal((await evaluateSafely('a'.repeat(40000) + '!', { expected: '21', mode: 'regex', pattern: '(a+)+$' })).status, 'insufficient');
  assert.ok(Date.now() - started < 3000);
});
test('oversized text is insufficient without silently judging a truncated prefix', async () => {
  const output = 'Final answer: 21\n' + 'x'.repeat(1000000) + '\nFinal answer: 22';
  assert.equal(evaluateAnswer(output, { expected: '21', mode: 'auto' }).status, 'insufficient');
  assert.equal((await evaluateSafely(output, { expected: '21', mode: 'regex', pattern: 'answer: (\\d+)' })).status, 'insufficient');
});
