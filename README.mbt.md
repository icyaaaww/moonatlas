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
- `reconcile_preferences(before, after, preferences)` transfers manual choices across those renames.
- `export_index(atlas)` creates an escaped Markdown inventory with source line ranges.
- `export_svg(atlas, title)` creates a portable topic/document overview.

Check `Atlas.issues` before using graph results. Invalid input produces an empty graph
and explicit issues; invalid comparisons contain a `kind: "invalid"` entry.
Low-level `parse_document` expects already validated documents; `build_atlas` is the
recommended bounded API. Repeated headings are lexical clues, not inferred semantic
equivalence. See README.md and docs/architecture.md for scope and limitations.
