import {test,expect} from '@playwright/test';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {readFile} from 'node:fs/promises';
const app=pathToFileURL(fileURLToPath(new URL('../../dist/MoonAtlas.html',import.meta.url))).href;
const fixture=(name,text)=>({name,mimeType:'text/plain',buffer:Buffer.from(text)});
test.beforeEach(async({page,context})=>{await context.setOffline(true);await page.goto(app);});

test('offline map, outline and exact line evidence work without network',async({page})=>{
  const remote=[];page.on('request',r=>{if(/^https?:/.test(r.url()))remote.push(r.url());});
  await expect(page.locator('.doc-node')).toHaveCount(8);
  await page.getByRole('button',{name:'展开 发布流程 的标题',exact:true}).click();
  await page.locator('.outline button').filter({hasText:'回滚'}).click();
  await expect(page.locator('#detail .highlight')).toContainText(['## 回滚','当错误率持续升高']);
  await expect(page.locator('#detail .path')).toHaveText('工程手册/发布流程.md');
  expect(remote).toEqual([]);
  await page.screenshot({path:'test-results/desktop-map.png',fullPage:true});
});
test('classification and exact source survive save and reopen',async({page})=>{
  await page.locator('#files-input').setInputFiles(fixture('notes.md','# Reading\n## Evidence\nLiteral content'));
  await page.locator('.doc-open').click();
  await page.getByLabel('所属主题').fill('我的阅读');await page.getByLabel('显示名称').fill('整理后的标题');
  await page.getByRole('button',{name:'保存整理',exact:true}).click();
  await expect(page.locator('.topic-label')).toContainText('我的阅读');
  const downloaded=page.waitForEvent('download');await page.locator('#save-project').click();const download=await downloaded;
  const file=await download.path(); const saved=JSON.parse(await readFile(file,'utf8'));
  expect(saved.documents[0].content).toContain('# Reading');expect(saved.preferences[0].title).toBe('整理后的标题');
  await page.locator('#new-project').click();await expect(page.locator('.doc-node')).toHaveCount(0);
  await page.locator('#project-input').setInputFiles(file);
  await expect(page.locator('.doc-open')).toContainText('整理后的标题');
});
test('snapshot replacement recognizes rename and keeps classification',async({page})=>{
  await page.locator('#files-input').setInputFiles(fixture('old.md','# Same\nBody'));
  await page.locator('.doc-open').click();await page.getByLabel('所属主题').fill('自定义主题');await page.getByRole('button',{name:'保存整理',exact:true}).click();
  await page.locator('#files-input').setInputFiles(fixture('new.md','# Same\nBody'));
  await page.getByRole('button',{name:'以本次文件替换资料集',exact:true}).click();
  await expect(page.locator('.topic-label')).toContainText('自定义主题');
  await page.locator('[data-view="changes"]').click();
  await expect(page.locator('.change-kind')).toHaveText('重命名');
  await expect(page.locator('#view-content')).toContainText('old.md → new.md');
});
test('explicit aliases add cross-document concept and show both sources',async({page})=>{
  await page.locator('[data-view="concepts"]').click();
  await page.getByRole('button',{name:'＋ 确认概念名称归并',exact:true}).click();
  await page.getByLabel('原文中的名称，例如 B-tree').fill('B-tree');await page.getByLabel('统一显示为，例如 B树').fill('B树');
  await page.getByRole('button',{name:'保存归并规则',exact:true}).click();
  const card=page.locator('.card').filter({has:page.getByRole('heading',{name:'B树',exact:true})});
  await expect(card.locator('.source-link')).toHaveCount(2);
  await card.locator('.source-link').first().click();await expect(page.locator('#detail .source')).toContainText('B-tree');
});
test('offline HTML export reopens hostile source as literal text',async({page,context})=>{
  const text='# <img src=x onerror="globalThis.pwned=true">\n</script><script>globalThis.pwned=true</script>';
  await page.locator('#files-input').setInputFiles(fixture('unsafe.md',text));
  await page.locator('#export-menu').click();
  const pending=page.waitForEvent('download');await page.getByRole('button',{name:'交互 HTML · 含原文',exact:true}).click();const download=await pending;
  const saved='test-results/shared.html';await download.saveAs(saved);
  const shared=await context.newPage();await context.setOffline(true);await shared.goto(pathToFileURL(fileURLToPath(new URL('../../'+saved,import.meta.url))).href);
  await expect(shared.locator('.doc-node')).toHaveCount(1);await shared.locator('.doc-open').click();
  await expect(shared.locator('#detail .source')).toContainText('</script>');
  expect(await shared.evaluate(()=>globalThis.pwned)).toBeUndefined();
  await expect(shared.locator('#detail img')).toHaveCount(0);
});
test('invalid project and invalid UTF8 leave existing knowledge base intact',async({page})=>{
  await page.locator('#project-input').setInputFiles(fixture('bad.json','{"format":"moonatlas","version":9}'));
  await expect(page.locator('#toast')).toContainText('不是受支持');await expect(page.locator('.doc-node')).toHaveCount(8);
  await page.locator('#files-input').setInputFiles({name:'bad.md',mimeType:'text/plain',buffer:Buffer.from([0xff])});
  await expect(page.locator('#toast')).toContainText('不是有效 UTF-8');await expect(page.locator('.doc-node')).toHaveCount(8);
});
test('updating a selected heading relocates evidence by stable section identity',async({page})=>{
  await page.locator('#files-input').setInputFiles(fixture('note.md','# Title\n## Stable\nOriginal'));
  await page.getByRole('button',{name:'展开 Title 的标题',exact:true}).click();
  await page.locator('.outline button').filter({hasText:'Stable'}).click();
  await page.locator('#files-input').setInputFiles(fixture('note.md','New preface\n# Title\n## Stable\nUpdated'));
  await page.getByRole('button',{name:'合并新增 / 更新',exact:true}).click();
  await expect(page.locator('#detail .highlight').first()).toContainText('3');
  await expect(page.locator('#detail .highlight')).toContainText(['## Stable','Updated']);
});
test('SVG overview is valid XML and contains no scripts',async({page})=>{
  await page.locator('#export-menu').click();
  const pending=page.waitForEvent('download');await page.getByRole('button',{name:'SVG 总览图',exact:true}).click();
  const download=await pending;const svg=await readFile(await download.path(),'utf8');
  const result=await page.evaluate(svg=>{const doc=new DOMParser().parseFromString(svg,'image/svg+xml');return {errors:doc.querySelectorAll('parsererror').length,scripts:doc.querySelectorAll('script').length,rects:doc.querySelectorAll('rect').length};},svg);
  expect(result.errors).toBe(0);expect(result.scripts).toBe(0);expect(result.rects).toBeGreaterThan(8);
});
test('search filters full original text and mobile has no horizontal overflow',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.locator('#search').fill('连接池配置');await expect(page.locator('.doc-node')).toHaveCount(1);
  await expect(page.locator('.doc-open')).toContainText('演示事故复盘');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({path:'test-results/mobile-map.png',fullPage:true});
});
