import {test,expect,type Page} from '@playwright/test';
import JSZip from 'jszip';
interface SaveProbe {calls:number;active:boolean;name:string;creates:number;writes:number;closes:number;aborts:number;text:string;base64:string;release?:()=>void}
declare global {interface Window {saveProbe:SaveProbe}}
async function install(page:Page,mode:'save'|'cancel'|'permission'|'write-fail'|'close-wait'|'select-wait'='save'){
 await page.addInitScript(mode=>{
  const state:SaveProbe={calls:0,active:false,name:'',creates:0,writes:0,closes:0,aborts:0,text:'',base64:''};window.saveProbe=state;
  Object.defineProperty(window,'showSaveFilePicker',{configurable:true,value:async(options:{suggestedName:string})=>{
   state.calls++;state.active=navigator.userActivation.isActive;state.name=options.suggestedName;
   if(mode==='cancel')throw new DOMException('cancelled','AbortError');if(mode==='permission')throw new DOMException('picker denied','SecurityError');
   if(mode==='select-wait')await new Promise<void>(resolve=>{state.release=resolve});
   return {async createWritable(){state.creates++;return {
    async write(blob:Blob){state.writes++;if(mode==='write-fail')throw new Error('write denied');state.text=await blob.text();let binary='';for(const byte of new Uint8Array(await blob.arrayBuffer()))binary+=String.fromCharCode(byte);state.base64=btoa(binary)},
    async close(){if(mode==='close-wait')await new Promise<void>(resolve=>{state.release=resolve});state.closes++},async abort(){state.aborts++},
   }}};
  }});
 },mode);
}
async function open(page:Page,format:string,source='# SAVE_SOURCE\n\n中文正文',url='/'){
 await page.goto(url);await page.locator('textarea').fill(source);await expect(page.locator('[data-render-state]')).toHaveAttribute('data-render-state','ready');await page.getByRole('button',{name:'导出',exact:true}).click();await page.getByRole('button',{name:format,exact:false}).click();
}
const action=(page:Page)=>page.getByRole('button',{name:/^(立即导出并保存|正在生成\.\.\.)$/});
for(const [format,extension]of [['可编辑单文件 HTML','.markflow.html'],['纯净静态阅读 HTML','.html'],['Word 原生文档 (.docx)','.docx'],['原始 Markdown (.md)','.md'],['Markdown 资源包 (.zip)','.zip']] as const)test('saves '+extension+' through the common workbench entry',async({page})=>{
 await install(page);await open(page,format);await page.getByLabel('导出文件主名称').fill('中文方案'+extension+extension);await expect(page.locator('#export-suggested-name')).toHaveText('建议文件名：中文方案'+extension);await action(page).click();await expect(page.getByText(/已保存文件/)).toBeVisible();
 const state=await page.evaluate(()=>window.saveProbe);expect(state).toMatchObject({calls:1,active:true,name:'中文方案'+extension,creates:1,writes:1,closes:1,aborts:0});
 if(extension==='.docx'){const zip=await JSZip.loadAsync(state.base64,{base64:true});expect(await zip.file('word/document.xml')!.async('string')).toContain('SAVE_SOURCE')}
 else if(extension==='.zip'){const zip=await JSZip.loadAsync(state.base64,{base64:true});expect(await zip.file('document.md')!.async('string')).toContain('SAVE_SOURCE')}
 else expect(state.text).toContain('SAVE_SOURCE');
});
test('cancelling selection neither generates a download nor reports an error',async({page})=>{
 await install(page,'cancel');let downloads=0,dialogs=0;page.on('download',()=>downloads++);page.on('dialog',async dialog=>{dialogs++;await dialog.dismiss()});await open(page,'纯净静态阅读 HTML');await action(page).click();await expect(page.getByText(/已取消保存/)).toBeVisible();await expect(action(page)).toBeEnabled();expect(await page.evaluate(()=>window.saveProbe)).toMatchObject({calls:1,creates:0,writes:0});expect(downloads).toBe(0);expect(dialogs).toBe(0);
});
test('freezes source before an asynchronous picker and releases busy only after close',async({page})=>{
 await install(page,'select-wait');await open(page,'纯净静态阅读 HTML','# FROZEN_SELECTION_SOURCE');await action(page).click();await expect.poll(()=>page.evaluate(()=>window.saveProbe.calls)).toBe(1);await expect(action(page)).toBeDisabled();
 await page.evaluate(()=>{const editor=document.querySelector('textarea')!;Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(editor,'# LATER_SELECTION_SOURCE');editor.dispatchEvent(new Event('input',{bubbles:true}));window.saveProbe.release?.()});await expect(page.getByText(/已保存文件/)).toBeVisible();const text=await page.evaluate(()=>window.saveProbe.text);expect(text).toContain('FROZEN_SELECTION_SOURCE');expect(text).not.toContain('LATER_SELECTION_SOURCE');
});
test('waits for file close before showing saved feedback',async({page})=>{
 await install(page,'close-wait');await open(page,'原始 Markdown (.md)');await action(page).click();await expect.poll(()=>page.evaluate(()=>Boolean(window.saveProbe.release))).toBe(true);await expect(action(page)).toBeDisabled();await expect(page.getByText(/已保存文件/)).toHaveCount(0);await page.evaluate(()=>window.saveProbe.release?.());await expect(page.getByText(/已保存文件/)).toBeVisible();await expect(action(page)).toBeEnabled();
});
for(const mode of ['permission','write-fail'] as const)test('reports '+mode+' without silent download fallback',async({page})=>{
 await install(page,mode);let downloads=0;page.on('download',()=>downloads++);await open(page,'原始 Markdown (.md)');const event=page.waitForEvent('dialog'),click=action(page).click(),dialog=await event;expect(dialog.message()).toContain(mode==='permission'?'picker denied':'write denied');await dialog.accept();await click;await expect(action(page)).toBeEnabled();expect(downloads).toBe(0);expect(await page.evaluate(()=>window.saveProbe)).toMatchObject({aborts:mode==='write-fail'?1:0,closes:0});await expect(page.getByText(/已保存文件/)).toHaveCount(0);
});
test('DOCX consent occurs before a selected file is opened for writing',async({page})=>{
 await install(page);await open(page,'Word 原生文档 (.docx)','# CONSENT_SOURCE\n\n$x^2$');await action(page).click();await expect(page.getByRole('checkbox',{name:'接受图片静态化及语义重排'})).toBeVisible();expect(await page.evaluate(()=>window.saveProbe.creates)).toBe(0);await page.getByRole('checkbox',{name:'接受图片静态化及语义重排'}).check();await page.getByRole('button',{name:'确认并导出',exact:true}).click();await expect(page.getByText(/已保存文件/)).toBeVisible();expect(await page.evaluate(()=>window.saveProbe)).toMatchObject({calls:1,creates:1,writes:1,closes:1});
});
test('PDF keeps native HTML delivery and the normalized title without a byte picker',async({page})=>{
 await install(page);await page.addInitScript(()=>document.addEventListener('load',event=>{if(event.target instanceof HTMLIFrameElement&&event.target.title==='PDF导出文档'){const frame=event.target;frame.contentWindow!.print=()=>{frame.setAttribute('data-delivered','true')}}},true));
 await open(page,'PDF 文档（A4）');await page.getByLabel('导出文件主名称').fill('中文.pdf.pdf');await action(page).click();const frame=page.locator('iframe[title="PDF导出文档"]');await expect(frame).toHaveAttribute('data-delivered','true');expect(await frame.evaluate(node=>(node as HTMLIFrameElement).contentDocument!.title)).toBe('中文');expect(await page.evaluate(()=>window.saveProbe.calls)).toBe(0);await expect(page.getByText(/PDF导出已交由浏览器处理/)).toBeVisible();await frame.evaluate(node=>(node as HTMLIFrameElement).contentWindow!.dispatchEvent(new Event('afterprint')));await expect(frame).toHaveCount(0);
});

test('ordinary HTTP ignores even a present picker and downloads with the common empty-name rule',async({page})=>{
 await install(page);await page.route('http://markflow-save.test/**',async route=>{const url=new URL(route.request().url()),response=await route.fetch({url:'http://127.0.0.1:4173'+url.pathname+url.search});await route.fulfill({response})});
 await open(page,'原始 Markdown (.md)','# HTTP_SAVE_SOURCE','http://markflow-save.test/');expect(await page.evaluate(()=>isSecureContext)).toBe(false);await page.getByLabel('导出文件主名称').fill('');const downloading=page.waitForEvent('download');await action(page).click();expect((await downloading).suggestedFilename()).toBe('MarkFlow-Document.md');await expect(page.getByText(/已生成并发起下载/)).toBeVisible();expect(await page.evaluate(()=>window.saveProbe.calls)).toBe(0);await expect(page.getByText(/已保存文件/)).toHaveCount(0);
});
