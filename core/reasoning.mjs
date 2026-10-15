const standard = ['low', 'medium', 'high'];
const extended = [...standard, 'xhigh', 'max'];

// Provider capability references and the verification date live in docs/reasoning-support.md.
export function reasoningCapability(model, protocol) {
  const id = String(model || '').toLowerCase().replace(/^models\//, '');
  if (['responses', 'chat'].includes(protocol)) {
    if (/^gpt-(?:6-astra|6\.1-sol)(?:-\d{4}-\d{2}-\d{2})?$/.test(id)) {
      return { kind: 'openai', efforts: extended };
    }
    if (/^gpt-6-(?:sol|luna)(?:-\d{4}-\d{2}-\d{2})?$/.test(id)) {
      return { kind: 'openai', efforts: ['none', ...extended] };
    }
    if (/^gpt-5\.4(?:-\d{4}-\d{2}-\d{2})?$/.test(id)) {
      return { kind: 'openai', efforts: ['none', ...standard, 'xhigh'] };
    }
    if (/^grok-4\.[67](?:-latest)?$/.test(id)) return { kind: 'grok', efforts: [...standard, 'xhigh'] };
    if (/^grok-4\.5(?:-latest)?$/.test(id)) return { kind: 'grok', efforts: standard };
  }
  if (protocol === 'gemini') {
    if (/^gemini-(?:4-argon|3\.8-flash)(?:-preview)?$/.test(id)) {
      return { kind: 'gemini-level', efforts: standard };
    }
    if (/^gemini-(?:3\.6-flash|3\.[15]-flash-lite|3-flash)(?:-preview)?$/.test(id)) {
      return { kind: 'gemini-level', efforts: ['minimal', ...standard] };
    }
    if (/^gemini-2\.5-pro(?:-preview(?:-\d{2}-\d{2})?)?$/.test(id)) {
      return { kind: 'gemini-budget', efforts: [...standard, 'dynamic'], budgets: { low: 1024, medium: 8192, high: 32768, dynamic: -1 } };
    }
    if (/^gemini-2\.5-flash(?:-lite)?(?:-preview(?:-\d{2}-\d{4})?)?$/.test(id)) {
      return { kind: 'gemini-budget', efforts: ['none', ...standard, 'dynamic'], budgets: { none: 0, low: 1024, medium: 8192, high: 24576, dynamic: -1 } };
    }
  }
  if (protocol === 'anthropic') {
    if (/^claude-(?:opus-4-[78]|opus-5(?:-5)?|sonnet-5(?:-5)?|haiku-5-5|fable-5(?:-1)?|mythos-5(?:-1)?)(?:-\d{8})?$/.test(id)) {
      return { kind: 'claude-adaptive', efforts: extended };
    }
    if (/^claude-(?:opus|sonnet)-4-6(?:-\d{8})?$/.test(id)) {
      return { kind: 'claude-adaptive', efforts: [...standard, 'max'] };
    }
  }
  return { kind: '', efforts: [] };
}

export function validateReasoning(target, protocol) {
  const effort = target.reasoningEffort ?? '';
  if (typeof effort !== 'string' || (effort && !reasoningCapability(target.model, protocol).efforts.includes(effort))) {
    throw new Error('Unsupported reasoning setting for this model/protocol; choose service default or a supported level');
  }
  return effort;
}

export function applyReasoning(body, target, protocol) {
  const effort = validateReasoning(target, protocol);
  if (!effort) return body;
  const capability = reasoningCapability(target.model, protocol);
  if (['openai', 'grok'].includes(capability.kind)) {
    if (protocol === 'responses') body.reasoning = { ...object(body.reasoning), effort };
    else body.reasoning_effort = effort;
    if (protocol === 'responses') delete body.reasoning_effort;
    else delete body.reasoning;
    if (capability.kind === 'openai' && effort !== 'none') {
      for (const key of ['temperature', 'top_p', 'top_logprobs', 'logprobs']) delete body[key];
      if (Array.isArray(body.include)) body.include = body.include.filter(value => value !== 'message.output_text.logprobs');
    }
    if (capability.kind === 'grok') {
      for (const key of ['presence_penalty', 'frequency_penalty', 'presencePenalty', 'frequencyPenalty', 'stop']) delete body[key];
    }
  } else if (capability.kind.startsWith('gemini-')) {
    const generation = object(body.generationConfig), thinking = { ...object(generation.thinkingConfig) };
    delete thinking.thinkingLevel;
    delete thinking.thinkingBudget;
    if (capability.kind === 'gemini-budget') thinking.thinkingBudget = capability.budgets[effort];
    else thinking.thinkingLevel = effort;
    body.generationConfig = { ...generation, thinkingConfig: thinking };
  } else if (capability.kind === 'claude-adaptive') {
    body.thinking = { type: 'adaptive' };
    body.output_config = { ...object(body.output_config), effort };
    for (const key of ['temperature', 'top_p', 'top_k']) delete body[key];
  }
  return body;
}

function object(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
