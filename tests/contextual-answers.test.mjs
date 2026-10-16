import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAnswer } from '../core/answer.mjs';
import { needsModelJudge } from '../core/model-judge.mjs';
import { Engine } from '../core/engine.mjs';
import { defaultConfig } from '../core/config.mjs';
import { builtinPrompts } from '../core/builtins.mjs';
import { createMockServer } from '../scripts/mock-server.mjs';
import { contextualAnswers } from './fixtures/narrative-answers.mjs';

const promptIn = body => body.input || body.messages?.[0]?.content || body.contents?.[0]?.parts?.[0]?.text;
for (const sample of contextualAnswers) {
  test(`${sample.name} requests context interpretation instead of declaring a final contradiction`, () => {
    const question = builtinPrompts.find(p => p.id === sample.builtinId);
    const result = evaluateAnswer(sample.text, question);
    assert.equal(result.status, 'insufficient');
    assert.equal(result.reason, 'Context-dependent answer needs interpretation');
    assert.equal(needsModelJudge(result, question), true);
  });

  for (const protocol of ['responses', 'chat', 'gemini', 'anthropic']) {
    test(`${protocol} auxiliary extraction resolves ${sample.name} using the original question`, async () => {
      const question = builtinPrompts.find(p => p.id === sample.builtinId);
      const fixture = await createMockServer({
        textForRequest: ({ body }) => promptIn(body) === question.prompt ? sample.text :
          JSON.stringify({ answer: sample.expected, evidence: sample.evidence }),
      });
      const config = defaultConfig();
      config.connections = [{ id: 'c', name: 'Local', baseUrl: fixture.baseUrl, protocol }];
      config.prompts = [question];
      config.targets = [{ id: 't', connectionId: 'c', model: 'test-normal', promptIds: [question.id] }];
      config.settings.answerJudgeTargetId = '@current';
      const engine = new Engine({ config });
      try {
        await engine.run();
        const result = engine.snapshot().history[0].results[0];
        assert.equal(result.status, 'normal');
        assert.equal(result.answer, sample.expected);
        assert.equal(result.judgement.evidence, sample.evidence);
        assert.equal(result.judgement.localReason, 'Context-dependent answer needs interpretation');
        assert.equal(fixture.requests.length, 2);
        const payload = JSON.parse(promptIn(fixture.requests[1].body).split('\n').at(-1));
        assert.deepEqual(payload, { question: question.prompt, reply: sample.text });
      } finally { await engine.close(); await fixture.close(); }
    });
  }

  test(`auxiliary extraction of ${sample.name} cannot match an unrelated expected value`, async () => {
    const question = { ...builtinPrompts.find(p => p.id === sample.builtinId), expected: '999901' };
    const config = defaultConfig();
    config.connections = [{ id: 'c', name: 'Local', baseUrl: 'http://localhost', protocol: 'responses' }];
    config.prompts = [question];
    config.targets = [{ id: 't', connectionId: 'c', model: 'test-normal', promptIds: [question.id] }];
    config.settings.answerJudgeTargetId = '@current';
    const prompts = [];
    const engine = new Engine({ config, request: async (_connection, _target, input) => {
      prompts.push(input.prompt);
      return { text: prompts.length === 1 ? sample.text : JSON.stringify({ answer: sample.expected, evidence: sample.evidence }) };
    } });
    try {
      await engine.run();
      const result = engine.snapshot().history[0].results[0];
      assert.equal(result.status, 'degraded');
      assert.equal(result.answer, sample.expected);
      assert.equal(prompts.length, 2);
      assert.equal(prompts.join('\n').includes('999901'), false);
    } finally { await engine.close(); }
  });
}

test('a conditional aside cannot make conflicting unconditional conclusions eligible for assistance', () => {
  const question = { expected: '21', mode: 'auto' };
  const result = evaluateAnswer('Final answer: 21. If shapes cannot be selected, the answer is 29. Final answer: 22.', question);
  assert.equal(result.reason, 'Contradictory final answers');
  assert.equal(needsModelJudge(result, question), false);
});

test('a vague reference to conditions does not hide an unconditional wrong answer', () => {
  const result = evaluateAnswer('The conditions are given in the question. Final answer: 22.', { expected: '21' });
  assert.equal(result.status, 'degraded');
  assert.equal(result.answer, '22');
});

for (const qualifier of [
  'With the calculation complete', 'With all calculations included', 'Without any rounding', 'If calculated correctly',
  'With confidence', 'Without a doubt', 'For comparison with the previous answer',
]) {
  test(`a computational qualifier remains a hard conflict: ${qualifier}`, () => {
    const question = { expected: '21' };
    const result = evaluateAnswer(`${qualifier}, the final answer is 21. Final answer: 22.`, question);
    assert.equal(result.reason, 'Contradictory final answers');
    assert.equal(needsModelJudge(result, question), false);
  });
}

test('paired with/without background quantities are candidates for interpretation for arbitrary subjects', () => {
  const question = { expected: '30' };
  const result = evaluateAnswer('The average adult height is 30 inches. Without nutrient Z, average height is 20 inches; with nutrient Z, average height is 40 inches.', question);
  assert.equal(result.reason, 'Context-dependent answer needs interpretation');
  assert.equal(needsModelJudge(result, question), true);
});

for (const uncertainty of ['This is uncertain.', 'The final answer is unsure.', 'I am not certain.', '最终答案不确定。']) {
  test(`a contextual aside cannot override explicit conclusion uncertainty: ${uncertainty}`, () => {
    const question = { expected: '21' };
    const result = evaluateAnswer(`If the question used random drawing, the answer is 29. Final answer: 21. ${uncertainty}`, question);
    assert.equal(result.reason, 'Ambiguous answer');
    assert.equal(needsModelJudge(result, question), false);
  });
}
