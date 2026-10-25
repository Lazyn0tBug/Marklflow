import {test,expect,type Page} from '@playwright/test';
const pixel='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1S8AAAAASUVORK5CYII=';
async function ready(page:Page,markdown:string){await page.locator('textarea').first().fill(markdown);await expect(page.locator('[data-render-state]')).toHaveAttribute('data-render-state','ready')}
test('isolates TeX definitions across repeated document revisions',async({page})=>{
 await page.goto('/');await expect(page.locator('textarea').first()).toBeVisible();
 const md='# 宏隔离\n\n$\\newcommand{\\mfReview}{7}\\mfReview$';
 await ready(page,md);await expect(page.locator('.mf-doc math')).toContainText('7');
 await ready(page,md+'\n\n新修订');await expect(page.locator('.mf-doc math')).toContainText('7');
 await page.locator('textarea').first().fill('# 无宏定义\n\n$\\mfReview$');
 await expect(page.locator('[data-render-state]')).toHaveAttribute('data-render-state','error');
});
test('blocks corrupt SVG images instead of exporting a blank figure',async({page})=>{
 await page.goto('/');await expect(page.locator('textarea').first()).toBeVisible();
 await ready(page,'# SVG图片\n\n<svg width="40" height="40"><image href="data:image/png;base64,AAAA" width="40" height="40"/></svg>');
 await page.getByRole('button',{name:'导出',exact:true}).click();
 const event=page.waitForEvent('dialog');const action=page.getByRole('button',{name:'立即导出并保存'}).click();
 const dialog=await event;expect(dialog.message()).toContain('导出过程出错');await dialog.accept();await action;
});
test('shows unsupported content diagnostics and keeps static task state',async({page})=>{
 await page.goto('/');await expect(page.locator('textarea').first()).toBeVisible();
 await ready(page,'# 任务\n\n- [x] 已做\n- [ ] 待做');await expect(page.locator('.mf-doc')).toContainText('未完成');
 await page.locator('textarea').first().fill('# 静态边界\n\n<canvas>替代说明</canvas>');
 await expect(page.locator('[data-render-state]')).toHaveAttribute('data-render-state','error');await expect(page.locator('.mf-diagnostic')).toContainText('canvas');
});

test('keeps diagnostic-like literal formula text in MathML and SVG modes',async({page})=>{
 await page.goto('/');await expect(page.locator('textarea').first()).toBeVisible();
 await ready(page,'# 公式文本\n\n$\\text{data-mjx-error and mjx-merror}$');
 await expect(page.locator('.mf-doc math')).toContainText('data-mjx-error');
 await page.getByTitle(/当前公式输出模式/).click();
 await expect(page.locator('[data-render-state]')).toHaveAttribute('data-render-state','ready');
 await expect(page.locator('.mf-doc svg')).toHaveCount(1);
});
