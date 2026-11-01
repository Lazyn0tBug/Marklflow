import {test,expect,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';

/**
 * The workbench keeps a thin gutter around the view and puts the reading margin on the document itself.
 * The paged output replaces that margin with the page margins, so a page never carries both.
 */
async function ready(page:Page){
 await page.goto('/');await expect(page.locator('[data-render-state]')).toHaveAttribute('data-render-state','ready',{timeout:30000});
}
const paddingOf=(page:Page,selector:string)=>page.locator(selector).first().evaluate(el=>parseFloat(getComputedStyle(el).paddingLeft));

test.use({viewport:{width:1440,height:900}});
// The byte path without a destination picker is the browser download; the picker is covered elsewhere.
test.beforeEach(async({page})=>{await page.addInitScript(()=>Object.defineProperty(window,'showSaveFilePicker',{value:undefined,configurable:true}))});

test('keeps the view gutter thin and the reading margin on the document',async({page})=>{
 await ready(page);
 expect(await paddingOf(page,'[data-view=html] > div')).toBe(48);
 const margin=await paddingOf(page,'[data-view=html] .mf-doc');
 expect(margin).toBeGreaterThan(0);
 expect(margin).toBeLessThanOrEqual(56);
 // The margin follows the sheet, not the window, so a narrow pane keeps a readable column.
 const column=await page.locator('[data-view=html] .mf-doc').evaluate(el=>el.getBoundingClientRect().width-parseFloat(getComputedStyle(el).paddingLeft)*2);
 expect(column).toBeGreaterThan(400);
});

test('scales the reading margin with the sheet width',async({page})=>{
 await ready(page);
 const wide=await paddingOf(page,'[data-view=html] .mf-doc');
 await page.setViewportSize({width:900,height:900});
 await page.waitForTimeout(200);
 const narrow=await paddingOf(page,'[data-view=html] .mf-doc');
 expect(narrow).toBeLessThan(wide);
 expect(narrow).toBeGreaterThanOrEqual(16);
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
 expect(html).toContain('--mf-content-padding:clamp(16px,4cqi,56px)');
 expect(html.match(/padding:var\(--mf-content-padding\)/g)).toHaveLength(1);
 expect(html).toContain('.mf-doc{padding:0!important}');
});
