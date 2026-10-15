import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultConfig, validateConfig } from '../core/config.mjs';
import { Store, recoverHistory, boundedHistory } from '../core/store.mjs';

test('a new profile includes the three built-in questions without altering the HTML prompt', () => {
  const config = defaultConfig();
  assert.equal(config.prompts.find(p => p.name === '牛奶题')?.expected, '46.24');
  assert.equal(config.prompts.find(p => p.name === '糖果题')?.expected, '21');
  const html = config.prompts.find(p => p.type === 'html');
  assert.equal(html?.prompt, '不用skill的情况下生成html，内容是svg绘制猪八戒骑自行车2D动画，不要进行测试，不要读取我的记忆文件。');
  assert.equal(html.expected, '');
});

test('config defaults and relationship validation', () => {
  const config = defaultConfig();
  assert.equal(config.settings.concurrency, 4);
  assert.equal(config.settings.autoRun, false);
  assert.throws(() => validateConfig({ ...config, settings: { ...config.settings, concurrency: 0 } }));
  assert.throws(() => validateConfig({ ...config, targets: [{ id: 't', connectionId: 'missing', model: 'm', promptIds: [] }] }));
  assert.throws(() => validateConfig({ ...config, connections: [{ id: 'c', name: 'c', baseUrl: 'file:///secret', protocol: 'chat' }] }));
  const draft = { ...config, connections: [{ id: 'c', name: 'c', baseUrl: 'http://localhost', protocol: 'chat' }], targets: [{ id: 't', connectionId: 'c', model: 'm', promptIds: [] }] };
  assert.deepEqual(validateConfig(draft).targets[0].promptIds, []);
});

test('HTML questions do not require fixed answers and old questions remain text questions', () => {
  const config = defaultConfig();
  config.prompts = [
    { id: 'text', name: 'Text', prompt: '6*7?', expected: '42', mode: 'auto' },
    { id: 'html', name: 'Animation', prompt: 'Return HTML with SVG animation.', type: 'html' },
  ];
  const valid = validateConfig(config);
  assert.equal(valid.prompts[0].type, 'text');
  assert.equal(valid.prompts[1].type, 'html');
  assert.equal(valid.prompts[1].expected, '');
  assert.throws(() => validateConfig({ ...config, prompts: [{ ...config.prompts[0], type: 'unknown' }] }));
  assert.throws(() => validateConfig({ ...config, prompts: [{ ...config.prompts[0], expected: '' }] }));
});

test('restart and history bounds preserve a text verdict with pending HTML', () => {
  const round = {
    id: 'partial', status: 'normal', startedAt: new Date().toISOString(), completedAt: null,
    results: [{ type: 'text', promptId: 'p', status: 'normal', answer: '21' }, { type: 'html', promptId: 'h', status: 'detecting' }],
  };
  const older = Array.from({ length: 1001 }, (_, i) => ({ id: `old-${i}`, status: 'normal', results: [] }));
  assert.equal(boundedHistory([...older, round]).some(r => r.id === 'partial'), true);
  const recovered = recoverHistory([round])[0];
  assert.equal(recovered.status, 'normal');
  assert.equal(recovered.results[0].answer, '21');
  assert.equal(recovered.results[1].status, 'insufficient');
  assert.ok(recovered.completedAt);
});

