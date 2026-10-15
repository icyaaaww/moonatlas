///|
test "unclosed metadata and multi-backtick code spans do not create false links" {
  let a = @moonatlas.build_atlas(
    [
      {
        path: "a.md",
        content: "---\n[real](b.md)\n``[code](missing.md) ` still code``\n",
      },
      { path: "b.md", content: "# B", },
    ],
    [],
    [],
  )
  assert_eq(a.links.length(), 1)
  assert_eq(a.links[0].status, "linked")
}

///|
test "wiki basename extension fallback and explicit directories are distinct" {
  let a = @moonatlas.build_atlas(
    [
      { path: "a.md", content: "[[same.md]] [[wrong/same]]", },
      { path: "nested/same.md", content: "# B", },
    ],
    [],
    [],
  )
  assert_eq(a.links[0].target, "nested/same.md")
  assert_eq(a.links[1].status, "missing")
}

///|
test "literal txt does not consume metadata" {
  let p = @moonatlas.parse_document(
    { path: "a.txt", content: "---\ntopic: fake\n---\n# text", },
    [],
  )
  assert_eq(p.topic, "未分类")
  assert_eq(p.sections.length(), 0)
  assert_true(p.excerpt.contains("topic: fake"))
}

///|
test "bounded reference graph rejects excessive links instead of truncating silently" {
  let lines : Array[String] = []
  for _i = 0; _i < 5001; _i = _i + 1 {
    lines.push("[a](x.md)")
  }
  let a = @moonatlas.build_atlas(
    [{ path: "a.md", content: lines.join("\n"), }],
    [],
    [],
  )
  assert_eq(a.issues[0].code, "limit")
  assert_eq(a.pages.length(), 0)
}

///|
test "svg output escapes user text and contains document paths" {
  let a = @moonatlas.build_atlas(
    [{ path: "notes/a.md", content: "# <script> & title", }],
    [],
    [],
  )
  let svg = @moonatlas.export_svg(a, "A < B & C")
  assert_true(svg.contains("&lt;script&gt;"))
  assert_false(svg.contains("<script>"))
  assert_true(svg.contains("notes/a.md"))
  assert_true(svg.contains("viewBox=\"0 0 1040"))
}
