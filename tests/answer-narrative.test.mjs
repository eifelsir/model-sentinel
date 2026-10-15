import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAnswer } from '../core/answer.mjs';
import { narrativeAnswers } from './fixtures/narrative-answers.mjs';

for (const fixture of narrativeAnswers) {
  test(`auto extracts the actual ${fixture.name}`, () => {
    assert.deepEqual(evaluateAnswer(fixture.text, { expected: fixture.expected, mode: 'auto' }), {
      status: 'normal', answer: fixture.expected, reason: 'Answer matches',
    });
  });
}

for (const [text, expected, status, answer] of [
  ['The average adult height is therefore 46.24 inches.', '46.24', 'normal', '46.24'],
  ['Final answer: 21 pieces.', '21', 'normal', '21'],
  ['Final answer: 21 pieces + 2 pieces.', '21', 'insufficient', ''],
  ['The average adult height is 46.24 inches. Otherwise, their average height is 42 inches.', '46.24', 'normal', '46.24'],
  ['The average adult height is 46.24 inches. If no milk is available, the average height is 42 inches.', '46.24', 'insufficient', ''],
  ['The average adult height is 46.24 inches. With all calculations included, the average adult height is 47.24 inches.', '46.24', 'insufficient', ''],
  ['The average adult height is 46.24 inches. When calculated correctly, the average adult height is 47.24 inches.', '46.24', 'insufficient', ''],
  ['The average adult height is 46.24 inches. Without any rounding, the average adult height is 47.24 inches.', '46.24', 'insufficient', ''],
  ['The average adult height is 46.24 inches. In this case, the average adult height is 47.24 inches.', '46.24', 'insufficient', ''],
  ['The average adult height is 46.24 inches. If calculated correctly, the average adult height is 47.24 inches.', '46.24', 'insufficient', ''],
  ['The average adult height is 46.24 inches. The average height is 42 inches.', '46.24', 'insufficient', ''],
  [String.raw`The average height is therefore \[42+4.24=\boxed{46.24\text{ inches}}.\]`, '46.24', 'normal', '46.24'],
  [String.raw`The average height is 47.24 inches. \(\boxed{46.24}\)`, '46.24', 'insufficient', ''],
  [String.raw`The average height is therefore \[42+4.24=\boxed{47.24\text{ inches}}.\]`, '46.24', 'degraded', '47.24'],
  ['最少取出 **21 颗**。\n证明中可能出现多种情况，但不影响这个下界。', '21', 'normal', '21'],
  ['一种情况可能不满足要求。\n所以，最少需要 **21 颗**。', '21', 'normal', '21'],
  ['最少需要取出 **21 个**。', '21', 'normal', '21'],
  ['最少需要摸出 **21 个**。', '21', 'normal', '21'],
  ['最少需取出 **21 个**。', '21', 'normal', '21'],
  ['最少要摸出 **21 个**。', '21', 'normal', '21'],
  ['最多需要取出 **21 个**。', '21', 'normal', '21'],
  ['最少需要取出 **22 个**。', '21', 'degraded', '22'],
  [String.raw`最少需要取出 **22 个**。
故答案为 \(\boxed{21\text{ 个}}\)。`, '21', 'insufficient', ''],
  ['最少需要取出 **21 + 2 个**。', '21', 'insufficient', ''],
  ['The average adult height is 46.24 inches.\nThere are several possible cases in the calculation.', '46.24', 'normal', '46.24'],
  [String.raw`The average adult height is **47.24 inches**.
The calculation includes possible cases.
\[\boxed{47.24\text{ inches}}\]`, '46.24', 'degraded', '47.24'],
  [String.raw`最少取出 **22 颗**。证明中可能出现多种情况。
因此，\boxed{22}。`, '21', 'degraded', '22'],
  [String.raw`\[\boxed{46.24\mathrm{inches}}\]`, '46.24', 'normal', '46.24'],
  [String.raw`The result is \(\boxed{46.24\text{ inches}}\).`, '46.24', 'normal', '46.24'],
  ['最终答案：**21颗**', '21', 'normal', '21'],
  ['答案为 21 个。', '21', 'normal', '21'],
  ['First, **21** appears in the calculation.\nThe final answer is 22.', '21', 'degraded', '22'],
  [String.raw`The calculation mentions 21.
Therefore the answer is \boxed{210}.`, '21', 'degraded', '210'],
  [String.raw`可能是 \boxed{21} 或者 \boxed{22}。`, '21', 'insufficient', ''],
  ['最终答案：21颗或22颗。', '21', 'insufficient', ''],
  [String.raw`最终答案：21
\boxed{22}`, '21', 'insufficient', ''],
  [String.raw`\boxed{21}
No, 22.`, '21', 'insufficient', ''],
  [String.raw`\boxed{21 + 2}`, '21', 'insufficient', ''],
  [String.raw`\boxed{21 / 2}`, '21', 'insufficient', ''],
  [String.raw`\boxed{21 or 22}`, '21', 'insufficient', ''],
  [String.raw`The answer might be \boxed{21}.`, '21', 'insufficient', ''],
  ['The answer is 21. But it could also be 22.', '21', 'insufficient', ''],
  [String.raw`\boxed{21\text{ candies} + 2}`, '21', 'insufficient', ''],
  [String.raw`Maybe, \boxed{21}.`, '21', 'insufficient', ''],
  ['The final answer is 21, because some cases might fail with 20.', '21', 'normal', '21'],
  ['Final answer: 21 mod 2', '21', 'insufficient', ''],
  ['Final answer: 21 ± 2', '21', 'insufficient', ''],
  ['Final answer: 21 times 2', '21', 'insufficient', ''],
  [String.raw`\boxed{21 \sqrt{2}}`, '21', 'insufficient', ''],
  [String.raw`\boxed{21 \pm 2}`, '21', 'insufficient', ''],
  ['The answer is 21 thousand.', '21', 'insufficient', ''],
  ['Final answer: 21, actually 22.', '21', 'insufficient', ''],
  ['Final answer: 21, actually 22, because of rounding.', '21', 'insufficient', ''],
  ['Final answer: 21 mod 2, because of the calculation.', '21', 'insufficient', ''],
  ['Maybe, after calculation, the answer is 21.', '21', 'insufficient', ''],
  [String.raw`也许，经过计算，\boxed{21}。`, '21', 'insufficient', ''],
  ['The average height is 21 inches. However, I am not sure.', '21', 'insufficient', ''],
  ['The answer is 21. However, I am unsure.', '21', 'insufficient', ''],
  ['Final answer: 21. It is 22.', '21', 'insufficient', ''],
  ['Final answer: 21. It should be 22.', '21', 'insufficient', ''],
  ['The answer is 21, because 7*3=21, but actually 22.', '21', 'insufficient', ''],
  ['The answer is 21. It is 21.', '21', 'normal', '21'],
  ['The answer is 21. It is based on multiplication.', '21', 'normal', '21'],
  ['Final answer: Paris\nThis is the capital of France.', 'Paris', 'normal', 'Paris'],
  ['最终答案：21。\n不过，我不确定。', '21', 'insufficient', ''],
  ['The answer is 21. The proof might have several cases.', '21', 'normal', '21'],
  ['Final answer: 21 result: 22', '21', 'insufficient', ''],
]) {
  test(`narrative ${JSON.stringify(text)} => ${status}`, () => {
    const result = evaluateAnswer(text, { expected, mode: 'auto' });
    assert.equal(result.status, status);
    assert.equal(result.answer, answer);
  });
}

test('many repeated boxed candidates are bounded before expensive evaluation', () => {
  const started = Date.now();
  assert.equal(evaluateAnswer(String.raw`\boxed{21}`.repeat(60000), { expected: '21' }).status, 'insufficient');
  assert.ok(Date.now() - started < 2000);
});
