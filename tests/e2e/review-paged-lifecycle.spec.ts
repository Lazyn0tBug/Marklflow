import {test,expect} from '@playwright/test';

test('recovers from an interrupted A4 preview without retaining an abandoned host',async({page})=>{
 await page.goto('/');const editor=page.locator('textarea').first();await expect(editor).toBeVisible();
 const markdown='# 分页生命周期\n\n'+Array.from({length:45},(_,i)=>'段落 '+i+'：'+ '分页完整性与宿主清理。'.repeat(12)).join('\n\n')+'\n\n## 文末\n\nFINAL_LIFECYCLE_END';
 await editor.fill(markdown);await expect(page.locator('[data-render-state]')).toHaveAttribute('data-render-state','ready');
 await page.getByRole('button',{name:'A4 分页',exact:true}).click();
 await page.getByRole('button',{name:'流式',exact:true}).click();
 await expect(page.locator('[data-render-state]')).toHaveAttribute('data-render-state','ready');
 await expect(page.locator('body > .mf-pagination')).toHaveCount(0,{timeout:30000});
 await page.getByRole('button',{name:'A4 分页',exact:true}).click();
 await expect(page.locator('[data-pagination-state]')).toHaveAttribute('data-pagination-state','ready',{timeout:60000});
 await expect(page.locator('.pagedjs_pages')).toContainText('FINAL_LIFECYCLE_END');
 expect(Number(await page.locator('[data-page-count]').getAttribute('data-page-count'))).toBeGreaterThan(1);
 await expect(page.locator('body > .mf-pagination')).toHaveCount(0);
 await page.getByRole('button',{name:'流式',exact:true}).click();
 await expect(page.locator('[data-render-state]')).toHaveAttribute('data-render-state','ready');
});
