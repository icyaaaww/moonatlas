///|
test "section comparison distinguishes additions removals and edits with both line ranges" {
  let result = @moonatlas.compare_sections(
    { path: "a.md", content: "# A\n## Keep\nold\n## Gone\nremoved", },
    { path: "a.md", content: "# A\n## Keep\nnew\n## Added\nadded", },
  )
  assert_eq(result.issues.length(), 0)
  assert_eq(result.changes.length(), 3)
  assert_eq(result.changes[0].kind, "updated")
  assert_eq(result.changes[0].before_text, "## Keep\nold")
  assert_eq(result.changes[0].after_text, "## Keep\nnew")
  assert_eq(result.changes[0].after.unwrap().start_line, 2)
  assert_eq(result.changes[1].kind, "added")
  assert_eq(result.changes[2].kind, "removed")
}

///|
test "inserting preface relocates evidence without inventing heading edits" {
  let result = @moonatlas.compare_sections(
    { path: "a.md", content: "# A\n## B\nbody", },
    { path: "a.md", content: "preface\n# A\n## B\nbody", },
  )
  assert_eq(result.changes.length(), 1)
  assert_eq(result.changes[0].id, "intro")
}

///|
test "comparison detects changes after excerpt limit and includes complete text" {
  let text = Array::make(1400, "x").join("")
  let result = @moonatlas.compare_sections(
    { path: "a.md", content: "# A\n" + text + "old", },
    { path: "a.md", content: "# A\n" + text + "new", },
  )
  assert_eq(result.changes.length(), 1)
  assert_true(result.changes[0].before_text.has_suffix("old"))
  assert_true(result.changes[0].after_text.has_suffix("new"))
}

///|
test "txt metadata and repeated heading ambiguity stay visible" {
  let txt = @moonatlas.compare_sections({ path: "a.txt", content: "x", }, {
    path: "a.txt",
    content: "y",
  })
  assert_eq(txt.changes[0].title, "全文 / 无标题内容")
  let metadata = @moonatlas.compare_sections(
    { path: "a.md", content: "---\ntopic: A\n---\n# Title", },
    { path: "a.md", content: "---\ntopic: B\n---\n# Title", },
  )
  assert_eq(metadata.changes[0].id, "intro")
  let repeated = @moonatlas.compare_sections(
    { path: "a.md", content: "## A\none\n## A\ntwo", },
    { path: "a.md", content: "## A\ntwo\n## A\none", },
  )
  assert_eq(repeated.notes.length(), 1)
  assert_eq(repeated.changes.length(), 2)
}

///|
test "renamed titles are not guessed equivalent and invalid inputs are explicit" {
  let changed = @moonatlas.compare_sections(
    { path: "a.md", content: "# Old\nSame", },
    { path: "a.md", content: "# New\nSame", },
  )
  assert_eq(changed.changes.length(), 2)
  let invalid = @moonatlas.compare_sections({ path: "../a.md", content: "", }, {
    path: "a.md",
    content: "",
  })
  assert_eq(invalid.issues[0].code, "path")
}

///|
test "empty documents do not invent a removed intro and line ending changes stay literal" {
  let empty = @moonatlas.compare_sections({ path: "a.md", content: "", }, {
    path: "a.md",
    content: "# New",
  })
  assert_eq(empty.changes.length(), 1)
  assert_eq(empty.changes[0].kind, "added")
  let endings = @moonatlas.compare_sections(
    { path: "a.md", content: "# A\nbody", },
    { path: "a.md", content: "# A\r\nbody", },
  )
  assert_eq(endings.changes.length(), 1)
  assert_true(endings.changes[0].after_text.contains("\r"))
}
