import {test,expect,type Page} from '@playwright/test';

test.use({viewport:{width:1440,height:960}});
async function ready(page:Page){await expect(page.locator('[data-render-state]')).toHaveAttribute('data-render-state','ready',{timeout:30000})}
async function boot(page:Page){await page.goto('/');await ready(page);await page.locator('textarea').fill('# Split check\n\n'+Array.from({length:70},(_,i)=>'Paragraph '+i+' with source text and selection preservation.').join('\n\n'));await ready(page)}
async function twoFrames(page:Page){await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))))}
async function watchCapture(page:Page){await page.evaluate(()=>{const target=document.querySelector('[role=separator]')!;target.addEventListener('gotpointercapture',(event)=>{(window as Window&{__splitPointer?:number;__splitHandle?:Element}).__splitPointer=(event as PointerEvent).pointerId;(window as Window&{__splitHandle?:Element}).__splitHandle=target},{once:true})})}
const separator=(page:Page)=>page.getByRole('separator',{name:'调整编辑器与 HTML 视图宽度'});

test('resizes with pointer and keyboard, cancels safely, and preserves editing state',async({page},info)=>{
 await boot(page);const editor=page.getByRole('textbox',{name:'Markdown 编辑器'}),handle=separator(page);
 await expect(handle).toHaveAttribute('aria-valuenow','50');
 await editor.evaluate((el:HTMLTextAreaElement)=>{el.focus();el.setSelectionRange(4,15);el.scrollTop=280});
 const before=await editor.evaluate((el:HTMLTextAreaElement)=>({value:el.value,selection:[el.selectionStart,el.selectionEnd],top:el.scrollTop,focused:document.activeElement===el}));
 const box=await handle.boundingBox();expect(box).not.toBeNull();
 await page.mouse.move(box!.x+box!.width/2,box!.y+box!.height/2);await page.mouse.down();await page.mouse.move(box!.x+150,box!.y+box!.height/2,{steps:5});await page.mouse.up();
 await expect.poll(()=>handle.getAttribute('aria-valuenow')).not.toBe('50');
 await expect(handle).toHaveAttribute('aria-valuemin',/\d+/);await expect(handle).toHaveAttribute('aria-valuemax',/\d+/);
 expect(await editor.evaluate((el:HTMLTextAreaElement)=>({value:el.value,selection:[el.selectionStart,el.selectionEnd],focused:document.activeElement===el}))).toEqual({value:before.value,selection:before.selection,focused:before.focused});
 await handle.focus();const initial=Number(await handle.getAttribute('aria-valuenow'));await page.keyboard.press('ArrowRight');await expect(handle).toHaveAttribute('aria-valuenow',String(Math.min(Number(await handle.getAttribute('aria-valuemax')),initial+2)));
 await page.keyboard.press('Home');await expect(handle).toHaveAttribute('aria-valuenow','50');await page.keyboard.press('ArrowLeft');await page.keyboard.press('Enter');await expect(handle).toHaveAttribute('aria-valuenow','50');
 await handle.evaluate(el=>el.dispatchEvent(new MouseEvent('dblclick',{bubbles:true})));await expect(handle).toHaveAttribute('aria-valuenow','50');
 const saved=await page.evaluate(()=>localStorage.getItem('markflow_split_preferences_v1'));expect(saved).toContain('"ratio":0.5');
 const start=await handle.boundingBox();await watchCapture(page);
 await page.mouse.move(start!.x+4,start!.y+start!.height/2);await page.mouse.down();await page.mouse.move(start!.x+100,start!.y+start!.height/2,{steps:3});
 const pointerId=await page.evaluate(()=> (window as Window&{__splitPointer?:number}).__splitPointer);expect(pointerId).toBeDefined();
 await expect(handle).not.toHaveAttribute('aria-valuenow','50');
 await handle.evaluate((el,id)=>el.dispatchEvent(new PointerEvent('pointercancel',{bubbles:true,pointerId:id!})),pointerId);
 await expect(handle).toHaveAttribute('aria-valuenow','50');await twoFrames(page);await expect(handle).toHaveAttribute('aria-valuenow','50');
 expect(await handle.evaluate((el,id)=>el.hasPointerCapture(id!),pointerId)).toBe(false);expect(await page.evaluate(()=>localStorage.getItem('markflow_split_preferences_v1'))).toBe(saved);await page.mouse.up();
 const current=await handle.boundingBox();await watchCapture(page);await page.mouse.move(current!.x+4,current!.y+current!.height/2);await page.mouse.down();await page.mouse.move(current!.x+90,current!.y+current!.height/2,{steps:3});
 await expect(handle).not.toHaveAttribute('aria-valuenow','50');await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
 await expect(handle).toHaveAttribute('aria-valuenow','50');await twoFrames(page);await expect(handle).toHaveAttribute('aria-valuenow','50');
 const blurPointer=await page.evaluate(()=> (window as Window&{__splitPointer?:number}).__splitPointer);expect(blurPointer).toBeDefined();expect(await handle.evaluate((el,id)=>el.hasPointerCapture(id!),blurPointer)).toBe(false);expect(await page.evaluate(()=>localStorage.getItem('markflow_split_preferences_v1'))).toBe(saved);await page.mouse.up();
 const lostStart=await handle.boundingBox();await watchCapture(page);await page.mouse.move(lostStart!.x+4,lostStart!.y+lostStart!.height/2);await page.mouse.down();await page.mouse.move(lostStart!.x+85,lostStart!.y+lostStart!.height/2,{steps:3});
 await expect(handle).not.toHaveAttribute('aria-valuenow','50');const lostPointer=await page.evaluate(()=> (window as Window&{__splitPointer?:number}).__splitPointer);expect(lostPointer).toBeDefined();
 await handle.evaluate((el,id)=>el.releasePointerCapture(id!),lostPointer);await expect(handle).toHaveAttribute('aria-valuenow','50');await twoFrames(page);await expect(handle).toHaveAttribute('aria-valuenow','50');
 expect(await handle.evaluate((el,id)=>el.hasPointerCapture(id!),lostPointer)).toBe(false);expect(await page.evaluate(()=>localStorage.getItem('markflow_split_preferences_v1'))).toBe(saved);await page.mouse.up();
 const hiddenStart=await handle.boundingBox();await watchCapture(page);await page.mouse.move(hiddenStart!.x+4,hiddenStart!.y+hiddenStart!.height/2);await page.mouse.down();await page.mouse.move(hiddenStart!.x+70,hiddenStart!.y+hiddenStart!.height/2,{steps:3});
 await expect(handle).not.toHaveAttribute('aria-valuenow','50');const hiddenPointer=await page.evaluate(()=> (window as Window&{__splitPointer?:number}).__splitPointer);expect(hiddenPointer).toBeDefined();
 await page.getByRole('button',{name:'HTML 预览',exact:true}).evaluate((el:HTMLButtonElement)=>el.click());await expect(handle).toHaveCount(0);await page.getByRole('button',{name:'HTML 预览',exact:true}).evaluate((el:HTMLButtonElement)=>el.click());await expect(handle).toHaveAttribute('aria-valuenow','50');await twoFrames(page);await expect(handle).toHaveAttribute('aria-valuenow','50');
 expect(await page.evaluate(id=>{const target=(window as Window&{__splitHandle?:Element}).__splitHandle;return target?.hasPointerCapture(id!)},hiddenPointer)).toBe(false);expect(await page.evaluate(()=>localStorage.getItem('markflow_split_preferences_v1'))).toBe(saved);await page.mouse.up();
 await page.screenshot({path:info.outputPath('split-desktop.png')});
});

