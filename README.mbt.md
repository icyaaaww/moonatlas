# MoonAtlas

A pure MoonBit library for local, multi-document knowledge maps with source evidence.
It performs no filesystem or network I/O. Hosts provide UTF-8 Markdown/TXT snapshots.
The package name `icyaaaww/moonatlas` is currently local and is not published on Mooncakes.

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
equivalence. See README.md and docs/architecture.md for scope and limitations.
