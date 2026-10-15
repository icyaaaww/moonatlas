///|
fn xml_text(value : String) -> String {
  let safe = String::from_array(
    value.to_array().filter(c => c >= ' ' || c == '\n' || c == '\t'),
  )
  safe
  .replace_all(old="&", new="&amp;")
  .replace_all(old="<", new="&lt;")
  .replace_all(old=">", new="&gt;")
  .replace_all(old="\"", new="&quot;")
  .replace_all(old="'", new="&apos;")
}

///|
fn svg_rect(x : Int32, y : Int32, width : Int32, fill : String) -> String {
  "<rect x=\"" +
  x.to_string() +
  "\" y=\"" +
  (y - 24).to_string() +
  "\" width=\"" +
  width.to_string() +
  "\" height=\"48\" rx=\"8\" fill=\"" +
  fill +
  "\" stroke=\"#cbd9c9\"/>"
}

///|
fn svg_text(
  x : Int32,
  y : Int32,
  label : String,
  color : String,
  size : Int32,
) -> String {
  "<text x=\"" +
  x.to_string() +
  "\" y=\"" +
  y.to_string() +
  "\" fill=\"" +
  color +
  "\" font-size=\"" +
  size.to_string() +
  "\">" +
  xml_text(label) +
  "</text>"
}

///|
fn svg_edge(x1 : Int32, y1 : Int32, x2 : Int32, y2 : Int32) -> String {
  let middle = (x1 + x2) / 2
  "<path d=\"M " +
  x1.to_string() +
  " " +
  y1.to_string() +
  " C " +
  middle.to_string() +
  " " +
  y1.to_string() +
  ", " +
  middle.to_string() +
  " " +
  y2.to_string() +
  ", " +
  x2.to_string() +
  " " +
  y2.to_string() +
  "\" fill=\"none\" stroke=\"#94b099\" stroke-width=\"1.5\"/>"
}

///|
/// Deterministic topic/document overview. Detailed headings remain in HTML/Markdown exports.
pub fn export_svg(atlas : Atlas, title : String) -> String {
  let topics : Map[String, Array[Page]] = Map([])
  for page in atlas.pages {
    if !topics.contains(page.topic) {
      topics[page.topic] = []
    }
    topics[page.topic].push(page)
  }
  let names = topics.keys().to_array()
  names.sort()
  let height = 160 + atlas.pages.length() * 68 + names.length() * 24
  let root_y = height / 2 + 25
  let parts = [
    "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"1040\" height=\"" +
    height.to_string() +
    "\" viewBox=\"0 0 1040 " +
    height.to_string() +
    "\" role=\"img\"><title>" +
    xml_text(title) +
    "</title><rect width=\"100%\" height=\"100%\" fill=\"#f7f8f3\"/><g font-family=\"Segoe UI, Microsoft YaHei, sans-serif\">",
  ]
  parts.push(svg_text(32, 40, "MOONATLAS / 月图知识总览", "#276653", 18))
  parts.push(
    svg_text(
      32,
      65,
      "主题 → 文档 · " +
      atlas.pages.length().to_string() +
      " 篇 · 完整标题与原文见交互 HTML",
      "#77847e",
      12,
    ),
  )
  let mut y = 120
  for topic in names {
    let pages = topics[topic]
    let center = y + (pages.length() - 1) * 34
    parts.push(svg_edge(252, root_y, 332, center))
    for p in pages {
      parts.push(svg_edge(542, center, 622, y))
      parts.push(
        "<g><title>" + xml_text(p.title + " — " + p.path) + "</title>",
      )
      parts.push(svg_rect(622, y, 380, "#ffffff"))
      parts.push(svg_text(638, y - 3, clip_text(p.title, 23), "#203e37", 14))
      parts.push(svg_text(638, y + 15, clip_text(p.path, 38), "#77847e", 10))
      parts.push("</g>")
      y += 68
    }
    parts.push("<g><title>" + xml_text(topic) + "</title>")
    parts.push(svg_rect(332, center, 210, "#eaf1e5"))
    parts.push(svg_text(347, center + 5, clip_text(topic, 12), "#276653", 14))
    parts.push("</g>")
    y += 24
  }
  parts.push(svg_rect(32, root_y, 220, "#276653"))
  parts.push(svg_text(48, root_y + 5, clip_text(title, 12), "#ffffff", 15))
  parts.push("</g></svg>")
  parts.join("\n")
}
