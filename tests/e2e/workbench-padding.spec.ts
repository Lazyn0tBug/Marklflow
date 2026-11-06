import {test,expect,type Page} from './fixtures';
import {readFile} from 'node:fs/promises';

/**
 * The workbench spacing contract (docs/design/workbench-spacing-contract-2026-11-01.md):
 * the view clearance steps with the pane width, the code margin is one character wide, the line
 * number column follows the digit count, and the document margin stays with the paper.
 *
 * Every assertion measures the live layout and computes the expected value from the same rule, so
 * the contract can be tuned without rewriting the test. Eyeball first, test second.
 */
const STEPS=[{min:0,padding:0.75},{min:43.75,padding:1.125},{min:68.75,padding:1.5}];
const ALLOWANCE=0.5;

async function ready(page:Page){
 await page.goto('/');await expect(page.locator('[data-render-state]')).toHaveAttribute('data-render-state','ready',{timeout:30000});
}
const rootFontSize=(page:Page)=>page.evaluate(()=>parseFloat(getComputedStyle(document.documentElement).fontSize));
/** The clearance band a pane of the given width belongs to, in pixels. */
const clearanceFor=(width:number,root:number)=>STEPS.filter(step=>width>=step.min*root).at(-1)!.padding*root;
const paddingOf=(page:Page,selector:string)=>page.locator(selector).first().evaluate(el=>parseFloat(getComputedStyle(el).paddingLeft));
const paneWidth=(page:Page,view:string)=>page.locator('[data-view='+view+']').evaluate(el=>el.getBoundingClientRect().width);
/** The advance width of the given text in the element's own font. */
const textWidth=(page:Page,selector:string,text='0')=>page.locator(selector).first().evaluate((el,text)=>{
 const style=getComputedStyle(el),probe=document.createElement('span');
 probe.style.cssText='position:absolute;visibility:hidden;white-space:pre';
 for(const property of ['font-family','font-size','font-weight','font-style','letter-spacing','word-spacing'])probe.style.setProperty(property,style.getPropertyValue(property));
 probe.textContent=text;document.body.append(probe);
 const width=probe.getBoundingClientRect().width;probe.remove();return width;
},text);

test.use({viewport:{width:1440,height:900}});
// The byte path without a destination picker is the browser download; the picker is covered elsewhere.
test.beforeEach(async({page})=>{await page.addInitScript(()=>Object.defineProperty(window,'showSaveFilePicker',{value:undefined,configurable:true}))});

test('the view clearance steps with the pane width in both views',async({page})=>{
 await ready(page);
 const root=await rootFontSize(page);
 for(const view of ['editor','html']){
  const width=await paneWidth(page,view);
  expect(await paddingOf(page,'[data-view='+view+'] .mf-view')).toBeCloseTo(clearanceFor(width,root),1);
 }
 // A wider pane never yields a smaller clearance.
 const narrow=await paddingOf(page,'[data-view=html] .mf-view');
 await page.setViewportSize({width:2400,height:900});
 await page.waitForTimeout(300);
 const wide=await paddingOf(page,'[data-view=html] .mf-view');
 expect(wide).toBeGreaterThanOrEqual(narrow);
 expect(wide).toBeCloseTo(clearanceFor(await paneWidth(page,'html'),await rootFontSize(page)),1);
});

test('the code margin is one character wide and the line number column follows the digits',async({page})=>{
 await ready(page);
 const root=await rootFontSize(page);
 expect(await paddingOf(page,'textarea')).toBeCloseTo(await textWidth(page,'textarea'),1);
 const digits=await page.locator('textarea').evaluate(el=>String((el as HTMLTextAreaElement).value.split('\n').length).length);
 const column=await page.locator('[data-line-numbers]').evaluate(el=>el.getBoundingClientRect().width);
 expect(column).toBeCloseTo(await textWidth(page,'[data-line-numbers]','0'.repeat(digits))+ALLOWANCE*root,1);
});

test('the spacing scales with the root font size instead of fixed pixels',async({page})=>{
 await ready(page);
 const before={clearance:await paddingOf(page,'[data-view=html] .mf-view'),code:await paddingOf(page,'textarea')};
 await page.evaluate(()=>{document.documentElement.style.fontSize='20px'});
 await page.waitForTimeout(200);
 const root=await rootFontSize(page);
 expect(root).toBe(20);
 // The view clearance is rem-based: it follows the root font size instead of staying on the pixel value.
 const clearance=await paddingOf(page,'[data-view=html] .mf-view');
 expect(clearance).toBeCloseTo(clearanceFor(await paneWidth(page,'html'),root),1);
 expect(clearance).not.toBeCloseTo(before.clearance,1);
 // The code margin is character-based: it follows the code font, which is itself rem-sized.
 expect(await paddingOf(page,'textarea')).toBeCloseTo(await textWidth(page,'textarea'),1);
 expect(await paddingOf(page,'textarea')).not.toBeCloseTo(before.code,1);
 // The line number column is digits plus a rem allowance.
 const digits=await page.locator('textarea').evaluate(el=>String((el as HTMLTextAreaElement).value.split('\n').length).length);
 const column=await page.locator('[data-line-numbers]').evaluate(el=>el.getBoundingClientRect().width);
 expect(column).toBeCloseTo(await textWidth(page,'[data-line-numbers]','0'.repeat(digits))+ALLOWANCE*root,1);
});

test('the reading margin follows the sheet width',async({page})=>{
 await ready(page);
 const root=await rootFontSize(page);
 const margin=await paddingOf(page,'[data-view=html] .mf-doc');
 expect(margin).toBeGreaterThan(0);
 expect(margin).toBeLessThanOrEqual(3.5*root);
 // The margin follows the sheet, not the window, so a narrow pane keeps a readable column.
 const column=await page.locator('[data-view=html] .mf-doc').evaluate(el=>el.getBoundingClientRect().width-parseFloat(getComputedStyle(el).paddingLeft)*2);
 expect(column).toBeGreaterThan(400);
 await page.setViewportSize({width:900,height:900});
 await page.waitForTimeout(200);
 const narrow=await paddingOf(page,'[data-view=html] .mf-doc');
 expect(narrow).toBeLessThan(margin);
 expect(narrow).toBeGreaterThanOrEqual(root);
});

test('paged pages carry the page margin instead of the reading margin',async({page})=>{
 await ready(page);
 await page.getByRole('button',{name:'A4 分页',exact:true}).click();
 await expect(page.locator('[data-pagination-state]')).toHaveAttribute('data-pagination-state','ready',{timeout:60000});
 const sheet=page.locator('.pagedjs_page').first();
 expect(await sheet.locator('.mf-doc').evaluate(el=>parseFloat(getComputedStyle(el).paddingLeft))).toBe(0);
 // The theme's 20mm left margin is the only inset inside the page.
 const inset=await sheet.evaluate(el=>Math.round((el.querySelector('.mf-doc') as HTMLElement).getBoundingClientRect().left-el.getBoundingClientRect().left));
 expect(inset).toBe(76);
});

test('the exported HTML carries the margin once and drops it for print',async({page})=>{
 await ready(page);
 await page.getByRole('button',{name:'导出',exact:true}).click();
 const event=page.waitForEvent('download');await page.getByRole('button',{name:'立即导出并保存',exact:true}).click();
 const html=await readFile((await (await event).path())!, 'utf8');
 expect(html).toContain('--mf-content-padding:clamp(1rem,4cqi,3.5rem)');
 expect(html.match(/padding:var\(--mf-content-padding\)/g)).toHaveLength(1);
 expect(html).toContain('.mf-doc{padding:0!important}');
});
