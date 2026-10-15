import {expect} from '@playwright/test';
export async function importFiles(page,files,mode='merge'){
  await page.locator('#files-input').setInputFiles(files);
  await expect(page.getByRole('heading',{name:'导入预览',exact:true})).toBeVisible();
  await page.getByLabel('导入方式',{exact:true}).selectOption(mode);
  if(await page.getByLabel('我已核对移出列表',{exact:true}).isVisible())await page.getByLabel('我已核对移出列表',{exact:true}).check();
  await page.getByRole('button',{name:'确认导入',exact:true}).click();
  await expect(page.locator('#modal')).not.toBeVisible();
}
