# MoonAtlas

A pure MoonBit library for local, multi-document knowledge maps with source evidence.
It performs no filesystem or network I/O. Hosts provide UTF-8 Markdown/TXT snapshots.
Core module: `icyaaaww/moonatlas`, library version `0.1.0`.
The browser application's `1.0.0` version is independent of the library version.
The current publishing tool requires a `0.x.y` module version; this is the first registry release of the core used by the 1.0 application.

## Install and use

In a MoonBit project, add the registry dependency:

```sh
moon add icyaaaww/moonatlas
```

Import the root package in your `moon.pkg`:

```moonbit nocheck
///|
import {
  "icyaaaww/moonatlas",
}
```

Then call the API from a test or application. The following example is checked as part of the library's tests:

```mbt check
///|
test {
  let docs : Array[@moonatlas.Document] = [
    {
      path: "team/release.md",
      content: "# Release\n## Rollback\nRestore the previous version.",
    },
    {
      path: "team/review.md",
      content: "# Review\n## Rollback\nRecord the decision.",
    },
  ]
  let atlas = @moonatlas.build_atlas(docs, [], [])
  assert_eq(atlas.issues.length(), 0)
  assert_eq(atlas.concepts[0].paths.length(), 2)
  assert_eq(atlas.concepts[0].sources[0].start_line, 2)
  assert_true(@moonatlas.export_index(atlas).contains("Rollback"))
}
```

Public entry points:

- `validate_documents(documents)` checks document counts, paths and text sizes.
- `parse_document(document, preferences)` extracts ATX headings and exact source lines.
- `build_atlas(documents, preferences, aliases)` validates and creates a deterministic map.
- `compare_documents(before, after)` reports additions, changes, removals and unique exact-content renames.
- `compare_sections(before, after)` returns literal section additions/removals/edits with complete before/after text and line evidence; inspect `issues` and repeated-heading `notes`.
- `reconcile_preferences(before, after, preferences)` transfers manual choices across those renames.
- `health_checks(atlas)` creates stable structural findings with original paths and lines; validate `Atlas.issues` first.
- `update_impacts(before, after)` returns direct incoming reference evidence from both snapshots, including deleted or renamed targets; inspect `issues`.
- `diff_lines(before, after)` returns 1-based changed line ranges; a count of zero is an insertion/deletion boundary. `precise: false` explicitly indicates a bounded whole-region fallback. Browser transport limits each text to 200,000 UTF-16 units.
- `search_documents(documents, preferences, query)` returns literal case-insensitive matches with snippets and 1-based source lines. Metadata hits use line 0. At most 200 hits are returned; `total` includes remaining matches. Inspect `issues` before use.
- `classify_documents(documents, preferences, paths, topic)` applies one topic to 1–200 unique existing paths while preserving display titles and unselected preferences. Invalid selections fail atomically; inspect `issues` before using `preferences`.
- `export_index(atlas)` creates an escaped Markdown inventory with source line ranges.
- `export_svg(atlas, title)` creates a portable topic/document overview.

Check `Atlas.issues` before using graph results. Invalid input produces an empty graph
and explicit issues; invalid comparisons contain a `kind: "invalid"` entry.
Low-level `parse_document` expects already validated documents; `build_atlas` is the
recommended bounded API. Repeated headings are lexical clues, not inferred semantic
equivalence. See `docs/architecture.md` for scope and limitations, and `docs/provenance.md`
for sources and licenses. The archive includes the core, its tests, and `examples/demo`;
the browser UI and npm build tools remain in the GitHub repository.

## Validate from source

```sh
moon check --target all
moon test --target js
moon test --target wasm-gc
moon run examples/demo --target js
```

Input limits: 200 documents, 200,000 UTF-16 units per document, 2,000,000 in total,
3,000 headings, 5,000 references, 200 preferences and 200 aliases. Inputs beyond
the limits produce explicit issues. Markdown scanning is intentionally bounded,
not a complete CommonMark/YAML implementation. There is no PDF/Word reader,
network connector, semantic inference or source-file mutation in this library.
