///|
/// Compare literal document snapshots. Rename requires a unique exact-content match.
pub fn compare_documents(
  before : Array[Document],
  after : Array[Document],
) -> Array[Change] {
  if !validate_documents(before).is_empty() ||
    !validate_documents(after).is_empty() {
    return [
      {
        kind: "invalid",
        path: "",
        previous_path: "",
        detail: "输入校验失败，无法比较",
      },
    ]
  }
  let old : Map[String, String] = Map([])
  let fresh : Map[String, String] = Map([])
  for d in before {
    old[d.path] = d.content
  }
  for d in after {
    fresh[d.path] = d.content
  }
  let removed = before.filter(d => !fresh.contains(d.path))
  let added = after.filter(d => !old.contains(d.path))
  let renamed : Map[String, Bool] = Map([])
  let changes : Array[Change] = []
  for d in added {
    let matches = removed.filter(r => r.content == d.content)
    let new_matches = added.filter(r => r.content == d.content)
    if matches.length() == 1 &&
      new_matches.length() == 1 &&
      d.content.trim() != "" {
      renamed[matches[0].path] = true
      changes.push({
        kind: "renamed",
        path: d.path,
        previous_path: matches[0].path,
        detail: "内容完全相同且匹配唯一；按重命名处理",
      })
    } else {
      changes.push({
        kind: "added",
        path: d.path,
        previous_path: "",
        detail: "新加入的文档",
      })
    }
  }
  for d in removed {
    if !renamed.contains(d.path) {
      changes.push({
        kind: "removed",
        path: d.path,
        previous_path: "",
        detail: "当前资料集不再包含此文档",
      })
    }
  }
  for d in after {
    if old.get(d.path) is Some(content) {
      if content != d.content {
        changes.push({
          kind: "updated",
          path: d.path,
          previous_path: "",
          detail: "原文内容发生变化",
        })
      }
    }
  }
  changes.sort_by((a, b) => a.path.compare(b.path))
  changes
}

///|
/// Carry manual choices across only unambiguous content-identical renames.
pub fn reconcile_preferences(
  before : Array[Document],
  after : Array[Document],
  preferences : Array[Preference],
) -> Array[Preference] {
  let changes = compare_documents(before, after)
  let result : Array[Preference] = []
  for p in preferences {
    let rename = changes
      .iter()
      .find_first(c => c.kind == "renamed" && c.previous_path == p.path)
    match rename {
      Some(c) =>
        if !preferences.any(other => other.path == c.path) {
          result.push({ path: c.path, topic: p.topic, title: p.title, })
        }
      None => result.push(p)
    }
  }
  result
}

///|
fn markdown_text(text : String) -> String {
  text
  .replace_all(old="\\", new="\\\\")
  .replace_all(old="[", new="\\[")
  .replace_all(old="]", new="\\]")
  .replace_all(old="*", new="\\*")
  .replace_all(old="_", new="\\_")
  .replace_all(old="`", new="\\`")
  .replace_all(old="<", new="&lt;")
  .replace_all(old="\n", new=" ")
  .replace_all(old="\r", new=" ")
}

///|
/// Portable inventory with original paths and line numbers; no guessed heading anchors.
pub fn export_index(atlas : Atlas) -> String {
  let rows = [
    "# MoonAtlas 知识库索引", "", "由目录、显式分类和原文标题生成；同名标题仅表示文字线索。",
    "",
  ]
  let topics : Map[String, Array[Page]] = Map([])
  for page in atlas.pages {
    if !topics.contains(page.topic) {
      topics[page.topic] = []
    }
    topics[page.topic].push(page)
  }
  let names = topics.keys().to_array()
  names.sort()
  for topic in names {
    rows.push("## " + markdown_text(topic))
    rows.push("")
    for p in topics[topic] {
      rows.push(
        "- **" + markdown_text(p.title) + "** — " + markdown_text(p.path),
      )
      for s in p.sections {
        rows.push(
          "  - " +
          markdown_text(s.title) +
          "（L" +
          s.evidence.start_line.to_string() +
          "–" +
          s.evidence.end_line.to_string() +
          "）",
        )
      }
    }
    rows.push("")
  }
  rows.push("## 跨文档标题线索")
  rows.push("")
  for c in atlas.concepts {
    if c.paths.length() > 1 {
      rows.push(
        "- " +
        markdown_text(c.label) +
        "：" +
        c.paths.map(markdown_text).join("、"),
      )
    }
  }
  rows.join("\n") + "\n"
}
