import {test,expect} from '@playwright/test';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {readFile} from 'node:fs/promises';
import {importFiles} from './helpers.mjs';
const app=pathToFileURL(fileURLToPath(new URL('../../dist/MoonAtlas.html',import.meta.url))).href;
const file=(name,text)=>({name,mimeType:'text/plain',buffer:Buffer.from(text)});
test.beforeEach(async({page,context})=>{await context.setOffline(true);await page.goto(app);});

test('new users choose a clear entry without loading example documents or writing a draft',async({page})=>{
  await expect(page.locator('#welcome')).toBeVisible();await expect(page.locator('.doc-node')).toHaveCount(0);
  await page.locator('#start-continue').click();await expect(page.locator('#modal')).toContainText('没有本机草稿');await page.getByRole('button',{name:'取消',exact:true}).click();
  await page.screenshot({path:'test-results/v10-welcome.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'test-results/v10-mobile-home.png',fullPage:true});
  await page.locator('#start-demo').click();await expect(page.locator('.doc-node')).toHaveCount(8);await expect(page.locator('#getting-started')).toBeVisible();
});

test('import previews add overwrite removal and skipped files and cancellation preserves data',async({page})=>{
  await importFiles(page,[file('a.md','# Old'),file('b.md','# Keep')]);
  await page.locator('#files-input').setInputFiles([file('a.md','# New'),file('c.md','# Added'),file('scan.pdf','fake PDF')]);
  await expect(page.locator('.import-preview')).toContainText('覆盖修改 1');await expect(page.locator('.import-preview')).toContainText('跳过 1');await expect(page.locator('.preview-list')).toContainText('scan.pdf');
  await page.getByLabel('导入方式',{exact:true}).selectOption('replace');await expect(page.locator('.preview-list')).toContainText('移出 · b.md');
  await page.getByRole('button',{name:'确认导入',exact:true}).click();await expect(page.locator('#modal')).toBeVisible();await expect(page.locator('.doc-node')).toHaveCount(2);
  await page.screenshot({path:'test-results/v10-import.png',fullPage:true});
  await page.getByRole('button',{name:'取消',exact:true}).click();await expect(page.locator('.doc-open').filter({hasText:'Old'})).toHaveCount(1);
  await importFiles(page,[file('a.md','# New'),file('c.md','# Added')],'replace');await expect(page.locator('.doc-open').filter({hasText:'Keep'})).toHaveCount(0);
  await page.locator('#undo').click();await expect(page.locator('.doc-open').filter({hasText:'Keep'})).toHaveCount(1);
});

test('search reveals long source matches and expands a previously folded topic',async({page})=>{
  const body='# Target\n## Section\n'+'ordinary\n'.repeat(120)+'🙂 Evidence <script>literal</script>';
  await importFiles(page,[file('a.md',body),file('b.md','# Other')]);
  await page.getByRole('button',{name:'折叠主题 未分类',exact:true}).click();
  await page.locator('[data-view="organize"]').click();await page.locator('#guide-search').click();await expect(page.locator('#search')).toBeFocused();
  await page.locator('#search').fill('Evidence');await expect(page.locator('.search-result')).toContainText('L123');await page.locator('.search-result').click();
  await expect(page.locator('.doc-node.selected .outline')).toBeVisible();await expect(page.locator('#detail .highlight')).toContainText('Evidence');await expect(page.locator('#detail mark')).toContainText('Evidence');await expect(page.locator('#detail script')).toHaveCount(0);
  await page.screenshot({path:'test-results/v10-search.png',fullPage:true});
});

test('batch classification and review apply atomically and undo in one step',async({page})=>{
  await importFiles(page,[file('a.md','# A'),file('b.md','# B'),file('c.md','# C')]);
  await page.getByRole('button',{name:'批量分类',exact:true}).click();await page.getByLabel('选择文档 a.md',{exact:true}).check();await page.getByLabel('选择文档 b.md',{exact:true}).check();
  await page.getByRole('button',{name:'设置共同主题',exact:true}).click();await page.getByLabel('共同主题',{exact:true}).fill('阅读');await page.getByRole('button',{name:'确认批量分类',exact:true}).click();
  await expect(page.locator('.branch').filter({hasText:'阅读'}).locator('.doc-node')).toHaveCount(2);await page.locator('#undo').click();await expect(page.locator('.topic-label')).toHaveCount(1);
  await page.locator('[data-view="organize"]').click();await page.getByRole('button',{name:'选择本页任务',exact:true}).click();await page.getByRole('button',{name:'批量忽略',exact:true}).click();await page.getByRole('button',{name:'确认批量处理',exact:true}).click();await expect(page.locator('#toast')).toContainText('共同忽略原因');
  await page.getByLabel('共同忽略原因（必填）').fill('保留独立笔记');await page.getByRole('button',{name:'确认批量处理',exact:true}).click();await expect(page.locator('.health-card')).toHaveCount(0);await page.locator('#undo').click();await expect(page.locator('.health-card')).toHaveCount(3);
});

test('backup verification detects corruption and never marks a different project as backed up',async({page})=>{
  await importFiles(page,file('note.md','# Original'));
  const pending=page.waitForEvent('download');await page.locator('#save-project').click();const text=await readFile(await (await pending).path(),'utf8');
  await expect(page.locator('#save-status')).toContainText('待选回文件验证');
  const corrupt=JSON.parse(text);corrupt.documents[0].content='# Corrupted';await page.locator('#verify-input').setInputFiles(file('bad.json',JSON.stringify(corrupt)));await expect(page.locator('#modal')).toContainText('不一致');await expect(page.locator('.doc-open')).toContainText('Original');
  await page.getByRole('button',{name:'取消',exact:true}).click();await importFiles(page,file('note.md','# Updated'));
  await page.locator('#verify-input').setInputFiles(file('old.json',text));await expect(page.locator('#modal')).toContainText('与当前项目不同');await expect(page.locator('#save-status')).toContainText('需要备份');
  await page.getByRole('button',{name:'取消',exact:true}).click();
  const newPending=page.waitForEvent('download');await page.locator('#save-project').click();const fresh=await readFile(await (await newPending).path(),'utf8');await page.locator('#verify-input').setInputFiles(file('new.json',fresh));await expect(page.getByRole('heading',{name:'备份验证通过',exact:true})).toBeVisible();await expect(page.locator('#save-status')).toContainText('已验证备份');
  await page.screenshot({path:'test-results/v10-backup.png',fullPage:true});
});

test('switch waits for verified backup and old v1 projects restore without a checksum',async({page})=>{
  await importFiles(page,file('note.md','# My work'));await page.locator('#new-project').click();const pending=page.waitForEvent('download');await page.getByRole('button',{name:'备份并验证后继续',exact:true}).click();const text=await readFile(await (await pending).path(),'utf8');
  await expect(page.locator('.doc-node')).toHaveCount(1);await page.locator('#verify-input').setInputFiles(file('backup.json',text));await expect(page.locator('.doc-node')).toHaveCount(0);
  const old=await readFile(new URL('../fixtures/v01-project.json',import.meta.url),'utf8');await page.locator('#project-input').setInputFiles(file('legacy.json',old));await expect(page.locator('#toast')).toContainText('旧版项目');await expect(page.locator('.doc-node')).not.toHaveCount(0);
  await importFiles(page,file('extra.md','# Keep after cancellation'));await page.locator('#new-project').click();
  const cancelledDownload=page.waitForEvent('download');await page.getByRole('button',{name:'备份并验证后继续',exact:true}).click();const cancelledText=await readFile(await (await cancelledDownload).path(),'utf8');
  await page.keyboard.press('Escape');await page.locator('#verify-input').setInputFiles(file('cancelled.json',cancelledText));await expect(page.getByRole('heading',{name:'备份验证通过',exact:true})).toBeVisible();await expect(page.locator('.doc-open').filter({hasText:'Keep after cancellation'})).toHaveCount(1);
});

test('cancel during reading stops import and malformed recovery keeps the workspace usable',async({page})=>{
  await page.evaluate(()=>{const original=File.prototype.arrayBuffer;File.prototype.arrayBuffer=async function(){await new Promise(r=>setTimeout(r,300));return original.call(this);};});
  await page.locator('#files-input').setInputFiles(file('a.md','# A'));await expect(page.getByRole('heading',{name:'正在读取资料',exact:true})).toBeVisible();await page.getByRole('button',{name:'取消',exact:true}).click();
  await expect(page.locator('#welcome')).toBeVisible();await importFiles(page,file('b.md','# B'));await expect(page.locator('.doc-node')).toHaveCount(1);
  await page.locator('#project-input').setInputFiles(file('bad.json','{'));await expect(page.getByRole('heading',{name:'项目未恢复',exact:true})).toBeVisible();await expect(page.locator('.doc-open')).toContainText('B');
});
