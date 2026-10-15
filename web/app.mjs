import { core, build, emptyProject, replaceDocuments, parseProject, projectJSON, shareHTML, readDocuments, validateReviews, planImport } from './project.mjs';
import {backupJSON,readBackup,canonicalProject} from './backup.mjs';
import { reviewFor, reviewNames, checkNames, maintenanceReport } from './maintenance.mjs';
import { sampleDocuments } from './samples.mjs';
import { maintenanceSample } from './maintenance-sample.mjs';
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
let healthCache=[], impactCache=[], healthFilter='pending', healthKind='all', healthPage=0;
const lineCache=new Map();
let homeVisible=false, modalSerial=0, importController=null, ioSerial=0, backupState=null, pendingSwitch=null, searchCache=null, searchPage=0;
const selectedDocuments=new Set(),selectedChecks=new Set();
let batchMode=false;
const writer = new DraftWriter(store,(status,value)=>{
  draftStatus=status;
  if(status==='saved')draftRecord=value;
  if(status==='error')fail(value);
  renderSession();
});
const titles = {
  map: ['看见知识的全貌', '把散落的资料串起来。每一条线索，都可以回到原文。', '全局地图', '目录 → 文档 → 标题'],
  concepts: ['发现资料之间的联系', '同名标题是线索，是否属于同一概念，由你确认。', '跨文档线索', '保留每一处出处，不替你推断语义'],
  organize: ['把整理变成可以完成的任务', '逐项核对资料结构，记录处理结果；原文更新后重新检查。', '知识库体检', '处理记录随项目保存'],
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
  const serial=++modalSerial;
  const dialog = $('modal');
  if (dialog.open) dialog.close();
  $('modal-content').replaceChildren(node('h2', '', title), node('p', '', description), ...fields);
  $('modal-actions').replaceChildren(button('取消', () => {pendingSwitch=null;dialog.close();}));
  for (const [label, fn, cls] of controls) $('modal-actions').append(button(label, async () => {
    const buttons=Array.from($('modal-actions').querySelectorAll('button'));buttons.forEach(b=>b.disabled=true);
    try { const result = await fn(); if (result !== false && serial===modalSerial) dialog.close(); } catch (error) { fail(error); }
    finally {if(serial===modalSerial)buttons.forEach(b=>b.disabled=false);}
  }, cls));
  dialog.showModal();
}
function field(label, value, maxLength = 200) {
  const wrap = node('label', 'field', label); const input = node('input'); input.value = value; input.maxLength = maxLength; wrap.append(input); return [wrap, input];
}
function guardUnsaved(action) {
  if (!dirty && !writer.enabled) return action();
  modal('离开当前资料集？', writer.enabled?'本机自动保存只保留一个当前草稿。切换资料集会替换这份草稿，并清空当前窗口的撤销记录。建议先下载项目备份。':'当前窗口有尚未下载保存的整理。你可以先保存项目文件，再继续。', [
    ['备份并验证后继续', async () => { const stamp=mutation;await save();pendingSwitch={action,mutation:stamp};showBackup();return false; }, 'primary'], ['放弃当前更改', action, 'danger'],
  ]);
}
function renderSession(){
  $('undo').disabled=!history.past.length;$('redo').disabled=!history.future.length;
  const text={off:'本机自动保存：未开启',pending:'正在保存到本机…',saved:'已保存到本机 ✓',error:'本机保存已暂停 · 查看'};
  $('local-save').textContent=text[draftStatus];$('local-save').dataset.status=draftStatus;
  $('local-save').title=draftStatus==='saved'?'浏览器草稿；请定期下载项目备份':'点击管理本机草稿与自动保存';
  $('save-status').textContent=(draftStatus==='saved'&&draftRecord?`本机保存于 ${new Date(draftRecord.updatedAt).toLocaleTimeString()} · `:'')+
    (backupState?.mutation===mutation?(backupState.verified?'当前资料已验证备份':'已发起备份下载，待选回文件验证'):project.documents.length&&!demo?'当前资料需要备份':'原文保留在本机');
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
  let restored;
  try{restored=parseProject(JSON.stringify(record.project));}
  catch(error){modal('草稿暂时无法恢复',`校验未通过：${error.message}。当前项目保持不变，可改用之前下载的项目备份。`,[['打开项目备份',()=>$('project-input').click()]]);return false;}
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
  diffSelection={path,index:0,beforePage:0,afterPage:0,hunk:0};renderDetail();
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
  dropdown.addEventListener('change',()=>{diffSelection.index=Number(dropdown.value);diffSelection.beforePage=0;diffSelection.afterPage=0;diffSelection.hunk=0;renderDetail();});choose.append(dropdown);body.append(choose);
  const change=changes[diffSelection.index];
  const cacheKey=JSON.stringify([diffSelection.path,change.id]);
  if(!lineCache.has(cacheKey))lineCache.set(cacheKey,core('lines',{before:change.before_text,after:change.after_text}));
  const lineDiff=lineCache.get(cacheKey);
  const navigate=(index)=>{
    diffSelection.hunk=index;
    const edit=lineDiff.edits[index];
    for(const side of ['before','after']){
      const total=change[`${side}_text`].split('\n').length;
      diffSelection[side+'Page']=Math.floor(Math.max(0,Math.min(total-1,edit[side+'_start']-1))/60);
    }
    renderDetail();
    requestAnimationFrame(()=>document.querySelectorAll('.diff-source').forEach(p=>p.querySelector('.diff-active')?.scrollIntoView({block:'nearest'})));
  };
  if(lineDiff.edits.length){
    const bar=node('div','diff-navigation');
    const prev=button('上一处变化',()=>navigate(diffSelection.hunk-1));prev.disabled=diffSelection.hunk===0;
    const next=button('下一处变化',()=>navigate(diffSelection.hunk+1));next.disabled=diffSelection.hunk>=lineDiff.edits.length-1;
    bar.append(prev,node('span','',`${diffSelection.hunk+1} / ${lineDiff.edits.length} 处行变化`),next,button('定位此处',()=>navigate(diffSelection.hunk)));
    body.append(bar,node('p','hint','− 删除 / 旧行　＋ 新增 / 新行；修改以两侧删除和新增表示。'));
  }
  if(!lineDiff.precise)body.append(node('div','notice','变化区域较大，已按整段标记；保留完整原文，不声称这是最小逐行差异。'));
  const row=node('div','card-row');row.append(node('h3','',change.title),node('span','change-kind '+change.kind,kindNames[change.kind]));body.append(row);
  const columns=node('div','diff-columns');
  for(const side of ['before','after']){
    const pane=node('section','diff-pane '+side),evidence=change[side],text=change[`${side}_text`];
    pane.append(node('div','section-label',side==='before'?'修改前 · 基线':'修改后 · 当前'));
    if(!evidence){pane.append(node('p','hint',side==='before'?'原先没有这个章节':'当前已移除此章节'));columns.append(pane);continue;}
    pane.append(node('div','path',`L${evidence.start_line}–${evidence.end_line}`));
    const lines=text.split('\n'),key=side+'Page',page=diffSelection[key],offset=page*60;
    const source=node('div','source diff-source');
    lines.slice(offset,offset+60).forEach((text,i)=>{
      const relative=offset+i+1;
      const editIndex=lineDiff.edits.findIndex(e=>relative>=e[side+'_start'] && relative<e[side+'_start']+e[side+'_count']);
      const changed=editIndex>=0;
      const row=node('div','source-line'+(changed?(side==='before'?' diff-deleted':' diff-added'):'')+(changed && editIndex===diffSelection.hunk?' diff-active':''));
      row.append(node('span','line-no',String(evidence.start_line+offset+i)),node('span','diff-sign',changed?(side==='before'?'−':'+'):' '),node('span','line-text',text || ' '));source.append(row);
    });pane.append(source);
    if(lines.length>60){const pagination=node('div','pagination');const prev=button('上一页',()=>{diffSelection[key]--;renderDetail();});prev.disabled=page===0;const next=button('下一页',()=>{diffSelection[key]++;renderDetail();});next.disabled=offset+60>=lines.length;pagination.append(prev,node('span','',`${page+1}/${Math.ceil(lines.length/60)}`),next);pane.append(pagination);}
    pane.append(button('下载这段原文',()=>download(`MoonAtlas-${side}.txt`,text,'text/plain'),'text-button'));
    if(side==='after')pane.append(button('定位当前原文',()=>select(diffSelection.path,evidence.start_line,evidence.end_line),'text-button'));
    columns.append(pane);
  }
  body.append(columns);host.append(body);
}
function adopt(next, { sample = false, changed = true, remember = true, reset = false } = {}) {
  const graph = build(next);
  const findings=core('health',next),ids=new Set(findings.map(c=>c.id));
  next={...next,reviews:validateReviews(next.reviews).filter(r=>ids.has(r.id))};
  const updates=core('compare',{before:next.baseline,after:next.documents});
  const impacts=core('impacts',{before:next.baseline,after:next.documents});
  if(impacts.issues.length)throw new Error(impacts.issues.map(i=>i.message).join('\n'));
  if(reset){history.clear();mapState.focus=null;mapState.collapsed.clear();mapState.scrollTop=0;mapState.scrollLeft=0;}
  else if(remember && atlas && JSON.stringify(project)!==JSON.stringify(next)){
    if(!history.push({project,demo}))toast('本次资料超过撤销缓存上限，请先下载项目备份');
  }
  const previousContent = selection && project.documents.find(d=>d.path===selection.path)?.content;
  project = next; atlas = graph; demo = sample; dirty = changed;
  mutation++;diffSelection=null;sectionCache.clear();lineCache.clear();healthPage=0;searchCache=null;searchPage=0;selectedDocuments.clear();selectedChecks.clear();homeVisible=false;
  if(reset){query='';$('search').value='';backupState=null;pendingSwitch=null;}
  healthCache=findings;
  updateCache=updates;
  impactCache=impacts.impacts;
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
  $('welcome').hidden=!homeVisible;
  document.querySelector('.intro').hidden=homeVisible;document.querySelector('.workspace').hidden=homeVisible;
  $('getting-started').hidden=homeVisible || !project.documents.length;
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
  $('issue-count').textContent = healthCache.filter(c=>reviewFor(project,c).state==='pending').length;
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
  if(query)renderSearch(host);
  const bulk=node('div','batch-toolbar');
  bulk.append(button(batchMode?'结束多选': '批量分类',()=>{batchMode=!batchMode;selectedDocuments.clear();renderView();}));
  if(batchMode){
    const visible=atlas.pages.filter(p=>matches(p)&&(!mapState.focus||p.topic===mapState.focus));
    bulk.append(button('选择当前结果',()=>{visible.forEach(p=>selectedDocuments.add(p.path));renderView();}),button('清空选择',()=>{selectedDocuments.clear();renderView();}),node('span','',`已选 ${selectedDocuments.size} 篇`));
    const apply=button('设置共同主题',batchClassify,'primary');apply.disabled=!selectedDocuments.size;bulk.append(apply);
  }
  host.append(bulk);
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
      if(batchMode){const label=node('label','doc-select'),check=node('input');check.type='checkbox';check.checked=selectedDocuments.has(p.path);check.setAttribute('aria-label',`选择文档 ${p.path}`);check.addEventListener('change',()=>{if(check.checked)selectedDocuments.add(p.path);else selectedDocuments.delete(p.path);renderView();});label.append(check);card.append(label);}
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
function highlighted(text,term=query){
  const fragment=document.createDocumentFragment();
  if(!term){fragment.append(document.createTextNode(text));return fragment;}
  const expression=new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'giu');let start=0;
  for(const match of text.matchAll(expression)){
    fragment.append(document.createTextNode(text.slice(start,match.index)),node('mark','search-mark',match[0]));start=match.index+match[0].length;
  }
  fragment.append(document.createTextNode(text.slice(start)));return fragment;
}
function renderSearch(host){
  if(!searchCache||searchCache.query!==query){searchCache={query,...core('search',{...project,query})};searchPage=0;}
  const box=node('section','search-results');box.setAttribute('aria-label','搜索结果');
  box.append(node('div','section-label',`找到 ${searchCache.total} 个位置${searchCache.total>200?' · 展示前 200 个，请缩小关键词':''}`));
  if(searchCache.issues.length)box.append(node('p','',searchCache.issues.map(i=>i.message).join('；')));
  for(const hit of searchCache.hits.slice(searchPage*10,searchPage*10+10)){
    const b=button('',()=>{
      const p=atlas.pages.find(p=>p.path===hit.path);mapState.focus=null;mapState.collapsed.delete(p.topic);expanded.add(hit.path);mapState.scrollTop=0;
      renderView();select(hit.path,Math.max(1,hit.line),Math.max(1,hit.line));
      requestAnimationFrame(()=>{
        const card=Array.from(document.querySelectorAll('.doc-node')).find(n=>n.dataset.path===hit.path);
        card?.scrollIntoView({block:'nearest',inline:'nearest'});
        if(matchMedia('(max-width:950px)').matches)$('detail').scrollIntoView({block:'start'});
      });
    },'search-result');
    b.append(node('strong','',`${hit.path} · ${hit.line?'L'+hit.line:'标题 / 路径 / 分类 / 标签'}`));const snippet=node('span','search-snippet');snippet.append(highlighted(hit.snippet));b.append(snippet);box.append(b);
  }
  if(searchCache.hits.length>10){const controls=node('div','pagination'),prev=button('上一页结果',()=>{searchPage--;renderView();}),next=button('下一页结果',()=>{searchPage++;renderView();});prev.disabled=searchPage===0;next.disabled=(searchPage+1)*10>=searchCache.hits.length;controls.append(prev,node('span','',`${searchPage+1}/${Math.ceil(searchCache.hits.length/10)}`),next);box.append(controls);}
  host.append(box);
}
function batchClassify(){
  const paths=Array.from(selectedDocuments),stamp=mutation;
  const [wrap,input]=field('共同主题','',120),list=node('div','preview-list');paths.forEach(path=>list.append(node('div','',path)));
  modal(`批量分类 ${paths.length} 篇文档`,'保留每篇文档的显示名称和原文。确认后可以一步撤销。',[
    ['确认批量分类',()=>{
      if(stamp!==mutation)throw new Error('资料已经变化，请重新选择。');
      const result=core('classify',{...project,paths,topic:input.value.trim()});if(result.issues.length)throw new Error(result.issues.map(i=>i.message).join('\n'));
      adopt({...project,preferences:result.preferences},{sample:demo});toast(`已分类 ${paths.length} 篇文档，可撤销`);
    },'primary'],
  ],[wrap,list]);
}
function batchReview(state){
  const ids=Array.from(selectedChecks),stamp=mutation;
  const [wrap,input]=field(state==='ignored'?'共同忽略原因（必填）':'共同处理备注（可选）','',1000);
  const list=node('div','preview-list');healthCache.filter(c=>selectedChecks.has(c.id)).forEach(c=>list.append(node('div','',`${checkNames[c.kind]} · ${c.paths.join('、')}${c.kind==='link'?' L'+c.line+' → '+c.target:''}`)));
  modal(`批量${state==='ignored'?'忽略':'处理'} ${ids.length} 项`,'下面列出本次范围。只改变处理记录，可一步撤销。',[
    ['确认批量处理',()=>{
      if(stamp!==mutation)throw new Error('资料已经变化，请重新选择。');
      if(state==='ignored'&&!input.value.trim())throw new Error('请填写共同忽略原因');
      const reviews=validateReviews([...(project.reviews||[]).filter(r=>!ids.includes(r.id)),...ids.map(id=>({id,state,note:input.value.trim(),reopened:false}))]);
      adopt({...project,reviews},{sample:demo});toast(`已记录 ${ids.length} 项处理结果，可撤销`);
    },'primary'],
  ],[wrap,list]);
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
  const wrap = node('div','cards');
  const summary=node('div','health-summary');
  for(const state of ['pending','done','ignored']){
    const b=button(`${reviewNames[state]} ${healthCache.filter(c=>reviewFor(project,c).state===state).length}`,()=>{healthFilter=state;healthPage=0;renderView();});
    b.setAttribute('aria-pressed',String(healthFilter===state));summary.append(b);
  }
  const all=button(`全部 ${healthCache.length}`,()=>{healthFilter='all';healthPage=0;renderView();});all.setAttribute('aria-pressed',String(healthFilter==='all'));summary.append(all);wrap.append(summary);
  wrap.append(node('div','notice','已处理是你的核对记录，问题仍可能存在。原文修改后会重新待处理；修正后不再检测到的问题会从清单移除。忽略时请写明原因。'));
  const filters=node('div','health-tools');const label=node('label','field','问题类型'),type=node('select');
  for(const [key,text] of Object.entries({all:'全部类型',...checkNames})){const option=node('option','',text);option.value=key;type.append(option);}
  type.value=healthKind;type.addEventListener('change',()=>{healthKind=type.value;healthPage=0;renderView();});label.append(type);
  filters.append(label,button('导出整理报告',exportMaintenance));wrap.append(filters);
  const items=healthCache.filter(c=>{
    const r=reviewFor(project,c);
    return (healthFilter==='all'||r.state===healthFilter) && (healthKind==='all'||c.kind===healthKind) && (!query || `${c.target} ${r.note}`.toLowerCase().includes(query) || c.paths.some(path=>matches(atlas.pages.find(p=>p.path===path))));
  });
  healthPage=Math.min(healthPage,Math.max(0,Math.ceil(items.length/30)-1));
  const bulk=node('div','batch-toolbar');bulk.append(button('选择本页任务',()=>{items.slice(healthPage*30,healthPage*30+30).forEach(c=>selectedChecks.add(c.id));renderView();}),button('清空任务选择',()=>{selectedChecks.clear();renderView();}),node('span','',`已选 ${selectedChecks.size} 项（含其他页）`));
  for(const [label,state] of [['批量标记已处理','done'],['批量忽略','ignored']]){const b=button(label,()=>batchReview(state));b.disabled=!selectedChecks.size;bulk.append(b);}wrap.append(bulk);
  for(const check of items.slice(healthPage*30,healthPage*30+30)){
    const r=reviewFor(project,check),card=node('div','card health-card');card.dataset.kind=check.kind;
    const title=check.kind==='link'?check.target:check.kind==='duplicate'?`${check.paths.length} 份相同资料`:atlas.pages.find(p=>p.path===check.paths[0]).title;
    const header=node('div','card-row');header.append(node('div','issue-title',checkNames[check.kind]),node('span','review-state '+r.state,reviewNames[r.state]));
    const choice=node('label','task-select'),checkbox=node('input');checkbox.type='checkbox';checkbox.checked=selectedChecks.has(check.id);checkbox.setAttribute('aria-label',`选择任务 ${checkNames[check.kind]} ${check.paths[0]} L${check.line}`);checkbox.addEventListener('change',()=>{if(checkbox.checked)selectedChecks.add(check.id);else selectedChecks.delete(check.id);renderView();});choice.append(checkbox,node('span','','选择此项'));card.append(choice);
    card.append(header,node('h3','',title),node('p','',check.kind==='link'?`${statusNames[check.status]}。只核对当前资料集，未导入也可能触发提示。`:check.kind==='duplicate'?'完整原文逐字相同；请核实是否因用途不同而需要保留。':'点击原文，在右侧设置所属主题。'));
    check.paths.forEach(path=>card.append(sourceButton(path,check.line)));
    if(r.reopened)card.append(node('div','notice','原文已变化，请重新核对。之前的备注已保留。'));
    if(r.note)card.append(node('p','review-note',`备注：${r.note}`));
    if(r.state==='done')card.append(node('p','hint','这条结构提示仍存在；标记已处理不会修改或删除原文。'));
    const actions=node('div','review-actions');
    actions.append(button('标记已处理',()=>editReview(check,'done')),button('忽略并备注',()=>editReview(check,'ignored')));
    if(r.state!=='pending')actions.append(button('重新待处理',()=>saveReview(check,'pending',r.note),'text-button'));
    card.append(actions);wrap.append(card);
  }
  if(items.length>30){const pagination=node('div','pagination');const previous=button('上一页任务',()=>{healthPage--;renderView();});previous.disabled=healthPage===0;const next=button('下一页任务',()=>{healthPage++;renderView();});next.disabled=(healthPage+1)*30>=items.length;pagination.append(previous,node('span','',`${healthPage+1}/${Math.ceil(items.length/30)} · ${items.length} 项`),next);wrap.append(pagination);}
  const unchecked = atlas.links.filter(l => ['fragment_unchecked','attachment_unchecked'].includes(l.status)).length;
  if (unchecked) wrap.append(node('div','notice',`${unchecked} 条锚点或附件引用未校验。本版本不读取附件，也不推断 Markdown 标题锚点。外部网址不会被请求。`));
  if (!items.length) wrap.append(blank('当前筛选下没有任务','可以切换处理状态或问题类型，查看其他体检项。'));
  host.append(wrap);
}
function saveReview(check,state,note){
  const reviews=[...(project.reviews||[]).filter(r=>r.id!==check.id),{id:check.id,state,note:note.trim(),reopened:false}];
  adopt({...project,reviews},{sample:demo});toast('处理记录已保存到当前项目，可撤销；下载项目可保留记录');
}
function editReview(check,state){
  const [wrap,input]=field(state==='ignored'?'忽略原因（必填）':'处理备注（可选）',reviewFor(project,check).note,1000);
  modal(state==='ignored'?'忽略这条提示':'记录处理结果','只记录你的判断，原文不会被改写。来源原文更新后会重新提示检查。',[
    ['保存处理记录',()=>{if(state==='ignored'&&!input.value.trim())throw new Error('请填写忽略原因');saveReview(check,state,input.value);},'primary'],
  ],[wrap]);
}
function exportMaintenance(){
  modal('导出整理报告','报告包含路径、引用目标、处理备注和更新引用位置，不包含原文正文。请确认这些信息适合分享。',[
    ['下载 Markdown 报告',()=>download('MoonAtlas-maintenance.md',maintenanceReport(project,healthCache,impactCache),'text/markdown'),'primary'],
  ]);
}
function renderChanges(host) {
  const wrap = node('div','cards'); const note = node('div','notice',`基线包含 ${project.baseline.length} 篇文档。通过“导入文档”合并新增/修改；通过“以本次文件替换资料集”比较完整快照，包括移除和重命名。`);
  note.append(node('br'),button('将当前资料设为基线', () => modal('更新比较基线','当前原文将成为下一次比较的起点，现有更新记录将清空。',[
    ['设为新基线', () => { adopt({...project,baseline:structuredClone(project.documents)},{sample:demo}); toast('比较基线已更新，请保存项目'); },'primary'],
  ]))); note.append(button('导出整理报告',exportMaintenance));wrap.append(note);
  wrap.append(node('div','notice','影响追踪只列出新旧快照中指向变化文档的直接引用，不代表引用者内容一定需要修改，也不包含没有显式链接的依赖。'));
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
    const impacts=impactCache.filter(i=>i.changed_path===c.path);
    if(impacts.length){
      const group=node('details','impact-list');group.append(node('summary','',`需要核对的引用 · ${new Set(impacts.map(i=>i.source_path)).size} 篇 / ${impacts.length} 个快照位置`));
      const content=node('div','impact-items');
      let shown=0;
      const more=button('显示更多引用',appendBatch);
      function appendBatch(){
        const batch=impacts.slice(shown,shown+30);shown+=batch.length;
        batch.forEach(i=>{
          const label=`${i.snapshot==='before'?'基线':'当前'} · ${i.source_path}${i.status==='fragment_unchecked'?' · 锚点未验证':''}`;
          content.append(i.snapshot==='before'?button(`${label} · L${i.line} ↗`,()=>showBaseline(i.source_path,i.line),'source-link'):sourceButton(i.source_path,i.line,i.line,label));
        });
        more.hidden=shown>=impacts.length;
      }
      group.addEventListener('toggle',()=>{if(group.open && !shown)appendBatch();});group.append(content,more);card.append(group);
    }else card.append(node('p','hint','两个快照中未找到指向此文档的可解析直接引用。'));
    wrap.append(card);
  }
  if(!list.length) wrap.append(blank('与基线相比，没有原文变化','你仍可调整分类与显示名。导入新版资料后，这里会列出变化。'));
  host.append(wrap);
}
function showBaseline(path,line=1) {
  const doc = project.baseline.find(d=>d.path===path);
  const lines=doc.content.split('\n'),start=Math.max(0,line-4),end=Math.min(lines.length,start+60),preview=node('div','source');
  lines.slice(start,end).forEach((text,i)=>{const row=node('div','source-line'+(start+i+1===line?' highlight':''));row.append(node('span','line-no',String(start+i+1)),node('span','line-text',text||' '));preview.append(row);});
  modal('基线中的文档',`${path} · 基线 L${start+1}–${end} / 共 ${lines.length} 行。完整内容可下载。`,[['下载此原文',()=>download(path.split('/').at(-1),doc.content,'text/plain')]], [preview]);
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
  lines.slice(offset,offset+100).forEach((text,i)=>{ const n=offset+i+1; const row=node('div','source-line'+(n>=selection.start && n<=selection.end?' highlight':''));const content=node('span','line-text');content.append(highlighted(text||' ')); row.append(node('span','line-no',String(n)),content); source.append(row); }); body.append(source);
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
  importController?.abort();const controller=new AbortController();importController=controller;
  const serial=++ioSerial,stamp=mutation;let reading=true;
  const progress=node('div','import-progress','准备读取…');progress.setAttribute('role','status');
  modal('正在读取资料','文件只在本机读取。完成预览并确认后，才会更新当前项目。',[],[progress]);
  const onClose=()=>{if(reading&&!$('modal').open)controller.abort();};$('modal').addEventListener('close',onClose);
  try {
    const {documents,skipped,skippedFiles}=await readDocuments(files,{signal:controller.signal,onProgress:(done,total,path)=>{progress.textContent=`已读取 ${done} / ${total} · ${path}`;}});
    reading=false;
    if(serial!==ioSerial||controller.signal.aborted)return;
    if(stamp!==mutation)throw new Error('读取期间当前项目已变化，请重新选择文件并预览。');
    const base=demo?emptyProject():project;
    const wrapper=node('div','import-preview'),label=node('label','field','导入方式'),mode=node('select');
    mode.setAttribute('aria-label','导入方式');
    for(const [value,text] of [['merge','合并新增 / 更新'],['replace','以本次文件替换资料集']]){const option=node('option','',text);option.value=value;mode.append(option);}
    label.append(mode);wrapper.append(label);
    const summary=node('div','notice'),list=node('div','preview-list'),ackLabel=node('label','removal-confirm'),ack=node('input');ack.type='checkbox';ackLabel.append(ack,document.createTextNode('我已核对移出列表'));
    wrapper.append(summary,list,ackLabel);let plan=null;
    const draw=()=>{
      plan=null;ack.checked=false;list.replaceChildren();ackLabel.hidden=true;
      try{
        plan=planImport(base,documents,mode.value==='replace');
        const counts=Object.fromEntries(['added','updated','removed','renamed'].map(kind=>[kind,plan.changes.filter(c=>c.kind===kind).length]));
        summary.textContent=`新增 ${counts.added} · 覆盖修改 ${counts.updated} · 移出 ${counts.removed} · 重命名 ${counts.renamed} · 内容未变 ${plan.unchanged.length} · 跳过 ${skipped}。确认后共 ${plan.next.documents.length} 篇。`;
        for(const c of plan.changes)list.append(node('div','preview-row',`${c.kind==='removed'?'移出':kindNames[c.kind]} · ${c.previous_path?c.previous_path+' → ':''}${c.path}`));
        for(const path of plan.unchanged)list.append(node('div','preview-row',`未变 · ${path}`));
        for(const path of skippedFiles)list.append(node('div','preview-row skipped',`跳过 · ${path}（仅支持 Markdown/TXT）`));
        ackLabel.hidden=counts.removed===0;
      }catch(error){summary.textContent=error.message;list.append(node('p','','可以尝试切换导入方式或减少文件数量。'));}
      const confirm=$('modal-actions').querySelector('.primary');if(confirm)confirm.disabled=!plan;
    };
    modal('导入预览',demo?'将用你选择的资料替换当前示例。请核对文件列表，源文件不会被修改。':'合并保留未选中的文档；完整替换会将未选中文档移出项目。所有变更可一步撤销，源文件不会被修改。',[
      ['确认导入',()=>{
        if(stamp!==mutation||serial!==ioSerial)throw new Error('预览已经过期，请重新导入。');
        if(!plan)throw new Error('请先解决预览中的问题');
        if(!ackLabel.hidden&&!ack.checked)throw new Error('请勾选确认，核对即将移出的文档。');
        let next=plan.next;
        if(demo||(!base.documents.length&&!base.baseline.length&&!base.preferences.length))next={...next,baseline:structuredClone(next.documents)};
        adopt(next);toast(`已导入 ${documents.length} 篇，跳过 ${skipped} 个不支持的文件。可在本机保存或下载备份。`);
      },'primary'],
    ],[wrapper]);mode.addEventListener('change',draw);draw();
  }catch(error){
    if(serial===ioSerial&&!controller.signal.aborted){reading=false;modal('导入未完成',`${error.message}\n当前资料未被修改，请修正后重新选择。`);fail(error);}
  }finally{reading=false;$('modal').removeEventListener('close',onClose);}
}
function download(name, text, type) {
  const url=URL.createObjectURL(new Blob([text],{type}));const link=node('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
async function save() {
  const snapshot=structuredClone(project),stamp=mutation;
  const text=await backupJSON(snapshot);
  download('MoonAtlas-project.json',text,'application/json');
  if(stamp===mutation)backupState={mutation:stamp,verified:false,time:new Date().toISOString()};
  renderSession();toast('已发起备份下载。请确认文件落盘，再点击“备份与恢复”选回文件验证。');
}
function showBackup(){
  const info=node('div','notice',backupState?.mutation===mutation?(backupState.verified?'当前项目的备份文件已验证一致。':'已发起下载，尚未验证文件是否完整落盘。'):'当前项目尚无已验证的备份。');
  const status=node('p','hint',draftStatus==='saved'&&draftRecord?`本机草稿保存于 ${new Date(draftRecord.updatedAt).toLocaleString()}`:'本机草稿与下载备份相互独立。');
  modal('备份与恢复','备份包含原文、基线、分类、归并和处理记录。选回文件后校验内容并尝试重建项目；验证不会替换当前资料。校验值检测意外损坏，不是来源真实性证明。',[
    ['下载完整备份',async()=>{await save();showBackup();return false;},'primary'],
    ['选回文件验证',()=>{$('verify-input').click();return false;}],
    ['打开备份恢复',()=>{pendingSwitch=null;$('project-input').click();}],
  ],[info,status]);
}
async function readProjectFile(file){
  if(file.size>30000000)throw new Error('项目文件过大，最多 30 MB');
  let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer());}catch{throw new Error(`${file.name} 不是有效 UTF-8 项目文件`);}
  return readBackup(text);
}
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
    ['整理报告 · 含备注',()=>download('MoonAtlas-maintenance.md',maintenanceReport(project,healthCache,impactCache),'text/markdown')],
    ['交互 HTML · 含原文',exportStandalone,'primary'],
  ]);
}
document.querySelectorAll('.nav').forEach(b=>b.addEventListener('click',()=>{homeVisible=false;view=b.dataset.view;selectedDocuments.clear();selectedChecks.clear();render();}));
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
$('search').addEventListener('input',e=>{query=e.target.value.toLocaleLowerCase().trim();selectedDocuments.clear();selectedChecks.clear();renderView();renderDetail();});
$('import-files').addEventListener('click',()=>$('files-input').click());
$('import-folder').addEventListener('click',()=>$('folder-input').click());
for(const id of ['files-input','folder-input'])$(id).addEventListener('change',async e=>{const selected=Array.from(e.target.files);e.target.value='';await importFiles(selected);});
$('open-project').addEventListener('click',()=>$('project-input').click());
$('project-input').addEventListener('change',async e=>{
  const f=e.target.files[0];e.target.value='';if(!f)return;
  const serial=++ioSerial,stamp=mutation;
  try{
    const result=await readProjectFile(f);if(serial!==ioSerial)return;if(stamp!==mutation)throw new Error('读取期间项目已变化，请重新打开备份。');
    const same=canonicalProject(result.project)===canonicalProject(project);
    const apply=()=>{selection=null;expanded.clear();adopt(result.project,{changed:false,reset:true});backupState={mutation,verified:true,time:new Date().toISOString()};renderSession();toast(result.verified?'备份校验通过，项目已恢复':'旧版项目已校验并恢复；建议下载新版带校验值的备份');};
    if(same)apply();else guardUnsaved(apply);
  }catch(error){modal('项目未恢复',`${error.message}\n当前项目保持不变，可选择其他备份或取消继续工作。`,[['重新选择备份',()=>$('project-input').click()]]);fail(error);}
});
$('verify-input').addEventListener('change',async e=>{
  const f=e.target.files[0];e.target.value='';if(!f)return;const stamp=mutation,serial=++ioSerial;
  try{
    const result=await readProjectFile(f);if(serial!==ioSerial)return;if(stamp!==mutation)throw new Error('验证期间项目已变化，请重新验证。');
    const same=canonicalProject(result.project)===canonicalProject(project);
    if(same){backupState={mutation,verified:true,time:new Date().toISOString()};dirty=false;$('save-project').textContent='保存项目';renderSession();}
    if(same&&pendingSwitch?.mutation===mutation){const action=pendingSwitch.action;pendingSwitch=null;$('modal').close();action();return;}
    pendingSwitch=null;
    modal(same?'备份验证通过':'文件可恢复，但与当前项目不同',`${result.verified?'校验值一致，项目重建成功。':'旧版文件不含校验值，结构校验和项目重建成功。'}\n${result.project.documents.length} 篇文档，${result.project.preferences.length} 条分类，${result.project.reviews.length} 条处理记录。\n${same?'文件与当前项目的原文、基线和整理记录一致。':'当前项目未被替换，也未标记为已备份。请下载当前项目再验证。'}`);
  }catch(error){pendingSwitch=null;modal('备份验证未通过',`${error.message}\n当前项目保持不变。请检查是否选错文件，或重新下载备份。`);fail(error);}
});
$('save-project').addEventListener('click',()=>save().catch(fail));$('export-menu').addEventListener('click',showExport);
$('backup-center').addEventListener('click',()=>{pendingSwitch=null;showBackup();});
$('modal').addEventListener('cancel',()=>{pendingSwitch=null;});
$('show-home').addEventListener('click',()=>{homeVisible=true;render();});
$('start-import').addEventListener('click',()=>$('files-input').click());
$('start-open').addEventListener('click',()=>$('project-input').click());
$('start-demo').addEventListener('click',()=>guardUnsaved(loadDemo));
$('start-continue').addEventListener('click',async()=>{
  if(project.documents.length){homeVisible=false;render();return;}
  try{const record=await store.read();if(record)offerDraft(record);else modal('继续上次整理','这一路径下没有本机草稿。可以选择之前下载的项目 JSON 恢复。',[['打开项目备份',()=>$('project-input').click()]]);}catch(error){fail(error);}
});
$('guide-search').addEventListener('click',()=>{homeVisible=false;view='map';selectedDocuments.clear();selectedChecks.clear();render();$('search').focus();});
$('guide-organize').addEventListener('click',()=>{view='organize';render();});
$('guide-backup').addEventListener('click',()=>showBackup());
$('load-demo').addEventListener('click',()=>guardUnsaved(loadDemo));
$('load-maintenance-demo').addEventListener('click',()=>guardUnsaved(()=>{
  selection=null;expanded.clear();view='organize';healthFilter='pending';healthKind='all';
  adopt(maintenanceSample(),{sample:true,changed:false,reset:true});
  toast('已载入虚构演示：先完成体检，再查看更新记录中的引用与章节差异');
}));
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
  if(seed && seed!=='null')adopt(parseProject(seed),{changed:false,reset:true});else {adopt(emptyProject(),{changed:false,reset:true});homeVisible=true;render();}
  checkDraftAtStartup();
}catch(error){adopt(emptyProject(),{changed:false});fail(error);}
