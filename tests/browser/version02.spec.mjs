import {importFiles} from './helpers.mjs';
import {test,expect} from '@playwright/test';
import {fileURLToPath,pathToFileURL} from 'node:url';
const app=pathToFileURL(fileURLToPath(new URL('../../dist/MoonAtlas.html',import.meta.url))).href;
const fixture=(name,text)=>({name,mimeType:'text/plain',buffer:Buffer.from(text)});
async function importNote(page,text='# Title\n## Chapter\nold'){
  await importFiles(page,fixture('note.md',text));
}
async function enableSave(page){
  await page.locator('#local-save').click();await page.getByRole('button',{name:'开启本机自动保存',exact:true}).click();
  await expect(page.locator('#local-save')).toHaveText('已保存到本机 ✓');
  await expect(page.locator('#modal')).not.toBeVisible();
}
async function rename(page,name){
  await page.locator('.doc-open').first().click();await page.getByLabel('显示名称').fill(name);await page.getByRole('button',{name:'保存整理',exact:true}).click();
}
test.beforeEach(async({page,context})=>{await context.setOffline(true);await page.goto(app);await page.locator('#start-demo').click();});

test('classification, removal and baseline changes can be undone and redone',async({page})=>{
  await importNote(page);await rename(page,'My title');
  await page.locator('#undo').click();await expect(page.locator('.doc-open')).toContainText('Title');
  await page.locator('#redo').click();await expect(page.locator('.doc-open')).toContainText('My title');
  await page.getByRole('button',{name:'移出资料集',exact:true}).click();await page.getByRole('button',{name:'移出',exact:true}).click();
  await expect(page.locator('.doc-node')).toHaveCount(0);await page.locator('#undo').click();await expect(page.locator('.doc-open')).toContainText('My title');
  await importFiles(page,fixture('note.md','# Title\n## Chapter\nnew'));
  await page.locator('[data-view="changes"]').click();
  await expect(page.locator('#change-count')).toHaveText('1');await page.getByRole('button',{name:'将当前资料设为基线',exact:true}).click();await page.getByRole('button',{name:'设为新基线',exact:true}).click();
  await expect(page.locator('#change-count')).toHaveText('0');await page.locator('#undo').click();await expect(page.locator('#change-count')).toHaveText('1');
});

test('local persistence is opt-in and restores exact choices after reload',async({page})=>{
  await importNote(page);await rename(page,'Saved title');
  const count=await page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('moonatlas-local',1);r.onsuccess=()=>{const db=r.result;const q=db.transaction('drafts').objectStore('drafts').count();q.onsuccess=()=>{resolve(q.result);db.close();};};r.onerror=reject;}));expect(count).toBe(0);
  await enableSave(page);await rename(page,'Saved again');await expect(page.locator('#local-save')).toHaveText('已保存到本机 ✓');
  await page.reload();await expect(page.getByRole('heading',{name:'发现上次的本机草稿'})).toBeVisible();
  await page.getByRole('button',{name:'恢复并继续自动保存',exact:true}).click();
  await expect(page.locator('.doc-open')).toContainText('Saved again');await expect(page.locator('#undo')).toBeDisabled();
  await expect(page.locator('#local-save')).toHaveText('已保存到本机 ✓');
  await page.screenshot({path:'test-results/v02-autosave.png',fullPage:true});
});

test('clearing local draft does not clear current project or recreate the draft',async({page})=>{
  await importNote(page);await enableSave(page);await rename(page,'To clear');
  await expect(page.locator('#local-save')).toHaveText('已保存到本机 ✓');await page.locator('#local-save').click();await page.getByRole('button',{name:'清除本机草稿',exact:true}).click();
  await expect(page.locator('.doc-open')).toContainText('To clear');await expect(page.locator('#local-save')).toHaveText('本机自动保存：未开启');
  page.on('dialog',d=>d.accept());await page.reload();await expect(page.locator('#welcome')).toBeVisible();await expect(page.locator('#modal')).not.toBeVisible();
});

