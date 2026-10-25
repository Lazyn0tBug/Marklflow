import JSZip from 'jszip';
import {test,expect,type Page} from '@playwright/test';
import {readFile,copyFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const pixel='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1S8AAAAASUVORK5CYII=';
const fence=String.fromCharCode(96).repeat(3);
const fixture=['# HTML 验证 🧪','','<div class="mf-columns"><section><h2>左侧卡片</h2><p>语义结构</p></section><section><h2>右侧卡片</h2><p>容器排版</p></section></div>','','| 名称 | 值 |','| :--- | ---: |','| 中文 | 42 |','','公式 $x^2+1$。','',fence+'mermaid','graph LR','A[输入] --> B[输出]',fence,'','![像素]('+pixel+')','','## 文末','正文结束。'].join('\n');
async function source(page:Page,text:string){
 await page.goto('/');const editor=page.locator('textarea').first();await expect(editor).toBeVisible();await editor.fill(text);
 await expect(page.locator('[data-render-state]')).toHaveAttribute('data-render-state','ready',{timeout:30000});
}
async function download(page:Page){
 await page.getByRole('button',{name:'导出',exact:true}).click();
 const event=page.waitForEvent('download');await page.getByRole('button',{name:'立即导出并保存',exact:true}).click();
 return (await (await event).path())!;
}
test.use({viewport:{width:1280,height:900}});
test('isolates document palette and rejects executable content',async({page})=>{
 await source(page,'# 安全测试\n\n<figure><figcaption>说明</figcaption></figure>\n\n<script>alert(1)</script><span onclick="alert(1)">安全文本</span>\n\n<a href="javascript:alert(1)">链接</a>');
 await expect(page.locator('.mf-doc script,.mf-doc [onclick],.mf-doc iframe')).toHaveCount(0);
 await expect(page.locator('.mf-doc figcaption')).toHaveText('说明');await expect(page.locator('.mf-doc a')).not.toHaveAttribute('href');
 const color=await page.locator('.mf-doc').evaluate(n=>getComputedStyle(n).color);
 await page.getByRole('button',{name:/切换.*模式/}).click();
 expect(await page.locator('.mf-doc').evaluate(n=>getComputedStyle(n).color)).toBe(color);
});
test('queries its own container in wide and narrow layouts',async({page})=>{
 await source(page,fixture);await page.getByRole('button',{name:'编辑器',exact:true}).click();
 await page.getByRole('button',{name:'收起侧边文档与大纲 (侧边点击)',exact:true}).click();
 const grid=page.locator('.mf-doc .mf-columns');
 await expect.poll(()=>grid.evaluate(n=>getComputedStyle(n).gridTemplateColumns.split(' ').length)).toBe(2);
 await page.setViewportSize({width:684,height:900});
 await expect.poll(()=>grid.evaluate(n=>getComputedStyle(n).gridTemplateColumns.split(' ').length)).toBe(1);
 await expect(page.locator('.mf-doc table thead')).toHaveCount(1);
});
test('opens HTML offline and restores editable source and assets',async({page,context},info)=>{
 const sourceFixture=fixture.replace(pixel,'data:image/png;base64,'+(await readFile(new URL('../../public/assets/aistudio/image_49bc8de2.png',import.meta.url))).toString('base64'));
 await source(page,sourceFixture);const downloaded=await download(page);const file=info.outputPath('editable.html');await copyFile(downloaded,file);const html=await readFile(file,'utf8');
 expect(html).not.toContain('data-mermaid-code');expect(html).not.toContain('oklch(');expect(html).toContain('mf-document');
 const recipient=await context.newPage();await context.setOffline(true);await recipient.goto(pathToFileURL(file).href);
 await expect(recipient.locator('article.mf-doc svg')).toHaveCount(1);await expect(recipient.locator('article.mf-doc svg')).toContainText('输入');await expect(recipient.locator('article.mf-doc svg')).toContainText('输出');await expect(recipient.locator('article.mf-doc math')).toHaveCount(1);
 await expect.poll(()=>recipient.locator('img').evaluate(n=>(n as HTMLImageElement).complete&&(n as HTMLImageElement).naturalWidth>0)).toBe(true);
 const nodeFill=await recipient.locator('svg rect').first().getAttribute('fill');
 expect(nodeFill).not.toBe('rgb(51, 51, 51)');
 await recipient.screenshot({path:info.outputPath('offline-html.png'),fullPage:true});
 await recipient.pdf({path:info.outputPath('document.pdf'),format:'A4',printBackground:true});
 await recipient.close();await context.setOffline(false);await page.getByRole('button',{name:'取消',exact:true}).click();
 await page.locator('input[type=file]').setInputFiles(file);await expect(page.locator('textarea').first()).toHaveValue(sourceFixture);
 await expect(page.locator('[data-render-state]')).toHaveAttribute('data-render-state','ready');
});
test('paginates long content without losing final text or source mappings',async({page},info)=>{
 const long=['# 自动分页','',...Array.from({length:100},(_,i)=>'段落 '+i+'：中文排版与长文档完整性验证。'.repeat(5)+'\n'),'\n## 最后章节\n\n最终标记_END_100'].join('\n');
 await source(page,long);await page.getByRole('button',{name:'A4 分页',exact:true}).click();
 await expect(page.locator('[data-page-count]')).toBeVisible({timeout:60000});
 expect(Number(await page.locator('[data-page-count]').getAttribute('data-page-count'))).toBeGreaterThan(1);
 await expect(page.locator('.pagedjs_pages')).toContainText('最终标记_END_100');
 await expect(page.locator('.pagedjs_pages [data-heading-id]').last()).toHaveAttribute('data-line',/\d+/);
 await page.locator('.pagedjs_page').first().screenshot({path:info.outputPath('first-page.png')});
});
test('reports static DOCX mappings before explicit consent',async({page})=>{
 await source(page,fixture);await page.getByRole('button',{name:'导出',exact:true}).click();await page.getByRole('button',{name:/Word 原生文档/}).click();
 await expect(page.getByRole('region',{name:'DOCX 兼容性提示'})).toContainText('图片');
 await expect(page.getByRole('checkbox',{name:'接受图片静态化及语义重排'})).not.toBeChecked();
});


test('exports native DOCX structure with embedded formula and diagram pictures',async({page},info)=>{
 await source(page,fixture);await page.getByRole('button',{name:'导出',exact:true}).click();await page.getByRole('button',{name:/Word 原生文档/}).click();
 await page.getByRole('checkbox',{name:'接受图片静态化及语义重排'}).check();
 const event=page.waitForEvent('download');await page.getByRole('button',{name:'立即导出并保存',exact:true}).click();const result=await event;
 const file=info.outputPath('document.docx');await result.saveAs(file);
 const zip=await JSZip.loadAsync(await readFile(file));const xml=await zip.file('word/document.xml')!.async('string');
 expect(xml).toContain('正文结束');expect(xml).toContain('w:tbl');expect((xml.match(/<w:drawing>/g)||[]).length).toBeGreaterThanOrEqual(3);
 expect(Object.keys(zip.files).filter(f=>f.startsWith('word/media/')).length).toBeGreaterThanOrEqual(3);
});

test('prepares the print frame only after assets are ready and cleans up after print',async({page})=>{
 await page.addInitScript(()=>{
  document.addEventListener('load',event=>{
   if(event.target instanceof HTMLIFrameElement){const frame=event.target;frame.contentWindow!.print=()=>frame.setAttribute('data-test-printed','true')}
  },true);
 });
 await source(page,fixture);await page.getByRole('button',{name:'导出',exact:true}).click();await page.getByRole('button',{name:/PDF 文档/}).click();
 await page.getByRole('button',{name:'立即导出并保存',exact:true}).click();
 const frame=page.locator('iframe[title="PDF导出文档"]');await expect(frame).toHaveAttribute('data-test-printed','true');
 await expect(page.frameLocator('iframe[title="PDF导出文档"]').locator('body')).toContainText('正文结束');
 expect(await page.frameLocator('iframe[title="PDF导出文档"]').locator('img').evaluate(n=>(n as HTMLImageElement).complete&&(n as HTMLImageElement).naturalWidth>0)).toBe(true);
 await frame.evaluate(n=>(n as HTMLIFrameElement).contentWindow!.dispatchEvent(new Event('afterprint')));
 await expect(frame).toHaveCount(0);
});

test('does not report successful export for a corrupt embedded image',async({page})=>{
 await source(page,'# 损坏图片\n\n![invalid](data:image/png;base64,AAAA)');await page.getByRole('button',{name:'导出',exact:true}).click();
 const alert=page.waitForEvent('dialog');const action=page.getByRole('button',{name:'立即导出并保存',exact:true}).click();
 const dialog=await alert;expect(dialog.message()).toContain('导出过程出错');await dialog.accept();await action;
 await expect(page.getByText(/已成功生成|已成功下载/)).toHaveCount(0);
});
