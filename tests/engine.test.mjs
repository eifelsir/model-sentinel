import test from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../core/engine.mjs';
import { defaultConfig } from '../core/config.mjs';
import { animation } from './fixtures/html-animation.mjs';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
function config() {
  return { ...defaultConfig(), connections: [{ id: 'c', name: 'Connection', baseUrl: 'http://localhost', apiKey: '', protocol: 'chat' }], prompts: [{ id: 'p', name: 'Prompt', prompt: 'compute', expected: '21', mode: 'auto' }], targets: ['a', 'b', 'd'].map(id => ({ id, connectionId: 'c', model: id, promptIds: ['p'], enabled: true, intervalMinutes: 30, timeoutSeconds: 180 })) };
}
test('global concurrency, synchronous overlap guard and completion persistence', async () => {
  const value = config(); value.settings.concurrency = 2;
  let active = 0, max = 0, calls = 0; const saved = [];
  const engine = new Engine({ config: value, request: async () => { calls++; max = Math.max(max, ++active); await pause(25); active--; return { text: '21', incomplete: false }; }, persist: async (c, h) => saved.push(structuredClone(h)) });
  try {
    await Promise.all([engine.run(), engine.run(['a'])]);
    assert.equal(calls, 3); assert.equal(max, 2);
    const state = engine.snapshot();
    assert.equal(state.history.length, 3); assert.ok(state.history.every(r => r.status === 'normal' && r.completedAt));
    assert.ok(saved.at(-1).every(r => r.status === 'normal'));
  } finally { await engine.close(); }
});
test('stop cancels queued and in-flight tasks, pauses auto and persists insufficient outcomes', async () => {
  const value = config(); value.settings.concurrency = 1; const saved = [];
  const engine = new Engine({ config: value, request: async (_c, _t, _p, { signal }) => new Promise(resolve => signal.addEventListener('abort', () => resolve({ text: '', incomplete: true, reason: 'cancelled' }), { once: true })), persist: async (c, h) => saved.push(structuredClone(h)) });
  try {
    const pending = engine.run(); await pause(10); engine.stop(); await pending;
    assert.equal(engine.snapshot().config.settings.autoRun, false);
    assert.equal(engine.snapshot().history.length, 3);
    assert.ok(engine.snapshot().history.every(r => r.status === 'insufficient'));
    assert.ok(saved.at(-1).every(r => r.completedAt));
  } finally { await engine.close(); }
});
test('automatic immediate run uses immutable snapshots despite deleted targets', async () => {
  const value = config(); value.targets = value.targets.slice(0, 1);
  const engine = new Engine({ config: value, request: async () => { await pause(30); return { text: '21' }; } });
  try {
    engine.setAuto(true);
    assert.deepEqual(engine.snapshot().activeTargetIds, ['a']);
    engine.updateConfig({ ...value, targets: [], prompts: [] });
    await pause(80);
    const state = engine.snapshot();
    assert.equal(state.history[0].status, 'normal');
    assert.equal(state.history[0].results[0].expected, '21');
    assert.deepEqual(state.nextRuns, {});
  } finally { await engine.close(); }
});
test('explicit wrong dominates insufficient, unknown outputs never pass', async () => {
  const value = config(); value.targets = value.targets.slice(0, 1);
  value.prompts.push({ id: 'q', name: 'Other', prompt: 'other', expected: '21', mode: 'auto' });
  value.targets[0].promptIds.push('q');
  const engine = new Engine({ config: value, request: async (_c, _t, p) => p.id === 'p' ? { text: '22' } : { text: '', incomplete: true } });
  try { await engine.run(); assert.equal(engine.snapshot().history[0].status, 'degraded'); }
  finally { await engine.close(); }
});
test('saved empty-prompt targets run as insufficient without requests', async () => {
  const value = config(); value.targets = value.targets.slice(0, 1); value.targets[0].promptIds = [];
  let called = false;
  const engine = new Engine({ config: value, request: async () => { called = true; return { text: '21' }; } });
  try {
    await engine.run();
    assert.equal(called, false);
    assert.equal(engine.snapshot().history[0].status, 'insufficient');
    assert.match(engine.snapshot().history[0].results[0].reason, /prompt|test/i);
  } finally { await engine.close(); }
});
test('scheduled rounds repeat and Stop All clears next runs', async () => {
  const value = config(); value.targets = value.targets.slice(0, 1); value.targets[0].intervalMinutes = 0.001;
  const engine = new Engine({ config: value, request: async () => ({ text: '21' }) });
  try {
    engine.setAuto(true); await pause(190); engine.stop();
    assert.ok(engine.snapshot().history.length >= 2);
    const count = engine.snapshot().history.length;
    assert.deepEqual(engine.snapshot().nextRuns, {});
    await pause(90); assert.equal(engine.snapshot().history.length, count);
  } finally { await engine.close(); }
});
test('target cancellation and timeout cannot be overwritten by a late response', async () => {
  const value = config(); value.targets = value.targets.slice(0, 1); value.targets[0].timeoutSeconds = 0.02;
  const engine = new Engine({ config: value, request: async () => { await pause(100); return { text: '21' }; } });
  try {
    await engine.run();
    assert.equal(engine.snapshot().history[0].status, 'insufficient');
    assert.match(engine.snapshot().history[0].results[0].reason, /timed out/);
    await pause(120);
    assert.equal(engine.snapshot().history[0].status, 'insufficient');
  } finally { await engine.close(); }
});
test('global limit applies across prompts as well as targets', async () => {
  const value = config(); value.settings.concurrency = 2;
  value.prompts.push({ id: 'q', name: 'q', prompt: 'q', expected: '21' });
  value.targets.forEach(t => t.promptIds.push('q'));
  let active = 0, max = 0;
  const engine = new Engine({ config: value, request: async () => { max = Math.max(max, ++active); await pause(10); active--; return { text: '21' }; } });
  try { await engine.run(); assert.equal(max, 2); assert.equal(engine.snapshot().history.flatMap(r => r.results).length, 6); }
  finally { await engine.close(); }
});
test('restart recovery and bounded global history preserve recent details', async () => {
  const value = config(); value.targets = [];
  const history = [{ id: 'interrupted', status: 'detecting', results: [{ status: 'detecting', text: '' }] }, ...Array.from({ length: 1004 }, (_, i) => ({ id: String(i), status: 'normal', completedAt: new Date().toISOString(), results: [{ status: 'normal', text: 'a'.repeat(i === 0 ? 70000 : 1) }] }))];
  const engine = new Engine({ config: value, history });
  try {
    const state = engine.snapshot();
    assert.equal(state.history.length, 1000);
    assert.equal(state.history[0].status, 'insufficient');
    assert.ok(state.history[0].completedAt);
    assert.equal(state.history[1].results[0].text.length, 65536);
  } finally { await engine.close(); }
});
test('judge inspects the complete response before history is bounded', async () => {
  const value = config(); value.targets = value.targets.slice(0, 1);
  const engine = new Engine({ config: value, request: async () => ({ text: 'Final answer: 21\n' + 'Explanation. '.repeat(6000) + '\nFinal answer: 22' }) });
  try {
    await engine.run();
    assert.equal(engine.snapshot().history[0].status, 'insufficient');
    assert.equal(engine.snapshot().history[0].results[0].text.length, 65536);
  } finally { await engine.close(); }
});
test('close aborts queued work but preserves the persisted automatic-run preference', async () => {
  const value = config(); value.settings.autoRun = true; value.settings.concurrency = 1;
  const saved = [];
  const engine = new Engine({ config: value, request: async (_c, _t, _p, { signal }) => new Promise(resolve => {
    signal.addEventListener('abort', () => resolve({ text: '', incomplete: true, reason: 'cancelled' }), { once: true });
  }), persist: async (c, h) => saved.push({ config: structuredClone(c), history: structuredClone(h) }) });
  await pause(10);
  await engine.close();
  assert.equal(engine.snapshot().config.settings.autoRun, true);
  assert.equal(saved.at(-1).config.settings.autoRun, true);
  assert.ok(saved.at(-1).history.every(r => r.status === 'insufficient' && r.completedAt));
  assert.deepEqual(engine.snapshot().nextRuns, {});
  assert.deepEqual(engine.snapshot().activeTargetIds, []);
});

