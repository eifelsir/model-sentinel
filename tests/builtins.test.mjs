import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultConfig, validateConfig } from '../core/config.mjs';
import { includeBuiltinPrompts } from '../core/builtins.mjs';
import { evaluateAnswer } from '../core/answer.mjs';
import { Store } from '../core/store.mjs';

test('new profiles include the saved answer-only questions and combined question', () => {
  const { prompts } = defaultConfig();
  const milk = prompts.find(p => p.id === 'builtin-milk');
  const candy = prompts.find(p => p.id === 'builtin-candy');
  const combined = prompts.find(p => p.name === '二合一');
  assert.ok(milk.prompt.endsWith('\n\n只回复答案'));
  assert.ok(candy.prompt.endsWith('\n\n\n只回复答案'));
  assert.equal(milk.expected, '46.24');
  assert.equal(candy.expected, '21');
  assert.ok(combined, 'the saved combined question is available in a new profile');
  assert.equal(combined.expected, '21和46.24');
  assert.equal(combined.mode, 'auto');
  assert.ok(combined.prompt.startsWith('分别回答以下两个问题：\n\n在一个黑色的袋子里'));
  assert.ok(combined.prompt.includes('A previously isolated, newly discovered, randomly mating mammalian species'));
  assert.ok(combined.prompt.endsWith('仅回复答案什么和什么，例如：11和12     ，不要有多余汉字'));
});

test('version-one profiles gain the combined question without changing saved questions or assignments', () => {
  const config = defaultConfig();
  config.builtinsVersion = 1;
  config.prompts = [{ id: 'custom', type: 'text', name: 'My milk', prompt: 'My edited question', expected: '50', mode: 'auto', pattern: '' }];
  config.connections = [{ id: 'c', name: 'Saved', baseUrl: 'http://localhost', protocol: 'responses' }];
  config.targets = [{ id: 't', connectionId: 'c', model: 'saved-model', promptIds: ['custom'] }];
  const original = structuredClone(config);
  const updated = includeBuiltinPrompts(config);
  assert.equal(updated.prompts.length, 2);
  assert.deepEqual(updated.prompts[0], original.prompts[0]);
  assert.equal(updated.prompts[1].name, '二合一');
  assert.equal(updated.prompts[1].expected, '21和46.24');
  assert.deepEqual(updated.targets, original.targets);
  assert.deepEqual(config, original);
  assert.equal(updated.builtinsVersion, 2);
  assert.strictEqual(includeBuiltinPrompts(updated), updated);
});

test('upgrading an existing copy of the combined question preserves its identity and edited answer', () => {
  const combined = defaultConfig().prompts.find(p => p.name === '二合一');
  assert.ok(combined);
  const config = { ...defaultConfig(), builtinsVersion: 1, prompts: [{ ...combined, id: 'already-saved', expected: 'my-answer' }] };
  const updated = includeBuiltinPrompts(config);
  assert.deepEqual(updated.prompts, config.prompts);
  assert.equal(updated.builtinsVersion, 2);
});

test('a custom question with the builtin ID is retained when the combined question is added', () => {
  const config = { ...defaultConfig(), builtinsVersion: 1, prompts: [{ id: 'builtin-combined', type: 'text', name: 'Custom', prompt: 'custom question', expected: 'custom answer', mode: 'auto', pattern: '' }] };
  const updated = includeBuiltinPrompts(config);
  assert.equal(updated.prompts.length, 2);
  assert.equal(updated.prompts[0].prompt, 'custom question');
  assert.equal(updated.prompts[1].expected, '21和46.24');
  assert.notEqual(updated.prompts[1].id, 'builtin-combined');
  assert.equal(validateConfig(updated).builtinsVersion, 2);
});

test('a full saved question list remains valid and completes its upgrade after space is available', () => {
  const config = {
    ...defaultConfig(), builtinsVersion: 1,
    prompts: Array.from({ length: 1000 }, (_, i) => ({
      id: `saved-${i}`, type: 'text', name: `Saved ${i}`, prompt: `Question ${i}`, expected: `${i}`, mode: 'auto', pattern: '',
    })),
  };
  const original = structuredClone(config);
  assert.equal(validateConfig(config).prompts.length, 1000);
  const deferred = includeBuiltinPrompts(config);
  assert.deepEqual(deferred, original);
  assert.equal(validateConfig(deferred).builtinsVersion, 1);
  const updated = includeBuiltinPrompts({ ...deferred, prompts: deferred.prompts.slice(1) });
  assert.equal(updated.prompts.length, 1000);
  assert.deepEqual(updated.prompts.slice(0, -1), original.prompts.slice(1));
  assert.equal(updated.prompts.at(-1).expected, '21和46.24');
  assert.equal(validateConfig(updated).builtinsVersion, 2);
  assert.deepEqual(config, original);
});

test('legacy profiles receive all presets and migrated versions survive storage and restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sentinel-builtin-upgrade-'));
  try {
    const config = { ...defaultConfig(), builtinsVersion: 0, prompts: [] };
    const updated = includeBuiltinPrompts(config);
    assert.equal(updated.prompts.length, 4);
    await new Store(directory).save(updated, []);
    const loaded = await new Store(directory).load();
    assert.equal(loaded.config.builtinsVersion, 2);
    assert.equal(loaded.config.prompts.length, 4);
    assert.strictEqual(includeBuiltinPrompts(loaded.config), loaded.config);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('combined answers retain both values in order during local comparison', () => {
  const question = defaultConfig().prompts.find(p => p.name === '二合一');
  assert.ok(question);
  for (const [reply, status] of [
    ['21和46.24', 'normal'],
    ['最终答案：**21和46.24**', 'normal'],
    ['21和47.24', 'degraded'],
    ['46.24和21', 'degraded'],
    ['21', 'degraded'],
    ['无法回答', 'insufficient'],
  ]) {
    assert.equal(evaluateAnswer(reply, question).status, status, reply);
  }
});
