import {test,expect,type Page} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
test.use({viewport:{width:1440,height:960}});
const source=Array.from({length:8},(_,section)=>['## Section '+section,'',...Array.from({length:14},(_,paragraph)=>'Paragraph '+section+'_'+paragraph+' '+('中文与 semantic source mapping content. '.repeat(paragraph%3+2))+'\n'),...(section===3?['```ts',...Array.from({length:65},(_,line)=>'const value'+line+' = '+line+';'),'```','']:[])].join('\n')).join('\n');
const lineOf=(text:string)=>source.split('\n').findIndex(line=>line.startsWith(text))+1;
async function ready(page:Page){await expect(page.locator('[data-render-state]')).toHaveAttribute('data-render-state','ready',{timeout:30000})}
async function boot(page:Page){await page.goto('/');await ready(page);await page.locator('textarea').fill(source);await ready(page);await page.getByRole('button',{name:/^大纲 \(/}).click()}
async function editorAt(page:Page,line:number){const editor=page.locator('textarea'),row=page.locator('[data-view=editor] .w-12 > div').nth(line-1);await editor.dispatchEvent('pointerdown');await editor.evaluate((el:HTMLTextAreaElement,rowTop)=>{el.scrollTop=Math.max(0,el.scrollTop+rowTop-el.getBoundingClientRect().top)},await row.evaluate(el=>el.getBoundingClientRect().top))}
async function previewAt(page:Page,line:number){const view=page.locator('[data-view=html] > div');await view.dispatchEvent('pointerdown');await view.evaluate((el:HTMLElement,line)=>{const target=el.querySelector<HTMLElement>('[data-line="'+line+'"]');if(!target)throw new Error('Missing source node '+line);el.scrollTop+=target.getBoundingClientRect().top-el.getBoundingClientRect().top},line)}
async function editorLine(page:Page){return page.locator('textarea').evaluate((el:HTMLTextAreaElement)=>{const gutter=el.parentElement!.querySelector<HTMLElement>('.w-12')!,top=Math.max(0,el.scrollTop-parseFloat(getComputedStyle(el).paddingTop)),rows=[...gutter.children] as HTMLElement[];let previous=0;for(let i=0;i<rows.length;i++){const height=rows[i]!.getBoundingClientRect().height;if(top<=previous+height)return i+1+(top-previous)/height;previous+=height}return rows.length})}

test('synchronizes mapped paragraphs and long code, and highlights the editor center chapter',async({page})=>{
 await boot(page);const line=lineOf('Paragraph 4_5');await editorAt(page,line);
 await expect.poll(()=>page.locator('[data-view=html] p[data-line="'+line+'"]').evaluate(el=>Math.abs(el.getBoundingClientRect().top-el.closest('[data-view]')!.firstElementChild!.getBoundingClientRect().top))).toBeLessThan(3);
 await expect(page.locator('[aria-current=location]')).toHaveAttribute('title',/^Section 4 /);
 const codeLine=lineOf('```ts');await editorAt(page,codeLine+25);await expect.poll(()=>page.locator('.mf-code').evaluate(el=>el.getBoundingClientRect().top-el.closest('[data-view]')!.firstElementChild!.getBoundingClientRect().top)).toBeLessThan(-100);
 const reverse=lineOf('Paragraph 2_6');await previewAt(page,reverse);await expect.poll(async()=>Math.abs(await editorLine(page)-reverse)).toBeLessThan(1.1);
 await page.getByRole('button',{name:'双向同步滚动：已开启',exact:true}).click();const before=await page.locator('textarea').evaluate(el=>el.scrollTop);await previewAt(page,lineOf('Paragraph 5_3'));await expect.poll(()=>page.locator('textarea').evaluate(el=>el.scrollTop)).toBe(before);
});

test('keeps an explicit wheel scroll made before a wrapped geometry refresh',async({page})=>{
 await boot(page);const value=Array.from({length:100},(_,i)=>'line '+i+' '+('中文🙂 unbroken'.repeat(32))).join('\n');await page.locator('textarea').fill(value);await ready(page);
 const editor=page.locator('textarea'),target=await editor.evaluate((el:HTMLTextAreaElement)=>{
  el.scrollTop=0;el.dispatchEvent(new Event('scroll'));const frame=el.parentElement!;frame.style.width='520px';frame.style.flex='none';void el.clientWidth;
  const next=Math.min(640,el.scrollHeight-el.clientHeight);el.dispatchEvent(new WheelEvent('wheel',{bubbles:true,deltaY:120}));el.scrollTop=next;el.dispatchEvent(new Event('scroll'));return next;
 });
 expect(target).toBeGreaterThan(100);await expect.poll(()=>editor.evaluate((el:HTMLTextAreaElement,expected:number)=>Math.abs(el.scrollTop-expected),target)).toBeLessThan(1);
});

test('measures soft-wrapped logical rows against native textarea layout without changing source',async({page})=>{
 await boot(page);const editor=page.getByRole('textbox',{name:'Markdown 编辑器'});
 const value=['中文🙂'.repeat(35)+' https://'+('segment'.repeat(30)),"const tabbed = '\t\t"+('x'.repeat(150))+"'",'',('尾行🙂'.repeat(35)),''].join('\n');
 await editor.fill(value);await expect(editor).toHaveAttribute('wrap','soft');expect(await editor.inputValue()).toBe(value);
 await expect.poll(async()=>editor.evaluate(el=>el.parentElement!.querySelector<HTMLElement>('.w-12')!.children.length)).toBe(5);
 const heights=await editor.evaluate((el:HTMLTextAreaElement)=>{
  const gutter=el.parentElement!.querySelector<HTMLElement>('.w-12')!,rows=[...gutter.children] as HTMLElement[],style=getComputedStyle(el),oracle=document.createElement('textarea');
  for(let i=0;i<style.length;i++){const key=style.item(i);oracle.style.setProperty(key,style.getPropertyValue(key),style.getPropertyPriority(key))}
  oracle.wrap='soft';oracle.style.position='fixed';oracle.style.left='-100000px';oracle.style.top='0';oracle.style.visibility='hidden';oracle.style.display='block';oracle.style.flex='none';oracle.style.boxSizing='border-box';oracle.style.width=el.getBoundingClientRect().width+'px';oracle.style.height='1px';oracle.style.minHeight='0';oracle.style.maxHeight='none';oracle.style.overflowY='scroll';oracle.style.resize='none';document.body.append(oracle);
  const pads=parseFloat(style.paddingTop)+parseFloat(style.paddingBottom),measured=el.value.split('\n').map(line=>{oracle.value=line||'\u200b';return oracle.scrollHeight-pads});oracle.remove();
  return {measured,actual:rows.map(row=>row.getBoundingClientRect().height),total:gutter.scrollHeight-el.scrollHeight};
 });
 expect(heights.measured).toHaveLength(5);expect(heights.actual).toHaveLength(5);
 for(let i=0;i<5;i++)expect(Math.abs(heights.actual[i]!-heights.measured[i]!)).toBeLessThanOrEqual(1);
 expect(heights.actual[0]!).toBeGreaterThan(24);expect(heights.actual[1]!).toBeGreaterThan(24);expect(heights.actual[2]).toBeCloseTo(24,0);expect(heights.actual[4]).toBeCloseTo(24,0);
 expect(Math.abs(heights.total)).toBeLessThanOrEqual(1);expect(await editor.inputValue()).toBe(value);
});

test('records one large-document mirror measurement without imposing a timing threshold',async({page},info)=>{
 await boot(page);const editor=page.getByRole('textbox',{name:'Markdown 编辑器'}),large=await readFile(resolve(process.cwd(),'tests/fixtures/architecture/large.md'),'utf8'),logicalLines=large.split('\n').length;
 await editor.evaluate((el:HTMLTextAreaElement)=>{
  const original=HTMLElement.prototype.getBoundingClientRect,state={rows:0,start:0,end:0};Object.defineProperty(window,'__e1MirrorMeasure',{configurable:true,value:state});
  HTMLElement.prototype.getBoundingClientRect=function(this:HTMLElement){if(this.parentElement?.getAttribute('aria-hidden')==='true'){if(state.rows===0)state.start=performance.now();state.rows++;state.end=performance.now()}return original.call(this)};
 });
 await editor.fill(large);await ready(page);expect(await editor.inputValue()).toBe(large);
 const metrics=await page.evaluate(()=>({...((window as unknown as {__e1MirrorMeasure:{rows:number;start:number;end:number}}).__e1MirrorMeasure),elapsedMs:(window as unknown as {__e1MirrorMeasure:{rows:number;start:number;end:number}}).__e1MirrorMeasure.end-(window as unknown as {__e1MirrorMeasure:{rows:number;start:number;end:number}}).__e1MirrorMeasure.start}));
 expect(metrics.rows).toBe(logicalLines);expect(metrics.elapsedMs).toBeGreaterThanOrEqual(0);
 await writeFile(info.outputPath('e1-large-mirror-measurement.json'),JSON.stringify({fixture:'tests/fixtures/architecture/large.md',bytes:Buffer.byteLength(large),logicalLines,...metrics},null,2));
});

test('persists the wrap preference and preserves source selection and undo across mode changes',async({page})=>{
 await boot(page);const editor=page.getByRole('textbox',{name:'Markdown 编辑器'});expect(await editor.getAttribute('wrap')).toBe('soft');
 await editor.evaluate((el:HTMLTextAreaElement)=>el.setSelectionRange(12,27));const selected=await editor.evaluate((el:HTMLTextAreaElement)=>[el.selectionStart,el.selectionEnd]);
 await page.getByRole('button',{name:'设置',exact:true}).click();const toggle=page.getByRole('checkbox',{name:'自动换行'});await expect(toggle).toBeChecked();await toggle.uncheck();await expect(editor).toHaveAttribute('wrap','off');expect(await editor.inputValue()).toBe(source);expect(await editor.evaluate((el:HTMLTextAreaElement)=>[el.selectionStart,el.selectionEnd])).toEqual(selected);
 await page.reload();await ready(page);await expect(page.getByRole('textbox',{name:'Markdown 编辑器'})).toHaveAttribute('wrap','off');
 const restored=page.getByRole('textbox',{name:'Markdown 编辑器'}),unbroken='unbroken'.repeat(120);await restored.fill(unbroken);expect(await restored.inputValue()).toBe(unbroken);const horizontal=await restored.evaluate((el:HTMLTextAreaElement)=>{el.scrollLeft=el.scrollWidth;return {left:el.scrollLeft,width:el.scrollWidth,client:el.clientWidth}});expect(horizontal.width).toBeGreaterThan(horizontal.client);expect(horizontal.left).toBeGreaterThan(0);
 await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('checkbox',{name:'自动换行'}).check();await expect(restored).toHaveAttribute('wrap','soft');await page.keyboard.press('Escape');
 await restored.fill(source);await restored.evaluate((el:HTMLTextAreaElement)=>{el.focus();el.setSelectionRange(el.value.length,el.value.length)});await restored.press('X');await expect(restored).toHaveValue(source+'X');await restored.press('Control+z');await expect(restored).toHaveValue(source);
});

test('defers wrapped row measurement during IME composition and measures the committed value afterward',async({page})=>{
 await boot(page);const editor=page.getByRole('textbox',{name:'Markdown 编辑器'});const result=await editor.evaluate((el:HTMLTextAreaElement)=>{
  const gutter=el.parentElement!.querySelector<HTMLElement>('.w-12')!,first=gutter.children[0] as HTMLElement,initial=first.getBoundingClientRect().height,next='🙂中文'.repeat(300)+'\n'+el.value;
  el.focus();el.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true,data:''}));const setter=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!;setter.call(el,next);el.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertCompositionText',data:'🙂'}));el.setSelectionRange(5,5);
  return {initial,selection:[el.selectionStart,el.selectionEnd],value:el.value};
 });
 const composing=editor.locator('..').locator('.w-12 > div').first();await expect(editor).toHaveValue(result.value);await expect(composing).toHaveCSS('height',result.initial+'px');
 const selection=await editor.evaluate((el:HTMLTextAreaElement)=>[el.selectionStart,el.selectionEnd]);expect(selection).toEqual(result.selection);
 await editor.dispatchEvent('compositionend',{data:'🙂'});await expect.poll(()=>composing.evaluate(el=>parseFloat(getComputedStyle(el).height))).toBeGreaterThan(result.initial);
 expect(await editor.inputValue()).toBe(result.value);expect(await editor.evaluate((el:HTMLTextAreaElement)=>[el.selectionStart,el.selectionEnd])).toEqual(result.selection);
});

