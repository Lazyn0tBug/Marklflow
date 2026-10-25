import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import JSZip from 'jszip';
test('exports a resource ZIP through the common modal with portable source and verified bytes',async({page},info)=>{
 const data='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1S8AAAAASUVORK5CYII=';
 await page.goto('/');await page.locator('textarea').fill('# BUNDLE_SOURCE\n\n![image]('+data+')');await expect(page.locator('[data-render-state]')).toHaveAttribute('data-render-state','ready');await page.getByRole('button',{name:'导出',exact:true}).click();await page.getByRole('button',{name:/Markdown 资源包/}).click();const download=page.waitForEvent('download');await page.getByRole('button',{name:'立即导出并保存',exact:true}).click();const file=info.outputPath('source.zip');await(await download).saveAs(file);const zip=await JSZip.loadAsync(await readFile(file));const hash=createHash('sha256').update(Buffer.from(data.split(',')[1]!,'base64')).digest('hex'),asset='assets/'+hash+'.png';expect(await zip.file('document.md')!.async('string')).toContain(asset);expect(await zip.file(asset)!.async('base64')).toBe(data.split(',')[1]);expect(await zip.file('manifest.json')!.async('string')).toContain(hash);await expect(page.getByText(/已生成并发起下载/)).toBeVisible();
});
