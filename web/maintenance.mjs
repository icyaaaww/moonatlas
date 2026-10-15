// Presentation and user review state only; findings and impacts come from MoonBit.
export const reviewNames = {pending:'待处理',done:'已处理',ignored:'已忽略'};
export const checkNames = {unclassified:'待分类',duplicate:'内容完全相同',link:'引用需核对'};
export function reviewFor(project,check) {
  return (project.reviews || []).find(r=>r.id===check.id) || {id:check.id,state:'pending',note:'',reopened:false};
}
function markdown(value) {
  return String(value).replace(/[\\`*_{}\[\]()#+.!|>~-]/g,'\\$&').replace(/</g,'&lt;').replace(/[\r\n]/g,' ');
}
export function maintenanceReport(project,checks,impacts) {
  const rows = ['# MoonAtlas 知识库整理报告','',`项目：${markdown(project.name)}`,`生成时间：${new Date().toISOString()}`,'',
    '范围：当前导入的 Markdown / TXT。处理状态是人工记录；已处理不代表问题已自动消失。引用关系不证明引用者的内容需要修改。','',
    `当前文档 ${project.documents.length} 篇；比较基线 ${project.baseline.length} 篇。`,'','## 结构体检',''];
  for(const check of checks){
    const r=reviewFor(project,check);
    rows.push(`- ${reviewNames[r.state]} · ${checkNames[check.kind]} · ${check.paths.map(markdown).join('、')}${check.kind==='link'?` · L${check.line} → ${markdown(check.target)} (${check.status})`:''}`);
    if(r.reopened) rows.push('  - 原文已变化，需要重新核对。');
    if(r.note) rows.push(`  - 备注：${markdown(r.note)}`);
  }
  if(!checks.length)rows.push('当前未发现支持范围内的结构问题。');
  rows.push('','## 更新涉及的直接引用','');
  for(const item of impacts) rows.push(`- ${markdown(item.changed_path)} ← ${markdown(item.source_path)} L${item.line} · ${item.snapshot==='before'?'基线快照':'当前快照'}${item.status==='fragment_unchecked'?' · 锚点未验证':''}`);
  if(!impacts.length) rows.push('两个快照中未发现指向变化文档的可解析直接引用；这不保证没有内容上的依赖。');
  rows.push('','不包含原文正文；包含路径、引用目标及人工备注，分享前请核对。','');
  return rows.join('\n');
}