test('keeps the wrap setting clear and operable in desktop and narrow settings dialogs',async({page},info)=>{
 await boot(page);const button=page.getByRole('button',{name:'设置',exact:true}),dialog=page.getByRole('dialog'),toggle=page.getByRole('checkbox',{name:'自动换行'});
 await button.click();await expect(dialog).toBeVisible();await expect(toggle).toBeChecked();await expect(page.getByText('仅调整编辑器显示，不改变正文换行。关闭后可水平滚动。')).toBeVisible();
 await page.screenshot({path:info.outputPath('e1-settings-desktop.png')});await page.setViewportSize({width:390,height:844});const box=await dialog.boundingBox();expect(box).not.toBeNull();expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.x+box!.width).toBeLessThanOrEqual(390);await expect(toggle).toBeVisible();await page.screenshot({path:info.outputPath('e1-settings-narrow.png')});
 await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();await expect(button).toBeFocused();
});

test('restores semantic locations through A4 mode and cached Tab switches',async({page},info)=>{
 await boot(page);await page.locator('button[title^="Section 3 (第"]').click();const line=lineOf('## Section 3');await expect.poll(async()=>Math.abs(await editorLine(page)-line)).toBeLessThan(1.1);
 await page.getByRole('button',{name:'A4 分页',exact:true}).click();await expect(page.locator('[data-pagination-state]')).toHaveAttribute('data-pagination-state','ready',{timeout:60000});
 await page.locator('button[title^="Section 4 (第"]').click();const target=lineOf('## Section 4');await expect.poll(async()=>Math.abs(await editorLine(page)-target)).toBeLessThan(1.1);
 await expect.poll(()=>page.locator('[data-view=html] [data-heading-id][data-line="'+target+'"]').first().evaluate(el=>Math.abs(el.getBoundingClientRect().top-el.closest('[data-view]')!.firstElementChild!.getBoundingClientRect().top))).toBeLessThan(3);
 await previewAt(page,lineOf('Paragraph 2_6'));await expect.poll(async()=>Math.abs(await editorLine(page)-lineOf('Paragraph 2_6'))).toBeLessThan(1.1);
 const reference=await page.locator('[data-preview-reference]').getAttribute('data-preview-reference');const top=await page.locator('[data-view=html] > div').evaluate(el=>el.scrollTop);
 await page.getByRole('button',{name:'文档 (',exact:false}).click();await page.getByRole('button',{name:'新建文档',exact:true}).click();await ready(page);await page.getByRole('tab').first().click();await expect(page.locator('[data-pagination-state]')).toHaveAttribute('data-pagination-state','ready');expect(await page.locator('[data-preview-reference]').getAttribute('data-preview-reference')).toBe(reference);await expect.poll(()=>page.locator('[data-view=html] > div').evaluate((el,top)=>Math.abs(el.scrollTop-top),top)).toBeLessThan(3);
 await page.screenshot({path:info.outputPath('a4-source-sync.png')});
});

