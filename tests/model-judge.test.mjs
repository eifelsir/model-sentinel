import test from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../core/engine.mjs';
import { defaultConfig } from '../core/config.mjs';
import { roundUsage, usageRecords } from '../core/usage.mjs';
import { createMockServer } from '../scripts/mock-server.mjs';

const source = 'You will need a grand total of **21 pieces** to guarantee it.';
const extraction = JSON.stringify({ answer: '21', evidence: 'a grand total of **21 pieces**' });
function configuration(baseUrl, protocol = 'responses', expected = '21') {
  return {
    ...defaultConfig(),
    connections: [{ id: 'c', name: 'Local', baseUrl, apiKey: 'judge-fixture-key', protocol }],
    prompts: [{ id: 'p', name: 'Question', prompt: 'original-question', expected }],
    targets: [{ id: 't', connectionId: 'c', model: 'test-normal', promptIds: ['p'] }],
    settings: { ...defaultConfig().settings, answerJudgeTargetId: '@current' },
  };
}
const promptFrom = body => body.input || body.messages?.[0]?.content || body.contents?.[0]?.parts?.[0]?.text;

for (const protocol of ['responses', 'chat', 'gemini', 'anthropic']) {
  test(`${protocol} configured model extracts an answer only after local extraction fails`, async () => {
    const fixture = await createMockServer({
      textForRequest: ({ body }) => promptFrom(body) === 'original-question' ? source : extraction,
    });
    const engine = new Engine({ config: configuration(fixture.baseUrl, protocol) });
    try {
      await engine.run();
      const round = engine.snapshot().history[0], result = round.results[0];
      assert.equal(result.status, 'normal');
      assert.equal(result.answer, '21');
      assert.equal(result.text, source);
      assert.equal(result.judgement.model, 'test-normal');
      assert.equal(result.judgement.evidence, 'a grand total of **21 pieces**');
      assert.equal(fixture.requests.length, 2);
      assert.equal(promptFrom(fixture.requests[0].body), 'original-question');
      assert.equal('expected' in fixture.requests[1].body, false);
      if (protocol === 'responses') {
        assert.equal(result.usage.totalTokens, 22);
        assert.equal(result.judgement.usage.totalTokens, 22);
        assert.equal(roundUsage(round).totalTokens, 44);
      }
    } finally { await engine.close(); await fixture.close(); }
  });
}

test('judge receives no fixed answer and cannot turn a different extracted answer into a pass', async () => {
  const fixture = await createMockServer({ textForRequest: ({ body }) => promptFrom(body) === 'original-question' ? source : extraction });
  const engine = new Engine({ config: configuration(fixture.baseUrl, 'responses', '999901') });
  try {
    await engine.run();
    const result = engine.snapshot().history[0].results[0];
    assert.equal(result.status, 'degraded');
    assert.equal(result.answer, '21');
    assert.equal(JSON.stringify(fixture.requests).includes('999901'), false);
  } finally { await engine.close(); await fixture.close(); }
});

test('model extraction accepts literal Chinese evidence and sentence-final punctuation', async () => {
  for (const [reply, answer, evidence] of [
    ['需要的总数量为21颗。', '21', '需要的总数量为21颗。'],
    ['You need 21.', '21', 'You need 21.'],
  ]) {
    let calls = 0;
    const engine = new Engine({
      config: configuration('http://localhost'),
      request: async () => ({ text: ++calls === 1 ? reply : JSON.stringify({ answer, evidence }) }),
    });
    try {
      await engine.run();
      assert.equal(engine.snapshot().history[0].results[0].status, 'normal');
      assert.equal(calls, 2);
    } finally { await engine.close(); }
  }
});

for (const [name, reply] of [
  ['invalid JSON', 'The answer is 21.'],
  ['unsupported evidence', JSON.stringify({ answer: '21', evidence: 'The final answer is 21.' })],
  ['answer missing from evidence', JSON.stringify({ answer: '22', evidence: 'a grand total of **21 pieces**' })],
  ['uncertain conclusion', JSON.stringify({ answer: null, evidence: '' })],
]) {
  test(`judge rejects ${name} while retaining request usage`, async () => {
    const fixture = await createMockServer({ textForRequest: ({ body }) => promptFrom(body) === 'original-question' ? source : reply });
    const engine = new Engine({ config: configuration(fixture.baseUrl) });
    try {
      await engine.run();
      const result = engine.snapshot().history[0].results[0];
      assert.equal(result.status, 'insufficient');
      assert.equal(result.answer, '');
      assert.equal(result.judgement.usage.totalTokens, 22);
    } finally { await engine.close(); await fixture.close(); }
  });
}

