///|
pub(all) struct LineEdit {
  before_start : Int32
  before_count : Int32
  after_start : Int32
  after_count : Int32
} derive(Eq, Debug, ToJson, FromJson)

///|
pub(all) struct LineDiff {
  edits : Array[LineEdit]
  precise : Bool
} derive(Eq, Debug, ToJson, FromJson)

///|
/// Exact line equality; large changed regions use one explicit bounded fallback.
pub fn diff_lines(before : String, after : String) -> LineDiff {
  if before == after {
    return { edits: [], precise: true, }
  }
  let a = if before == "" {
    []
  } else {
    before.split("\n").map(s => s.to_owned()).to_array()
  }
  let b = if after == "" {
    []
  } else {
    after.split("\n").map(s => s.to_owned()).to_array()
  }
  let mut prefix = 0
  while prefix < a.length() && prefix < b.length() && a[prefix] == b[prefix] {
    prefix += 1
  }
  let mut suffix = 0
  while suffix < a.length() - prefix &&
        suffix < b.length() - prefix &&
        a[a.length() - 1 - suffix] == b[b.length() - 1 - suffix] {
    suffix += 1
  }
  let n = a.length() - prefix - suffix
  let m = b.length() - prefix - suffix
  if n == 0 || m == 0 || n > 4000 || m > 4000 || n * m > 250000 {
    return {
      edits: [
        {
          before_start: prefix + 1,
          before_count: n,
          after_start: prefix + 1,
          after_count: m,
        },
      ],
      precise: n == 0 || m == 0,
    }
  }
  let width = m + 1
  let dp = Array::make((n + 1) * width, 0)
  for i = n - 1; i >= 0; i = i - 1 {
    for j = m - 1; j >= 0; j = j - 1 {
      dp[i * width + j] = if a[prefix + i] == b[prefix + j] {
        dp[(i + 1) * width + j + 1] + 1
      } else {
        Int32::max(dp[(i + 1) * width + j], dp[i * width + j + 1])
      }
    }
  }
  let edits : Array[LineEdit] = []
  let mut i = 0
  let mut j = 0
  while i < n || j < m {
    if i < n && j < m && a[prefix + i] == b[prefix + j] {
      i += 1
      j += 1
      continue
    }
    let start_i = i
    let start_j = j
    while i < n || j < m {
      if i < n && j < m && a[prefix + i] == b[prefix + j] {
        break
      }
      if i < n && (j == m || dp[(i + 1) * width + j] >= dp[i * width + j + 1]) {
        i += 1
      } else {
        j += 1
      }
    }
    edits.push({
      before_start: prefix + start_i + 1,
      before_count: i - start_i,
      after_start: prefix + start_j + 1,
      after_count: j - start_j,
    })
  }
  { edits, precise: true, }
}
