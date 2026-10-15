import { core, build, emptyProject, replaceDocuments, parseProject, projectJSON, shareHTML, readDocuments } from './project.mjs';
import { sampleDocuments } from './samples.mjs';
import { ProjectHistory } from './history.mjs';
import { LocalDraft, DraftWriter } from './local-draft.mjs';
import { mapControls, mountMap } from './map-view.mjs';

const $ = id => document.getElementById(id);
const template = document.documentElement.outerHTML;
const needsOfflineTemplate = Boolean(document.querySelector('script[src="app.mjs"]'));
let project = emptyProject(), atlas, view = 'map', query = '', selection = null, demo = false, dirty = false, sourcePage = 0;
const expanded = new Set();
const history = new ProjectHistory();
const mapState = {zoom:1,fit:false,focus:null,collapsed:new Set(),links:true,scrollLeft:0,scrollTop:0};
const store = new LocalDraft(globalThis.indexedDB,location.pathname);
let draftStatus='off', draftRecord=null, diffSelection=null, updateCache=[], sectionCache=new Map(), mutation=0;
const writer = new DraftWriter(store,(status,value)=>{
  draftStatus=status;
  if(status==='saved')draftRecord=value;
  if(status==='error')fail(value);
  renderSession();
});
const titles = {
  map: ['看见知识的全貌', '把散落的资料串起来。每一条线索，都可以回到原文。', '全局地图', '目录 → 文档 → 标题'],
  concepts: ['发现资料之间的联系', '同名标题是线索，是否属于同一概念，由你确认。', '跨文档线索', '保留每一处出处，不替你推断语义'],
  organize: ['给知识一个清楚的位置', '处理未分类文档、相同内容和需要核实的内部引用。', '整理工作台', '所有操作只影响当前项目'],
  changes: ['知道这次更新了什么', '对照你保存的基线，查看新增、修改、移除与重命名。', '更新记录', '按原文比较；不包含分类与显示名调整'],
};
const kindNames = { added:'新增', removed:'移除', updated:'修改', renamed:'重命名', invalid:'无效' };
const statusNames = { missing:'当前资料集未找到', ambiguous:'有多个同名文档', outside:'引用超出资料集', unsupported:'暂不支持的链接格式' };
const assignments = { folder:'来自目录', metadata:'来自 topic 元数据', user:'你设置的分类', unclassified:'尚未分类' };
function node(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}
function button(text, fn, className = '') {
  const b = node('button', className, text); b.type = 'button'; b.addEventListener('click', fn); return b;
}
function toast(message, error = false) {
  $('toast').textContent = message; $('toast').dataset.error = String(error); $('toast').hidden = false;
  clearTimeout(toast.timer); toast.timer = setTimeout(() => $('toast').hidden = true, error ? 10000 : 4500);
}
function fail(error) { toast(error.message || String(error), true); }
function modal(title, description, controls = [], fields = []) {
  const dialog = $('modal');
  if (dialog.open) dialog.close();
  $('modal-content').replaceChildren(node('h2', '', title), node('p', '', description), ...fields);
  $('modal-actions').replaceChildren(button('取消', () => dialog.close()));
  for (const [label, fn, cls] of controls) $('modal-actions').append(button(label, async () => {
    try { const result = await fn(); if (result !== false) dialog.close(); } catch (error) { fail(error); }
  }, cls));
  dialog.showModal();
}
function field(label, value, maxLength = 200) {
  const wrap = node('label', 'field', label); const input = node('input'); input.value = value; input.maxLength = maxLength; wrap.append(input); return [wrap, input];
}
function guardUnsaved(action) {
  if (!dirty && !writer.enabled) return action();
  modal('离开当前资料集？', writer.enabled?'本机自动保存只保留一个当前草稿。切换资料集会替换这份草稿，并清空当前窗口的撤销记录。建议先下载项目备份。':'当前窗口有尚未下载保存的整理。你可以先保存项目文件，再继续。', [
    ['先保存项目', () => { save(); action(); }, 'primary'], ['放弃当前更改', action, 'danger'],
  ]);
}
function renderSession(){
  $('undo').disabled=!history.past.length;$('redo').disabled=!history.future.length;
  const text={off:'本机自动保存：未开启',pending:'正在保存到本机…',saved:'已保存到本机 ✓',error:'本机保存已暂停 · 查看'};
  $('local-save').textContent=text[draftStatus];$('local-save').dataset.status=draftStatus;
  $('local-save').title=draftStatus==='saved'?'浏览器草稿；请定期下载项目备份':'点击管理本机草稿与自动保存';
}
function stepHistory(direction){
  try{
    const state=history[direction]({project,demo});if(!state)return;
    adopt(state.project,{sample:state.demo,remember:false});
    toast(direction==='undo'?'已撤销上一步整理':'已重做');
  }catch(error){fail(error);}
}
async function checkDraftAtStartup(){
  const atStart=mutation;
  try{
    const record=await store.read();draftRecord=record;
    if(!record || mutation!==atStart)return;
    offerDraft(record);
  }catch{/* Keep ordinary in-memory use available; explain failures when storage is requested. */}
}
function offerDraft(record){
  modal('发现上次的本机草稿',`保存时间：${new Date(record.updatedAt).toLocaleString()}。恢复会继续在本机自动保存；也可以取消，保留当前页面。`,[
    ['恢复并继续自动保存',()=>restoreDraft(record),'primary'],
    ['下载草稿备份',()=>{const restored=parseProject(JSON.stringify(record.project));download('MoonAtlas-local-backup.json',projectJSON(restored),'application/json');}],
  ]);
}
async function restoreDraft(record){
  const restored=parseProject(JSON.stringify(record.project));
  await writer.stop();writer.enable(record.revision);draftRecord=record;
  selection=null;expanded.clear();adopt(restored,{changed:false,reset:true});
  await writer.tail;
  if(writer.enabled)toast('已恢复本机草稿；撤销记录从本次打开开始');
}
async function manageDraft(){
  await writer.tail;
  let record;
  try{record=await store.read();draftRecord=record;}catch(error){fail(error);return;}
  if(writer.enabled && record?.revision!==writer.revision){await writer.stop();draftStatus='error';renderSession();}
  const controls=[];
  if(writer.enabled){
    controls.push(['关闭自动保存',async()=>{await writer.stop();draftStatus='off';renderSession();toast('自动保存已关闭，原草稿仍保留');}]);
  }else{
    controls.push([record?'用当前项目替换草稿并开启':'开启本机自动保存',async()=>{
      await writer.stop();writer.enable(record?.revision || null);await writer.enqueue(project);toast('本机自动保存已开启；建议定期下载项目备份');
    },'primary']);
    if(record)controls.push(['恢复草稿',()=>restoreDraft(record)]);
  }
  if(record)controls.push(['清除本机草稿',async()=>{
    await writer.stop();writer.revision=record.revision;
    try{await writer.clear();draftRecord=null;toast('本机草稿已清除，当前窗口内容仍保留');}
    catch(error){draftStatus='error';renderSession();throw error;}
  },'danger']);
  modal('本机自动保存',`开启后，当前项目的完整原文、分类和比较基线会保存在这台设备的浏览器中。不会上传。浏览器清理、无痕窗口结束或应用地址改变后，草稿可能无法恢复，请同时下载项目备份。\n${record?'已有一份草稿，保存于 '+new Date(record.updatedAt).toLocaleString()+'。清除只影响浏览器草稿，无法撤销。':'目前没有已保存的草稿。'}\n撤销与重做只在当前窗口保留，不随草稿恢复。`,controls);
}
function sectionComparison(path){
  if(!sectionCache.has(path)){
    const before=project.baseline.find(d=>d.path===path),after=project.documents.find(d=>d.path===path);
    const result=core('sections',{before,after});
    if(result.issues.length)throw new Error(result.issues.map(i=>i.message).join('\n'));
    sectionCache.set(path,result);
  }
  return sectionCache.get(path);
}
function showSectionChanges(path){
  const result=sectionComparison(path);
  diffSelection={path,index:0,beforePage:0,afterPage:0};renderDetail();
  if(!result.changes.length)toast('未发现可展示的章节差异，请核对完整原文');
  if(matchMedia('(max-width:950px)').matches)$('detail').scrollIntoView({behavior:'smooth',block:'start'});
}
function renderSectionDiff(host){
  const result=sectionComparison(diffSelection.path),changes=result.changes;
  const head=node('div','detail-head');const kicker=node('div','detail-kicker','COMPARE / 章节变化');
  kicker.append(button('返回原文',()=>select(diffSelection.path),'text-button'));
  head.append(kicker,node('h2','',`${changes.length} 处章节变化`),node('div','path',diffSelection.path));host.append(head);
  const body=node('div','detail-body');
  result.notes.forEach(note=>body.append(node('div','notice',note)));
  body.append(node('p','hint','按标题与出现顺序配对，展示完整章节原文。标题改名按新增与删除处理；这里不推断语义是否改变。'));
  if(!changes.length){body.append(node('p','hint','没有章节变化'));host.append(body);return;}
  const choose=node('label','field','选择变化章节');const dropdown=node('select');
  changes.forEach((c,i)=>{const option=node('option','',`${kindNames[c.kind]} · ${c.title}`);option.value=String(i);dropdown.append(option);});dropdown.value=String(diffSelection.index);
  dropdown.addEventListener('change',()=>{diffSelection.index=Number(dropdown.value);diffSelection.beforePage=0;diffSelection.afterPage=0;renderDetail();});choose.append(dropdown);body.append(choose);
  const change=changes[diffSelection.index];
  const row=node('div','card-row');row.append(node('h3','',change.title),node('span','change-kind '+change.kind,kindNames[change.kind]));body.append(row);
  const columns=node('div','diff-columns');
  for(const side of ['before','after']){
    const pane=node('section','diff-pane '+side),evidence=change[side],text=change[`${side}_text`];
    pane.append(node('div','section-label',side==='before'?'修改前 · 基线':'修改后 · 当前'));
    if(!evidence){pane.append(node('p','hint',side==='before'?'原先没有这个章节':'当前已移除此章节'));columns.append(pane);continue;}
    pane.append(node('div','path',`L${evidence.start_line}–${evidence.end_line}`));
    const lines=text.split('\n'),key=side+'Page',page=diffSelection[key],offset=page*60;
    const source=node('div','source diff-source');
    lines.slice(offset,offset+60).forEach((text,i)=>{const row=node('div','source-line');row.append(node('span','line-no',String(evidence.start_line+offset+i)),node('span','line-text',text || ' '));source.append(row);});pane.append(source);
    if(lines.length>60){const pagination=node('div','pagination');const prev=button('上一页',()=>{diffSelection[key]--;renderDetail();});prev.disabled=page===0;const next=button('下一页',()=>{diffSelection[key]++;renderDetail();});next.disabled=offset+60>=lines.length;pagination.append(prev,node('span','',`${page+1}/${Math.ceil(lines.length/60)}`),next);pane.append(pagination);}
    pane.append(button('下载这段原文',()=>download(`MoonAtlas-${side}.txt`,text,'text/plain'),'text-button'));
    if(side==='after')pane.append(button('定位当前原文',()=>select(diffSelection.path,evidence.start_line,evidence.end_line),'text-button'));
    columns.append(pane);
  }
  body.append(columns);host.append(body);
}
function adopt(next, { sample = false, changed = true, remember = true, reset = false } = {}) {
  const graph = build(next);
  if(reset){history.clear();mapState.focus=null;mapState.collapsed.clear();mapState.scrollTop=0;mapState.scrollLeft=0;}
  else if(remember && atlas && JSON.stringify(project)!==JSON.stringify(next)){
    if(!history.push({project,demo}))toast('本次资料超过撤销缓存上限，请先下载项目备份');
  }
  const previousContent = selection && project.documents.find(d=>d.path===selection.path)?.content;
  project = next; atlas = graph; demo = sample; dirty = changed;
  mutation++;diffSelection=null;sectionCache.clear();
  updateCache=core('compare',{before:project.baseline,after:project.documents});
  if(mapState.focus && !atlas.pages.some(p=>p.topic===mapState.focus))mapState.focus=null;
  if (selection && !project.documents.some(d => d.path === selection.path)) selection = null;
  if (selection && previousContent !== project.documents.find(d=>d.path===selection.path)?.content) {
    const section = atlas.pages.find(p=>p.path===selection.path)?.sections.find(s=>s.id===selection.sectionId);
    selection = {...selection,start:section?.evidence.start_line || 1,end:section?.evidence.end_line || 1,sectionId:section?.id};
    sourcePage = Math.floor((selection.start-1)/100);
  }
  render();
  if(writer.enabled)writer.enqueue(project).catch(()=>{});
}
function loadDemo() {
  selection = null; expanded.clear();
  adopt({ ...emptyProject(), name: '团队与学习笔记', documents: structuredClone(sampleDocuments), baseline: structuredClone(sampleDocuments) }, { sample:true, changed:false,reset:true });
}
function changes() { return updateCache; }
function problematicLinks() { return atlas.links.filter(l => Object.hasOwn(statusNames,l.status)); }
function matches(page) {
  if (!query) return true;
  const content = project.documents.find(d => d.path === page.path)?.content || '';
  return [page.title,page.path,page.topic,...page.tags,content].join('\n').toLocaleLowerCase().includes(query);
}
function select(path, start = 1, end = 1) {
  diffSelection=null;
  const section = atlas.pages.find(p=>p.path===path)?.sections.find(s=>s.evidence.start_line===start && s.evidence.end_line===end);
  selection = { path, start, end, sectionId:section?.id }; sourcePage = Math.floor((start - 1) / 100);
  renderDetail();
  for (const el of document.querySelectorAll('.doc-node')) el.classList.toggle('selected', el.dataset.path === path);
  if (matchMedia('(max-width:950px)').matches) $('detail').scrollIntoView({ behavior:'smooth', block:'start' });
}
function render() {
  renderSession();
  const [title, description, label, hint] = titles[view];
  $('view-title').replaceChildren(document.createTextNode(title), node('span','','。'));
  $('view-description').textContent = description;
  $('view-label').replaceChildren(document.createTextNode(label), node('span','',hint));
  $('workspace-name').textContent = project.name;
  $('sample-badge').hidden = !demo;
  $('save-project').textContent = dirty ? '保存项目 •' : '保存项目';
  $('stats').replaceChildren(...[[atlas.pages.length,'篇文档'],[new Set(atlas.pages.map(p => p.topic)).size,'个主题'],[atlas.concepts.filter(c => c.paths.length > 1).length,'条关联线索']].map(([n,label]) => {
    const stat = node('div','stat'); stat.append(node('strong','',String(n).padStart(2,'0')),node('span','',label)); return stat;
  }));
  $('concept-count').textContent = atlas.concepts.filter(c => c.paths.length > 1).length;
  $('issue-count').textContent = atlas.pages.filter(p => p.assignment === 'unclassified').length + atlas.duplicates.length + problematicLinks().length;
  $('change-count').textContent = changes().length;
  document.querySelectorAll('.nav').forEach(b => { const active = b.dataset.view === view; b.classList.toggle('active', active); if (active) b.setAttribute('aria-current','page'); else b.removeAttribute('aria-current'); });
  renderView(); renderDetail();
}
function blank(title, description) {
  const e = node('div','empty'); e.append(node('div','empty-icon','◈'),node('h3','',title),node('div','',description)); return e;
}
function renderView() {
  const host = $('view-content'); host.replaceChildren();
  if (view === 'map') renderMap(host);
  if (view === 'concepts') renderConcepts(host);
  if (view === 'organize') renderOrganize(host);
  if (view === 'changes') renderChanges(host);
  $('footer-info').textContent = query ? '正在筛选 · 清空搜索可查看完整资料集' : '标题与目录线索 · 可人工调整 · 不代表语义推断';
}
function renderMap(host) {
  host.append(mapControls(mapState,renderView));
  const pages = atlas.pages.filter(p=>matches(p) && (!mapState.focus || p.topic===mapState.focus));
  if (!pages.length) {
    const e = blank(query ? '没有匹配的资料' : '你的第一张知识地图', query ? '试试文档标题、路径或正文中的关键词。' : '导入一个 Markdown 文件夹，让资料的结构和联系变得清楚。');
    if (!query) e.append(button('＋ 导入文档', () => $('files-input').click(), 'primary'),button('打开项目文件', () => $('project-input').click()));
    host.append(e); return;
  }
  const map = node('div','map'); const root = node('div','map-root'); root.append(node('span','','◈'),node('span','',project.name),node('small','',`${pages.length} 篇`)); map.append(root);
  const groups = new Map(); for (const p of pages) { if (!groups.has(p.topic)) groups.set(p.topic,[]); groups.get(p.topic).push(p); }
  const branches = node('div','branches');
  for (const [topic, docs] of Array.from(groups).sort((a,b) => a[0].localeCompare(b[0],'zh'))) {
    const branch = node('section','branch');
    const heading = node('div','topic-label');
    const fold=button(mapState.collapsed.has(topic)?'+':'−',()=>{if(mapState.collapsed.has(topic))mapState.collapsed.delete(topic);else mapState.collapsed.add(topic);renderView();},'topic-fold');
    fold.setAttribute('aria-label',`${mapState.collapsed.has(topic)?'展开':'折叠'}主题 ${topic}`);fold.setAttribute('aria-expanded',String(!mapState.collapsed.has(topic)));
    heading.append(fold,node('span','',topic),node('em','',`${docs.length} 篇`),button('聚焦',()=>{mapState.focus=topic;mapState.collapsed.delete(topic);mapState.scrollTop=0;renderView();},'topic-focus'));
    const list = node('div','doc-list');
    list.hidden=mapState.collapsed.has(topic);
    for (const p of docs) {
      const card = node('div','doc-node' + (selection?.path === p.path ? ' selected' : '')); card.dataset.path = p.path;
      const open = button('', () => select(p.path), 'doc-open'); open.title = p.path;
      const changed=changes().find(c=>c.path===p.path);
      open.append(node('span','file-icon','▧'),node('span','doc-title',p.title),node('span','node-meta',p.sections.length ? `${p.sections.length} 标题` : '纯文本'));
      card.append(open);
      if(changed){const badge=node('span','map-change',kindNames[changed.kind]);badge.title='相对原文基线的变化';open.append(badge);}
      if (p.sections.length) {
        const toggle = button(expanded.has(p.path) ? '−' : '+', () => { if (expanded.has(p.path)) expanded.delete(p.path); else expanded.add(p.path); renderView(); },'expand');
        toggle.setAttribute('aria-label',`${expanded.has(p.path)?'收起':'展开'} ${p.title} 的标题`); toggle.setAttribute('aria-expanded',String(expanded.has(p.path))); card.append(toggle);
      }
      if (expanded.has(p.path)) {
        const outline = node('div','outline');
        // Headings are already parsed by MoonBit. Indentation expresses their original level.
        for (const s of p.sections) {
          const b = button('', () => select(p.path,s.evidence.start_line,s.evidence.end_line)); b.style.paddingLeft = `${9+(s.level-1)*10}px`;
          b.append(node('span','level',`H${s.level}`),node('span','',s.title),node('span','line',`L${s.evidence.start_line}`)); outline.append(b);
        }
        card.append(outline);
      }
      list.append(card);
    }
    branch.append(heading,list); branches.append(branch);
  }
  map.append(branches);mountMap(host,map,mapState,atlas.links,l=>select(l.from,l.line,l.line),renderView);
}
function sourceButton(path, line = 1, end = line, label = path) {
  const b = button('', () => select(path,line,end), 'source-link'); b.append(node('span','',label),node('small','',`L${line}${end > line ? '–'+end : ''} ↗`)); return b;
}
function renderConcepts(host) {
  const wrap = node('div','cards');
  const note = node('div','notice','同名标题经过空白与大小写归一后聚合。名称不同的概念需要你确认；标签只作展示，不参与语义推断。');
  note.append(node('br'),button('＋ 确认概念名称归并', editAlias)); wrap.append(note);
  if (project.aliases.length) {
    const card = node('div','card'); card.append(node('h3','','已确认的名称规则'));
    project.aliases.forEach((a,index) => { const row = node('div','alias-row'); row.append(node('span','',`${a.name} → ${a.target}`),button('移除', () => { try { adopt({...project,aliases:project.aliases.filter((_,i) => i!==index)},{sample:demo}); } catch(e){fail(e);} },'text-button')); card.append(row); }); wrap.append(card);
  }
  const concepts = atlas.concepts.filter(c => c.paths.length > 1 && (!query || [c.label,...c.paths,...c.sources.map(s=>s.quote)].join('\n').toLowerCase().includes(query)));
  for (const c of concepts) {
    const card = node('div','card'); const row = node('div','card-row'); row.append(node('h3','',c.label),node('span','count',`${c.paths.length} 篇文档`)); card.append(row);
    card.append(node('p','','查看不同上下文，再决定是否归为同一主题。'));
    c.sources.forEach(s => card.append(sourceButton(s.path,s.start_line,s.end_line)));
    wrap.append(card);
  }
  if (!concepts.length) wrap.append(blank('还没有跨文档标题线索','导入更多资料，或在确认含义后添加名称归并规则。'));
  host.append(wrap);
}
function editAlias() {
  const [a,name] = field('原文中的名称，例如 B-tree',''); const [b,target] = field('统一显示为，例如 B树','');
  modal('确认两个名称的关系','这条规则会合并标题线索，保留每份文档中的原始标题与原文。请确认它们在你的资料集中确实指向同一概念。',[
    ['保存归并规则', () => { adopt({...project,aliases:[...project.aliases,{name:name.value.trim(),target:target.value.trim()}]},{sample:demo}); toast('概念规则已更新，原文保持原样'); },'primary'],
  ],[a,b]);
}
function renderOrganize(host) {
  const wrap = node('div','cards'); let count = 0;
  for (const p of atlas.pages.filter(p => p.assignment === 'unclassified' && matches(p))) {
    const card = node('div','card'); card.append(node('div','issue-title','01 / 待分类'),node('h3','',p.title),node('p','','给这篇资料设置一个主题，让它出现在合适的地图分支。'),sourceButton(p.path)); wrap.append(card); count++;
  }
  for (const d of atlas.duplicates.filter(d => !query || d.paths.some(path => matches(atlas.pages.find(p=>p.path===path))))) {
    const card = node('div','card'); card.append(node('div','issue-title','02 / 内容完全相同'),node('h3','',`${d.paths.length} 份相同资料`),node('p','','按完整原文逐字比较。请核实用途后决定保留哪些文档。'));
    d.paths.forEach(path=>card.append(sourceButton(path))); wrap.append(card); count++;
  }
  for (const l of problematicLinks().filter(l => !query || `${l.from} ${l.target}`.toLowerCase().includes(query))) {
    const card = node('div','card'); card.append(node('div','issue-title','03 / '+statusNames[l.status]),node('h3','',l.target),node('p','','只检查当前导入的资料；未导入的文档也可能触发此提示。'),sourceButton(l.from,l.line)); wrap.append(card); count++;
  }
  const unchecked = atlas.links.filter(l => ['fragment_unchecked','attachment_unchecked'].includes(l.status)).length;
  if (unchecked) wrap.append(node('div','notice',`${unchecked} 条锚点或附件引用未校验。本版本不读取附件，也不推断 Markdown 标题锚点。外部网址不会被请求。`));
  if (!count) wrap.append(blank(query?'没有匹配的整理任务':'当前资料结构清楚','未发现待分类文档、完全相同的内容或支持范围内的内部引用问题。'));
  host.append(wrap);
}
function renderChanges(host) {
  const wrap = node('div','cards'); const note = node('div','notice',`基线包含 ${project.baseline.length} 篇文档。通过“导入文档”合并新增/修改；通过“以本次文件替换资料集”比较完整快照，包括移除和重命名。`);
  note.append(node('br'),button('将当前资料设为基线', () => modal('更新比较基线','当前原文将成为下一次比较的起点，现有更新记录将清空。',[
    ['设为新基线', () => { adopt({...project,baseline:structuredClone(project.documents)},{sample:demo}); toast('比较基线已更新，请保存项目'); },'primary'],
  ]))); wrap.append(note);
  const list = changes().filter(c => !query || `${c.path} ${c.previous_path}`.toLowerCase().includes(query));
  for (const c of list) {
    const card = node('div','card'); const row = node('div','card-row'); row.append(node('h3','',c.path),node('span','change-kind '+c.kind,kindNames[c.kind] || c.kind)); card.append(row);
    card.append(node('p','',c.previous_path ? `${c.previous_path} → ${c.path}\n${c.detail}` : c.detail));
    if(c.kind!=='removed') card.append(sourceButton(c.path));
    else card.append(button('查看基线原文',()=>showBaseline(c.path),'text-button'));
    if(c.kind==='updated'){
      const result=sectionComparison(c.path);
      card.append(button(`查看章节变化 · ${result.changes.length} 处`,()=>showSectionChanges(c.path),'section-compare-button'));
    }
    wrap.append(card);
  }
  if(!list.length) wrap.append(blank('与基线相比，没有原文变化','你仍可调整分类与显示名。导入新版资料后，这里会列出变化。'));
  host.append(wrap);
}
function showBaseline(path) {
  const doc = project.baseline.find(d=>d.path===path);
  const preview = node('pre','source',doc.content.slice(0,5000));
  modal('基线中的文档',path+(doc.content.length>5000?' · 仅预览前 5,000 个字符':''),[['下载此原文',()=>download(path.split('/').at(-1),doc.content,'text/plain')]], [preview]);
}
function renderDetail() {
  const host = $('detail'); host.replaceChildren();
  host.parentElement.classList.toggle('comparing',Boolean(diffSelection));
  if(diffSelection){renderSectionDiff(host);return;}
  const p = selection && atlas.pages.find(p=>p.path===selection.path);
  if(!p) {
    const wrap = node('div','detail-welcome'); wrap.append(node('div','art','◈'),node('div','eyebrow','EVERY NODE HAS A SOURCE'),node('h2','','从一篇文档，走向整张地图'),node('p','hint','点击地图上的文档或标题，在这里查看原文与出处。'));
    const steps=node('ol'); ['导入你的资料，保留目录层级','展开标题，找到知识之间的联系','调整主题，把判断保存在项目中'].forEach(s=>steps.append(node('li','',s))); wrap.append(steps);
    wrap.append(node('p','hint','当前为本地离线版本。你确认的分类和名称归并会随项目保存，源文件不会被修改。'),button('打开已有项目',()=>$('project-input').click(),'text-button')); host.append(wrap); return;
  }
  const doc = project.documents.find(d=>d.path===p.path);
  const head = node('div','detail-head'); const kicker = node('div','detail-kicker','SOURCE / 原文证据'); kicker.append(button('关闭',()=>{selection=null;renderDetail();renderView();},'text-button')); head.append(kicker,node('h2','',p.title),node('div','path',p.path));
  const tags=node('div','tags'); tags.append(node('span','tag',p.topic)); p.tags.forEach(t=>tags.append(node('span','tag','#'+t))); head.append(tags); host.append(head);
  const body=node('div','detail-body'); const label=node('div','section-label','原文定位'); label.append(node('span','muted',`L${selection.start}–${selection.end}`)); body.append(label);
  const lines=doc.content.split('\n'); const maxPage=Math.max(0,Math.ceil(lines.length/100)-1); sourcePage=Math.min(sourcePage,maxPage);
  const source=node('div','source'); const offset=sourcePage*100;
  lines.slice(offset,offset+100).forEach((text,i)=>{ const n=offset+i+1; const row=node('div','source-line'+(n>=selection.start && n<=selection.end?' highlight':'')); row.append(node('span','line-no',String(n)),node('span','line-text',text || ' ')); source.append(row); }); body.append(source);
  if(maxPage>0) {
    const pagination=node('div','pagination'); const prev=button('上一页',()=>{sourcePage--;renderDetail();}); prev.disabled=sourcePage===0; const next=button('下一页',()=>{sourcePage++;renderDetail();}); next.disabled=sourcePage===maxPage;
    pagination.append(prev,node('span','',`${sourcePage+1}/${maxPage+1} · ${lines.length} 行`),next); body.append(pagination);
  }
  const outgoing=atlas.links.filter(l=>l.from===p.path && ['linked','fragment_unchecked'].includes(l.status));
  if(outgoing.length) { body.append(node('div','section-label','文档中的引用')); outgoing.forEach(l=>body.append(sourceButton(l.target,1,1,l.target+(l.status==='fragment_unchecked'?' · 锚点未核验':'')))); }
  if(changes().some(c=>c.path===p.path && c.kind==='updated'))body.append(button('对比修改前后的章节',()=>showSectionChanges(p.path),'section-compare-button'));
  host.append(body);
  const form=node('form','detail-form'); form.append(node('div','section-label','整理这篇资料'));
  const existing=project.preferences.find(pref=>pref.path===p.path);
  const [titleField,title]=field('显示名称',existing?.title || '',200); title.placeholder=p.title;
  const [topicField,topic]=field('所属主题',existing?.topic || '',120); topic.placeholder=p.topic;
  topicField.append(node('small','',assignments[p.assignment]+' · 留空恢复默认'));
  form.append(titleField,topicField); const actions=node('div','form-actions'); const submit=node('button','primary','保存整理'); submit.type='submit';
  actions.append(submit,button('移出资料集',()=>modal('从当前项目移出这篇文档？','源文件不会被修改。相对基线的移除会显示在更新记录中。',[
    ['移出',()=>{adopt(replaceDocuments(project,project.documents.filter(d=>d.path!==p.path)),{sample:demo});toast('已从当前项目移出');},'danger'],
  ]),'text-button')); form.append(actions);
  form.addEventListener('submit',e=>{e.preventDefault();try {const prefs=project.preferences.filter(pref=>pref.path!==p.path); if(title.value.trim() || topic.value.trim())prefs.push({path:p.path,title:title.value.trim(),topic:topic.value.trim()}); adopt({...project,preferences:prefs},{sample:demo});toast('整理已保存到当前项目，请下载项目文件以便下次继续');}catch(error){fail(error);}});
  host.append(form);
  requestAnimationFrame(()=>source.querySelector('.highlight')?.scrollIntoView({block:'nearest'}));
}
async function importFiles(files) {
  try {
    const {documents,skipped}=await readDocuments(files);
    const apply=(replace)=>{
      const base=demo?emptyProject():project;
      let docs=documents;
      if(!replace) {const map=new Map(base.documents.map(d=>[d.path,d])); documents.forEach(d=>map.set(d.path,d));docs=Array.from(map.values());}
      let next=replaceDocuments(base,docs);
      if(demo || (!base.documents.length && !base.baseline.length && !base.preferences.length))next={...next,baseline:structuredClone(docs)};
      adopt(next);toast(`已导入 ${documents.length} 篇文档${skipped?`，跳过 ${skipped} 个非 Markdown/TXT 文件`:''}`);
    };
    if(demo || !project.documents.length) {apply(true);return;}
    const collisions=documents.filter(d=>project.documents.some(p=>p.path===d.path)).length;
    modal('如何更新当前资料集？',`本次导入 ${documents.length} 篇文档，其中 ${collisions} 篇路径与当前资料相同。合并时，同路径原文将被替换；替换资料集时，未在本次选中的文档会移出当前项目。`,[
      ['合并新增 / 更新',()=>apply(false),'primary'],['以本次文件替换资料集',()=>apply(true)],
    ]);
  }catch(error){fail(error);}
}
function download(name, text, type) {
  const url=URL.createObjectURL(new Blob([text],{type}));const link=node('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
function save() {download('MoonAtlas-project.json',projectJSON(project),'application/json');dirty=false;$('save-project').textContent='保存项目';toast('已发起项目下载；下次使用“打开项目文件”恢复');}
async function exportStandalone() {
  let source=template;
  if(needsOfflineTemplate) {
    const result=await fetch('/MoonAtlas.html');if(!result.ok)throw new Error('离线模板尚未构建，请先运行 npm run build');source=await result.text();
  }
  download('MoonAtlas-share.html',shareHTML(source,project),'text/html');toast('已发起分享页下载，文件包含当前项目的原文');
}
function showExport() {
  modal('导出你的知识地图','项目文件与分享 HTML 包含完整原文和比较基线；图谱 JSON 包含摘录和路径。分享前请确认这些资料适合公开。SVG 总览只显示主题与文档，Markdown 索引包含全部标题与行号。',[
    ['SVG 总览图',()=>download('MoonAtlas-map.svg',core('svg',project),'image/svg+xml')],
    ['Markdown 索引',()=>download('MoonAtlas-index.md',core('index',project),'text/markdown')],
    ['图谱 JSON',()=>download('MoonAtlas-graph.json',JSON.stringify(atlas,null,2),'application/json')],
    ['交互 HTML · 含原文',exportStandalone,'primary'],
  ]);
}
document.querySelectorAll('.nav').forEach(b=>b.addEventListener('click',()=>{view=b.dataset.view;render();}));
$('undo').addEventListener('click',()=>stepHistory('undo'));
$('redo').addEventListener('click',()=>stepHistory('redo'));
$('local-save').addEventListener('click',()=>manageDraft().catch(fail));
document.addEventListener('keydown',e=>{
  if(!(e.ctrlKey||e.metaKey) || e.altKey || e.target.closest('input,textarea,select,[contenteditable="true"]') || $('modal').open)return;
  if(e.key.toLowerCase()==='z'){e.preventDefault();stepHistory(e.shiftKey?'redo':'undo');}
  else if(e.key.toLowerCase()==='y'){e.preventDefault();stepHistory('redo');}
});
let resizeTimer;
window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(view==='map')renderView();},100);});
$('search').addEventListener('input',e=>{query=e.target.value.toLocaleLowerCase().trim();renderView();});
$('import-files').addEventListener('click',()=>$('files-input').click());
$('import-folder').addEventListener('click',()=>$('folder-input').click());
for(const id of ['files-input','folder-input'])$(id).addEventListener('change',async e=>{const selected=Array.from(e.target.files);e.target.value='';await importFiles(selected);});
$('open-project').addEventListener('click',()=>$('project-input').click());
$('project-input').addEventListener('change',async e=>{
  const f=e.target.files[0];e.target.value='';if(!f)return;
  try{if(f.size>30000000)throw new Error('项目文件过大');const next=parseProject(new TextDecoder('utf-8',{fatal:true}).decode(await f.arrayBuffer()));guardUnsaved(()=>{selection=null;expanded.clear();adopt(next,{changed:false,reset:true});toast('项目已恢复，包括分类、归并规则和基线');});}catch(error){fail(error);}
});
$('save-project').addEventListener('click',save);$('export-menu').addEventListener('click',showExport);
$('load-demo').addEventListener('click',()=>guardUnsaved(loadDemo));
$('new-project').addEventListener('click',()=>guardUnsaved(()=>{selection=null;expanded.clear();adopt(emptyProject(),{changed:false,reset:true});}));
$('rename-project').addEventListener('click',()=>{const [wrap,input]=field('地图名称',project.name,120);modal('给地图起个名字','名称只影响当前项目的展示。', [['保存',()=>{if(!input.value.trim())throw new Error('请输入地图名称');adopt({...project,name:input.value.trim()},{sample:demo});},'primary']],[wrap]);});
window.addEventListener('beforeunload',e=>{if((dirty && draftStatus!=='saved') || draftStatus==='pending'){e.preventDefault();e.returnValue='';}});
let dragDepth=0;
document.addEventListener('dragenter',e=>{if(Array.from(e.dataTransfer?.types||[]).includes('Files')){e.preventDefault();dragDepth++;$('drop-overlay').hidden=false;}});
document.addEventListener('dragover',e=>{if(Array.from(e.dataTransfer?.types||[]).includes('Files'))e.preventDefault();});
document.addEventListener('dragleave',()=>{dragDepth=Math.max(0,dragDepth-1);if(!dragDepth)$('drop-overlay').hidden=true;});
document.addEventListener('drop',e=>{e.preventDefault();dragDepth=0;$('drop-overlay').hidden=true;if(e.dataTransfer?.files.length)importFiles(e.dataTransfer.files);});
try {
  const seed=$('moonatlas-seed').textContent.trim();
  if(seed && seed!=='null')adopt(parseProject(seed),{changed:false,reset:true});else loadDemo();
  checkDraftAtStartup();
}catch(error){adopt(emptyProject(),{changed:false});fail(error);}
