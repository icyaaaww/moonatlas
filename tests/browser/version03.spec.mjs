import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
const app=pathToFileURL(fileURLToPath(new URL('../../dist/MoonAtlas.html',import.meta.url))).href;
const file=(name,text)=>({name,mimeType:'text/plain',buffer:Buffer.from(text)});
test.beforeEach(async({page,context})=>{await context.setOffline(true);await page.goto(app);});

test('maintenance demo exposes all three workflows and local draft retains review notes',async({page})=>{
  await page.locator('#load-maintenance-demo').click();await expect(page.locator('.health-card')).toHaveCount(3);
  const card=page.locator('.health-card[data-kind="link"]');await card.getByRole('button',{name:'忽略并备注',exact:true}).click();await page.getByLabel('忽略原因（必填）').fill('等待补齐资料');await page.getByRole('button',{name:'保存处理记录',exact:true}).click();
  await page.locator('#local-save').click();await page.getByRole('button',{name:'开启本机自动保存',exact:true}).click();await expect(page.locator('#local-save')).toHaveText('已保存到本机 ✓');
  await page.reload();await page.getByRole('button',{name:'恢复并继续自动保存',exact:true}).click();await page.locator('[data-view="organize"]').click();await page.getByRole('button',{name:'已忽略 1',exact:true}).click();await expect(card).toContainText('等待补齐资料');
  await page.locator('[data-view="changes"]').click();await expect(page.locator('.impact-list')).toHaveCount(2);await page.getByRole('button',{name:'查看章节变化 · 2 处',exact:true}).click();await expect(page.locator('.diff-added')).toContainText('确认测试和备份验证通过');
});

test('review status needs an ignore reason and survives download, reopen and undo',async({page})=>{
  await page.locator('#files-input').setInputFiles(file('note.md','# A\n[missing](gone.md)'));
  await page.locator('[data-view="organize"]').click();
  const card=page.locator('.health-card[data-kind="link"]');
  await card.getByRole('button',{name:'忽略并备注',exact:true}).click();
  await page.getByRole('button',{name:'保存处理记录',exact:true}).click();
  await expect(page.locator('#modal')).toBeVisible();await expect(page.locator('#toast')).toContainText('请填写忽略原因');
  await page.getByLabel('忽略原因（必填）').fill('该资料暂未导入 <script>unsafe</script>');
  await page.getByRole('button',{name:'保存处理记录',exact:true}).click();await expect(card).toHaveCount(0);
  await page.getByRole('button',{name:'已忽略 1',exact:true}).click();await expect(card).toContainText('暂未导入');
  const pending=page.waitForEvent('download');await page.locator('#save-project').click();const saved=await readFile(await (await pending).path(),'utf8');
  await page.locator('#project-input').setInputFiles(file('saved.json',saved));await expect(card).toContainText('<script>unsafe</script>');
  await card.getByRole('button',{name:'重新待处理',exact:true}).click();await expect(card).toHaveCount(0);
  await page.locator('#undo').click();await expect(card).toContainText('暂未导入');await page.locator('#redo').click();await expect(card).toHaveCount(0);
});

test('source update reopens a reviewed finding and a real fix removes it',async({page})=>{
  await page.locator('#files-input').setInputFiles(file('note.md','# A\n[x](gone.md)'));
  await page.locator('[data-view="organize"]').click();
  const card=page.locator('.health-card[data-kind="link"]');await card.getByRole('button',{name:'标记已处理',exact:true}).click();
  await page.getByLabel('处理备注（可选）').fill('已向维护者核对');await page.getByRole('button',{name:'保存处理记录',exact:true}).click();
  await page.locator('#files-input').setInputFiles(file('note.md','# A\n[x](gone.md)\nUpdated'));
  await page.getByRole('button',{name:'合并新增 / 更新',exact:true}).click();await expect(card).toContainText('原文已变化');await expect(card).toContainText('已向维护者核对');
  await page.screenshot({path:'test-results/v03-health.png',fullPage:true});
  await page.locator('#files-input').setInputFiles(file('gone.md','# Imported'));
  await page.getByRole('button',{name:'合并新增 / 更新',exact:true}).click();await expect(card).toHaveCount(0);
});

test('removed target points to baseline source at its actual line beyond initial preview',async({page})=>{
  const source='# Reader\n'+'padding text\n'.repeat(500)+'[target](target.md)';
  await page.locator('#files-input').setInputFiles([file('ref.md',source),file('target.md','# Target')]);
  await page.locator('#files-input').setInputFiles(file('ref.md',source));await page.getByRole('button',{name:'以本次文件替换资料集',exact:true}).click();
  await page.locator('[data-view="changes"]').click();await page.locator('.impact-list summary').click();
  await page.getByRole('button',{name:'基线 · ref.md · L502 ↗',exact:true}).click();
  await expect(page.locator('#modal .highlight')).toContainText('[target](target.md)');await expect(page.locator('#modal')).toContainText('L499');
  await page.getByRole('button',{name:'取消',exact:true}).click();
  await page.screenshot({path:'test-results/v03-impact.png',fullPage:true});
});

test('next line change crosses pages and keeps literal text safely highlighted',async({page})=>{
  const original='# Title\n'+Array.from({length:140},(_,i)=>`line ${i}`).join('\n');
  const changed=original.replace('line 2\n','<script>first</script>\n').replace('line 130\n','changed at 130\n');
  await page.locator('#files-input').setInputFiles(file('note.md',original));await page.locator('#files-input').setInputFiles(file('note.md',changed));
  await page.getByRole('button',{name:'合并新增 / 更新',exact:true}).click();await page.locator('[data-view="changes"]').click();await page.getByRole('button',{name:'查看章节变化 · 1 处',exact:true}).click();
  await expect(page.locator('.diff-added')).toContainText('<script>first</script>');await expect(page.locator('.diff-deleted')).toContainText('line 2');
  await page.getByRole('button',{name:'下一处变化',exact:true}).click();await expect(page.locator('.diff-added.diff-active')).toContainText('changed at 130');
  await expect(page.locator('.diff-deleted.diff-active')).toContainText('line 130');
  await page.screenshot({path:'test-results/v03-line-diff.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'test-results/v03-mobile.png',fullPage:true});
});

test('exported report includes review notes and real reference positions without source body',async({page})=>{
  await page.locator('#files-input').setInputFiles(file('note.md','# Title\nSECRET BODY'));
  await page.locator('[data-view="organize"]').click();await page.getByRole('button',{name:'标记已处理',exact:true}).click();await page.getByLabel('处理备注（可选）').fill('核对完成');await page.getByRole('button',{name:'保存处理记录',exact:true}).click();
  await page.getByRole('button',{name:'导出整理报告',exact:true}).click();const pending=page.waitForEvent('download');await page.getByRole('button',{name:'下载 Markdown 报告',exact:true}).click();
  const report=await readFile(await (await pending).path(),'utf8');expect(report).toContain('核对完成');expect(report).toContain('已处理');expect(report).not.toContain('SECRET BODY');
});

test('health task pagination and mobile filters remain usable',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.locator('#files-input').setInputFiles(Array.from({length:35},(_,i)=>file(`note-${i}.md`,`# Note ${i}`)));
  await page.locator('[data-view="organize"]').click();await expect(page.locator('.health-card')).toHaveCount(30);
  await page.getByRole('button',{name:'下一页任务',exact:true}).click();await expect(page.locator('.health-card')).toHaveCount(5);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
