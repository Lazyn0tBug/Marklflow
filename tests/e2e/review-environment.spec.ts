import {test,expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
test('records capability detection separately from rendered verification',async({page,browser},info)=>{
 await page.goto('/');await expect(page.locator('[data-render-state]')).toHaveAttribute('data-render-state','ready');
 const probes=await page.evaluate(async()=>{await document.fonts.ready;return {grid:CSS.supports('display','grid'),namedContainer:CSS.supports('container-name','mf-document'),containerUnits:CSS.supports('width','1cqi'),fluidUnits:CSS.supports('width','clamp(1rem,2cqi,3rem)'),oklch:CSS.supports('color','oklch(50% .1 180)'),cryptoDigest:!!crypto.subtle?.digest,dialog:typeof HTMLDialogElement!=='undefined',fontStatus:document.fonts.status}});
 expect(probes.grid&&probes.namedContainer&&probes.containerUnits&&probes.fluidUnits&&probes.cryptoDigest&&probes.dialog).toBe(true);
 await writeFile(info.outputPath('runtime.json'),JSON.stringify({browser:browser.version(),platform:process.platform,date:new Date().toISOString(),probes,limits:'API/grammar detection is not glyph coverage, Word, physical print or cross-browser acceptance'},null,2));
});
