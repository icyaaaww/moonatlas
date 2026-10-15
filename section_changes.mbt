///|
/// A literal section comparison; renamed titles are added/removed, not guessed.
pub(all) struct SectionChange {
  id : String
  title : String
  kind : String
  before : Evidence?
  after : Evidence?
  before_text : String
  after_text : String
} derive(Eq, Debug, ToJson, FromJson)

///|
pub(all) struct SectionComparison {
  changes : Array[SectionChange]
  issues : Array[Issue]
  notes : Array[String]
} derive(Eq, Debug, ToJson, FromJson)

///|
priv struct ComparisonPart {
  key : String
  title : String
  evidence : Evidence
  text : String
}

///|
fn comparison_parts(doc : Document, page : Page) -> Array[ComparisonPart] {
  if doc.content == "" {
    return []
  }
  let lines = doc.content.split("\n").map(s => s.to_owned()).to_array()
  let parts : Array[ComparisonPart] = []
  let intro_end = if page.sections.is_empty() {
    lines.length()
  } else {
    page.sections[0].evidence.start_line - 1
  }
  if intro_end > 0 {
    let text = lines[:intro_end].to_owned().join("\n")
    parts.push({
      key: "intro",
      title: if page.sections.is_empty() {
        "全文 / 无标题内容"
      } else {
        "文首 / 元数据"
      },
      text,
      evidence: {
        path: doc.path,
        start_line: 1,
        end_line: intro_end,
        quote: clip_text(text, 1200),
      },
    })
  }
  let occurrences : Map[String, Int32] = Map([])
  for s in page.sections {
    let name = normalize_name(s.title)
    let n = occurrences.get(name).unwrap_or(0)
    occurrences[name] = n + 1
    parts.push({
      key: "heading:" + Json([name, n.to_string()]).stringify(),
      title: s.title,
      evidence: s.evidence,
      text: lines[s.evidence.start_line - 1:s.evidence.end_line]
      .to_owned()
      .join("\n"),
    })
  }
  parts
}

///|
/// Compare complete section text, never the clipped evidence excerpt.
/// Identical content moving to different line numbers is not an edit.
pub fn compare_sections(
  before : Document,
  after : Document,
) -> SectionComparison {
  let issues = validate_documents([before])
  issues.append(validate_documents([after]))
  if !issues.is_empty() {
    return { changes: [], issues, notes: [], }
  }
  let old = parse_document(before, [])
  let fresh = parse_document(after, [])
  if old.sections.length() > 3000 || fresh.sections.length() > 3000 {
    return {
      changes: [],
      issues: [
        problem("limit", after.path, "每个快照最多 3,000 个标题"),
      ],
      notes: [],
    }
  }
  let notes : Array[String] = []
  for page in [old, fresh] {
    let seen : Map[String, Bool] = Map([])
    for s in page.sections {
      let key = normalize_name(s.title)
      if seen.contains(key) {
        if notes.is_empty() {
          notes.push(
            "存在同名标题：按出现顺序配对；插入、删除或调整重复标题的顺序可能导致额外变化，请核对两侧原文。",
          )
        }
      }
      seen[key] = true
    }
  }
  let old_parts = comparison_parts(before, old)
  let new_parts = comparison_parts(after, fresh)
  let old_map : Map[String, ComparisonPart] = Map([])
  let new_map : Map[String, ComparisonPart] = Map([])
  for p in old_parts {
    old_map[p.key] = p
  }
  for p in new_parts {
    new_map[p.key] = p
  }
  let changes : Array[SectionChange] = []
  for p in new_parts {
    match old_map.get(p.key) {
      Some(previous) =>
        if previous.text != p.text {
          changes.push({
            id: p.key,
            title: p.title,
            kind: "updated",
            before: Some(previous.evidence),
            after: Some(p.evidence),
            before_text: previous.text,
            after_text: p.text,
          })
        }
      None =>
        changes.push({
          id: p.key,
          title: p.title,
          kind: "added",
          before: None,
          after: Some(p.evidence),
          before_text: "",
          after_text: p.text,
        })
    }
  }
  for p in old_parts {
    if !new_map.contains(p.key) {
      changes.push({
        id: p.key,
        title: p.title,
        kind: "removed",
        before: Some(p.evidence),
        after: None,
        before_text: p.text,
        after_text: "",
      })
    }
  }
  { changes, issues, notes, }
}
