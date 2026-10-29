import {test,expect,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import JSZip from 'jszip';
async function open(page:Page,source:string){await page.goto('/');await page.locator('textarea').first().fill(source);await expect(page.locator('[data-render-state]')).toHaveAttribute('data-render-state','ready');await page.getByRole('button',{name:'导出',exact:true}).click()}
test('uses the accepted source when the editor changes immediately after export starts',async({page},info)=>{
 await open(page,'# ACCEPTED_EXPORT_SOURCE');const downloaded=page.waitForEvent('download');
 await page.evaluate(()=>{const button=Array.from(document.querySelectorAll('button')).find(node=>node.textContent?.trim()==='立即导出并保存');if(!button)throw new Error('Missing export button');button.click();const editor=document.querySelector('textarea');if(!editor)throw new Error('Missing editor');const setter=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')?.set;if(!setter)throw new Error('Missing native setter');setter.call(editor,'# EDITED_AFTER_ACCEPT');editor.dispatchEvent(new Event('input',{bubbles:true}))});
 await expect(page.locator('textarea').first()).toHaveValue('# EDITED_AFTER_ACCEPT');const path=info.outputPath('frozen-source.html');await(await downloaded).saveAs(path);const html=await readFile(path,'utf8');expect(html).toContain('ACCEPTED_EXPORT_SOURCE');expect(html).not.toContain('EDITED_AFTER_ACCEPT');await expect(page.getByText(/已生成并发起下载/)).toBeVisible();
});
test('cleans a failed download and permits a manual retry with accurate Web feedback',async({page})=>{
 await open(page,'# MARKDOWN_DOWNLOAD');await page.getByRole('button',{name:'原始 Markdown (.md)',exact:true}).click();
 await page.evaluate(()=>{const click=HTMLAnchorElement.prototype.click,revoke=URL.revokeObjectURL;let fail=true;HTMLAnchorElement.prototype.click=function(){if(this.download&&fail){fail=false;throw new Error('injected-download-failure')}click.call(this)};URL.revokeObjectURL=function(url){document.documentElement.dataset.revoked=String(Number(document.documentElement.dataset.revoked||0)+1);revoke.call(URL,url)}});
 const alert=page.waitForEvent('dialog'),action=page.getByRole('button',{name:'立即导出并保存',exact:true}).click();const dialog=await alert;expect(dialog.message()).toContain('injected-download-failure');await dialog.accept();await action;await expect(page.locator('a[download]')).toHaveCount(0);await expect(page.locator('html')).toHaveAttribute('data-revoked','1');await expect(page.getByRole('button',{name:'立即导出并保存',exact:true})).toBeEnabled();
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'立即导出并保存',exact:true}).click();expect((await download).suggestedFilename()).toMatch(/\.md$/);await expect(page.getByText(/已生成并发起下载/)).toBeVisible();await expect(page.locator('a[download]')).toHaveCount(0);
});
test('keeps accepted DOCX source when the document changes during generation',async({page},info)=>{
 await open(page,'# ACCEPTED_DOCX_SOURCE\n\nFrozen paragraph.');await page.getByRole('button',{name:/Word 原生文档/}).click();const download=page.waitForEvent('download');await page.evaluate(()=>{const button=Array.from(document.querySelectorAll('button')).find(node=>node.textContent?.trim()==='立即导出并保存');button!.click();const editor=document.querySelector('textarea')!;Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(editor,'# LATE_DOCX_SOURCE');editor.dispatchEvent(new Event('input',{bubbles:true}))});const path=info.outputPath('frozen.docx');await(await download).saveAs(path);const zip=await JSZip.loadAsync(await readFile(path));const xml=await zip.file('word/document.xml')!.async('string');expect(xml).toContain('ACCEPTED_DOCX_SOURCE');expect(xml).not.toContain('LATE_DOCX_SOURCE');expect(xml).toContain('Frozen paragraph.');
});

// Exercise the existing download path; picker capability is covered separately.
test.beforeEach(async({page})=>{await page.addInitScript(()=>Object.defineProperty(window,'showSaveFilePicker',{value:undefined,configurable:true}))});