test('HTML-only rounds report generation while mixed rounds preserve text correctness', async () => {
  const value = config();
  value.prompts.push({ id: 'html', name: 'SVG animation', prompt: 'Generate HTML animation', type: 'html' });
  value.targets = [
    { ...value.targets[0], promptIds: ['html'] },
    { ...value.targets[1], promptIds: ['p', 'html'] },
  ];
  const engine = new Engine({ config: value, request: async (_c, _t, p) => ({ text: p.type === 'html' ? animation : '21' }) });
  try {
    await engine.run();
    const history = engine.snapshot().history;
    assert.equal(history.find(r => r.targetId === 'a').status, 'generated');
    assert.equal(history.find(r => r.targetId === 'b').status, 'normal');
    const result = history.find(r => r.targetId === 'b').results[1];
    assert.equal(result.type, 'html');
    assert.equal(result.status, 'generated');
    assert.equal(result.answer, '');
    assert.equal(result.html, animation);
  } finally { await engine.close(); }
});

test('truncated HTML replies never create previewable artifacts', async () => {
  const value = config();
  value.prompts = [{ id: 'html', name: 'SVG animation', prompt: 'Generate HTML animation', type: 'html' }];
  value.targets = [{ ...value.targets[0], promptIds: ['html'] }];
  const engine = new Engine({ config: value, request: async () => ({ text: animation, incomplete: true }) });
  try {
    await engine.run();
    assert.equal(engine.snapshot().history[0].status, 'insufficient');
    assert.equal(engine.snapshot().history[0].results[0].html || '', '');
  } finally { await engine.close(); }
});

