///|
pub(all) struct SearchHit {
  path : String
  line : Int32
  snippet : String
  kind : String
} derive(Eq, Debug, ToJson, FromJson)

///|
pub(all) struct SearchResult {
  hits : Array[SearchHit]
  total : Int32
  issues : Array[Issue]
} derive(Eq, Debug, ToJson, FromJson)

///|
fn search_excerpt(line : String, needle : String) -> String {
  let offset = line.to_lower().find(needle).unwrap_or(0)
  let chars = line.to_array()
  let mut position = 0
  let mut index = 0
  while index < chars.length() && position < offset {
    position += chars[index].to_string().to_lower().length()
    index += 1
  }
  let start = Int32::max(0, index - 50)
  let end = Int32::min(chars.length(), start + 240)
  (if start > 0 { "…" } else { "" }) +
  chars[start:end].to_owned().map(c => c.to_string()).join("") +
  (if end < chars.length() { "…" } else { "" })
}

///|
/// Case-insensitive literal search; line zero denotes metadata rather than body evidence.
pub fn search_documents(
  documents : Array[Document],
  preferences : Array[Preference],
  query : String,
) -> SearchResult {
  let atlas = build_atlas(documents, preferences, [])
  if !atlas.issues.is_empty() {
    return { hits: [], total: 0, issues: atlas.issues, }
  }
  let needle = query.trim().to_owned().to_lower()
  if needle.length() > 200 {
    return {
      hits: [],
      total: 0,
      issues: [problem("query", "", "搜索词最多 200 个文本码元")],
    }
  }
  if needle == "" {
    return { hits: [], total: 0, issues: [], }
  }
  let source : Map[String, String] = Map([])
  for d in documents {
    source[d.path] = d.content
  }
  let hits : Array[SearchHit] = []
  let mut total = 0
  for page in atlas.pages {
    if [page.path, page.title, page.topic, page.tags.join(" ")]
      .join("\n")
      .to_lower()
      .contains(needle) {
      total += 1
      if hits.length() < 200 {
        hits.push({
          path: page.path,
          line: 0,
          snippet: search_excerpt(
            page.title +
            " · " +
            page.topic +
            " · " +
            page.path +
            " · " +
            page.tags.join(" "),
            needle,
          ),
          kind: "metadata",
        })
      }
    }
    let lines = source[page.path].split("\n").to_array()
    for i = 0; i < lines.length(); i = i + 1 {
      let text = lines[i].to_owned()
      if text.to_lower().contains(needle) {
        total += 1
        if hits.length() < 200 {
          hits.push({
            path: page.path,
            line: i + 1,
            snippet: search_excerpt(text, needle),
            kind: "body",
          })
        }
      }
    }
  }
  { hits, total, issues: [], }
}

///|
pub(all) struct BatchClassification {
  preferences : Array[Preference]
  issues : Array[Issue]
} derive(Eq, Debug, ToJson, FromJson)

///|
/// One atomic classification result; preserve titles and reject stale selections.
pub fn classify_documents(
  documents : Array[Document],
  preferences : Array[Preference],
  paths : Array[String],
  topic : String,
) -> BatchClassification {
  let issues = validate_documents(documents)
  issues.append(validate_choices(preferences, []))
  if paths.is_empty() ||
    paths.length() > 200 ||
    topic.trim() == "" ||
    topic.length() > 120 {
    issues.push(
      problem(
        "batch", "", "请选择 1–200 篇文档，并填写不超过 120 个文本码元的主题",
      ),
    )
  }
  let selected : Map[String, Bool] = Map([])
  for path in paths {
    if selected.contains(path) || !documents.any(d => d.path == path) {
      issues.push(problem("batch", path, "重复或已不存在的文档"))
    }
    selected[path] = true
  }
  if !issues.is_empty() {
    return { preferences, issues, }
  }
  let result = preferences.filter(p => !selected.contains(p.path))
  for path in paths {
    let title = preferences
      .iter()
      .find_first(p => p.path == path)
      .map(p => p.title)
      .unwrap_or("")
    result.push({ path, title, topic: topic.trim().to_owned(), })
  }
  let errors = validate_choices(result, [])
  {
    preferences: if errors.is_empty() {
      result
    } else {
      preferences
    },
    issues: errors,
  }
}
