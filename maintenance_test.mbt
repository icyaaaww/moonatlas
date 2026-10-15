///|
test "health findings have distinct evidence and deterministic identities" {
  let docs : Array[@moonatlas.Document] = [
    { path: "a.md", content: "# A\n[x](missing.md)\n[x](missing.md)", },
    { path: "copies/b.md", content: "# Copy", },
    { path: "copies/c.md", content: "# Copy", },
  ]
  let checks = @moonatlas.health_checks(@moonatlas.build_atlas(docs, [], []))
  assert_eq(checks.length(), 4)
  assert_eq(checks[0].kind, "unclassified")
  assert_eq(checks[1].paths.length(), 2)
  assert_eq(checks[2].line, 2)
  assert_eq(checks[3].line, 3)
  assert_true(checks[2].id != checks[3].id)
  assert_eq(
    checks,
    @moonatlas.health_checks(
      @moonatlas.build_atlas([docs[2], docs[0], docs[1]], [], []),
    ),
  )
}

///|
test "removed target keeps baseline reference evidence without inventing current links" {
  let refdoc : @moonatlas.Document = {
    path: "ref.md",
    content: "# Ref\n[read](gone.md)",
  }
  let report = @moonatlas.update_impacts(
    [refdoc, { path: "gone.md", content: "# Gone", }],
    [refdoc],
  )
  assert_eq(report.issues.length(), 0)
  assert_eq(report.impacts.length(), 1)
  assert_eq(report.impacts[0].snapshot, "before")
  assert_eq(report.impacts[0].line, 2)
  assert_eq(report.impacts[0].changed_path, "gone.md")
}

///|
test "rename and changed source retain the correct side and line" {
  let report = @moonatlas.update_impacts(
    [
      { path: "a.md", content: "# A", },
      { path: "ref.md", content: "[a](a.md)", },
    ],
    [
      { path: "new.md", content: "# A", },
      { path: "ref.md", content: "preface\n[a](new.md)", },
    ],
  )
  assert_eq(report.impacts.length(), 2)
  assert_eq(report.impacts[0].kind, "renamed")
  assert_eq(report.impacts[0].target, "a.md")
  assert_eq(report.impacts[1].target, "new.md")
  assert_eq(report.impacts[1].line, 2)
}

///|
test "impact scope excludes self references external links and unresolved wiki names" {
  let before : Array[@moonatlas.Document] = [
    { path: "x/a.md", content: "# Old\n[self](a.md)", },
    { path: "y/a.md", content: "# Other", },
    { path: "r.md", content: "[[a]]\n[ext](https://example.com)", },
  ]
  let after : Array[@moonatlas.Document] = [
    { path: "x/a.md", content: "# New\n[self](a.md)", },
    before[1],
    before[2],
  ]
  assert_eq(@moonatlas.update_impacts(before, after).impacts.length(), 0)
  let invalid = @moonatlas.update_impacts([{ path: "../a.md", content: "", }], [])
  assert_true(!invalid.issues.is_empty())
}

///|
test "line edits locate separate insertions removals and replacements" {
  let result = @moonatlas.diff_lines(
    "same\nold\nkeep\nremove\nend", "same\nnew\nkeep\nend\nadded",
  )
  assert_true(result.precise)
  assert_eq(result.edits.length(), 3)
  assert_eq(result.edits[0].before_start, 2)
  assert_eq(result.edits[0].after_count, 1)
  assert_eq(result.edits[1].before_count, 1)
  assert_eq(result.edits[1].after_count, 0)
  assert_eq(result.edits[2].before_count, 0)
}

///|
test "line diff preserves empty files trailing newlines and literal CRLF changes" {
  assert_eq(@moonatlas.diff_lines("", "").edits.length(), 0)
  assert_eq(@moonatlas.diff_lines("", "hello").edits[0].before_count, 0)
  assert_eq(@moonatlas.diff_lines("hello\n", "hello").edits[0].before_start, 2)
  assert_eq(@moonatlas.diff_lines("a\r\nb", "a\nb").edits[0].before_count, 1)
  assert_eq(
    @moonatlas.diff_lines("中文\n🙂", "中文\n🌕").edits[0].before_start,
    2,
  )
}

///|
test "large diff has explicit bounded fallback without losing the changed range" {
  let before = "prefix\n" + Array::make(600, "old").join("\n") + "\nsuffix"
  let after = "prefix\n" + Array::make(600, "new").join("\n") + "\nsuffix"
  let result = @moonatlas.diff_lines(before, after)
  assert_true(!result.precise)
  assert_eq(result.edits[0].before_start, 2)
  assert_eq(result.edits[0].before_count, 600)
  assert_eq(result.edits[0].after_count, 600)
}