test('engine retains normalized usage for completed and incomplete answers with protocol overrides', async () => {
  const value = config();
  value.targets = [
    { ...value.targets[0], protocol: 'responses' },
    { ...value.targets[1], protocol: 'gemini' },
    { ...value.targets[2], protocol: 'anthropic' },
  ];
  const engine = new Engine({ config: value, request: async (_c, t) =>
    t.protocol === 'gemini'
      ? { text: '21', incomplete: true, usage: { promptTokenCount: 10, candidatesTokenCount: 20, thoughtsTokenCount: 5, totalTokenCount: 35 } }
      : t.protocol === 'anthropic'
        ? { text: '21', usage: { input_tokens: 10, cache_read_input_tokens: 30, output_tokens: 20 } }
        : { text: '21', usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 } },
  });
  try {
    await engine.run();
    const rounds = engine.snapshot().history;
    assert.equal(rounds.find(r => r.targetId === 'a').results[0].usage?.totalTokens, 30);
    const incomplete = rounds.find(r => r.targetId === 'b');
    assert.equal(incomplete.status, 'insufficient');
    assert.equal(incomplete.results[0].usage?.totalTokens, 35);
    assert.equal(incomplete.results[0].usage?.outputTokens, 25);
    assert.equal(rounds.find(r => r.targetId === 'd').results[0].usage?.inputTokens, 40);
  } finally { await engine.close(); }
});

test('answer evaluation failures preserve known usage and missing usage stays unknown', async () => {
  const engine = new Engine({
    config: config(),
    request: async (_c, t) => ({ text: '21', usage: t.id === 'a' ? { prompt_tokens: 10, completion_tokens: 20 } : null }),
    judge: async () => { throw new Error('evaluation failed'); },
  });
  try {
    await engine.run();
    const rounds = engine.snapshot().history;
    assert.equal(rounds.find(r => r.targetId === 'a').results[0].usage?.totalTokens, 30);
    assert.equal(rounds.find(r => r.targetId === 'b').results[0].usage, null);
    assert.ok(rounds.every(r => r.status === 'insufficient'));
  } finally { await engine.close(); }
});
