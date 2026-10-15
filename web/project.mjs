import { dispatch } from './core.mjs';

export function core(action, values) {
  const response = JSON.parse(dispatch(JSON.stringify({ action, ...values })));
  if (!response.ok) throw new Error(response.message || '核心请求失败');
  return response.value;
}
export function emptyProject() {
  return { format: 'moonatlas', version: 1, name: '我的知识地图', documents: [], preferences: [], aliases: [], baseline: [], reviews: [] };
}
export function build(project) {
  const atlas = core('build', project);
  if (atlas.issues.length) throw new Error(atlas.issues.map(x => `${x.path}: ${x.message}`).join('\n'));
  return atlas;
}
export function replaceDocuments(project, documents) {
  const preferences = core('reconcile', { before: project.documents, after: documents, preferences: project.preferences });
  const next = { ...project, documents, preferences };
  build(next);
  const checks = core('health', next);
  const changed = new Set(core('compare', {before:project.documents, after:documents}).flatMap(c=>[c.path,c.previous_path]));
  const byId = new Map(checks.map(c=>[c.id,c]));
  return {...next,reviews:(project.reviews || []).filter(r=>byId.has(r.id)).map(r=>byId.get(r.id).paths.some(p=>changed.has(p)) ? {...r,state:'pending',reopened:true} : r)};
}
export function validateReviews(reviews = []) {
  if (!Array.isArray(reviews) || reviews.length > 2000 || JSON.stringify(reviews).length > 1000000) throw new Error('体检记录超过上限：最多 2,000 条、1,000,000 个文本码元');
  const ids = new Set();
  return reviews.map(r=>{
    if (!r || typeof r.id !== 'string' || !r.id.length || r.id.length > 110000 || ids.has(r.id) ||
        !['pending','done','ignored'].includes(r.state) || typeof r.note !== 'string' || r.note.length > 1000 ||
        typeof r.reopened !== 'boolean' || (r.state === 'ignored' && !r.note.trim())) throw new Error('体检记录格式错误，忽略项必须填写原因');
    ids.add(r.id);
    return {id:r.id,state:r.state,note:r.note,reopened:r.reopened};
  });
}
export function parseProject(text) {
  if (text.length > 30000000) throw new Error('项目文件过大，最多 30 MB 文本');
  const p = JSON.parse(text);
  if (!p || p.format !== 'moonatlas' || p.version !== 1 || typeof p.name !== 'string' || p.name.length > 120 ||
      !Array.isArray(p.documents) || !Array.isArray(p.preferences) || !Array.isArray(p.aliases) || !Array.isArray(p.baseline)) {
    throw new Error('这不是受支持的 MoonAtlas v1 项目');
  }
  const next = { format: 'moonatlas', version: 1, name: p.name, documents: p.documents, preferences: p.preferences, aliases: p.aliases, baseline: p.baseline, reviews:validateReviews(p.reviews) };
  build(next);
  build({ ...emptyProject(), documents: next.baseline });
  return next;
}
export function projectJSON(project) { return JSON.stringify(project, null, 2); }
export function shareHTML(template, project) {
  const escaped = JSON.stringify(project).replace(/[<>&\u2028\u2029]/g, ch => `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`);
  if (!template.includes('id="moonatlas-seed"')) throw new Error('无法找到离线模板，请先构建应用');
  return '<!DOCTYPE html>\n' + template.replace(/^<!DOCTYPE html>\s*/i, '').replace(/(<script id="moonatlas-seed" type="application\/json">)[\s\S]*?(<\/script>)/, (_, open, close) => open + escaped + close);
}

export async function readDocuments(files) {
  const selected = Array.from(files);
  const accepted = selected.filter(f => /\.(md|txt)$/i.test(f.name));
  if (!accepted.length) throw new Error('请选择 UTF-8 编码的 .md 或 .txt 文档');
  if (accepted.length > 200) throw new Error('一次最多导入 200 篇文档');
  if (accepted.some(f => f.size > 800000) || accepted.reduce((n,f) => n + f.size, 0) > 8000000) throw new Error('文件过大，请拆分资料集后导入');
  const paths = new Set();
  const docs = [];
  for (const file of accepted) {
    // A selected folder is the knowledge-base root, not part of document identity.
    const path = file.webkitRelativePath ? file.webkitRelativePath.split('/').slice(1).join('/') : file.name;
    if (paths.has(path)) throw new Error(`导入文件重名：${path}。请使用“导入文件夹”保留目录结构`);
    paths.add(path);
    let content;
    try { content = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()); }
    catch { throw new Error(`${path} 不是有效 UTF-8 文本，请先转换编码`); }
    docs.push({ path, content });
  }
  build({ ...emptyProject(), documents: docs });
  return { documents: docs, skipped: selected.length - accepted.length };
}
