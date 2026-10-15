///|
fn basename(path : String) -> String {
  let parts = path.split("/").to_array()
  let name = parts[parts.length() - 1].to_owned()
  if name.to_lower().has_suffix(".md") {
    name[:name.length() - 3].to_owned()
  } else if name.to_lower().has_suffix(".txt") {
    name[:name.length() - 4].to_owned()
  } else {
    name
  }
}

///|
fn heading(line : String) -> (Int32, String)? {
  if line.has_prefix("    ") || line.has_prefix("\t") {
    return None
  }
  let chars = line.trim().to_owned().to_array()
  let mut count = 0
  while count < chars.length() && chars[count] == '#' {
    count += 1
  }
  if count == 0 ||
    count > 6 ||
    count >= chars.length() ||
    (chars[count] != ' ' && chars[count] != '\t') {
    return None
  }
  let title = String::from_array(chars[count:]).trim().to_owned()
  if title == "" {
    None
  } else {
    Some((count, title))
  }
}

///|
/// Supported metadata is deliberately limited to topic: and tags: [a, b].
pub fn parse_document(doc : Document, preferences : Array[Preference]) -> Page {
  let lines = doc.content
    .split("\n")
    .map(s => s.trim_end(chars="\r").to_owned())
    .to_array()
  let mut front_end = -1
  if doc.path.to_lower().has_suffix(".md") && lines[0].trim() == "---" {
    for i = 1; i < lines.length() && i < 100; i = i + 1 {
      if lines[i].trim() == "---" {
        front_end = i
        break
      }
    }
  }
  let mut topic = "未分类"
  let mut assignment = "unclassified"
  let folders = doc.path.split("/").to_array()
  if folders.length() > 1 {
    topic = folders[0].to_owned()
    assignment = "folder"
  }
  let tags : Array[String] = []
  if front_end >= 0 {
    for i = 1; i < front_end; i = i + 1 {
      let line = lines[i].trim().to_owned()
      if line.has_prefix("topic:") {
        let value = line[6:].trim().to_owned()
        if value != "" {
          topic = value
          assignment = "metadata"
        }
      }
      if line.has_prefix("tags:") {
        let value = line[5:].trim().to_owned()
        if value.has_prefix("[") && value.has_suffix("]") {
          for item in value[1:value.length() - 1].split(",") {
            let tag = item.trim().to_owned()
            if tag != "" && !tags.contains(tag) {
              tags.push(tag)
            }
          }
        }
      }
    }
  }
  let mut title = basename(doc.path)
  let mut title_found = false
  let marks : Array[(Int32, Int32, String)] = []
  let mut fence_char : Char = ' '
  let mut fence_length = 0
  for i, line in lines {
    if i <= front_end {
      continue
    }
    let trimmed = line.trim_start().to_owned()
    let chars = trimmed.to_array()
    if chars.length() >= 3 && (chars[0] == '`' || chars[0] == '~') {
      let mut n = 0
      while n < chars.length() && chars[n] == chars[0] {
        n += 1
      }
      if fence_length == 0 && n >= 3 {
        fence_char = chars[0]
        fence_length = n
        continue
      }
      if chars[0] == fence_char &&
        n >= fence_length &&
        String::from_array(chars[n:]).trim() == "" {
        fence_length = 0
        continue
      }
    }
    if fence_length > 0 {
      continue
    }
    // TXT is literal text: hashes do not become Markdown headings.
    if doc.path.to_lower().has_suffix(".md") {
      if heading(line) is Some((level, text)) {
        marks.push((i, level, text))
        if level == 1 && !title_found {
          title = text
          title_found = true
        }
      }
    }
  }
  let occurrences : Map[String, Int32] = Map([])
  let sections : Array[Section] = []
  for i, mark in marks {
    let (start, level, text) = mark
    let end = if i + 1 < marks.length() {
      marks[i + 1].0
    } else {
      lines.length()
    }
    let normalized = normalize_name(text)
    let occurrence = occurrences.get(normalized).unwrap_or(0)
    occurrences[normalized] = occurrence + 1
    let chunk = lines[start:end].to_owned().join("\n")
    sections.push({
      id: "section:" +
      Json([doc.path, normalized, occurrence.to_string()]).stringify(),
      title: text,
      level,
      evidence: {
        path: doc.path,
        start_line: start + 1,
        end_line: end,
        quote: clip_text(chunk, 1200),
      },
    })
  }
  for pref in preferences {
    if pref.path == doc.path {
      if pref.topic.trim() != "" {
        topic = pref.topic.trim().to_owned()
        assignment = "user"
      }
      if pref.title.trim() != "" {
        title = pref.title.trim().to_owned()
      }
    }
  }
  let body = lines[front_end + 1:].to_owned().join("\n").trim().to_owned()
  {
    id: "doc:" + doc.path,
    path: doc.path,
    title,
    topic,
    assignment,
    sections,
    tags,
    excerpt: clip_text(body, 220),
  }
}

///|
fn clip_text(text : String, limit : Int32) -> String {
  let chars = text.to_array()
  if chars.length() <= limit {
    text
  } else {
    String::from_array(chars[:limit])
  }
}
