///|
fn resolve_target(
  from : String,
  raw : String,
  wiki : Bool,
  paths : Map[String, Bool],
) -> (String, String) {
  let value = raw.trim().to_owned()
  if value.contains(":") || value.has_prefix("//") {
    return (value, "external")
  }
  if value.has_prefix("/") || value.contains("\\") || value.contains("?") {
    return (value, "unsupported")
  }
  let bare = value.split("#").to_array()[0]
    .to_owned()
    .replace_all(old="%20", new=" ")
  if bare.contains("%") {
    return (value, "unsupported")
  }
  if bare == "" {
    return (from, "fragment_unchecked")
  }
  let folders = from.split("/").to_array()
  let resolved : Array[String] = folders[:folders.length() - 1].map(s => {
    s.to_owned()
  })
  for part in bare.split("/") {
    if part == "." || part == "" {
      continue
    }
    if part == ".." {
      if resolved.is_empty() {
        return (value, "outside")
      }
      ignore(resolved.pop())
    } else {
      resolved.push(part.to_owned())
    }
  }
  let joined = resolved.join("/")
  let candidates = [joined]
  if wiki &&
    !joined.to_lower().has_suffix(".md") &&
    !joined.to_lower().has_suffix(".txt") {
    candidates.push(joined + ".md")
  }
  let found = candidates.iter().find_first(p => paths.contains(p))
  if found is Some(target) {
    return (
      target,
      if value.contains("#") {
        "fragment_unchecked"
      } else {
        "linked"
      },
    )
  }
  if wiki {
    let names = paths
      .keys()
      .filter(p => {
        (!bare.contains("/") && basename(p) == basename(bare)) ||
        p == bare ||
        p == bare + ".md"
      })
      .to_array()
    if names.length() == 1 {
      return (
        names[0],
        if value.contains("#") {
          "fragment_unchecked"
        } else {
          "linked"
        },
      )
    }
    if names.length() > 1 {
      return (value, "ambiguous")
    }
  }
  if !wiki &&
    !bare.to_lower().has_suffix(".md") &&
    !bare.to_lower().has_suffix(".txt") {
    return (value, "attachment_unchecked")
  }
  (joined, "missing")
}

///|
/// A bounded link scanner for ordinary inline and wiki links. Not CommonMark.
fn document_links(doc : Document, paths : Map[String, Bool]) -> Array[Link] {
  if !doc.path.to_lower().has_suffix(".md") {
    return []
  }
  let links = []
  let lines = doc.content.split("\n").to_array()
  let mut fence : Char = ' '
  let mut fence_size = 0
  let mut front_end = -1
  if lines[0].trim() == "---" {
    for i = 1; i < lines.length() && i < 100; i = i + 1 {
      if lines[i].trim() == "---" {
        front_end = i
        break
      }
    }
  }
  for i, source in lines {
    let line = source.trim().to_owned()
    if i <= front_end {
      continue
    }
    if source.has_prefix("    ") || source.has_prefix("\t") {
      continue
    }
    let chars = line.to_array()
    if chars.length() >= 3 && (chars[0] == '`' || chars[0] == '~') {
      let mut n = 0
      while n < chars.length() && chars[n] == chars[0] {
        n += 1
      }
      if fence_size == 0 && n >= 3 {
        fence = chars[0]
        fence_size = n
        continue
      }
      if chars[0] == fence &&
        n >= fence_size &&
        String::from_array(chars[n:]).trim() == "" {
        fence_size = 0
        continue
      }
    }
    if fence_size > 0 {
      continue
    }
    // Inline code is omitted, including unmatched code spans for conservatism.
    let mut code = 0
    let mut text = ""
    let mut cursor = 0
    while cursor < chars.length() {
      if chars[cursor] == '`' {
        let mut count = 0
        while cursor < chars.length() && chars[cursor] == '`' {
          count += 1
          cursor += 1
        }
        if code == 0 {
          code = count
        } else if code == count {
          code = 0
        }
      } else {
        if code == 0 {
          text += chars[cursor].to_string()
        }
        cursor += 1
      }
    }
    let wiki_parts = text.split("[[").to_array()
    for j = 1; j < wiki_parts.length(); j = j + 1 {
      if wiki_parts[j].split_once("]]") is Some((inside, _)) {
        let raw = inside.split("|").to_array()[0].to_owned()
        let (target, status) = resolve_target(doc.path, raw, true, paths)
        links.push({ from: doc.path, target, line: i + 1, status, })
        if links.length() > 5000 {
          return links
        }
      }
    }
    let parts = text.split("](").to_array()
    for j = 1; j < parts.length(); j = j + 1 {
      if !parts[j - 1].contains("[") {
        continue
      }
      if parts[j].split_once(")") is Some((inside, _)) {
        let raw = inside.to_owned()
        if raw.contains("(") || raw.contains("\"") || raw.contains("\t") {
          continue
        }
        let (target, status) = resolve_target(doc.path, raw, false, paths)
        links.push({ from: doc.path, target, line: i + 1, status, })
        if links.length() > 5000 {
          return links
        }
      }
    }
  }
  links
}
