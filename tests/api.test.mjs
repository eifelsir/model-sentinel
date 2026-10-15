import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { listModels, runPrompt } from '../core/api.mjs';

async function fixture(handler, body) {
  const errors = [];
  const server = createServer((req, res) => {
    Promise.resolve().then(() => handler(req, res)).catch(error => { errors.push(error); res.statusCode = 500; res.end('Fixture assertion failed'); });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const result = await body(`http://127.0.0.1:${server.address().port}`);
    if (errors.length) throw errors[0];
    return result;
  }
  finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
const responses = {
  responses: { status: 'completed', output: [{ type: 'reasoning', summary: [{ text: '42' }] }, { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: '21' }] }] },
  chat: { choices: [{ finish_reason: 'stop', message: { role: 'assistant', reasoning_content: '42', content: '21' } }] },
  gemini: { candidates: [{ finishReason: 'STOP', content: { role: 'model', parts: [{ thought: true, text: '42' }, { text: '21' }] } }] },
  anthropic: { stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '42' }, { type: 'text', text: '21' }] },
};
for (const protocol of Object.keys(responses)) test(`${protocol} request and final text contract`, async () => {
  await fixture(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    assert.ok(!raw.includes('never-send-expected'));
    assert.ok(!raw.includes('never-send-pattern'));
    assert.ok(raw.includes('unchanged prompt'));
    assert.equal(body.model ?? (protocol === 'gemini' ? 'model-x' : undefined), 'model-x');
    const paths = { responses: '/custom/v1/responses', chat: '/custom/v1/chat/completions', gemini: '/custom/v1beta/models/model-x:generateContent', anthropic: '/custom/v1/messages' };
    assert.equal(req.url, paths[protocol]);
    if (protocol === 'gemini') { assert.equal(req.headers['x-goog-api-key'], 'secret'); assert.equal(body.generationConfig.maxOutputTokens, 37); }
    else if (protocol === 'anthropic') { assert.equal(req.headers['x-api-key'], 'secret'); assert.equal(body.max_tokens, 37); }
    else { assert.equal(req.headers.authorization, 'Bearer secret'); assert.equal(body[protocol === 'responses' ? 'max_output_tokens' : 'max_completion_tokens'], 37); }
    res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(responses[protocol]));
  }, async baseUrl => {
    const result = await runPrompt({ baseUrl: baseUrl + (protocol === 'gemini' ? '/custom/v1beta' : '/custom/v1'), protocol, apiKey: 'secret' }, { model: 'model-x', maxOutputTokens: 37 }, { prompt: 'unchanged prompt', expected: 'never-send-expected', pattern: 'never-send-pattern' });
    assert.equal(result.text, '21'); assert.equal(result.incomplete, false);
  });
});
for (const protocol of Object.keys(responses)) test(`${protocol} pagination and truncation`, async () => {
  let count = 0;
  await fixture((req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.method === 'GET') {
      count++;
      if (count === 2) assert.ok(req.url.includes(protocol === 'gemini' ? 'pageToken=next' : 'after=one') || req.url.includes('after_id=one'));
      res.end(JSON.stringify(protocol === 'gemini' ? { models: [{ name: count === 1 ? 'models/one' : 'models/two' }], ...(count === 1 ? { nextPageToken: 'next' } : {}) } : { data: [{ id: count === 1 ? 'one' : 'two' }], has_more: count === 1, last_id: 'one' }));
    } else {
      const value = structuredClone(responses[protocol]);
      if (protocol === 'responses') value.status = 'incomplete';
      if (protocol === 'chat') value.choices[0].finish_reason = 'length';
      if (protocol === 'gemini') value.candidates[0].finishReason = 'MAX_TOKENS';
      if (protocol === 'anthropic') value.stop_reason = 'max_tokens';
      res.end(JSON.stringify(value));
    }
  }, async baseUrl => {
    const connection = { baseUrl, protocol, apiKey: 'secret' };
    assert.deepEqual(await listModels(connection), ['one', 'two']);
    assert.equal((await runPrompt(connection, { model: 'one' }, { prompt: 'test' })).incomplete, true);
  });
});
test('malformed, refused, timeout, abort and oversized results are insufficient and secret-free', async () => {
  await fixture((req, res) => {
    if (req.url.includes('/hang/')) return;
    if (req.url.includes('/error/')) { res.statusCode = 401; return res.end('secret-value'); }
    if (req.url.includes('/large/')) return res.end('x'.repeat(5 * 1024 * 1024));
    if (req.url.includes('/refuse/')) return res.end(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { refusal: 'secret-value' } }] }));
    res.end('not json secret-value');
  }, async baseUrl => {
    for (const path of ['malformed', 'error', 'large', 'refuse', 'hang']) {
      const result = await runPrompt({ baseUrl: `${baseUrl}/${path}`, protocol: 'chat', apiKey: 'secret-value' }, { model: 'x', timeoutSeconds: 0.04 }, { prompt: 'x' });
      assert.equal(result.incomplete, true);
      assert.ok(!result.reason.includes('secret-value'));
    }
    const controller = new AbortController(); controller.abort();
    assert.equal((await runPrompt({ baseUrl, protocol: 'chat' }, { model: 'x' }, { prompt: 'x' }, { signal: controller.signal })).incomplete, true);
  });
});
test('custom endpoint suffix and protocol override do not duplicate version', async () => {
  await fixture(async (req, res) => {
    assert.equal(req.url, '/proxy/v1/responses?region=x');
    res.end(JSON.stringify(responses.responses));
  }, async baseUrl => {
    assert.equal((await runPrompt({ baseUrl: baseUrl + '/proxy/v1/chat/completions?region=x', protocol: 'chat' }, { model: 'x', protocol: 'responses' }, { prompt: 'x' })).text, '21');
  });
});
for (const protocol of Object.keys(responses)) test(`${protocol} structured-only and refusal never produce a usable answer`, async () => {
  const thought = {
    responses: { status: 'completed', output: [{ type: 'reasoning', summary: [{ type: 'summary_text', text: '21' }] }] },
    chat: { choices: [{ finish_reason: 'stop', message: { role: 'assistant', reasoning_content: '21', content: null } }] },
    gemini: { candidates: [{ finishReason: 'STOP', content: { parts: [{ thought: true, text: '21' }] } }] },
    anthropic: { stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '21' }] },
  };
  const refusals = {
    responses: { status: 'completed', output: [{ type: 'message', role: 'assistant', content: [{ type: 'refusal', refusal: 'no' }, { type: 'output_text', text: '21' }] }] },
    chat: { choices: [{ finish_reason: 'stop', message: { refusal: 'no', content: '21' } }] },
    gemini: { candidates: [{ finishReason: 'SAFETY', content: { parts: [{ text: '21' }] } }] },
    anthropic: { stop_reason: 'refusal', content: [{ type: 'text', text: '21' }] },
  };
  let calls = 0;
  await fixture((req, res) => res.end(JSON.stringify(calls++ ? refusals[protocol] : thought[protocol])), async baseUrl => {
    const connection = { baseUrl, protocol };
    const result = await runPrompt(connection, { model: 'x' }, { prompt: 'x' });
    assert.equal(result.text, ''); assert.equal(result.incomplete, true);
    assert.equal((await runPrompt(connection, { model: 'x' }, { prompt: 'x' })).incomplete, true);
  });
});
test('Responses commentary is excluded from final text', async () => {
  await fixture((req, res) => res.end(JSON.stringify({ status: 'completed', output: [
    { type: 'message', role: 'assistant', phase: 'commentary', content: [{ type: 'output_text', text: 'Working on 22' }] },
    { type: 'message', role: 'assistant', phase: 'final_answer', content: [{ type: 'output_text', text: '21' }] },
  ] })), async baseUrl => {
    assert.equal((await runPrompt({ baseUrl, protocol: 'responses' }, { model: 'x' }, { prompt: 'x' })).text, '21');
  });
});
test('Grok and compatible custom providers use supported legacy max_tokens', async () => {
  await fixture(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    assert.equal(body.max_tokens, 71); assert.equal(body.max_completion_tokens, undefined);
    assert.equal(body.messages[0].content, 'original');
    assert.equal(body.expected, undefined); assert.equal(body.metadata.expected, undefined);
    res.end(JSON.stringify(responses.chat));
  }, async baseUrl => {
    for (const provider of ['grok', 'custom']) {
      await runPrompt({ baseUrl, provider, protocol: 'chat' }, { model: 'x', maxOutputTokens: 71, extraBody: { messages: [{ content: 'override' }], expected: 'private', metadata: { expected: 'private', tag: 'okay' } } }, { prompt: 'original', expected: 'private' });
    }
  });
});
test('pagination cycles reject instead of returning partial discovery', async () => {
  await fixture((req, res) => res.end(JSON.stringify({ models: [{ name: 'models/one' }], nextPageToken: 'repeat' })), async baseUrl => {
    await assert.rejects(listModels({ baseUrl, protocol: 'gemini', apiKey: 'secret' }), error => !error.message.includes('secret'));
  });
});
for (const [path, expectedPath] of [
  ['/v1beta/openai', '/v1beta/openai/chat/completions'],
  ['/proxy/api/chat/completions', '/proxy/api/chat/completions'],
  ['/vendor/prefix', '/vendor/prefix/chat/completions'],
]) test(`custom base path ${path} is preserved without an invented version`, async () => {
  await fixture((req, res) => {
    assert.equal(req.url, expectedPath);
    res.end(JSON.stringify(responses.chat));
  }, async baseUrl => {
    assert.equal((await runPrompt({ baseUrl: baseUrl + path, protocol: 'chat' }, { model: 'x' }, { prompt: 'x' })).incomplete, false);
  });
});

