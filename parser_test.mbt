///|
test "headings carry exact source line ranges" {
  let page = @moonatlas.parse_document(
    { path: "a.md", content: "# 课程\r\n介绍\r\n## 索引\r\n内容", },
    [],
  )
  assert_eq(page.title, "课程")
  assert_eq(page.sections[1].evidence.start_line, 3)
  assert_eq(page.sections[1].evidence.end_line, 4)
  assert_eq(page.sections[1].evidence.quote, "## 索引\n内容")
}

///|
test "fenced code and indented code are not headings" {
  let page = @moonatlas.parse_document(
    {
      path: "a.md",
      content: "# Title\n````md\n## fake\n```\n## still fake\n````\n    ## indented\n## real",
    },
    [],
  )
  assert_eq(page.sections.length(), 2)
  assert_eq(page.sections[1].title, "real")
}

///|
test "manual choices take precedence and survive content changes" {
  let prefs : Array[@moonatlas.Preference] = [
    { path: "notes/a.md", topic: "我的分类", title: "我的标题", },
  ]
  let page = @moonatlas.parse_document(
    {
      path: "notes/a.md",
      content: "---\ntopic: 原分类\ntags: [索引, 事务]\n---\n# 新标题",
    },
    prefs,
  )
  assert_eq(page.topic, "我的分类")
  assert_eq(page.title, "我的标题")
  assert_eq(page.assignment, "user")
  assert_eq(page.tags, ["索引", "事务"])
}

///|
test "heading identity is independent of preceding line offsets" {
  let a = @moonatlas.parse_document(
    { path: "a.md", content: "# Title\n## Index\nText", },
    [],
  )
  let b = @moonatlas.parse_document(
    { path: "a.md", content: "preface\n# Title\n## Index\nChanged", },
    [],
  )
  assert_eq(a.sections[1].id, b.sections[1].id)
}

///|
test "duplicate headings stay distinct and txt stays literal" {
  let a = @moonatlas.parse_document({ path: "a.md", content: "## A\n## A", }, [])
  assert_true(a.sections[0].id != a.sections[1].id)
  assert_eq(
    @moonatlas.parse_document({ path: "a.txt", content: "# Literal", }, []).sections.length(),
    0,
  )
}