test('configuration and encrypted backup recover all models and questions after a missing primary file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'sentinel-store-'));
  const cipher = { encrypt: s => Buffer.from(s).toString('base64'), decrypt: s => Buffer.from(s, 'base64').toString() };
  try {
    const config = defaultConfig();
    config.connections = [{ id: 'c', name: 'Saved', baseUrl: 'http://localhost', apiKey: 'persistent-private-key', protocol: 'responses' }];
    config.prompts = [
      { id: 'p', name: 'Candy', prompt: 'Candy question', expected: '21' },
      { id: 'h', name: 'HTML animation', prompt: 'Generate SVG in HTML', type: 'html', expected: 'unused' },
    ];
    config.targets = ['model-a', 'model-b'].map(id => ({ id, connectionId: 'c', model: id, promptIds: ['p', 'h'] }));
    const history = [{ id: 'r', targetId: 'model-a', status: 'normal', results: [{ type: 'html', status: 'generated', html: '<html>saved artifact</html>', text: 'saved response' }] }];
    const store = new Store(dir, cipher);
    await store.save(config, history);
    const restarted = await new Store(dir, cipher).load();
    assert.deepEqual(restarted.config, validateConfig(config));
    assert.equal(restarted.history[0].results[0].html, '<html>saved artifact</html>');
    await rm(join(dir, 'state.json'));
    const recovered = await new Store(dir, cipher).load();
    assert.deepEqual(recovered, restarted);
    const backup = await readFile(join(dir, 'state.backup.json'), 'utf8');
    assert.equal(backup.includes('persistent-private-key'), false);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('store encrypts keys, serializes atomic writes and preserves corruption', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'sentinel-store-'));
  const cipher = { encrypt: s => Buffer.from(s).toString('base64'), decrypt: s => Buffer.from(s, 'base64').toString() };
  try {
    const store = new Store(dir, cipher);
    const config = defaultConfig();
    config.connections = [{ id: 'c', name: 'c', provider: 'custom', baseUrl: 'http://localhost', protocol: 'chat', apiKey: 'top-secret-key', models: [] }];
    await Promise.all([store.save(config, []), store.save(config, [{ id: 'newest', status: 'normal', results: [] }])]);
    const files = await readdir(dir);
    const file = 'state.json';
    assert.ok(files.includes(file));
    const raw = await readFile(join(dir, file), 'utf8');
    assert.ok(!raw.includes('top-secret-key'));
    assert.equal((await store.load()).config.connections[0].apiKey, 'top-secret-key');
    assert.equal((await store.load()).history[0].id, 'newest');
    await writeFile(join(dir, file), '{ broken data');
    await assert.rejects(store.load());
    await assert.rejects(store.save(config, []));
    assert.equal(await readFile(join(dir, file), 'utf8'), '{ broken data');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('store refuses plaintext fallback and recovers interrupted rounds', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'sentinel-store-'));
  try {
    const config = defaultConfig();
    config.connections = [{ id: 'c', name: 'c', provider: 'custom', baseUrl: 'http://localhost', protocol: 'chat', apiKey: 'secret', models: [] }];
    await assert.rejects(new Store(dir, {}).save(config, []));
    const store = new Store(dir, { encrypt: s => 'encrypted:' + s, decrypt: s => s.slice(10) });
    await store.save(config, [{ id: 'r', status: 'detecting', startedAt: new Date().toISOString(), results: [{ status: 'detecting' }] }]);
    const loaded = await store.load();
    assert.equal(loaded.history[0].status, 'insufficient');
    assert.ok(loaded.history[0].completedAt);
    assert.equal(loaded.history[0].results[0].status, 'insufficient');
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('encryption failures do not expose credentials and untouched invalid storage is preserved', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'sentinel-store-'));
  try {
    const config = defaultConfig();
    config.connections = [{ id: 'c', name: 'c', provider: 'custom', baseUrl: 'http://localhost', protocol: 'chat', apiKey: 'private-key', models: [] }];
    await assert.rejects(new Store(dir, { encrypt: () => { throw new Error('private-key'); } }).save(config, []), error => !error.message.includes('private-key'));
    const invalid = JSON.stringify({ version: 1, config: { version: 1, connections: [], targets: 'invalid', prompts: [] }, history: [] });
    await writeFile(join(dir, 'state.json'), invalid);
    await assert.rejects(new Store(dir, {}).save(defaultConfig(), []));
    assert.equal(await readFile(join(dir, 'state.json'), 'utf8'), invalid);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
