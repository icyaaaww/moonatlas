///|
pub(all) struct HealthCheck {
  id : String
  kind : String
  paths : Array[String]
  line : Int32
  target : String
  status : String
} derive(Eq, Debug, ToJson, FromJson)

///|
/// Findings are structural clues in the imported dataset, never a quality score.
pub fn health_checks(atlas : Atlas) -> Array[HealthCheck] {
  let checks : Array[HealthCheck] = []
  for p in atlas.pages {
    if p.assignment == "unclassified" {
      checks.push({
        id: Json(["unclassified", p.path]).stringify(),
        kind: "unclassified",
        paths: [p.path],
        line: 1,
        target: "",
        status: "unclassified",
      })
    }
  }
  for d in atlas.duplicates {
    let paths = d.paths.copy()
    paths.sort()
    checks.push({
      id: Json(["duplicate", Json(paths).stringify()]).stringify(),
      kind: "duplicate",
      paths,
      line: 1,
      target: "",
      status: "duplicate",
    })
  }
  let seen : Map[String, Bool] = Map([])
  for l in atlas.links {
    if ["missing", "ambiguous", "outside", "unsupported"].contains(l.status) {
      let id = Json(["link", l.from, l.line.to_string(), l.target, l.status]).stringify()
      if !seen.contains(id) {
        checks.push({
          id,
          kind: "link",
          paths: [l.from],
          line: l.line,
          target: l.target,
          status: l.status,
        })
        seen[id] = true
      }
    }
  }
  checks
}

///|
pub(all) struct Impact {
  changed_path : String
  previous_path : String
  kind : String
  source_path : String
  line : Int32
  snapshot : String
  target : String
  status : String
} derive(Eq, Debug, ToJson, FromJson)

///|
pub(all) struct ImpactReport {
  impacts : Array[Impact]
  issues : Array[Issue]
} derive(Eq, Debug, ToJson, FromJson)

///|
/// Direct incoming references only; both snapshots retain their own evidence.
pub fn update_impacts(
  before : Array[Document],
  after : Array[Document],
) -> ImpactReport {
  let old = build_atlas(before, [], [])
  let fresh = build_atlas(after, [], [])
  let issues = old.issues.copy()
  issues.append(fresh.issues)
  if !issues.is_empty() {
    return { impacts: [], issues, }
  }
  let changes = compare_documents(before, after)
  let impacts : Array[Impact] = []
  for snapshot in ["before", "after"] {
    let links = if snapshot == "before" { old.links } else { fresh.links }
    let targets : Map[String, Change] = Map([])
    for c in changes {
      let path = if snapshot == "before" && c.previous_path != "" {
        c.previous_path
      } else {
        c.path
      }
      targets[path] = c
    }
    let seen : Map[String, Bool] = Map([])
    for l in links {
      if l.status != "linked" && l.status != "fragment_unchecked" {
        continue
      }
      if l.from == l.target {
        continue
      }
      if targets.get(l.target) is Some(c) {
        let id = Json([l.from, l.target, l.line.to_string()]).stringify()
        if !seen.contains(id) {
          impacts.push({
            changed_path: c.path,
            previous_path: c.previous_path,
            kind: c.kind,
            source_path: l.from,
            line: l.line,
            snapshot,
            target: l.target,
            status: l.status,
          })
          seen[id] = true
        }
      }
    }
  }
  { impacts, issues, }
}
