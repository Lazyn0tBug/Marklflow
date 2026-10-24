import {test,expect} from '@playwright/test';
test.use({viewport:{width:1280,height:900}});
test('keeps all seven pane combinations under user control and prevents hiding the last',async({page})=>{
 await page.goto('/');await expect(page.locator('textarea')).toBeVisible();
 const controls=[page.getByRole('button',{name:/侧边文档与大纲 \(侧边点击\)/}),page.getByRole('button',{name:'编辑器',exact:true}),page.getByRole('button',{name:'HTML 预览',exact:true})];
 for(let mask=1;mask<8;mask++){
  for(const control of controls)if(await control.getAttribute('aria-pressed')==='false')await control.click();
  for(let i=0;i<3;i++)if(!(mask&(1<<i)))await controls[i].click();
  for(let i=0;i<3;i++)await expect(controls[i]).toHaveAttribute('aria-pressed',String(Boolean(mask&(1<<i))));
  if((mask&(mask-1))===0)await expect(controls[Math.log2(mask)]).toBeDisabled();
 }
 await page.setViewportSize({width:684,height:900});
 for(const name of ['outline','editor','html'])await expect(page.locator('[data-view='+name+']')).toBeVisible();
 expect(await page.locator('[data-workbench]').evaluate(n=>n.scrollWidth>n.clientWidth)).toBe(true);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('opens hidden width settings as a real dialog and closes with Escape',async({page},info)=>{
 await page.goto('/');await expect(page.locator('textarea')).toBeVisible();await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.getByRole('button',{name:'设置',exact:true}).click();const dialog=page.getByRole('dialog',{name:'工作台设置'});await expect(dialog).toBeVisible();
 await expect(page.getByLabel('编辑器与 HTML 内容最大宽度')).toHaveValue('1024');await page.getByLabel('编辑器与 HTML 内容最大宽度').selectOption('800');
 await page.screenshot({path:info.outputPath('settings.png')});await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();
 await expect(page.locator('.mf-doc')).toHaveCSS('max-width','800px');await expect(page.getByRole('button',{name:'设置',exact:true})).toBeFocused();
});
test('saves undo and redo revisions and restores the selected document math preference',async({page})=>{
 await page.goto('/');const editor=page.locator('textarea');await expect(editor).toBeVisible();
 await editor.fill('# 最初');await page.getByRole('button',{name:'保存',exact:true}).click();await editor.fill('# 更新');await editor.press('Control+z');
 await expect(editor).toHaveValue('# 最初');await expect(page.getByText('已保存', {exact:true})).toBeVisible();await page.reload();await expect(page.locator('textarea')).toHaveValue('# 最初');
 await page.getByRole('button',{name:'MathML',exact:true}).click();await page.getByRole('button',{name:'新建文档',exact:true}).click();
 await expect(page.getByRole('button',{name:'MathML',exact:true})).toBeVisible();
});
test('synchronizes outline, editor and HTML using stable source headings',async({page})=>{
 await page.goto('/');const editor=page.locator('textarea');await expect(editor).toBeVisible();
 const md=Array.from({length:12},(_,i)=>'# 章节'+i+'\n\n'+Array.from({length:20},(_,j)=>'段落'+i+'_'+j+' 内容').join('\n\n')).join('\n\n');
 await editor.fill(md);await expect(page.locator('[data-render-state]')).toHaveAttribute('data-render-state','ready');
 await page.getByRole('button',{name:/^大纲 \(/}).click();await page.locator('button[title^="章节5 (第"]').click();
 await expect.poll(()=>editor.evaluate(n=>n.scrollTop)).toBeGreaterThan(4000);
 const preview=page.locator('[data-view=html] > div');await expect.poll(()=>preview.evaluate(n=>n.scrollTop)).toBeGreaterThan(500);
 await editor.press('Control+Home');await expect.poll(()=>preview.evaluate(n=>n.scrollTop)).toBe(0);
 await preview.hover();await page.mouse.wheel(0,100000);await expect.poll(()=>editor.evaluate(n=>n.scrollTop)).toBeGreaterThan(5000);
 await expect(page.locator('[aria-current=location]')).toHaveCount(1);
});
