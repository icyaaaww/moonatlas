///|
/// Input content is always literal text; this library performs no I/O.
pub(all) struct Document {
  path : String
  content : String
} derive(Eq, Debug, ToJson, FromJson)

///|
/// Persisted user choices are keyed by document path, independent of line numbers.
pub(all) struct Preference {
  path : String
  topic : String
  title : String
} derive(Eq, Debug, ToJson, FromJson)

///|
/// An explicit concept-name mapping, not a semantic equivalence inferred by AI.
pub(all) struct Alias {
  name : String
  target : String
} derive(Eq, Debug, ToJson, FromJson)

///|
pub(all) struct Evidence {
  path : String
  start_line : Int32
  end_line : Int32
  quote : String
} derive(Eq, Debug, ToJson, FromJson)

///|
pub(all) struct Section {
  id : String
  title : String
  level : Int32
  evidence : Evidence
} derive(Eq, Debug, ToJson, FromJson)

///|
pub(all) struct Page {
  id : String
  path : String
  title : String
  topic : String
  assignment : String
  sections : Array[Section]
  tags : Array[String]
  excerpt : String
} derive(Eq, Debug, ToJson, FromJson)

///|
pub(all) struct Concept {
  id : String
  label : String
  sources : Array[Evidence]
  paths : Array[String]
} derive(Eq, Debug, ToJson, FromJson)

///|
pub(all) struct Link {
  from : String
  target : String
  line : Int32
  status : String
} derive(Eq, Debug, ToJson, FromJson)

///|
pub(all) struct Issue {
  code : String
  path : String
  message : String
} derive(Eq, Debug, ToJson, FromJson)

///|
pub(all) struct Duplicate {
  paths : Array[String]
} derive(Eq, Debug, ToJson, FromJson)

///|
pub(all) struct Atlas {
  schema : Int32
  pages : Array[Page]
  concepts : Array[Concept]
  links : Array[Link]
  duplicates : Array[Duplicate]
  issues : Array[Issue]
} derive(Eq, Debug, ToJson, FromJson)

///|
pub(all) struct Change {
  kind : String
  path : String
  previous_path : String
  detail : String
} derive(Eq, Debug, ToJson, FromJson)

///|
fn problem(code : String, path : String, message : String) -> Issue {
  { code, path, message, }
}

///|
pub fn normalize_name(name : String) -> String {
  let parts : Array[String] = []
  let mut current = ""
  for ch in name.trim().to_owned().to_array() {
    if ch == ' ' || ch == '\t' || ch == '\n' || ch == '\r' {
      if current != "" {
        parts.push(current)
        current = ""
      }
    } else {
      current += ch.to_string()
    }
  }
  if current != "" {
    parts.push(current)
  }
  parts.join(" ").to_lower()
}

///|
pub fn validate_documents(documents : Array[Document]) -> Array[Issue] {
  let issues = []
  if documents.length() > 200 {
    return [problem("limit", "", "最多导入 200 篇文档")]
  }
  let seen : Map[String, Bool] = Map([])
  let mut total = 0
  for doc in documents {
    let pieces = doc.path.split("/").to_array()
    let lower = doc.path.to_lower()
    if doc.path == "" ||
      doc.path.length() > 500 ||
      doc.path.contains("\\") ||
      doc.path.contains(":") ||
      pieces.any(p => p == "" || p == "." || p == "..") ||
      (!lower.has_suffix(".md") && !lower.has_suffix(".txt")) {
      issues.push(
        problem(
          "path",
          doc.path,
          "需要 .md/.txt 的相对路径，不能包含空路径、冒号或 ..",
        ),
      )
    }
    if seen.contains(doc.path) {
      issues.push(problem("duplicate_path", doc.path, "文档路径重复"))
    }
    seen[doc.path] = true
    if doc.content.length() > 200000 {
      issues.push(
        problem(
          "limit",
          doc.path,
          "单篇文档超过 200,000 个 UTF-16 码元",
        ),
      )
    }
    if doc.content.contains("\u{0000}") {
      issues.push(problem("binary", doc.path, "不接受含 NUL 的文本"))
    }
    total += doc.content.length()
  }
  if total > 2000000 {
    issues.push(
      problem("limit", "", "总文本超过 2,000,000 个 UTF-16 码元"),
    )
  }
  issues
}
