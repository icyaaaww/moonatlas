///|
fn main {
  let documents : Array[@atlas.Document] = [
    {
      path: "工程/发布.md",
      content: "# 发布手册\n## 回滚\n恢复上一版本。",
    },
    {
      path: "工程/复盘.md",
      content: "# 事故复盘\n## 回滚\n记录回滚决策与结果。",
    },
  ]
  let graph = @atlas.build_atlas(documents, [], [])
  println(@atlas.export_index(graph))
}
