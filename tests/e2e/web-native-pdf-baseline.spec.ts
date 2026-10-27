import {writeFile} from 'node:fs/promises';
import {test,expect} from '@playwright/test';
import {pdfName,rowMarkers,paragraphMarkers} from '../fixtures/architecture/web-native-pdf-source';
for(const environment of ['development','built','http'] as const)for(const mathMode of ['mathml','svg'] as const)test(`Web native PDF handoff baseline ${environment} ${mathMode}`,async({page},info)=>{
 // Observe production handoff without opening an OS modal in unattended tests.
 // This interception is never reported as a saved native PDF.
 await page.addInitScript(()=>document.addEventListener('load',event=>{if(event.target instanceof HTMLIFrameElement&&event.target.title==='PDF导出文档'){const frame=event.target;frame.contentWindow!.print=()=>{frame.setAttribute('data-test-handoff','true')}}},true));
 if(environment==='http')await page.route('http://markflow-native.test/**',async route=>{const url=new URL(route.request().url()),response=await route.fetch({url:'http://127.0.0.1:4176'+url.pathname+url.search});await route.fulfill({response})});
 const origin=environment==='development'?'http://127.0.0.1:4175':environment==='built'?'http://127.0.0.1:4176':'http://markflow-native.test';
 await page.goto(origin+'/tests/fixtures/architecture/web-native-pdf-probe.html');await page.locator('#'+mathMode).click();const output=page.locator('[data-state]');await expect(output).toHaveAttribute('data-state','completed',{timeout:60000});
 await expect(output).toContainText('htmlSha256');const raw=await output.textContent()||'{}';const report:unknown=JSON.parse(raw);
 expect(report).toMatchObject({mathMode,jobTitle:pdfName+' '+mathMode,missingRows:[],missingParagraphs:[],finalMarker:true,laterSourcePresent:false,busy:false,saveObservedByApplication:false,result:{status:'completed',revision:1}});
 await info.attach('handoff-observation.json',{body:raw,contentType:'application/json'});
 const frame=page.locator('iframe[title="PDF导出文档"]');await expect(frame).toHaveAttribute('data-test-handoff','true');
 const inspected=await frame.evaluate(element=>{const doc=(element as HTMLIFrameElement).contentDocument!;return {html:doc.documentElement.outerHTML,text:doc.body.textContent||'',expectedPages:Number(doc.body.dataset.exportPages),actualPages:doc.querySelectorAll('.pagedjs_page').length,fractions:[...doc.querySelectorAll('math[display=block] mfrac')].map(node=>({width:node.getBoundingClientRect().width,available:node.closest('article')!.getBoundingClientRect().width})),math:doc.querySelectorAll('[data-mf-math-id]').length,svg:doc.querySelectorAll('svg').length,missingTargets:[...doc.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')].filter(link=>!doc.getElementById(link.getAttribute('href')!.slice(1))).map(link=>link.getAttribute('href'))}});
 expect(inspected.actualPages).toBe(inspected.expectedPages);expect(inspected.actualPages).toBeGreaterThan(2);expect(inspected.math).toBe(2);expect(inspected.svg).toBeGreaterThanOrEqual(mathMode==='svg'?4:2);expect(inspected.missingTargets).toEqual([]);
 if(mathMode==='mathml'){expect(inspected.fractions).toHaveLength(1);for(const fraction of inspected.fractions)expect(fraction.width).toBeLessThan(fraction.available/2)}
 for(const marker of [...rowMarkers,...paragraphMarkers,'CJK_CHECK','EXW0_FINAL_MARKER'])expect(inspected.text).toContain(marker);expect(inspected.text).not.toContain('EXW0_LATER_SOURCE');
 await writeFile(info.outputPath('frozen-paged.html'),inspected.html);await writeFile(info.outputPath('handoff-observation.json'),raw);
 if(environment==='built'){
  // Existing test browser only: useful content preflight, NOT native/system-save evidence.
  const proof=await page.context().newPage();await proof.setContent(inspected.html);await proof.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(image=>image.decode()))});
  await proof.pdf({path:info.outputPath('automated-preflight.pdf'),preferCSSPageSize:true,printBackground:true});await proof.close();
 }
 await frame.evaluate(element=>(element as HTMLIFrameElement).contentWindow!.dispatchEvent(new Event('afterprint')));await expect(frame).toHaveCount(0);
 if(environment==='http')expect(await page.evaluate(()=>isSecureContext)).toBe(false);
});

test('native print invocation failure cleans the actual delivery frame and releases busy',async({page})=>{
 await page.addInitScript(()=>document.addEventListener('load',event=>{if(event.target instanceof HTMLIFrameElement&&event.target.title==='PDF导出文档')event.target.contentWindow!.print=()=>{throw new Error('native-handoff-failed')}},true));
 await page.goto('http://127.0.0.1:4176/tests/fixtures/architecture/web-native-pdf-probe.html');await page.locator('#svg').click();const output=page.locator('[data-state]');await expect(output).toHaveAttribute('data-state','error',{timeout:60000});
 const report:unknown=JSON.parse(await output.textContent()||'{}');expect(report).toMatchObject({error:'Error: native-handoff-failed',busy:false,remainingFrames:0,saveObservedByApplication:false});expect(report).not.toHaveProperty('result');await expect(page.locator('iframe[title="PDF导出文档"]')).toHaveCount(0);
});
