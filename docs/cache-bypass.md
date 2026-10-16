# Cache Bypass

Verified against official documentation on October 16, 2026.

The switch requests bypass from the next round. Each request, including HTML and auxiliary extraction, gets a fresh random prefix and HTTP cache directives. The original question and fixed answer stored in the app are unchanged; the fixed answer is never added to the request.

## Native Controls

| Protocol and model | Additional request behavior |
| --- | --- |
| Responses / Chat, recognized OpenAI GPT-5.6 and GPT-6 Sol/Astra/Luna families | Send `prompt_cache_options: {"mode":"explicit"}` and omit explicit breakpoints, cache keys and retention options. |
| Claude Messages | Remove top-level automatic caching and system/tool cache breakpoints, preserving tools and their schemas. |
| Gemini, Grok, older or unrecognized compatible models | Use the generic random prefix and directives; omit configured explicit cache reuse. |

OpenAI documents explicit mode without breakpoints as performing neither prompt-cache reads nor writes. Merely removing `prompt_cache_options` from a supported model leaves its automatic caching default in place, so the app actively selects explicit mode while bypass is on. A service that rejects the parameter returns a failed request; the app does not silently retry with weaker controls.

Only known model-name families receive the OpenAI option. A compatible endpoint can map a model name differently, ignore the parameter or reject it. The app cannot verify that routing from the name.

## Reading Results

Detection details retain the requested strategy and the service's reported cache-read Token count for each primary and auxiliary request:

- A positive count after bypass remains visible as a reported hit. The app does not relabel it a successful bypass.
- Zero means the service reported zero input-cache Tokens.
- An absent counter means the service did not provide it.

Input/prefix caching reuses input computation. A full-response cache can instead return a previously generated answer. The returned input-cache counters cannot establish whether a proxy replayed an entire response; neither a zero nor a positive count proves that.

Random prefixes and HTTP directives cannot force a proxy to honor them, prevent a semantic cache from ignoring the identifier, or remove a service's hidden prefixes. Use the service's own response-cache settings for that behavior.

## Validation Scope

Automated tests use local HTTP fixtures to verify actual request JSON, distinct prefixes, switch propagation, error handling, persisted strategies and displayed usage. They replay the reported answers without paid provider calls. They do not certify that any particular third-party service honors cache bypass.

## References

- [OpenAI prompt caching and opt-out](https://developers.openai.com/api/docs/guides/prompt-caching#opt-out-of-caching)
- [OpenAI Chat Completions API](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create)
- [Gemini context caching](https://ai.google.dev/gemini-api/docs/caching)
