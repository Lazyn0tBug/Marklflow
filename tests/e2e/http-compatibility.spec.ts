import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
test('previews and exports on a real insecure HTTP origin without randomUUID or subtle',async({page},info)=>{
 const pixel='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1S8AAAAASUVORK5CYII=';
 await page.route('http://markflow.test/**',async route=>{
  const url=new URL(route.request().url());const response=await route.fetch({url:'http://127.0.0.1:4173'+url.pathname+url.search});await route.fulfill({response});
 });
 await page.goto('http://markflow.test/');
 expect(await page.evaluate(()=>({secure:isSecureContext,uuid:typeof crypto.randomUUID,subtle:typeof crypto.subtle}))).toEqual({secure:false,uuid:'undefined',subtle:'undefined'});
 await expect(page.locator('textarea')).toBeVisible();const markdown='# HTTP兼容\n\n公式 $x^2$\n\n![图片]('+pixel+')';await page.locator('textarea').fill(markdown);
 await expect(page.locator('[data-render-state]')).toHaveAttribute('data-render-state','ready');
 await page.getByRole('button',{name:'导出',exact:true}).click();const event=page.waitForEvent('download');await page.getByRole('button',{name:'立即导出并保存'}).click();
 const file=info.outputPath('http-export.html');await (await event).saveAs(file);const html=await readFile(file,'utf8');
 expect(html).toContain('<math');expect(html).toMatch(/<msup(?:\s|>)/);expect(html).toContain(pixel);
 const payload=html.match(/<script id="markflow-source-payload" type="application\/json">([^<]+)<\/script>/)![1];const doc=JSON.parse(decodeURIComponent(Buffer.from(payload,'base64').toString('ascii')));
 expect(doc.markdown).toBe(markdown);expect(doc.assets[0].sha256).toBe(createHash('sha256').update(Buffer.from(pixel.split(',')[1],'base64')).digest('hex'));
 await page.getByRole('button',{name:'取消',exact:true}).click();await page.locator('input[type=file]').setInputFiles(file);await expect(page.locator('textarea')).toHaveValue(markdown);await expect(page.locator('[data-render-state]')).toHaveAttribute('data-render-state','ready');
});

