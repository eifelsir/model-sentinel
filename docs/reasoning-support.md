# Model Reasoning Controls

Verified against official provider documentation on October 15, 2026.

The saved `reasoningEffort` belongs to a monitored model. An empty value omits the optional control, including for unknown model IDs. Output token limits remain a separate setting. The selector overrides conflicting effort fields in advanced JSON only when an explicit selection is made. Unsupported saved selections fail validation.

| Model family | Protocol | Values |
| --- | --- | --- |
| GPT-6 Astra, GPT-6.1 Sol | Responses / Chat | low, medium, high, xhigh, max |
| GPT-6 Sol / Luna | Responses / Chat | none, low, medium, high, xhigh, max |
| GPT-5.4 | Responses / Chat | none, low, medium, high, xhigh |
| Grok 4.6 / 4.7 | Responses / Chat | low, medium, high, xhigh |
| Grok 4.5 | Responses / Chat | low, medium, high |
| Gemini 4 Argon, 3.8 Flash | Gemini native | low, medium, high |
| Gemini 3.6 Flash, 3 Flash, 3.5 / 3.1 Flash-Lite | Gemini native | minimal, low, medium, high |
| Gemini 2.5 Pro | Gemini native | low=1024, medium=8192, high=32768 thinking tokens; dynamic=-1 |
| Gemini 2.5 Flash / Flash-Lite | Gemini native | none=0, low=1024, medium=8192, high=24576 thinking tokens; dynamic=-1 |
| Claude Opus 4.7 / 4.8 / 5 / 5.5, Sonnet 5 / 5.5, Haiku 5.5, Fable / Mythos 5 / 5.1 | Claude native | adaptive thinking; low, medium, high, xhigh, max |
| Claude Opus / Sonnet 4.6 | Claude native | adaptive thinking; low, medium, high, max |

Gemini 2.5 budget presets are application choices within the documented ranges, not native effort levels. Gemini `minimal` may still think. An API accepting a selection is not proof that an intermediary preserves it. Unknown aliases and unverified protocol adapters keep the service default and the existing advanced JSON editor.

Official references:

- https://developers.openai.com/api/docs/models/gpt-6.1-sol
- https://developers.openai.com/api/docs/models/gpt-6-astra
- https://developers.openai.com/api/docs/guides/latest-model
- https://developers.openai.com/api/docs/models/gpt-5.4
- https://docs.x.ai/developers/model-capabilities/text/reasoning
- https://ai.google.dev/gemini-api/docs/generate-content/thinking
- https://platform.claude.com/docs/en/build-with-claude/effort
- https://platform.claude.com/docs/en/build-with-claude/thinking

Explicit OpenAI reasoning removes incompatible sampling/logprob controls. Grok removes unsupported penalties and stop controls. Claude adaptive requests remove sampling controls. Final-answer parsing still ignores provider thinking blocks.
