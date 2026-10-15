# Changelog

## 1.2.1 - 2026-10-15

### Added

- Saved cache-bypass switches in the workbench and Settings, with a short explanation of input caching and response-cache limits.
- Per-request random input prefixes and no-cache/no-store directives for all four protocols, including HTML and auxiliary extraction. Explicit cache-reuse options are omitted only while bypass is enabled.
- Per-round bypass markers, restart coverage, an exact-response-cache regression, and tests for queued requests retaining their original switch setting.

### Changed

- Compact and expanded floating windows display the saved connection name before the model name. Both names truncate separately and retain full-name hover text.
- Documented the difference between provider input/prefix caching and proxy full-response caching when interpreting repeated tests.

### Fixed

- Same-name models on different connections were indistinguishable in the compact floating window.

## 1.2.0 - 2026-10-15

### Added

- Optional answer extraction with the current or another configured model when local automatic extraction is unclear. Expected answers remain local; evidence, auxiliary model and usage are retained.
- Per-model accounting for auxiliary requests and a desktop/restart regression scenario.

### Changed

- Text verdicts and floating history bars update before HTML generation completes. HTML is for human inspection and no longer changes text correctness.
- Queued text requests take priority over queued HTML requests; active mixed rounds survive history bounds and restart recovery.

### Fixed

- The reported milk reply was rejected because a conditional height and an `is therefore` equation were treated as conflicting answer declarations.
- Floating model badges could remain in the detecting state after text evaluation had finished.
- Auxiliary extraction preserves explicit local conflicts and complete numeric boundaries, redacts known saved keys before forwarding a reply, and retains unknown usage for cancelled auxiliary calls.

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