test('keeps all seven visibility combinations and scrolls the workbench on narrow screens',async({page},info)=>{
 await boot(page);const controls=[page.getByRole('button',{name:/侧边文档与大纲 \(侧边点击\)/}),page.getByRole('button',{name:'编辑器',exact:true}),page.getByRole('button',{name:'HTML 预览',exact:true})];
 for(let mask=1;mask<8;mask++){
  for(const control of controls)if(await control.getAttribute('aria-pressed')==='false')await control.click();
  for(const [index,control]of controls.entries())if(!(mask&(1<<index)))await control.click();
  for(const [index,control]of controls.entries()){await expect(control).toHaveAttribute('aria-pressed',String(Boolean(mask&(1<<index))));if(mask===(1<<index))await expect(control).toBeDisabled()}
  if((mask&6)===6)await expect(separator(page)).toBeVisible();else await expect(separator(page)).toHaveCount(0);
 }
 await page.setViewportSize({width:684,height:900});const workbench=page.locator('[data-workbench]');
 expect(await workbench.evaluate(el=>el.scrollWidth>el.clientWidth)).toBe(true);
 await expect(page.locator('#workbench-document')).toHaveCSS('min-width','728px');
 const panes=await page.evaluate(()=>({editor:document.querySelector('[data-view=editor]')!.getBoundingClientRect().width,html:document.querySelector('[data-view=html]')!.getBoundingClientRect().width}));
 expect(panes.editor).toBeGreaterThanOrEqual(359);expect(panes.html).toBeGreaterThanOrEqual(359);
 await page.screenshot({path:info.outputPath('split-narrow.png')});
});

test('does not alter source, revision-bound preview identity or A4 artifact when resizing',async({page},info)=>{
 await boot(page);await page.getByRole('button',{name:'A4 分页',exact:true}).click();await expect(page.locator('[data-pagination-state]')).toHaveAttribute('data-pagination-state','ready',{timeout:60000});
 const source=await page.locator('textarea').inputValue(),reference=await page.locator('[data-preview-reference]').getAttribute('data-preview-reference');
 const pageState=await page.locator('[data-page-count]').evaluate((el:HTMLElement)=>({count:el.dataset.pageCount,width:el.querySelector<HTMLElement>('.pagedjs_page')?.getBoundingClientRect().width,height:el.querySelector<HTMLElement>('.pagedjs_page')?.getBoundingClientRect().height}));
 const revisions=await page.evaluate(()=>({hash:document.querySelector('[data-preview-reference]')?.getAttribute('data-preview-reference'),source:document.querySelector('textarea')?.value}));
 const handle=separator(page),box=await handle.boundingBox();await page.mouse.move(box!.x+4,box!.y+100);await page.mouse.down();await page.mouse.move(box!.x+120,box!.y+100,{steps:4});await page.mouse.up();
 await expect(handle).not.toHaveAttribute('aria-valuenow','50');expect(await page.locator('textarea').inputValue()).toBe(source);expect(await page.locator('[data-preview-reference]').getAttribute('data-preview-reference')).toBe(reference);expect(revisions.source).toBe(source);
 expect(await page.locator('[data-page-count]').evaluate((el:HTMLElement)=>({count:el.dataset.pageCount,width:el.querySelector<HTMLElement>('.pagedjs_page')?.getBoundingClientRect().width,height:el.querySelector<HTMLElement>('.pagedjs_page')?.getBoundingClientRect().height}))).toEqual(pageState);
 await page.getByRole('button',{name:'设置',exact:true}).click();await expect(page.getByLabel('编辑器与 HTML 内容最大宽度')).toHaveValue('1024');await page.keyboard.press('Escape');
 await page.screenshot({path:info.outputPath('split-a4.png')});
});