const promptIn = (body, protocol) => protocol === 'responses' ? body.input : protocol === 'gemini' ? body.contents[0].parts[0].text : body.messages[0].content;
for (const protocol of Object.keys(responses)) {
  test(`${protocol} cache bypass changes each request prefix, preserves the question and sends cache directives`, async () => {
    const received = [];
    const original = 'A fixed question with its original formatting.\nReturn a final answer.';
    const target = {
      model: 'model-x', maxOutputTokens: 37,
      extraBody: { cache: { use_cache: true }, cache_control: { type: 'ephemeral' }, cachedContent: 'saved-input', prompt_cache_key: 'stable-key', prompt_cache_retention: '24h', prompt_cache_options: { prewarm: true }, metadata: { tag: 'keep-me' } },
    };
    const before = structuredClone(target);
    await fixture(async (req, res) => {
      let raw = ''; for await (const chunk of req) raw += chunk;
      received.push({ body: JSON.parse(raw), headers: req.headers });
      res.end(JSON.stringify(responses[protocol]));
    }, async baseUrl => {
      for (let index = 0; index < 2; index++) {
        const result = await runPrompt({ baseUrl, protocol }, target, { prompt: original, expected: 'private-fixed-answer' }, { bypassCache: true });
        assert.equal(result.text, '21');
        assert.equal(result.incomplete, false);
      }
    });
    assert.equal(received.length, 2);
    for (const { body, headers } of received) {
      const prompt = promptIn(body, protocol);
      assert.match(prompt, /^\[Model Sentinel request: [0-9a-f-]{36}\]\n/);
      assert.ok(prompt.endsWith(`\n\n${original}`));
      assert.equal(headers['cache-control'], 'no-cache, no-store');
      assert.equal(headers.pragma, 'no-cache');
      assert.equal(body.metadata.tag, 'keep-me');
      for (const key of ['cache', 'cache_control', 'cachedContent', 'prompt_cache_key', 'prompt_cache_retention', 'prompt_cache_options']) assert.equal(body[key], undefined);
      assert.equal(JSON.stringify(body).includes('private-fixed-answer'), false);
      assert.equal(body.previous_response_id, undefined);
      assert.equal(body.conversation, undefined);
      const turns = protocol === 'gemini' ? body.contents : body.messages;
      if (turns) { assert.equal(turns.length, 1); assert.equal(turns[0].role, 'user'); }
    }
    assert.notEqual(promptIn(received[0].body, protocol), promptIn(received[1].body, protocol));
    assert.deepEqual(target, before);
  });

  test(`${protocol} cache bypass off retains identical independent requests and advanced options`, async () => {
    const received = [];
    await fixture(async (req, res) => {
      let raw = ''; for await (const chunk of req) raw += chunk;
      received.push({ body: JSON.parse(raw), headers: req.headers });
      res.end(JSON.stringify(responses[protocol]));
    }, async baseUrl => {
      for (const options of [undefined, { bypassCache: false }]) {
        await runPrompt({ baseUrl, protocol }, { model: 'model-x', extraBody: { metadata: { tag: 'stable' } } }, { prompt: 'original question' }, options);
      }
    });
    assert.deepEqual(received[0].body, received[1].body);
    assert.equal(promptIn(received[0].body, protocol), 'original question');
    for (const { headers } of received) assert.equal(headers['cache-control'], undefined);
  });
}

