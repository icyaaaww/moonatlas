///|
fn alias_label(name : String, aliases : Map[String, String]) -> String {
  let mut label = name
  for _i = 0; _i <= aliases.length(); _i = _i + 1 {
    let found = aliases.get(normalize_name(label))
    match found {
      None => break
      Some(target) => {
        if normalize_name(target) == normalize_name(label) {
          label = target
          break
        }
        label = target
      }
    }
  }
  label
}

///|
fn validate_choices(
  preferences : Array[Preference],
  aliases : Array[Alias],
) -> Array[Issue] {
  let issues = []
  if preferences.length() > 200 || aliases.length() > 200 {
    return [problem("limit", "", "分类或概念规则最多 200 条")]
  }
  let seen : Map[String, Bool] = Map([])
  for pref in preferences {
    if seen.contains(pref.path) {
      issues.push(
        problem("preference", pref.path, "同一文档有重复的分类规则"),
      )
    }
    seen[pref.path] = true
    if pref.title.length() > 200 || pref.topic.length() > 120 {
      issues.push(problem("preference", pref.path, "标题或分类过长"))
    }
  }
  let mapping : Map[String, String] = Map([])
  for a in aliases {
    let name = normalize_name(a.name)
    let target = normalize_name(a.target)
    if name == "" ||
      target == "" ||
      name.length() > 200 ||
      target.length() > 200 ||
      mapping.contains(name) {
      issues.push(
        problem("alias", a.name, "概念规则名称为空、过长或重复"),
      )
    }
    mapping[name] = target
  }
  for start in mapping.keys() {
    let visited : Map[String, Bool] = Map([])
    let mut current = start
    while mapping.contains(current) {
      let next = mapping[current]
      if next == current {
        break
      }
      if visited.contains(current) {
        issues.push(
          problem("alias_cycle", start, "概念归并规则存在循环"),
        )
        break
      }
      visited[current] = true
      current = next
    }
  }
  issues
}

///|
/// Construct a source-backed graph. Repeated headings indicate lexical evidence,
/// not a claim that the sources express semantically equivalent concepts.
pub fn build_atlas(
  documents : Array[Document],
  preferences : Array[Preference],
  aliases : Array[Alias],
) -> Atlas {
  let issues = validate_documents(documents)
  issues.append(validate_choices(preferences, aliases))
  let empty : Atlas = {
    schema: 1,
    pages: [],
    concepts: [],
    links: [],
    duplicates: [],
    issues,
  }
  if !issues.is_empty() {
    return empty
  }
  let docs = documents.copy()
  docs.sort_by((a, b) => a.path.compare(b.path))
  let pages = docs.map(d => parse_document(d, preferences))
  let mut section_count = 0
  for p in pages {
    section_count += p.sections.length()
  }
  if section_count > 3000 {
    issues.push(
      problem("limit", "", "标题总数超过 3,000，请拆分资料集"),
    )
    return empty
  }
  let alias_map : Map[String, String] = Map([])
  for a in aliases {
    alias_map[normalize_name(a.name)] = a.target
  }
  let labels : Map[String, String] = Map([])
  for a in aliases {
    labels[normalize_name(a.name)] = alias_label(a.name, alias_map)
  }
  let grouped : Map[String, Concept] = Map([])
  for p in pages {
    for section in p.sections {
      let label = labels
        .get(normalize_name(section.title))
        .unwrap_or(section.title)
      let id = "concept:" + normalize_name(label)
      if !grouped.contains(id) {
        grouped[id] = { id, label, sources: [], paths: [], }
      }
      let c = grouped[id]
      c.sources.push(section.evidence)
      if !c.paths.contains(p.path) {
        c.paths.push(p.path)
      }
    }
  }
  let concepts = grouped.values().to_array()
  concepts.sort_by((a, b) => {
    if a.paths.length() != b.paths.length() {
      b.paths.length() - a.paths.length()
    } else {
      a.id.compare(b.id)
    }
  })
  let paths : Map[String, Bool] = Map([])
  for doc in docs {
    paths[doc.path] = true
  }
  let links : Array[Link] = []
  for doc in docs {
    links.append(document_links(doc, paths))
    if links.length() > 5000 {
      issues.push(
        problem("limit", "", "引用总数超过 5,000，请拆分资料集"),
      )
      return empty
    }
  }
  let contents : Map[String, Array[String]] = Map([])
  for doc in docs {
    if doc.content.trim() == "" {
      continue
    }
    if !contents.contains(doc.content) {
      contents[doc.content] = []
    }
    contents[doc.content].push(doc.path)
  }
  let duplicates : Array[Duplicate] = []
  for matches in contents.values() {
    if matches.length() > 1 {
      duplicates.push({ paths: matches, })
    }
  }
  duplicates.sort_by((a, b) => a.paths[0].compare(b.paths[0]))
  { schema: 1, pages, concepts, links, duplicates, issues, }
}
