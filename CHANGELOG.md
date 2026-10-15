# Changelog

## Mooncakes core 0.1.0 — 2026-10-15

- Published `icyaaaww/moonatlas@0.1.0`, the reusable MoonBit core used by the 1.0.0 browser app. Library and application versions are independent.
- Added repository metadata and an explicit package allowlist; the registry archive contains 31 core, test, example, documentation and license files, without the browser/npm host.
- Verified extracted package checks, 40 tests on each of JS/Wasm GC and a runnable example.
- Installed from the public registry in a fresh consumer project; four external API tests pass on each of JS/Wasm GC, and the consumer demo runs successfully.
- Added a CI packaging check and documented actual publication and installation evidence in docs/mooncakes-release.md.

## 1.0.0 — 2026-10-15

Stable source and offline distribution: https://github.com/icyaaaww/moonatlas/releases/tag/v1.0.0
Local validation is recorded in docs/validation.md; remote CI is tracked against the release commit in GitHub Actions.

- Explicit first-use home with import, recovery and fictional example choices.
- Cancellable file reads and merge/replace previews listing every affected or skipped file; removals require acknowledgement before applying.
- Bounded MoonBit search with source snippets, exact line navigation, keyword highlights and automatic map expansion.
- Atomic MoonBit batch classification and batch health review, affected-item confirmation and single-step undo.
- SHA-256 project backups, read-back verification and safe project switching only after a matching backup is verified or changes explicitly discarded.
- Backward-compatible v1 recovery, clearer draft/backup status and actionable corruption errors.
- Multi-engine browser regression coverage, reproducible synthetic performance measurements, migration guide and a real-user trial kit.
- At the original application release, no real-user outcomes or Mooncakes publication were claimed. The subsequent core publication is recorded above; remaining limits are recorded in docs/validation.md.

## 0.3.0 — 2026-10-15

Public source and offline distribution: https://github.com/icyaaaww/moonatlas/releases/tag/v0.3.0

- MoonBit structural health findings and direct incoming update references from both snapshots.
- Review workbench with pending/done/ignored states, required ignore reasons, type filters and paginated tasks.
- Validated optional review metadata in v1 projects, undo/redo support and source-change rechecking.
- Bounded MoonBit line diff with insertion/deletion highlights, cross-page change navigation and explicit large-region fallback.
- Exact baseline reference preview for removed or renamed targets, including evidence beyond the first 5,000 characters.
- Markdown maintenance reports, fictional maintenance demo and a focused user trial guide.
- Added core, integration and offline browser regression coverage; see docs/validation.md for measured results.

## 0.2.0 — 2026-10-15

Public source and offline distribution: https://github.com/icyaaaww/moonatlas

- Opt-in IndexedDB drafts with explicit recovery, clearing, transaction completion status and revision conflicts between tabs.
- Bounded session undo/redo for document imports, classifications, aliases, removals and baseline changes.
- Map zoom, pan, fit-to-width, topic folding/focus and clickable source-backed document reference lines.
- Pure MoonBit section comparisons with complete before/after text, line evidence and duplicate-heading caveats.
- Side-by-side section inspection, paginated long sources and changed-document map badges.
- Existing v1 project files remain compatible; sharing does not carry persistence opt-in or undo history.
- Added failure, recovery, concurrency, comparison and navigation tests.

## 0.1.0 — 2026-10-15

First local implementation; not a published registry or GitHub release.

- MoonBit document model, bounded Markdown/TXT parsing and source line evidence.
- Deterministic multi-document concepts, explicit aliases and exact duplicate groups.
- Internal document reference states, with explicit unchecked anchors and attachments.
- Snapshot comparisons and preference preservation across unique exact-content renames.
- Browser workspace with global hierarchy, original text, manual classification and search.
- Explicit project JSON persistence, baseline management and incremental re-import.
- SVG overview, Markdown index, graph JSON and standalone interactive HTML exports.
- Cross-target core tests, Node integration tests, Chromium offline workflows and CI definition.

Known boundaries and pending validation are documented in README.md and docs/.
