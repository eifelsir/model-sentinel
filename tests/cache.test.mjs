import test from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../core/engine.mjs';
import { defaultConfig } from '../core/config.mjs';
import { createMockServer } from '../scripts/mock-server.mjs';

const promptIn = body => body.input || body.messages?.[0]?.content || body.contents?.[0]?.parts?.[0]?.text;
test('cache bypass covers text, HTML and auxiliary extraction with a snapshot retained on each round', async () => {
  const reply = 'You will need a grand total of **21 pieces** to guarantee it.';
  const fixture = await createMockServer({
    textForRequest: ({ body }) => promptIn(body).endsWith('original-question') ? reply :
      promptIn(body).endsWith('html-question') ? '<!doctype html><html><body><svg xmlns="http://www.w3.org/2000/svg"><circle r="10"/></svg></body></html>' :
        JSON.stringify({ answer: '21', evidence: 'a grand total of **21 pieces**' }),
  });
  const config = defaultConfig();
  config.connections = [{ id: 'c', name: 'Local', baseUrl: fixture.baseUrl, protocol: 'responses' }];
  config.prompts = [{ id: 'p', name: 'Text', prompt: 'original-question', expected: '21' }, { id: 'h', name: 'HTML', prompt: 'html-question', type: 'html' }];
  config.targets = [{ id: 't', connectionId: 'c', model: 'test-normal', promptIds: ['p', 'h'] }];
  config.settings.bypassCache = true;
  config.settings.answerJudgeTargetId = '@current';
  const engine = new Engine({ config });
  try {
    await engine.run();
    const round = engine.snapshot().history[0];
    assert.equal(round.bypassCache, true);
    assert.equal(round.status, 'normal');
    assert.equal(round.results[0].answer, '21');
    assert.equal(round.results[1].status, 'generated');
    assert.equal(round.results[0].judgement.status, 'normal');
    assert.equal(round.results[0].prompt, 'original-question');
    assert.equal(fixture.requests.length, 3);
    const prompts = fixture.requests.map(request => promptIn(request.body));
    assert.equal(new Set(prompts.map(prompt => prompt.split('\n')[0])).size, 3);
    for (const prompt of prompts) assert.match(prompt, /^\[Model Sentinel request: [0-9a-f-]{36}\]\n/);
    const next = engine.snapshot().config;
    next.settings.bypassCache = false;
    engine.updateConfig(next);
    await engine.run();
    const state = engine.snapshot();
    assert.equal(state.history[0].bypassCache, false);
    assert.equal(state.history[1].bypassCache, true);
    const laterPrompts = fixture.requests.slice(3).map(request => promptIn(request.body));
    assert.ok(laterPrompts.includes('original-question'));
    assert.ok(laterPrompts.includes('html-question'));
    for (const prompt of laterPrompts) assert.equal(prompt.startsWith('[Model Sentinel request:'), false);
  } finally { await engine.close(); await fixture.close(); }
});

test('changing the cache switch during a round affects only later rounds, including queued questions', async () => {
  let release, observed;
  const gate = new Promise(resolve => { release = resolve; });
  const entered = new Promise(resolve => { observed = resolve; });
  let count = 0;
  const fixture = await createMockServer({
    beforeReply: async () => { if (++count === 1) { observed(); await gate; } },
  });
  const config = defaultConfig();
  config.settings.concurrency = 1;
  config.settings.bypassCache = true;
  config.connections = [{ id: 'c', name: 'Local', baseUrl: fixture.baseUrl, protocol: 'responses' }];
  config.prompts = ['first', 'second'].map(id => ({ id, name: id, prompt: id, expected: '42' }));
  config.targets = [{ id: 't', connectionId: 'c', model: 'test-normal', promptIds: ['first', 'second'] }];
  const engine = new Engine({ config });
  try {
    const running = engine.run();
    await entered;
    const next = engine.snapshot().config;
    next.settings.bypassCache = false;
    engine.updateConfig(next);
    release();
    await running;
    assert.equal(fixture.requests.length, 2);
    for (const request of fixture.requests) assert.match(promptIn(request.body), /^\[Model Sentinel request:/);
    await engine.run();
    assert.deepEqual(fixture.requests.slice(2).map(request => promptIn(request.body)), ['first', 'second']);
    assert.deepEqual(engine.snapshot().history.map(round => round.bypassCache), [false, true]);
  } finally { release(); await engine.close(); await fixture.close(); }
});
