import {test,expect} from '@playwright/test';
import {pathToFileURL} from 'node:url';
test('keeps long table/code text and container layout in A4 pages',async({page,context},info)=>{
 await page.goto('/');await expect(page.locator('textarea')).toBeVisible();
 const fence=String.fromCharCode(96).repeat(3);
 const md=['# 分页边界','','<div class="mf-columns"><section>卡片A</section><section>卡片B</section></div>','','| 行 | 内容 |','| --- | --- |',...Array.from({length:90},(_,i)=>'| '+i+' | 表格标记_'+i+' |'),'','---pagebreak---','',fence+'text',...Array.from({length:140},(_,i)=>'CODE_LINE_'+i+' '+('code '.repeat(12))),fence,'','## 末尾','FINAL_REVIEW_END'].join('\n');
 await page.locator('textarea').fill(md);await expect(page.locator('[data-render-state]')).toHaveAttribute('data-render-state','ready');await page.getByRole('button',{name:'A4 分页',exact:true}).click();
 await expect(page.locator('[data-pagination-state]')).toHaveAttribute('data-pagination-state','ready',{timeout:60000});
 await expect(page.getByRole('button',{name:'编辑器',exact:true})).toBeVisible();
 const pages=page.locator('.pagedjs_pages');for(const value of ['表格标记_89','CODE_LINE_139','FINAL_REVIEW_END'])await expect(pages).toContainText(value);
 const columns=pages.locator('.mf-columns').first();await expect(columns).toHaveCSS('grid-template-columns',/^[^ ]+$/);
 expect(await page.locator('[data-page-count]').getAttribute('data-page-count')).not.toBe('1');
 await page.setViewportSize({width:1280,height:1500});await page.getByRole('button',{name:'编辑器',exact:true}).click();await page.getByRole('button',{name:'收起侧边文档与大纲 (侧边点击)',exact:true}).click();
 await page.locator('.pagedjs_page').first().screenshot({path:info.outputPath('a4-table-first.png')});await page.locator('.pagedjs_page').last().screenshot({path:info.outputPath('a4-last.png')});
 await page.getByRole('button',{name:'导出',exact:true}).click();const event=page.waitForEvent('download');await page.getByRole('button',{name:'立即导出并保存'}).click();
 const file=info.outputPath('long-document.html');await (await event).saveAs(file);const recipient=await context.newPage();await context.setOffline(true);await recipient.goto(pathToFileURL(file).href);await expect(recipient.locator('article')).toContainText('FINAL_REVIEW_END');
 await recipient.pdf({path:info.outputPath('long-document.pdf'),format:'A4',printBackground:true});
});

// Exercise the existing download path; picker capability is covered separately.
test.beforeEach(async({page})=>{await page.addInitScript(()=>Object.defineProperty(window,'showSaveFilePicker',{value:undefined,configurable:true}))});
