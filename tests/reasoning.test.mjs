import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { runPrompt } from '../core/api.mjs';
import { validateConfig, defaultConfig } from '../core/config.mjs';

async function capture(protocol, model, effort, provider = 'custom', extraBody = {}) {
  let body;
  const server = http.createServer(async (req, res) => {
    let input = '';
    for await (const chunk of req) input += chunk;
    body = JSON.parse(input);
    res.setHeader('content-type', 'application/json');
    res.end('{}');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    await runPrompt(
      { baseUrl: `http://127.0.0.1:${server.address().port}/v1`, protocol, provider },
      { model, reasoningEffort: effort, extraBody, timeoutSeconds: 3 },
      { prompt: 'Compute without changing this prompt.', expected: '42' },
    );
    return body;
  } finally { await new Promise(resolve => server.close(resolve)); }
}

test('Responses reasoning selection is separate from the output cap and preserves input', async () => {
  const body = await capture('responses', 'gpt-6.1-sol', 'high', 'openai');
  assert.deepEqual(body.reasoning, { effort: 'high' });
  assert.equal(body.max_output_tokens, undefined);
  assert.equal(body.input, 'Compute without changing this prompt.');
  assert.equal(body.expected, undefined);
});

test('Chat reasoning selection uses the chat parameter', async () => {
  const body = await capture('chat', 'gpt-6-astra', 'max', 'openai');
  assert.equal(body.reasoning_effort, 'max');
  assert.equal(body.reasoning, undefined);
});

test('Grok reasoning and Gemini native levels use the matching provider fields', async () => {
  const grok = await capture('responses', 'grok-4.7', 'xhigh', 'grok');
  assert.deepEqual(grok.reasoning, { effort: 'xhigh' });
  const gemini = await capture('gemini', 'gemini-3.8-flash', 'medium', 'gemini');
  assert.deepEqual(gemini.generationConfig.thinkingConfig, { thinkingLevel: 'medium' });
  assert.equal(gemini.reasoning_effort, undefined);
});

test('Gemini 2.5 uses a thinking budget instead of unsupported levels', async () => {
  const body = await capture('gemini', 'gemini-2.5-pro', 'high', 'gemini');
  assert.deepEqual(body.generationConfig.thinkingConfig, { thinkingBudget: 32768 });
});

test('Claude adaptive thinking carries effort outside the thinking object', async () => {
  const body = await capture('anthropic', 'claude-opus-4-8', 'xhigh', 'claude');
  assert.deepEqual(body.thinking, { type: 'adaptive' });
  assert.deepEqual(body.output_config, { effort: 'xhigh' });
});

test('service default omits optional reasoning controls for unknown models', async () => {
  const body = await capture('chat', 'unknown-model', '', 'custom');
  assert.equal(body.reasoning_effort, undefined);
  assert.equal(body.reasoning, undefined);
  assert.equal(body.thinking, undefined);
});

test('selected reasoning removes incompatible sampling settings but retains unrelated advanced options', async () => {
  const body = await capture('responses', 'gpt-6.1-sol', 'high', 'openai', { temperature: 1, top_p: 0.9, top_logprobs: 3, include: ['message.output_text.logprobs', 'reasoning.encrypted_content'], metadata: { test: 'local' }, reasoning: { effort: 'low', summary: 'auto' } });
  assert.equal(body.temperature, undefined);
  assert.equal(body.top_p, undefined);
  assert.deepEqual(body.reasoning, { effort: 'high', summary: 'auto' });
  assert.deepEqual(body.metadata, { test: 'local' });
  assert.equal(body.top_logprobs, undefined);
  assert.deepEqual(body.include, ['reasoning.encrypted_content']);
});

test('saved unsupported effort is rejected instead of silently weakening the request', () => {
  const config = defaultConfig();
  config.connections = [{ id: 'c', name: 'test', baseUrl: 'http://localhost', protocol: 'responses' }];
  config.targets = [{ id: 't', connectionId: 'c', model: 'gpt-6.1-sol', promptIds: [], reasoningEffort: 'none' }];
  assert.throws(() => validateConfig(config), /reasoning/i);
  config.targets[0].reasoningEffort = 'high';
  assert.equal(validateConfig(config).targets[0].reasoningEffort, 'high');
});

test('models with narrower documented controls cannot save unsupported levels', () => {
  const config = defaultConfig();
  config.connections = [{ id: 'c', name: 'test', baseUrl: 'http://localhost', protocol: 'anthropic' }];
  config.targets = [{ id: 't', connectionId: 'c', model: 'claude-sonnet-4-6', promptIds: [], reasoningEffort: 'xhigh' }];
  assert.throws(() => validateConfig(config), /reasoning/i);
  config.connections[0].protocol = 'responses';
  config.targets[0].model = 'grok-4.5';
  config.targets[0].reasoningEffort = 'xhigh';
  assert.throws(() => validateConfig(config), /reasoning/i);
});

test('unverified Gemini aliases keep the service default instead of guessing supported levels', () => {
  const config = defaultConfig();
  config.connections = [{ id: 'c', name: 'test', baseUrl: 'http://localhost', protocol: 'gemini' }];
  for (const model of ['gemini-3.5-flash', 'gemini-3-flash-lite']) {
    config.targets = [{ id: 't', connectionId: 'c', model, promptIds: [], reasoningEffort: 'low' }];
    assert.throws(() => validateConfig(config), /reasoning/i);
    config.targets[0].reasoningEffort = '';
    assert.equal(validateConfig(config).targets[0].reasoningEffort, '');
  }
});
