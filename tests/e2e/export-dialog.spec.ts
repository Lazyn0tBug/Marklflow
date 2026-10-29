import {test,expect} from '@playwright/test';
for(const width of [1280,390])test('export dialog keeps keyboard focus and unified controls at '+width,async({page},info)=>{
 await page.setViewportSize({width,height:900});await page.goto('/');await expect(page.locator('[data-render-state]')).toHaveAttribute('data-render-state','ready');const trigger=page.getByRole('button',{name:'导出',exact:true});await trigger.focus();await trigger.click();const dialog=page.getByRole('dialog',{name:'导出与发布文档'});await expect(dialog).toBeVisible();await expect(dialog.getByLabel('导出文件主名称')).toBeFocused();
 const first=dialog.getByRole('checkbox',{name:/允许联网/}),last=dialog.getByRole('button',{name:'立即导出并保存',exact:true});await first.focus();await page.keyboard.press('Shift+Tab');await expect(last).toBeFocused();await page.keyboard.press('Tab');await expect(first).toBeFocused();
 await dialog.getByRole('button',{name:'原始 Markdown (.md)',exact:true}).click();await expect(dialog.getByRole('button',{name:'原始 Markdown (.md)',exact:true})).toHaveAttribute('aria-pressed','true');await expect(dialog.getByRole('button',{name:/可编辑单文件/})).toHaveAttribute('aria-pressed','false');await expect(dialog.getByRole('button',{name:'关闭',exact:true})).toBeVisible();await page.screenshot({path:info.outputPath('export-dialog-'+width+'.png')});const bounds=await dialog.boundingBox();expect(bounds!.x).toBeGreaterThanOrEqual(0);expect(bounds!.width).toBeLessThanOrEqual(width);await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(trigger).toBeFocused();
});

// Exercise the existing download path; picker capability is covered separately.
test.beforeEach(async({page})=>{await page.addInitScript(()=>Object.defineProperty(window,'showSaveFilePicker',{value:undefined,configurable:true}))});
