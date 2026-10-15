import {importFiles} from './helpers.mjs';
import {test,expect} from '@playwright/test';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {readFile} from 'node:fs/promises';
const app=pathToFileURL(fileURLToPath(new URL('../../dist/MoonAtlas.html',import.meta.url))).href;
const fixture=(name,text)=>({name,mimeType:'text/plain',buffer:Buffer.from(text)});
test.beforeEach(async({page,context})=>{await context.setOffline(true);await page.goto(app);await page.locator('#start-demo').click();});

test('v0.1 project roundtrip stays compatible and undo history stays out of exports',async({page})=>{
  const legacy=await readFile(new URL('../fixtures/v01-project.json',import.meta.url),'utf8');
  await page.locator('#project-input').setInputFiles(fixture('legacy.json',legacy));
  await page.locator('.doc-open').first().click();await page.getByLabel('显示名称').fill('New name');await page.getByRole('button',{name:'保存整理',exact:true}).click();
  await expect(page.locator('#undo')).toBeEnabled();
  const pending=page.waitForEvent('download');await page.locator('#save-project').click();const saved=JSON.parse(await readFile(await (await pending).path(),'utf8'));
  expect(saved.version).toBe(1);expect(saved).not.toHaveProperty('history');expect(saved).not.toHaveProperty('draft');expect(saved.documents).toEqual(JSON.parse(legacy).documents);
});

test('long chapter diff can reach evidence beyond the first page',async({page})=>{
  const before='# Heading\n'+Array.from({length:140},(_,i)=>`line ${i}`).join('\n');
  const after=before.replace('line 130','changed at line 130');
  await importFiles(page,fixture('long.md',before));await importFiles(page,fixture('long.md',after));
  await page.locator('[data-view="changes"]').click();await page.getByRole('button',{name:'查看章节变化 · 1 处',exact:true}).click();
  await expect(page.locator('#toast')).not.toContainText('跳过 -');
  const pane=page.locator('.diff-pane.after');await pane.getByRole('button',{name:'下一页',exact:true}).click();await pane.getByRole('button',{name:'下一页',exact:true}).click();
  await expect(pane).toContainText('changed at line 130');await expect(page.locator('.diff-pane.before')).not.toContainText('changed at line 130');
});

test('shared HTML carries no auto-save opt-in and keeps its own local draft recoverable',async({page,context})=>{
  await importFiles(page,fixture('share.md','# Original'));
  await page.locator('#export-menu').click();const pending=page.waitForEvent('download');await page.getByRole('button',{name:'交互 HTML · 含原文',exact:true}).click();
  const downloaded=await pending;const file='test-results/recovery-share.html';await downloaded.saveAs(file);
  const shared=await context.newPage();await shared.goto(pathToFileURL(fileURLToPath(new URL('../../'+file,import.meta.url))).href);
  await expect(shared.locator('#local-save')).toHaveText('本机自动保存：未开启');
  await shared.locator('#local-save').click();await shared.getByRole('button',{name:'开启本机自动保存',exact:true}).click();await expect(shared.locator('#local-save')).toHaveText('已保存到本机 ✓');
  await shared.locator('.doc-open').click();await shared.getByLabel('显示名称').fill('Edited share');await shared.getByRole('button',{name:'保存整理',exact:true}).click();await expect(shared.locator('#local-save')).toHaveText('已保存到本机 ✓');
  await shared.reload();await shared.getByRole('button',{name:'恢复并继续自动保存',exact:true}).click();await expect(shared.locator('.doc-open')).toContainText('Edited share');
});
