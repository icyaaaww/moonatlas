///|
test "path boundaries and duplicate source identity" {
  assert_eq(
    @moonatlas.validate_documents([{ path: "notes/a.md", content: "你好", }]).length(),
    0,
  )
  assert_eq(
    @moonatlas.validate_documents([{ path: "../a.md", content: "", }])[0].code,
    "path",
  )
  assert_eq(
    @moonatlas.validate_documents([
      { path: "a.md", content: "", },
      { path: "a.md", content: "new", },
    ])[0].code,
    "duplicate_path",
  )
}

///|
test "concept normalization preserves meaningful punctuation" {
  assert_eq(@moonatlas.normalize_name("  ACID \t 事务  "), "acid 事务")
  assert_true(
    @moonatlas.normalize_name("C++") != @moonatlas.normalize_name("C"),
  )
}
