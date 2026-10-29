import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
test('production parsing, math, diagrams, pagination and HTML export use only packaged runtime resources',async({page,context,browser},info)=>{
 const remote:string[]=[],local:string[]=[];
 await context.route('**/*',async route=>{const url=new URL(route.request().url());if(['http:','https:'].includes(url.protocol)&&url.origin!=='http://127.0.0.1:4173'){remote.push(url.href);await route.abort()}else{local.push(url.pathname);await route.continue()}});
 await page.addInitScript(()=>Object.defineProperty(window,'showSaveFilePicker',{value:undefined,configurable:true}));
 await page.goto('/');await expect(page.locator('[data-render-state]')).toHaveAttribute('data-render-state','ready');
 const source=['# PACKAGED_RUNTIME_SOURCE','','本地公式 $x^2+1$。','','```mermaid','graph LR; A[LOCAL_ALPHA]-->B[LOCAL_OMEGA];','```','','```dot','digraph Dependencies { a -> b; }','```','','PACKAGED_RUNTIME_END'].join('\n');
 await page.locator('textarea').fill(source);await expect(page.locator('[data-render-state]')).toHaveAttribute('data-render-state','ready');await expect(page.locator('.mf-doc math')).toHaveCount(1);await expect(page.locator('.mf-doc svg')).toHaveCount(2);
 await page.getByRole('button',{name:'A4 分页',exact:true}).click();await expect(page.locator('[data-pagination-state]')).toHaveAttribute('data-pagination-state','ready',{timeout:60000});await expect(page.locator('.pagedjs_pages')).toContainText('PACKAGED_RUNTIME_END');
 await page.getByRole('button',{name:'导出',exact:true}).click();await page.getByRole('button',{name:/纯净静态阅读 HTML/}).click();const event=page.waitForEvent('download');await page.getByRole('button',{name:'立即导出并保存',exact:true}).click();const path=info.outputPath('packaged-reading.html');await(await event).saveAs(path);const html=await readFile(path,'utf8');expect(html).toContain('PACKAGED_RUNTIME_END');expect(html).not.toMatch(/<script\b/i);expect(remote).toEqual([]);expect(local).toContain('/vendor/mathjax/tex-mml-svg.js');
 await info.attach('packaged-runtime.json',{body:JSON.stringify({browserVersion:browser.version(),userAgent:await page.evaluate(()=>navigator.userAgent),allowedOrigin:'http://127.0.0.1:4173',localResourcePaths:[...new Set(local)],unexpectedRemoteRequests:remote,applicationOfflineColdStartTested:false}),contentType:'application/json'});
});
