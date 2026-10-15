import { finalText } from './answer.mjs';
import { applyReasoning } from './reasoning.mjs';
import { randomUUID } from 'node:crypto';
const RESPONSE_LIMIT = 4 * 1024 * 1024;
function endpoint(connection, protocol, kind, model) {
  const url = new URL(connection.baseUrl);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid API URL');
  let path = url.pathname.replace(/\/+$/, '');
  // A supplied endpoint or version prefix is reusable for both discovery and runs.
  path = path.replace(/\/(?:chat\/completions|responses|messages|models(?:\/[^/]+:generateContent)?)$/, '');
  const version = protocol === 'gemini' ? 'v1beta' : 'v1';
  if (!path) path = `/${version}`;
  path += kind === 'models' ? '/models' : protocol === 'responses' ? '/responses' : protocol === 'chat' ? '/chat/completions' : protocol === 'anthropic' ? '/messages' : `/models/${model.split('/').map(encodeURIComponent).join('/')}:generateContent`;
  url.pathname = path;
  return url;
}
function headers(connection, protocol, bypassCache = false) {
  const result = { 'content-type': 'application/json' };
  if (protocol === 'anthropic') { result['anthropic-version'] = '2023-06-01'; if (connection.apiKey) result['x-api-key'] = connection.apiKey; }
  else if (protocol === 'gemini') { if (connection.apiKey) result['x-goog-api-key'] = connection.apiKey; }
  else if (connection.apiKey) result.authorization = `Bearer ${connection.apiKey}`;
  if (bypassCache) { result['cache-control'] = 'no-cache, no-store'; result.pragma = 'no-cache'; }
  return result;
}
async function fetchJSON(url, options, signal) {
  const response = await fetch(url, { ...options, signal, redirect: 'error' });
  if (!response.ok) { await response.body?.cancel(); throw new Error(`HTTP ${response.status}`); }
  const chunks = []; let size = 0;
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Empty API response');
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > RESPONSE_LIMIT) { await reader.cancel(); throw new Error('API response is too large'); }
    chunks.push(value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new Error('Invalid API JSON'); }
}
function errorReason(error, signal) {
  if (signal?.aborted) return signal.reason?.name === 'TimeoutError' ? 'Request timed out' : 'Request cancelled';
  if (/^HTTP \d{3}$|^API response is too large$|^Invalid API JSON$/.test(error?.message || '')) return error.message;
  if (error?.message?.startsWith('Unsupported reasoning setting')) return error.message;
  return 'API request failed';
}
function sanitizeExtra(value) {
  if (Array.isArray(value)) return value.map(sanitizeExtra);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !['expected', 'pattern'].includes(key)).map(([key, entry]) => [key, sanitizeExtra(entry)]));
}
function requestBody(protocol, target, test, connection, bypassCache = false) {
  const extra = sanitizeExtra(target.extraBody || {});
  // Never allow auxiliary options to replace user input or inject local judge data.
  for (const key of ['expected', 'pattern', 'mode', 'prompt', 'input', 'messages', 'contents', 'model', 'stream', 'stream_options', 'max_tokens', 'max_completion_tokens', 'max_output_tokens']) delete extra[key];
  if (bypassCache) {
    for (const key of ['cache', 'cache_control', 'cachedContent', 'prompt_cache_key', 'prompt_cache_retention', 'prompt_cache_options']) delete extra[key];
    if (protocol === 'anthropic') {
      for (const key of ['system', 'tools']) {
        for (const block of Array.isArray(extra[key]) ? extra[key] : []) {
          if (block && typeof block === 'object') delete block.cache_control;
        }
      }
    }
  }
  // Put a fresh identifier before the question to change both the prefix and exact request.
  const prompt = bypassCache ? `[Model Sentinel request: ${randomUUID()}]\nIgnore the request identifier above. Answer the following question normally.\n\n${test.prompt}` : test.prompt;
  const cap = target.maxOutputTokens;
  let body;
  if (protocol === 'responses') body = { ...extra, model: target.model, input: prompt, stream: false, ...(cap ? { max_output_tokens: cap } : {}) };
  else if (protocol === 'chat') body = { ...extra, model: target.model, messages: [{ role: 'user', content: prompt }], stream: false, ...(cap ? { [['grok', 'custom'].includes(connection.provider) ? 'max_tokens' : 'max_completion_tokens']: cap } : {}) };
  else if (protocol === 'anthropic') body = { ...extra, model: target.model, messages: [{ role: 'user', content: prompt }], stream: false, max_tokens: cap || 4096 };
  else body = { ...extra, contents: [{ role: 'user', parts: [{ text: prompt }] }], ...(cap || extra.generationConfig ? { generationConfig: { ...(extra.generationConfig || {}), ...(cap ? { maxOutputTokens: cap } : {}) } } : {}) };
  return applyReasoning(body, target, protocol);
}
function parseResponse(data, protocol) {
  let text = '', complete = false, refused = false;
  if (protocol === 'responses') {
    complete = data.status === 'completed';
    const messages = (Array.isArray(data.output) ? data.output : []).filter(item => item.type === 'message' && item.role === 'assistant' && (!item.phase || item.phase === 'final_answer'));
    refused = messages.some(m => (m.content || []).some(part => part.type === 'refusal'));
    complete &&= messages.every(m => !m.status || m.status === 'completed');
    text = messages.flatMap(m => (m.content || []).filter(p => p.type === 'output_text' && typeof p.text === 'string').map(p => p.text)).join('\n');
  } else if (protocol === 'chat') {
    if (data.choices?.length !== 1) return { text: '', incomplete: true, reason: 'Missing or ambiguous assistant choice', usage: data.usage ?? null };
    const choice = data.choices[0], message = choice.message;
    complete = choice.finish_reason === 'stop' && (!message?.role || message.role === 'assistant');
    refused = Boolean(message?.refusal);
    text = typeof message?.content === 'string' ? message.content : Array.isArray(message?.content) ? message.content.filter(p => p.type === 'text' && typeof p.text === 'string').map(p => p.text).join('\n') : '';
  } else if (protocol === 'gemini') {
    if (data.candidates?.length !== 1) return { text: '', incomplete: true, reason: 'Missing or ambiguous model candidate', usage: data.usageMetadata ?? null };
    const candidate = data.candidates[0];
    complete = candidate.finishReason === 'STOP' && (!candidate.content?.role || candidate.content.role === 'model');
    refused = Boolean(data.promptFeedback?.blockReason) || (candidate.safetyRatings || []).some(r => r.blocked);
    text = (candidate.content?.parts || []).filter(p => p.thought !== true && typeof p.text === 'string').map(p => p.text).join('\n');
  } else if (protocol === 'anthropic') {
    complete = ['end_turn', 'stop_sequence'].includes(data.stop_reason);
    refused = data.stop_reason === 'refusal' || (data.content || []).some(p => p.type === 'refusal');
    text = (data.content || []).filter(p => p.type === 'text' && typeof p.text === 'string').map(p => p.text).join('\n');
  }
  text = finalText(text);
  return { text, incomplete: !complete || refused || !text, reason: refused ? 'Response is a refusal' : !complete ? 'Response did not complete' : !text ? 'No final assistant text' : '', usage: data.usage ?? data.usageMetadata ?? null };
}
export async function runPrompt(connection, target, test, { signal, bypassCache = false } = {}) {
  const timeout = AbortSignal.timeout(Math.max(1, Math.round((target.timeoutSeconds ?? 180) * 1000)));
  const bounded = signal ? AbortSignal.any([signal, timeout]) : timeout;
  try {
    const protocol = target.protocol || connection.protocol;
    const model = target.model.replace(/^models\//, '');
    const data = await fetchJSON(endpoint(connection, protocol, 'run', model), { method: 'POST', headers: headers(connection, protocol, bypassCache), body: JSON.stringify(requestBody(protocol, target, test, connection, bypassCache)) }, bounded);
    return parseResponse(data, protocol);
  } catch (error) { return { text: '', incomplete: true, reason: errorReason(error, bounded), usage: null }; }
}
export async function listModels(connection, { signal } = {}) {
  const timeout = AbortSignal.timeout(30000);
  const bounded = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const result = new Set(), seen = new Set();
  try {
    const protocol = connection.protocol;
    let cursor = '';
    for (let page = 0; page < 100; page++) {
      const url = endpoint(connection, protocol, 'models');
      if (cursor) url.searchParams.set(protocol === 'gemini' ? 'pageToken' : protocol === 'anthropic' ? 'after_id' : 'after', cursor);
      const data = await fetchJSON(url, { headers: headers(connection, protocol) }, bounded);
      const values = protocol === 'gemini' ? data.models : data.data;
      if (!Array.isArray(values)) throw new Error('Invalid model list');
      for (const item of values) {
        const id = protocol === 'gemini' ? item.name?.replace(/^models\//, '') : item.id;
        if (typeof id === 'string' && id) result.add(id);
      }
      const next = protocol === 'gemini' ? data.nextPageToken : data.has_more ? data.last_id || values.at(-1)?.id : '';
      if (!next) return [...result];
      if (seen.has(next)) throw new Error('Model pagination repeated');
      seen.add(next); cursor = next;
    }
    throw new Error('Model pagination exceeded limit');
  } catch (error) { throw new Error(errorReason(error, bounded)); }
}
