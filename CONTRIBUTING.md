# Contributing

Thank you for helping improve Model Sentinel. Focused bug reports, reproducible fixtures, and small pull requests are welcome.

## Report a Bug

Include the app version, Windows version, selected protocol, reproduction steps, and expected/actual behavior. For extraction problems, include a minimal anonymized reply and expected answer.

Never post real API keys, account details, private endpoints, or unredacted configuration/history files. Use [SECURITY.md](SECURITY.md) for security issues.

## Development

Use Windows x64 and Node.js 24 LTS:

```powershell
npm ci
npm test
npm run build
npm run test:desktop
```

Core logic is in `core/`, Electron lifecycle and IPC in `desktop/`, and React UI in `src/`. Provider calls are non-streaming and expected answers must never be sent to the provider.

For protocol or accounting changes, use local HTTP fixtures and verify both request shape and returned results. Preserve existing profile compatibility, nullable usage fields, key redaction, and provider reasoning filters. Never require contributors' paid credentials for tests.

Text verdicts are independent of HTML generation. Optional model-assisted extraction must never receive the expected answer, must retain verifiable evidence and auxiliary usage, and must obey the same concurrency/cancellation boundaries. Run `npm run test:judgement` for these flows.

For UI changes, run the relevant desktop scenarios after building. Use `npm run test:floating` for hover, pin, collapse, screen-edge snapping and saved native geometry. See the README for HTML, Token, answer/float, boundary, regression, and packaged executable checks. Do not rebuild while graphical scenarios are still loading files.

Keep pull requests focused. Explain the user-visible change and how it was verified. New behavior should have a regression scenario that would fail without the change. Do not commit generated binaries, dependency folders, private profiles, or local test artifacts.