test('keeps sync when restoring hidden panes, width dialogs and all seven A4 pane combinations',async({page},info)=>{
 await boot(page);await page.getByRole('button',{name:'HTML 预览',exact:true}).click();await editorAt(page,lineOf('Paragraph 4_5'));await page.getByRole('button',{name:'HTML 预览',exact:true}).click();await expect.poll(()=>page.locator('[data-view=html] p[data-line="'+lineOf('Paragraph 4_5')+'"]').evaluate(el=>Math.abs(el.getBoundingClientRect().top-el.closest('[data-view]')!.firstElementChild!.getBoundingClientRect().top))).toBeLessThan(3);
 await page.getByRole('button',{name:'编辑器',exact:true}).click();await previewAt(page,lineOf('Paragraph 2_6'));await page.getByRole('button',{name:'编辑器',exact:true}).click();await expect.poll(async()=>Math.abs(await editorLine(page)-lineOf('Paragraph 2_6'))).toBeLessThan(1.1);
 const reference=await page.locator('[data-preview-reference]').getAttribute('data-preview-reference');await page.getByRole('button',{name:'设置',exact:true}).click();await expect(page.getByLabel('编辑器与 HTML 内容最大宽度')).toHaveValue('1024');await page.getByLabel('编辑器与 HTML 内容最大宽度').selectOption('800');await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).not.toBeVisible();await expect(page.locator('.mf-doc')).toHaveCSS('max-width','800px');expect(await page.locator('[data-preview-reference]').getAttribute('data-preview-reference')).toBe(reference);await expect(page.locator('textarea').locator('..')).toHaveCSS('max-width','800px');await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByLabel('编辑器与 HTML 内容最大宽度').selectOption('full');await page.keyboard.press('Escape');await expect(page.locator('.mf-doc')).toHaveCSS('max-width','100%');expect(await page.locator('[data-preview-reference]').getAttribute('data-preview-reference')).toBe(reference);
 await page.getByRole('button',{name:'A4 分页',exact:true}).click();await expect(page.locator('[data-pagination-state]')).toHaveAttribute('data-pagination-state','ready',{timeout:60000});const a4=await page.locator('[data-preview-reference]').getAttribute('data-preview-reference');
 const controls=[page.getByRole('button',{name:/侧边文档与大纲 \(侧边点击\)/}),page.getByRole('button',{name:'编辑器',exact:true}),page.getByRole('button',{name:'HTML 预览',exact:true})];
 for(let mask=1;mask<8;mask++){for(const control of controls)if(await control.getAttribute('aria-pressed')==='false')await control.click();for(const [i,control]of controls.entries())if(!(mask&(1<<i)))await control.click();for(const [i,control]of controls.entries()){await expect(control).toHaveAttribute('aria-pressed',String(Boolean(mask&(1<<i))));if(mask===(1<<i))await expect(control).toBeDisabled()}}
 await expect(page.locator('[data-preview-reference]')).toHaveAttribute('data-preview-reference',a4!);await page.setViewportSize({width:684,height:900});for(const name of ['outline','editor','html'])await expect(page.locator('[data-view='+name+']')).toBeVisible();expect(await page.locator('[data-workbench]').evaluate(el=>el.scrollWidth>el.clientWidth)).toBe(true);const workbench=page.locator('[data-workbench]');await workbench.evaluate(el=>{el.scrollLeft=el.scrollWidth});const horizontal=await workbench.evaluate(el=>el.scrollLeft);await editorAt(page,lineOf('Paragraph 5_3'));await expect(page.locator('[aria-current=location]')).toHaveAttribute('title',/^Section 5 /);await page.waitForTimeout(150);expect(await workbench.evaluate(el=>el.scrollLeft)).toBe(horizontal);await page.screenshot({path:info.outputPath('a4-three-panes-narrow.png')});
});

