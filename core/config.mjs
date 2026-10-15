import { validateReasoning } from './reasoning.mjs';
import { builtinPrompts } from './builtins.mjs';

export const PROTOCOLS = ['responses', 'chat', 'gemini', 'anthropic'];
export function defaultConfig() {
  return { version: 1, builtinsVersion: 1, connections: [], prompts: structuredClone(builtinPrompts), targets: [], settings: { concurrency: 4, autoRun: false, floatVisible: true, launchAtLogin: false } };
}
function requireValue(condition, message) { if (!condition) throw new Error(message); }
function text(value, name, max = 100000) {
  requireValue(typeof value === 'string' && value.trim().length > 0 && value.length <= max, `Invalid ${name}`);
  return value;
}
function range(value, fallback, min, max, name, integer = false) {
  const number = value ?? fallback;
  requireValue(typeof number === 'number' && Number.isFinite(number) && number >= min && number <= max && (!integer || Number.isInteger(number)), `Invalid ${name}`);
  return number;
}
function entries(value, name, normalize) {
  requireValue(Array.isArray(value) && value.length <= 1000, `Invalid ${name}`);
  const ids = new Set();
  return value.map(item => {
    requireValue(item && typeof item === 'object' && !Array.isArray(item), `Invalid ${name} entry`);
    const id = text(item.id, `${name} id`, 200);
    requireValue(!ids.has(id), `Duplicate ${name} id`); ids.add(id);
    return normalize(item);
  });
}
function protocol(value, fallback) {
  const result = value || fallback;
  requireValue(PROTOCOLS.includes(result), 'Invalid protocol');
  return result;
}
export function validateConfig(input) {
  requireValue(input && input.version === 1, 'Unsupported configuration version');
  const result = defaultConfig();
  result.builtinsVersion = input.builtinsVersion === 1 ? 1 : 0;
  result.connections = entries(input.connections, 'connection', c => {
    let url;
    try { url = new URL(c.baseUrl); } catch { throw new Error('Invalid connection URL'); }
    requireValue(['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.hash, 'Invalid connection URL');
    requireValue(c.apiKey == null || typeof c.apiKey === 'string', 'Invalid API key');
    requireValue(c.models == null || (Array.isArray(c.models) && c.models.every(m => typeof m === 'string')), 'Invalid models');
    return { id: c.id, name: text(c.name, 'connection name', 500), provider: c.provider || 'custom', baseUrl: url.toString().replace(/\/$/, ''), apiKey: c.apiKey || '', protocol: protocol(c.protocol, 'chat'), models: [...(c.models || [])] };
  });
  result.prompts = entries(input.prompts, 'prompt', p => {
    const type = p.type || 'text';
    requireValue(['text', 'html'].includes(type), 'Invalid question type');
    requireValue(['auto', 'exact', 'regex'].includes(p.mode || 'auto'), 'Invalid answer mode');
    requireValue(p.pattern == null || (typeof p.pattern === 'string' && p.pattern.length <= 5000), 'Invalid pattern');
    if (type === 'text' && p.mode === 'regex') requireValue(Boolean(p.pattern), 'Regex pattern is required');
    return { id: p.id, type, name: text(p.name, 'prompt name', 500), prompt: text(p.prompt, 'prompt'), expected: type === 'html' ? '' : text(p.expected, 'expected answer', 10000), mode: type === 'html' ? 'auto' : p.mode || 'auto', pattern: type === 'html' ? '' : p.pattern || '' };
  });
  result.targets = entries(input.targets, 'target', t => {
    const connection = result.connections.find(c => c.id === t.connectionId);
    requireValue(Boolean(connection), 'Target connection does not exist');
    requireValue(Array.isArray(t.promptIds) && new Set(t.promptIds).size === t.promptIds.length && t.promptIds.every(id => result.prompts.some(p => p.id === id)), 'Invalid target prompts');
    requireValue(t.extraBody == null || (typeof t.extraBody === 'object' && !Array.isArray(t.extraBody)), 'Invalid extra body');
    if (t.extraBody) requireValue(JSON.stringify(t.extraBody).length <= 100000, 'Extra body is too large');
    const selectedProtocol = t.protocol ? protocol(t.protocol) : '';
    return { id: t.id, connectionId: t.connectionId, model: text(t.model, 'model', 500), protocol: selectedProtocol, promptIds: [...t.promptIds], enabled: t.enabled !== false, intervalMinutes: range(t.intervalMinutes, 30, 0.001, 525600, 'interval'), timeoutSeconds: range(t.timeoutSeconds, 180, 0.01, 3600, 'timeout'), maxOutputTokens: t.maxOutputTokens == null ? null : range(t.maxOutputTokens, null, 1, 1000000, 'output tokens', true), reasoningEffort: validateReasoning(t, selectedProtocol || connection.protocol), extraBody: structuredClone(t.extraBody || {}) };
  });
  const settings = input.settings || {};
  result.settings = { concurrency: range(settings.concurrency, 4, 1, 32, 'concurrency', true), autoRun: settings.autoRun === true, floatVisible: settings.floatVisible !== false, launchAtLogin: settings.launchAtLogin === true };
  return result;
}
