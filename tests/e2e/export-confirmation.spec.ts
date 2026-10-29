import {test,expect,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import JSZip from 'jszip';
import corpus from '../fixtures/export-source/corpus.json' with {type:'json'};
async function review(page:Page){
 await page.goto('/');await expect(page.locator('[data-render-state]')).toHaveAttribute('data-render-state','ready');await page.locator('textarea').fill('# ACCEPTED_REVIEW\n\nFormula $x$.');await expect(page.locator('[data-render-state]')).toHaveAttribute('data-render-state','ready');
 await page.getByRole('button',{name:'导出',exact:true}).click();await page.getByRole('button',{name:/Word 原生文档/}).click();await page.getByRole('button',{name:'立即导出并保存',exact:true}).click();await expect(page.getByRole('checkbox',{name:'接受图片静态化及语义重排'})).toBeVisible();
}
test('keeps the accepted HTML through confirmation even when the source changes',async({page},info)=>{
 await review(page);await page.evaluate(()=>{const editor=document.querySelector('textarea')!;Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(editor,'# LATER_REVIEW');editor.dispatchEvent(new Event('input',{bubbles:true}))});
 await expect(page.locator('textarea')).toHaveValue('# LATER_REVIEW');await expect(page.getByRole('region',{name:'DOCX 兼容性提示'})).toContainText('1 个公式');await page.getByRole('checkbox',{name:'接受图片静态化及语义重排'}).check();const download=page.waitForEvent('download');await page.getByRole('button',{name:'确认并导出',exact:true}).click();const path=info.outputPath('accepted.docx');await(await download).saveAs(path);const zip=await JSZip.loadAsync(await readFile(path)),xml=await zip.file('word/document.xml')!.async('string');expect(xml).toContain('ACCEPTED_REVIEW');expect(xml).not.toContain('LATER_REVIEW');expect(xml.match(/<w:drawing>/g)).toHaveLength(1);
});
test('closing a pending confirmation releases export busy and never delivers an unconfirmed file',async({page})=>{
 let downloads=0;page.on('download',()=>{downloads++});await review(page);await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);await page.getByRole('button',{name:'导出',exact:true}).click();await page.getByRole('button',{name:'原始 Markdown (.md)',exact:true}).click();const action=page.getByRole('button',{name:'立即导出并保存',exact:true});await expect(action).toBeEnabled();const download=page.waitForEvent('download');await action.click();expect((await download).suggestedFilename()).toMatch(/\.md$/);expect(downloads).toBe(1);
});
test('source bundles remain available when formula and diagram rendering cannot complete',async({page},info)=>{
 await page.goto('/');await expect(page.locator('[data-render-state]')).toHaveAttribute('data-render-state','ready');const source='# SOURCE_SAVE\n\n$\\notDefinedHere$\n\n```mermaid\nINVALID DIAGRAM\n```\n\n![p]('+corpus.asset.data+')';await page.locator('textarea').fill(source);await expect(page.locator('[data-render-state]')).toHaveAttribute('data-render-state','error');await page.getByRole('button',{name:'导出',exact:true}).click();await page.getByRole('button',{name:/Markdown 资源包/}).click();const download=page.waitForEvent('download');await page.getByRole('button',{name:'立即导出并保存',exact:true}).click();const path=info.outputPath('source.zip');await(await download).saveAs(path);const zip=await JSZip.loadAsync(await readFile(path)),markdown=await zip.file('document.md')!.async('string');expect(markdown).toContain('notDefinedHere');expect(markdown).toContain('INVALID DIAGRAM');expect(markdown).toContain('assets/');expect(Object.keys(zip.files).filter(name=>name.startsWith('assets/')&&!zip.files[name]?.dir)).toHaveLength(1);
});

// Exercise the existing download path; picker capability is covered separately.
test.beforeEach(async({page})=>{await page.addInitScript(()=>Object.defineProperty(window,'showSaveFilePicker',{value:undefined,configurable:true}))});
