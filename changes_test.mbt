///|
test "compare distinguishes rename, edit, add and removal" {
  let a : Array[@moonatlas.Document] = [
    { path: "a.md", content: "A", },
    { path: "b.md", content: "B", },
    { path: "c.md", content: "C", },
  ]
  let b : Array[@moonatlas.Document] = [
    { path: "new.md", content: "A", },
    { path: "b.md", content: "B2", },
    { path: "d.md", content: "D", },
  ]
  let changes = @moonatlas.compare_documents(a, b)
  assert_eq(changes.length(), 4)
  assert_true(
    changes.any(c => {
      c.kind == "renamed" && c.previous_path == "a.md" && c.path == "new.md"
    }),
  )
  assert_true(changes.any(c => c.kind == "updated" && c.path == "b.md"))
  assert_true(changes.any(c => c.kind == "removed" && c.path == "c.md"))
  assert_true(changes.any(c => c.kind == "added" && c.path == "d.md"))
}

///|
test "duplicate contents and empty contents never guess rename" {
  let a : Array[@moonatlas.Document] = [
    { path: "a.md", content: "same", },
    { path: "b.md", content: "same", },
    { path: "empty.md", content: "", },
  ]
  let b : Array[@moonatlas.Document] = [
    { path: "c.md", content: "same", },
    { path: "blank.md", content: "", },
  ]
  assert_eq(
    @moonatlas.compare_documents(a, b).filter(c => c.kind == "renamed").length(),
    0,
  )
}

///|
test "manual classification survives rename and content edit" {
  let a : Array[@moonatlas.Document] = [{ path: "a.md", content: "# A", }]
  let b : Array[@moonatlas.Document] = [{ path: "b.md", content: "# A", }]
  let p = @moonatlas.reconcile_preferences(a, b, [
    { path: "a.md", topic: "我的主题", title: "自定义", },
  ])
  assert_eq(p[0].path, "b.md")
  assert_eq(
    @moonatlas.build_atlas([{ path: "b.md", content: "# Changed", }], p, []).pages[0].title,
    "自定义",
  )
}

///|
test "index preserves evidence and escapes active markup" {
  let a = @moonatlas.build_atlas(
    [{ path: "a.md", content: "# <script>\n## X", }],
    [],
    [],
  )
  let index = @moonatlas.export_index(a)
  assert_true(index.contains("L2–2"))
  assert_false(index.contains("<script>"))
}

///|
test "invalid comparison does not look like unchanged data" {
  assert_eq(
    @moonatlas.compare_documents([{ path: "../a.md", content: "x", }], [])[0].kind,
    "invalid",
  )
}