test('cache bypass prevents an exact-request reply cache from replaying an earlier answer', async () => {
  const cache = new Map();
  let currentAnswer = '21', generated = 0;
  await fixture(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    if (!cache.has(raw)) { cache.set(raw, currentAnswer); generated++; }
    const answer = cache.get(raw);
    res.end(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: answer } }] }));
  }, async baseUrl => {
    const call = options => runPrompt({ baseUrl, protocol: 'chat' }, { model: 'model-x' }, { prompt: 'fixed question' }, options);
    assert.equal((await call()).text, '21');
    currentAnswer = '22';
    assert.equal((await call()).text, '21');
    assert.equal((await call({ bypassCache: true })).text, '22');
    currentAnswer = '23';
    assert.equal((await call({ bypassCache: true })).text, '23');
    assert.equal(generated, 3);
  });
});

test('Anthropic cache bypass removes system and tool breakpoints without altering tools or schemas', async () => {
  const extraBody = {
    system: [{ type: 'text', text: 'System text', cache_control: { type: 'ephemeral' } }],
    tools: [{ name: 'tool', description: 'Retained tool', input_schema: { type: 'object', properties: { cache_control: { type: 'string' } } }, cache_control: { type: 'ephemeral' } }],
  };
  const received = [];
  await fixture(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    received.push(JSON.parse(raw));
    res.end(JSON.stringify(responses.anthropic));
  }, async baseUrl => {
    for (const bypassCache of [false, true]) {
      await runPrompt({ baseUrl, protocol: 'anthropic' }, { model: 'model-x', extraBody }, { prompt: 'question' }, { bypassCache });
    }
  });
  assert.deepEqual(received[0].system, extraBody.system);
  assert.deepEqual(received[0].tools, extraBody.tools);
  assert.deepEqual(received[1].system, [{ type: 'text', text: 'System text' }]);
  assert.equal(received[1].tools[0].cache_control, undefined);
  assert.equal(received[1].tools[0].name, 'tool');
  assert.deepEqual(received[1].tools[0].input_schema, extraBody.tools[0].input_schema);
  assert.equal(extraBody.system[0].cache_control.type, 'ephemeral');
});