test('disabled fallback, known answers, refusals and incomplete replies never call the judge', async () => {
  for (const [text, incomplete, enabled] of [[source, false, false], ['22', false, true], ['I cannot answer this question.', false, true], [source, true, true]]) {
    const value = configuration('http://localhost');
    if (!enabled) value.settings.answerJudgeTargetId = '';
    let calls = 0;
    const engine = new Engine({ config: value, request: async () => { calls++; return { text, incomplete }; } });
    try {
      await engine.run();
      assert.equal(calls, 1);
      assert.equal(engine.snapshot().history[0].results[0].judgement, undefined);
    } finally { await engine.close(); }
  }
});

for (const reply of [
  'Final answer: 21\nFinal answer: 22',
  'Final answer: 21 / 2',
  'Final answer: 21 or 22',
  'Maybe the final answer is 21.',
]) {
  test(`auxiliary extraction cannot override a locally unresolved conclusion: ${reply}`, async () => {
    let calls = 0;
    const engine = new Engine({
      config: configuration('http://localhost'),
      request: async () => ({ text: ++calls === 1 ? reply : JSON.stringify({ answer: '21', evidence: reply.split('\n')[0] }) }),
    });
    try {
      await engine.run();
      const result = engine.snapshot().history[0].results[0];
      assert.equal(result.status, 'insufficient');
      assert.equal(result.answer, '');
      assert.equal(calls, 1);
    } finally { await engine.close(); }
  });
}

for (const [reply, evidence] of [
  ['You will need a grand total of **-21 pieces** to guarantee it.', 'a grand total of **-21 pieces**'],
  ['You will need a grand total of **-21 pieces** to guarantee it.', '21 pieces'],
  ['You will need a grand total of **21 / 2 pieces** to guarantee it.', '21'],
  ['You will need a grand total of **1 / 21 pieces** to guarantee it.', '21'],
  ['You will need a grand total of **21 thousand pieces** to guarantee it.', '21'],
  ['需要的总数量为21颗+2颗。', '21颗'],
  ['需要的总数量为21颗乘以2。', '21颗'],
]) {
  test(`auxiliary numeric evidence must preserve the complete quantity: ${reply} / ${evidence}`, async () => {
    let calls = 0;
    const engine = new Engine({
      config: configuration('http://localhost'),
      request: async () => ({ text: ++calls === 1 ? reply : JSON.stringify({ answer: '21', evidence }) }),
    });
    try {
      await engine.run();
      const result = engine.snapshot().history[0].results[0];
      assert.equal(result.status, 'insufficient');
      assert.equal(result.answer, '');
      assert.equal(calls, 2);
    } finally { await engine.close(); }
  });
}

test('auxiliary extraction preserves a complete negative answer', async () => {
  let calls = 0;
  const engine = new Engine({
    config: configuration('http://localhost'),
    request: async () => ({
      text: ++calls === 1 ? 'You will need a grand total of **-21 pieces** to guarantee it.'
        : JSON.stringify({ answer: '-21', evidence: 'a grand total of **-21 pieces**' }),
    }),
  });
  try {
    await engine.run();
    assert.equal(engine.snapshot().history[0].results[0].status, 'degraded');
    assert.equal(engine.snapshot().history[0].results[0].answer, '-21');
  } finally { await engine.close(); }
});

