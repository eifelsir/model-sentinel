# Token accounting

Verified on 2026-10-15 from provider-owned documentation and SDK definitions. No counting request or tokenizer estimate is performed.

| Protocol | Input | Output | Extra detail |
| --- | --- | --- | --- |
| Responses | input_tokens | output_tokens | input_tokens_details.cached_tokens/cache_write_tokens; output_tokens_details.reasoning_tokens |
| Chat Completions / Grok | prompt_tokens | completion_tokens | prompt_tokens_details.cached_tokens/cache_write_tokens; completion_tokens_details.reasoning_tokens |
| Gemini native | promptTokenCount + toolUsePromptTokenCount | candidatesTokenCount + thoughtsTokenCount | cachedContentTokenCount and thoughtsTokenCount |
| Claude Messages | input_tokens + cache_creation_input_tokens + cache_read_input_tokens | output_tokens | output_tokens_details.thinking_tokens is an output subset |

Use reported total_tokens/totalTokenCount when present. Otherwise derive a total only when both input and output are known. Optional absent cache/thought components do not add tokens, but their detailed UI fields remain unknown rather than showing invented zero. Malformed, negative, fractional and unsafe integers are unknown.

History aggregation sums each known metric separately and records its coverage. A partial total is not completed by adding unmatched input/output across different requests. Summaries cover retained history, not the lifetime account or billing cost. Existing history without usage stays unknown.

Primary references:

- https://developers.openai.com/api/reference/resources/responses/object#usage
- https://github.com/openai/openai-python/blob/main/src/openai/types/responses/response_usage.py
- https://ai.google.dev/api/generate-content#UsageMetadata
- https://github.com/googleapis/python-genai/blob/main/google/genai/types.py
- https://platform.claude.com/docs/en/build-with-claude/prompt-caching#tracking-cache-performance
- https://github.com/anthropics/anthropic-sdk-python/blob/main/src/anthropic/types/usage.py
- https://github.com/anthropics/anthropic-sdk-python/blob/main/src/anthropic/types/output_tokens_details.py
