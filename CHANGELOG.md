# Changelog

## 1.3.2 - 2026-10-17

### Added

- Built-in combined candy/milk question with the saved answer `21和46.24`, preserving the question order and the user's answer-only instruction.
- Versioned preset upgrades add the combined question to existing profiles without replacing edited questions, fixed answers or model assignments, and without duplicating an existing copy.

### Changed

- Built-in milk and candy questions now include the saved answer-only instructions, with fixed answers `46.24` and `21`. The HTML/SVG animation prompt is unchanged.
- Includes the locally verified 1.3.1 edge auto-hide and fractional display scaling fixes.

## 1.3.1 - 2026-10-16

### Fixed

- Screen-edge correction repeatedly moved the floating window using rounded native dimensions, causing gradual growth and drift at fractional Windows display scaling.
- Programmatic moves and expansion no longer overwrite the saved compact position or detail size. Geometry updates use explicit position and size and run only when the intended layout changes.

### Added

- Edge auto-hide: leaving a docked monitor reduces it to a slim status strip; hovering restores the model list. Clicking a model keeps its details pinned, and dragging away restores the ordinary compact monitor.
- Native minimum-size handling keeps the status strip inside the work area even when Windows enforces a larger window.
- Persistent docking on all four work-area edges and native regressions for repeated updates, open/close cycles and restart at the active display scale.

## 1.3.0 - 2026-10-16

### Changed

- Reworked the floating monitor into a narrow traffic-monitor-style window. Compact rows retain connection/model identity, verdict, text answers, history and Token totals; height is bounded with scrolling for additional models.
- Hover opens the model list and leaving collapses it. Clicking a model pins its details; back, pin/unpin, collapse and Escape provide explicit controls.
- HTML thumbnails open interactive pages in separate sandboxed windows, keeping the monitor compact. The selected model retains its latest eight rounds and multiple HTML question tabs.

### Added

- Screen-edge snapping and saved compact placement, plus resizable details with size restoration.
- Evidence-format, four-protocol HTTP, floating interaction, native placement/restart and independent HTML preview regressions, including the portable executable.

### Fixed

- Auxiliary extraction could return the correct `21` but remain insufficient when its quotation differed only in Markdown emphasis, LaTeX presentation, whitespace or escaped punctuation.
- Evidence matching retains full numeric boundaries, signs and arithmetic expressions, with more specific rejection reasons.
- Native window size persistence uses content dimensions to avoid repeated size growth under Windows display scaling.
- Hover expansion still collapses when native resizing clears the pointer hover state without delivering a leave event.

## 1.2.2 - 2026-10-16

### Fixed

- The reported milk and candy replies were classified as contradictory final answers, preventing the configured auxiliary model from running. Conditional background values and alternative interpretations now request context-aware extraction using the original question, while unconditional contradictions remain insufficient.
- Cache bypass now also requests native explicit mode without breakpoints on recognized, supported OpenAI model families for Responses and Chat Completions. The previous random prefix and HTTP directives alone could leave automatic input caching enabled.

### Added

- Per-request bypass strategy and reported cache-read counts in result details, including auxiliary calls. Nonzero counts remain visible after requesting bypass; absent counters are not treated as zero.
- Screenshot-reply regressions across all four protocols, negative verdict checks, native-cache request checks, and desktop/portable replay scenarios.

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
