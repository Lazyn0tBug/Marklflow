import {test,expect} from '@playwright/test';
import JSZip from 'jszip';import {readFile} from 'node:fs/promises';
test('preserves mixed text, list starts, bookmarks, page breaks and A4 in DOCX',async({page},info)=>{
 await page.goto('/');await expect(page.locator('textarea').first()).toBeVisible();
 const md=['# DOCX复核','','<div>容器开头 <strong>加粗片段</strong> 容器末尾<p>独立段落</p>尾部文字</div>','','<h2 id="target">锚点目标</h2>','','[内部链接](#target)','','3. 第三项','4. 第四项','','独立列表分隔','','1. 重新第一项','','---pagebreak---','','分页后正文','','<table><tr><td colspan="2"><p>单元段一</p><p>单元段二</p></td></tr><tr><td>A</td><td>B</td></tr></table>'].join('\n');
 await page.locator('textarea').first().fill(md);await expect(page.locator('[data-render-state]')).toHaveAttribute('data-render-state','ready');
 await page.getByRole('button',{name:'导出',exact:true}).click();await page.getByRole('button',{name:/Word 原生文档/}).click();await page.getByRole('button',{name:'立即导出并保存',exact:true}).click();await page.getByRole('checkbox',{name:'接受图片静态化及语义重排'}).check();
 const event=page.waitForEvent('download');await page.getByRole('button',{name:'确认并导出',exact:true}).click();const file=info.outputPath('semantic.docx');await (await event).saveAs(file);
 const zip=await JSZip.loadAsync(await readFile(file));const xml=await zip.file('word/document.xml')!.async('string');const numbering=await zip.file('word/numbering.xml')!.async('string');
 for(const value of ['容器开头','容器末尾','尾部文字','单元段一','单元段二','分页后正文'])expect(xml).toContain(value);
 expect(xml).toContain('w:bookmarkStart');expect(xml).toContain('w:anchor=');expect(xml).toContain('w:gridSpan w:val="2"');
 expect(xml).toContain('w:type="page"');expect(xml).toContain('w:w="11906"');expect(xml).toContain('w:h="16838"');expect(numbering).toContain('<w:start w:val="3"');
});
