///|
test "shared headings retain every original source" {
  let atlas = @moonatlas.build_atlas(
    [
      { path: "a.md", content: "# A\n## 索引\nA 的内容", },
      { path: "b.md", content: "# B\n## 索引\nB 的内容", },
    ],
    [],
    [],
  )
  assert_eq(atlas.issues.length(), 0)
  assert_eq(atlas.concepts[0].label, "索引")
  assert_eq(atlas.concepts[0].paths, ["a.md", "b.md"])
  assert_true(atlas.concepts[0].sources[1].quote.contains("B 的内容"))
}

///|
test "explicit aliases merge names but retain source text" {
  let atlas = @moonatlas.build_atlas(
    [
      { path: "a.md", content: "# B-tree", },
      { path: "b.md", content: "# B树", },
    ],
    [],
    [{ name: "B-tree", target: "B树", }],
  )
  assert_eq(atlas.concepts.length(), 1)
  assert_eq(atlas.concepts[0].sources[0].quote, "# B-tree")
  let invalid = @moonatlas.build_atlas([], [], [
    { name: "a", target: "b", },
    { name: "b", target: "a", },
  ])
  assert_eq(invalid.issues[0].code, "alias_cycle")
}

///|
test "links distinguish missing, ambiguous, attachments and unchecked anchors" {
  let atlas = @moonatlas.build_atlas(
    [
      {
        path: "index.md",
        content: "[one](notes/a.md) [[same]] [missing](no.md) ![image](a.png) [anchor](notes/a.md#x)",
      },
      { path: "notes/a.md", content: "# A", },
      { path: "x/same.md", content: "# One", },
      { path: "y/same.md", content: "# Two", },
    ],
    [],
    [],
  )
  assert_true(atlas.links.any(l => l.status == "ambiguous"))
  assert_true(atlas.links.any(l => l.status == "missing"))
  assert_true(atlas.links.any(l => l.status == "attachment_unchecked"))
  assert_true(atlas.links.any(l => l.status == "fragment_unchecked"))
  assert_true(
    atlas.links.any(l => l.status == "linked" && l.target == "notes/a.md"),
  )
}

///|
test "relative references and fenced examples" {
  let atlas = @moonatlas.build_atlas(
    [
      {
        path: "x/a.md",
        content: "[B](../b.md)\n```\n[fake](missing.md)\n```\n`[code](fake.md)`",
      },
      { path: "b.md", content: "# B", },
    ],
    [],
    [],
  )
  assert_eq(atlas.links.length(), 1)
  assert_eq(atlas.links[0].target, "b.md")
}

///|
test "duplicates use exact text and order is deterministic" {
  let docs : Array[@moonatlas.Document] = [
    { path: "b.md", content: "# Same", },
    { path: "a.md", content: "# Same", },
    { path: "c.md", content: "# Same\n", },
  ]
  let a = @moonatlas.build_atlas(docs, [], [])
  assert_eq(a.duplicates.length(), 1)
  assert_eq(a.duplicates[0].paths, ["a.md", "b.md"])
  assert_eq(a, @moonatlas.build_atlas([docs[2], docs[0], docs[1]], [], []))
}