test('selected judge uses its saved connection and remains immutable during configuration changes', async () => {
  const value = configuration('http://source.local');
  value.connections.push({ id: 'judge-connection', name: 'Judge', baseUrl: 'http://judge.local', apiKey: 'other-test-key', protocol: 'chat' });
  value.targets.push({ id: 'judge', connectionId: 'judge-connection', model: 'another-model', promptIds: [], enabled: false });
  value.settings.answerJudgeTargetId = 'judge';
  let resolveSource;
  const sourcePromise = new Promise(resolve => { resolveSource = resolve; });
  const calls = [];
  const engine = new Engine({ config: value, request: async (connection, target, question) => {
    calls.push({ url: connection.baseUrl, model: target.model, prompt: question.prompt });
    return calls.length === 1 ? sourcePromise : { text: extraction };
  } });
  try {
    const pending = engine.run(['t']);
    engine.updateConfig({ ...value, targets: value.targets.slice(0, 1), settings: { ...value.settings, answerJudgeTargetId: '' } });
    resolveSource({ text: source });
    await pending;
    assert.equal(calls.length, 2);
    assert.equal(calls[1].url, 'http://judge.local');
    assert.equal(calls[1].model, 'another-model');
    assert.equal(engine.snapshot().history[0].results[0].status, 'normal');
  } finally { resolveSource({ text: source }); await engine.close(); }
});

test('auxiliary requests hide current and rotated keys in the question and source reply', async () => {
  const value = configuration('http://source.local');
  value.connections[0].apiKey = 'source-fake-secret';
  value.connections.push({ id: 'judge-connection', name: 'Judge', baseUrl: 'http://judge.local', apiKey: 'judge-fake-secret', protocol: 'chat' });
  value.targets.push({ id: 'judge', connectionId: 'judge-connection', model: 'another-model', promptIds: [], enabled: false });
  value.settings.answerJudgeTargetId = 'judge';
  value.prompts[0].prompt += '\nsource-fake-secret';
  let resolveSource, judgePrompt;
  const waiting = new Promise(resolve => { resolveSource = resolve; });
  let calls = 0;
  const engine = new Engine({ config: value, request: async (_connection, _target, question) => {
    if (++calls === 1) return waiting;
    judgePrompt = question.prompt;
    return { text: extraction };
  } });
  try {
    const pending = engine.run(['t']);
    const changed = structuredClone(value);
    changed.connections[0].apiKey = 'rotated-fake-secret';
    engine.updateConfig(changed);
    resolveSource({ text: `${source}\nDebug authorization: source-fake-secret; judge-fake-secret; rotated-fake-secret` });
    await pending;
    assert.equal(calls, 2);
    for (const key of ['source-fake-secret', 'judge-fake-secret', 'rotated-fake-secret']) assert.ok(!judgePrompt.includes(key));
    assert.ok(judgePrompt.includes(source));
    assert.equal(engine.snapshot().history[0].results[0].status, 'normal');
  } finally { resolveSource({ text: source }); await engine.close(); }
});

test('Stop All aborts an auxiliary request and a late judge cannot change the verdict', async () => {
  const value = configuration('http://localhost');
  let judgeStarted;
  const started = new Promise(resolve => { judgeStarted = resolve; });
  let resolveJudge;
  const late = new Promise(resolve => { resolveJudge = resolve; });
  let calls = 0;
  const engine = new Engine({ config: value, request: async () => ++calls === 1 ? { text: source, usage: { input_tokens: 10, output_tokens: 12, total_tokens: 22 } } : (judgeStarted(), late) });
  try {
    const pending = engine.run();
    await Promise.race([started, new Promise((_, reject) => setTimeout(() => reject(new Error('Auxiliary request did not start')), 1000))]);
    engine.stop();
    await pending;
    const cancelled = engine.snapshot().history[0];
    assert.equal(usageRecords(cancelled).length, 2);
    assert.equal(usageRecords(cancelled)[1].model, 'test-normal');
    assert.equal(usageRecords(cancelled)[1].auxiliary, true);
    assert.equal(usageRecords(cancelled)[1].usage, null);
    assert.equal(roundUsage(cancelled).counts.totalTokens, 1);
    assert.equal(roundUsage(cancelled).samples, 2);
    resolveJudge({ text: extraction, usage: { input_tokens: 10, output_tokens: 12, total_tokens: 22 } });
    await new Promise(resolve => setTimeout(resolve, 10));
    const result = engine.snapshot().history[0].results[0];
    assert.equal(result.status, 'insufficient');
    assert.match(result.reason, /cancelled/);
    assert.equal(result.text, source);
    assert.deepEqual(engine.snapshot().history[0], cancelled);
  } finally { resolveJudge?.({ text: extraction }); await engine.close(); }
});
