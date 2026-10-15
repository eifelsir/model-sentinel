export const usageFields = ['inputTokens', 'outputTokens', 'totalTokens', 'cacheReadTokens', 'cacheWriteTokens', 'reasoningTokens'];

const counter = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
const optionalCounter = value => value == null ? 0 : counter(value);
function sum(...values) {
  if (values.some(value => value == null)) return null;
  return counter(values.reduce((total, value) => total + value, 0));
}

export function normalizeUsage(value, protocol) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const usage = Object.fromEntries(usageFields.map(field => [field, null]));
  if (protocol === 'responses' || protocol === 'chat') {
    const chat = protocol === 'chat';
    const inputDetails = value[chat ? 'prompt_tokens_details' : 'input_tokens_details'];
    usage.inputTokens = counter(value[chat ? 'prompt_tokens' : 'input_tokens']);
    usage.outputTokens = counter(value[chat ? 'completion_tokens' : 'output_tokens']);
    usage.totalTokens = counter(value.total_tokens);
    usage.cacheReadTokens = counter(inputDetails?.cached_tokens);
    usage.cacheWriteTokens = counter(inputDetails?.cache_write_tokens);
    usage.reasoningTokens = counter(value[chat ? 'completion_tokens_details' : 'output_tokens_details']?.reasoning_tokens);
  } else if (protocol === 'gemini') {
    // Gemini reports candidate and thought output separately; cached input is already inclusive.
    usage.inputTokens = sum(counter(value.promptTokenCount), optionalCounter(value.toolUsePromptTokenCount));
    usage.outputTokens = sum(counter(value.candidatesTokenCount), optionalCounter(value.thoughtsTokenCount));
    usage.totalTokens = counter(value.totalTokenCount);
    usage.cacheReadTokens = counter(value.cachedContentTokenCount);
    usage.reasoningTokens = counter(value.thoughtsTokenCount);
  } else if (protocol === 'anthropic') {
    // Claude's input_tokens excludes cache reads/writes; output_tokens includes thinking.
    usage.inputTokens = sum(counter(value.input_tokens), optionalCounter(value.cache_creation_input_tokens), optionalCounter(value.cache_read_input_tokens));
    usage.outputTokens = counter(value.output_tokens);
    usage.cacheReadTokens = counter(value.cache_read_input_tokens);
    usage.cacheWriteTokens = counter(value.cache_creation_input_tokens);
    usage.reasoningTokens = counter(value.output_tokens_details?.thinking_tokens);
  }
  usage.totalTokens ??= sum(usage.inputTokens, usage.outputTokens);
  return usageFields.some(field => usage[field] != null) ? usage : null;
}

export function aggregateUsage(values) {
  const summary = { samples: values.length, reported: 0, counts: {} };
  for (const field of usageFields) {
    const known = values.map(value => counter(value?.[field])).filter(value => value != null);
    summary.counts[field] = known.length;
    summary[field] = known.length ? counter(known.reduce((total, value) => total + value, 0)) : null;
  }
  summary.reported = values.filter(value => usageFields.some(field => counter(value?.[field]) != null)).length;
  return summary;
}

export function roundUsage(round) {
  return aggregateUsage((round?.results || []).filter(result => result.promptId).map(result => result.usage));
}
