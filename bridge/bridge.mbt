///|
/// Transport only: graph, comparisons and exports are implemented in the library.
pub fn dispatch(input : String) -> String {
  if input.length() > 30000000 {
    return "{\"ok\":false,\"message\":\"请求过大\"}"
  }
  try {
    let request = @json.parse(input)
    let value : Json = match request {
      {
        "action": "build",
        "documents": docs,
        "preferences": prefs,
        "aliases": aliases,
        ..
      } =>
        @atlas.build_atlas(
          @json.from_json(docs),
          @json.from_json(prefs),
          @json.from_json(aliases),
        ).to_json()
      {
        "action": "health",
        "documents": docs,
        "preferences": prefs,
        "aliases": aliases,
        ..
      } => {
        let atlas = @atlas.build_atlas(
          @json.from_json(docs),
          @json.from_json(prefs),
          @json.from_json(aliases),
        )
        if !atlas.issues.is_empty() {
          return ({ "ok": false, "message": "资料集未通过校验" } : Json).stringify()
        }
        Json(@atlas.health_checks(atlas))
      }
      { "action": "impacts", "before": before, "after": after, .. } =>
        @atlas.update_impacts(@json.from_json(before), @json.from_json(after)).to_json()
      {
        "action": "lines",
        "before": String(before),
        "after": String(after),
        ..
      } => {
        if before.length() > 200000 || after.length() > 200000 {
          return ({ "ok": false, "message": "章节文本超过上限" } : Json).stringify()
        }
        @atlas.diff_lines(before, after).to_json()
      }
      {
        "action": "search",
        "documents": docs,
        "preferences": prefs,
        "query": String(query),
        ..
      } =>
        @atlas.search_documents(
          @json.from_json(docs),
          @json.from_json(prefs),
          query,
        ).to_json()
      {
        "action": "classify",
        "documents": docs,
        "preferences": prefs,
        "paths": paths,
        "topic": String(topic),
        ..
      } =>
        @atlas.classify_documents(
          @json.from_json(docs),
          @json.from_json(prefs),
          @json.from_json(paths),
          topic,
        ).to_json()
      { "action": "sections", "before": before, "after": after, .. } =>
        @atlas.compare_sections(@json.from_json(before), @json.from_json(after)).to_json()
      { "action": "compare", "before": before, "after": after, .. } =>
        Json(
          @atlas.compare_documents(
            @json.from_json(before),
            @json.from_json(after),
          ),
        )
      {
        "action": "reconcile",
        "before": before,
        "after": after,
        "preferences": prefs,
        ..
      } =>
        Json(
          @atlas.reconcile_preferences(
            @json.from_json(before),
            @json.from_json(after),
            @json.from_json(prefs),
          ),
        )
      {
        "action": "index",
        "documents": docs,
        "preferences": prefs,
        "aliases": aliases,
        ..
      } => {
        let atlas = @atlas.build_atlas(
          @json.from_json(docs),
          @json.from_json(prefs),
          @json.from_json(aliases),
        )
        if !atlas.issues.is_empty() {
          return ({ "ok": false, "message": "资料集未通过校验" } : Json).stringify()
        }
        Json(@atlas.export_index(atlas))
      }
      {
        "action": "svg",
        "documents": docs,
        "preferences": prefs,
        "aliases": aliases,
        "name": String(name),
        ..
      } => {
        let atlas = @atlas.build_atlas(
          @json.from_json(docs),
          @json.from_json(prefs),
          @json.from_json(aliases),
        )
        if !atlas.issues.is_empty() {
          return ({ "ok": false, "message": "资料集未通过校验" } : Json).stringify()
        }
        Json(@atlas.export_svg(atlas, name))
      }
      _ =>
        return (
          {
            "ok": false,
            "message": "请求字段缺失或 action 不受支持",
          } : Json).stringify()
    }
    ({ "ok": true, "value": value } : Json).stringify()
  } catch {
    _ =>
      (
        { "ok": false, "message": "JSON 结构或字段类型不符合协议" } :
        Json).stringify()
  }
}
