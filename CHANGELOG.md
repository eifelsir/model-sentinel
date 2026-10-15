# Changelog

## 1.1.0 - 2026-10-15

### Added

- Per-question and per-round Token usage, cache and reasoning details, retained-history/model summaries, and compact floating totals.
- HTML/SVG questions with eight-round thumbnail history, expandable interactive previews, and tabs for multiple generated pages.
- Provider/model-aware reasoning intensity settings, separate from output limits.
- Built-in milk, candy, and literal HTML/SVG bicycle animation prompts.
- Encrypted backup recovery, saved-question selection on startup, and actual data directory/version in Settings.
- Public project documentation, MIT license, contribution guidelines, and Windows CI.

### Changed

- Compact floating window now shows model names, history color bars, and text answers without expansion.
- Known and unknown usage counters are distinct; partial reporting is visible. Incomplete responses retain returned usage.
- HTML extraction rejects additional documents while accepting explanatory tag mentions around a single fenced page.

### Fixed

- Quantity-style candy conclusions, units, and boxed numeric answers could be incorrectly reported as insufficient.
- Explanation-only uncertainty could hide an otherwise definite correct answer.
- A new empty question editor could make saved questions appear absent after restart.
- Configuration toggles and Stop All could race with concurrent saves.

## 1.0.2 - 2026-10-15

- Improved extraction of compound quantity conclusions such as the user's candy response.
- Added replay fixtures for reported answer-extraction failures.

## 1.0.1 - 2026-10-15

- Added compact model identities and more conservative handling of contradictory answers.
- Preserved credentials across saved connection edits and late responses.

## 1.0.0 - 2026-10-15

- Initial Windows multi-provider answer monitor with scheduling, history, encrypted keys, and desktop floating window.
