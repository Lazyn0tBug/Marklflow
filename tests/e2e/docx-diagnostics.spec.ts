import {test,expect} from './fixtures';
import JSZip from 'jszip';
import {readFile} from 'node:fs/promises';
import fixture from '../fixtures/docx-math/o0-cases.json' with {type:'json'};
import omml from '../fixtures/docx-math/omml-cases.json' with {type:'json'};
for(const width of [1280,390])test('DOCX groups formulas, retains details and requests consent once at '+width,async({page},info)=>{
 await page.setViewportSize({width,height:900});await page.goto('/');await expect(page.locator('[data-render-state]')).toHaveAttribute('data-render-state','ready');await page.locator('textarea').fill(omml.cases[0]!.markdown);await expect(page.locator('[data-render-state]')).toHaveAttribute('data-render-state','ready');await page.getByRole('button',{name:'导出',exact:true}).click();await page.getByRole('button',{name:/Word 原生文档/}).click();const report=page.getByRole('region',{name:'DOCX 兼容性提示'}),action=page.getByRole('button',{name:/^(立即导出并保存|确认并导出)$/}),details=report.locator('details');await action.click();await expect(report).toContainText('本次 2 个公式');await expect(details).not.toHaveAttribute('open');await expect(report.getByText('line-7：公式转为图片')).not.toBeVisible();await expect(action).toBeDisabled();await expect(report.getByRole('checkbox')).toHaveCount(1);await report.locator('summary').click();await expect(report).toContainText('line-7');await expect(details.locator('li')).toHaveCount(2);await page.screenshot({path:info.outputPath('docx-details-'+width+'.png')});await report.locator('summary').click();await report.getByRole('checkbox').check();await expect(action).toBeEnabled();await page.screenshot({path:info.outputPath('docx-summary-'+width+'.png')});const download=page.waitForEvent('download');await action.click();const file=await download;expect(file.suggestedFilename()).toMatch(/\.docx$/);
 // Word draws the embedded SVG when it can and does not fall back to the raster copy when it cannot, so the
 // raster fallback must never be a blank image: a fully transparent picture is a few hundred bytes.
 const path=info.outputPath('docx-'+width+'.docx');await file.saveAs(path);const zip=await JSZip.loadAsync(await readFile(path));const xml=await zip.file('word/document.xml')!.async('string');
 expect(xml).toContain('svgBlip');
 const media=Object.keys(zip.files).filter(name=>name.startsWith('word/media/')&&!zip.files[name]?.dir);
 expect(media.some(name=>name.endsWith('.svg'))).toBe(true);
 for(const name of media.filter(name=>name.endsWith('.png'))){const bytes=(await zip.file(name)!.async('nodebuffer')).length;expect(bytes,name).toBeGreaterThan(1024);}
 await expect(page.getByText(/已生成并发起下载/)).toBeVisible();await page.keyboard.press('Escape');await page.getByRole('button',{name:'导出',exact:true}).click();await action.click();await expect(page.getByRole('checkbox',{name:'接受图片静态化及语义重排'})).not.toBeChecked();await expect(action).toBeDisabled();
});
test('DOCX blockers stay visible and cannot be bypassed by confirmation',async({page})=>{
 await page.goto('/');await expect(page.locator('[data-render-state]')).toHaveAttribute('data-render-state','ready');await page.locator('textarea').fill(fixture.cases[1]!.markdown);await page.getByRole('button',{name:'导出',exact:true}).click();await page.getByRole('button',{name:/Word 原生文档/}).click();const report=page.getByRole('region',{name:'DOCX 兼容性提示'});await page.getByRole('button',{name:'立即导出并保存',exact:true}).click();await expect(report).toContainText('原始MathML');await expect(report.getByRole('alert')).toBeVisible();await expect(report.getByRole('checkbox')).toHaveCount(0);await expect(page.getByRole('button',{name:'立即导出并保存',exact:true})).toBeDisabled();
});
test('invalid LaTeX fails before compatibility confirmation or delivery',async({page})=>{
 await page.goto('/');await expect(page.locator('[data-render-state]')).toHaveAttribute('data-render-state','ready');await page.locator('textarea').fill(fixture.cases[2]!.markdown);await expect(page.locator('[data-render-state]')).toHaveAttribute('data-render-state','error');await page.getByRole('button',{name:'导出',exact:true}).click();await page.getByRole('button',{name:/Word 原生文档/}).click();const failure=page.waitForEvent('dialog'),action=page.getByRole('button',{name:/^(立即导出并保存|确认并导出)$/}).click();const dialog=await failure;expect(dialog.message()).toContain('公式');await dialog.accept();await action;await expect(page.getByText(/已生成并发起下载/)).toHaveCount(0);await expect(page.getByRole('button',{name:'立即导出并保存',exact:true})).toBeEnabled();
});

// Exercise the existing download path; picker capability is covered separately.
test.beforeEach(async({page})=>{await page.addInitScript(()=>Object.defineProperty(window,'showSaveFilePicker',{value:undefined,configurable:true}))});