test('another tab cannot silently overwrite a newer local draft',async({page,context})=>{
  await importNote(page);await enableSave(page);
  const other=await context.newPage();await other.goto(app);await other.getByRole('button',{name:'恢复并继续自动保存',exact:true}).click();
  await expect(other.locator('#local-save')).toHaveText('已保存到本机 ✓');await rename(other,'Other tab title');await expect(other.locator('#local-save')).toHaveText('已保存到本机 ✓');
  await rename(page,'This tab title');await expect(page.locator('#local-save')).toHaveText('本机保存已暂停 · 查看');
  await expect(page.locator('.doc-open')).toContainText('This tab title');
  const third=await context.newPage();await third.goto(app);await third.getByRole('button',{name:'恢复并继续自动保存',exact:true}).click();await expect(third.locator('.doc-open')).toContainText('Other tab title');
});

test('quota failure pauses autosave and keeps the current project usable',async({page})=>{
  await importNote(page);
  await page.evaluate(()=>{IDBObjectStore.prototype.put=function(){throw new DOMException('test quota','QuotaExceededError');};});
  await page.locator('#local-save').click();await page.getByRole('button',{name:'开启本机自动保存',exact:true}).click();
  await expect(page.locator('#local-save')).toHaveText('本机保存已暂停 · 查看');await expect(page.locator('#toast')).toContainText('保存失败');
  await page.getByRole('button',{name:'取消',exact:true}).click();await expect(page.locator('.doc-node')).toHaveCount(1);
});

test('map supports zoom, pan, topic focus, folding and source-backed reference lines',async({page})=>{
  await page.getByRole('button',{name:'放大地图',exact:true}).click();await expect(page.locator('.zoom-value')).toHaveText('115%');
  const viewport=page.locator('.map-viewport');await viewport.focus();await page.keyboard.press('ArrowDown');
  expect(await viewport.evaluate(n=>n.scrollTop)).toBeGreaterThan(0);
  const topic=page.locator('.branch').filter({has:page.locator('.topic-label span').filter({hasText:'工程手册'})}).first();
  await topic.getByRole('button',{name:'聚焦',exact:true}).click();await expect(page.locator('.topic-label')).toHaveCount(1);
  await expect(page.locator('.reference-edges path').first()).toBeVisible();await page.locator('.reference-edges path').first().focus();await page.keyboard.press('Enter');
  await expect(page.locator('#detail .path')).not.toBeEmpty();
  await page.getByRole('button',{name:'折叠主题 工程手册',exact:true}).click();await expect(page.locator('.doc-list')).toBeHidden();await expect(page.locator('.reference-edges path')).toHaveCount(0);
  await page.getByRole('button',{name:'展开主题 工程手册',exact:true}).click();await page.getByRole('button',{name:'退出聚焦',exact:true}).click();await expect(page.locator('.topic-label')).toHaveCount(5);
  await page.getByRole('button',{name:'适合宽度',exact:true}).click();await page.screenshot({path:'test-results/v02-map.png',fullPage:true});
});

test('chapter comparison shows before and after, additions and removals',async({page})=>{
  await importNote(page,'# Title\n## Chapter\nold text\n## Gone\nremoved');
  await importFiles(page,fixture('note.md','# Title\n## Chapter\nnew text\n## Added\nnew section'));
  await page.locator('[data-view="changes"]').click();
  await page.getByRole('button',{name:'查看章节变化 · 3 处',exact:true}).click();
  await expect(page.locator('.diff-pane.before')).toContainText('old text');await expect(page.locator('.diff-pane.after')).toContainText('new text');
  await page.screenshot({path:'test-results/v02-section-diff.png',fullPage:true});
  await page.getByLabel('选择变化章节').selectOption({label:'移除 · Gone'});await expect(page.locator('.diff-pane.after')).toContainText('当前已移除此章节');
  await page.getByLabel('选择变化章节').selectOption({label:'新增 · Added'});await expect(page.locator('.diff-pane.before')).toContainText('原先没有这个章节');
  await page.getByRole('button',{name:'定位当前原文',exact:true}).click();await expect(page.locator('#detail .highlight')).toContainText(['## Added','new section']);
});

test('mobile comparison and map controls remain inside viewport',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'适合宽度',exact:true}).click();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await importNote(page);await importFiles(page,fixture('note.md','# Title\n## Chapter\nnew'));
  await page.locator('[data-view="changes"]').click();await page.getByRole('button',{name:'查看章节变化 · 1 处',exact:true}).click();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'test-results/v02-mobile-diff.png',fullPage:true});
});
