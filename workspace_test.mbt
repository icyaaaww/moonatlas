///|
test "search returns actual source lines and distinguishes metadata" {
  let docs : Array[@moonatlas.Document] = [
    {
      path: "folder/note.md",
      content: "# 标题\n前文\n恢复 Backup\n后文",
    },
  ]
  let result = @moonatlas.search_documents(docs, [], "backup")
  assert_eq(result.issues.length(), 0)
  assert_eq(result.total, 1)
  assert_eq(result.hits[0].line, 3)
  assert_true(result.hits[0].snippet.contains("恢复 Backup"))
  let metadata = @moonatlas.search_documents(
    docs,
    [{ path: "folder/note.md", topic: "交接", title: "自定义", }],
    "交接",
  )
  assert_eq(metadata.hits[0].kind, "metadata")
  assert_eq(metadata.hits[0].line, 0)
}

///|
test "search bounds results without inventing total or cutting Unicode evidence" {
  let text = Array::make(250, "重复🙂").join("\n")
  let result = @moonatlas.search_documents(
    [{ path: "a.txt", content: text, }],
    [],
    "🙂",
  )
  assert_eq(result.total, 250)
  assert_eq(result.hits.length(), 200)
  let long = @moonatlas.search_documents(
    [{ path: "a.txt", content: Array::make(600, "🙂").join("") + "MATCH", }],
    [],
    "match",
  )
  assert_true(long.hits[0].snippet.contains("MATCH"))
  assert_true(long.hits[0].snippet.has_prefix("…"))
  assert_eq(@moonatlas.search_documents([], [], " ").total, 0)
  assert_true(
    !@moonatlas.search_documents([], [], Array::make(201, "x").join("")).issues.is_empty(),
  )
}

///|
test "classification is atomic and preserves existing titles and unselected choices" {
  let docs : Array[@moonatlas.Document] = [
    { path: "a.md", content: "# A", },
    { path: "b.md", content: "# B", },
  ]
  let prefs : Array[@moonatlas.Preference] = [
    { path: "a.md", topic: "Old", title: "Custom", },
    { path: "b.md", topic: "Keep", title: "", },
  ]
  let result = @moonatlas.classify_documents(docs, prefs, ["a.md"], " New ")
  assert_eq(result.issues.length(), 0)
  assert_true(
    result.preferences.any(p => {
      p.path == "a.md" && p.topic == "New" && p.title == "Custom"
    }),
  )
  assert_true(
    result.preferences.any(p => p.path == "b.md" && p.topic == "Keep"),
  )
  let invalid = @moonatlas.classify_documents(
    docs,
    prefs,
    ["a.md", "gone.md"],
    "New",
  )
  assert_true(!invalid.issues.is_empty())
  assert_eq(invalid.preferences, prefs)
  assert_true(
    !@moonatlas.classify_documents(docs, prefs, ["a.md", "a.md"], "New").issues.is_empty(),
  )
}

///|
test "classification rejects overflow of historical preferences without dropping choices" {
  let preferences : Array[@moonatlas.Preference] = Array::makei(200, i => {
    path: i.to_string() + ".md",
    topic: "Old",
    title: "",
  })
  let result = @moonatlas.classify_documents(
    [{ path: "new.md", content: "", }],
    preferences,
    ["new.md"],
    "New",
  )
  assert_true(!result.issues.is_empty())
  assert_eq(result.preferences, preferences)
}