test('applies an outline jump selected while the replacement artifact is pending',async({page})=>{
 await boot(page);await page.evaluate(()=>{const post=Worker.prototype.postMessage;let hold=true;Worker.prototype.postMessage=function(this:Worker,message:unknown,options?:StructuredSerializeOptions|Transferable[]){const args=[message,options];if(hold){hold=false;setTimeout(()=>Reflect.apply(post,this,args),1200)}else Reflect.apply(post,this,args)}});await page.locator('textarea').fill(source+'\nPENDING_END');await expect(page.locator('[data-render-state]')).toHaveAttribute('data-render-state','pending');await page.locator('button[title^="Section 4 (第"]').click();await ready(page);const line=lineOf('## Section 4');await expect.poll(()=>page.locator('[data-view=html] [data-line="'+line+'"]').first().evaluate(el=>Math.abs(el.getBoundingClientRect().top-el.closest('[data-view]')!.firstElementChild!.getBoundingClientRect().top))).toBeLessThan(3);
 await page.locator('textarea').fill(Array.from({length:80},(_,i)=>'No heading paragraph '+i+' 内容\n').join('\n'));await ready(page);await expect(page.locator('[aria-current=location]')).toHaveCount(0);await editorAt(page,70);await expect.poll(()=>page.locator('[data-view=html] > div').evaluate(el=>el.scrollTop)).toBeGreaterThan(500);
});
