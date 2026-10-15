# Security Policy

## Supported Version

Security fixes target the latest 1.x release. Use the newest release before reporting an issue.

## Reporting

Please use this repository's **Security -> Advisories -> Report a vulnerability** when private vulnerability reporting is enabled. If it is unavailable, open an issue requesting a private contact channel without including exploit details, credentials, or sensitive data.

Include the version, affected component, minimal reproduction, and likely impact. Do not include working API keys or personal configuration/history exports.

## Design Boundaries

Keys are stored using Electron `safeStorage`; normal renderer snapshots omit stored keys. Requests go to endpoints configured by the user. Generated HTML is treated as untrusted and previewed in a restricted sandbox. The desktop renderer has no Node integration and uses narrow IPC.

History and exports contain prompts and model-generated content. Key redaction does not remove all other sensitive material a user may put into prompts or receive in replies. Review exports before sharing them.

The executable is currently unsigned. This project does not verify provider model identity or promise that generated pages are visually correct.
