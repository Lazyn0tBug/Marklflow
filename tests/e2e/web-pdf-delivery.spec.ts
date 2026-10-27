import {test,expect} from '@playwright/test';
import {z} from 'zod';
const reportSchema=z.object({beforeprintObserved:z.literal(true),exportBusyAtNativeCall:z.literal(true),domStagesAtNativeCall:z.literal(0),domAtNativeCall:z.object({active:z.undefined().optional(),waiting:z.array(z.string()).length(0),blocked:z.literal(false)}),busy:z.literal(false),saveObservedByApplication:z.literal(false),result:z.object({status:z.literal('completed'),revision:z.literal(1),message:z.string()})});
test('Web PDF adapter hands off frozen HTML without holding the shared DOM step',async({page},info)=>{
 await page.addInitScript(()=>document.addEventListener('load',event=>{
  if(!(event.target instanceof HTMLIFrameElement)||event.target.title!=='PDF导出文档')return;const frame=event.target;
  frame.contentWindow!.print=()=>{frame.contentWindow!.dispatchEvent(new Event('beforeprint'));frame.setAttribute('data-native-called','true')};
 },true));
 await page.goto('http://127.0.0.1:4176/tests/fixtures/architecture/web-native-pdf-probe.html');await page.locator('#svg').click();const output=page.locator('[data-state]');await expect(output).toHaveAttribute('data-state','completed',{timeout:60000});
 const raw=await output.textContent()||'{}',report=reportSchema.parse(JSON.parse(raw));expect(report.result.message).toContain('交由浏览器处理');expect(report.result.message).not.toContain('已保存');await info.attach('web-pdf-delivery.json',{body:raw,contentType:'application/json'});
 const frame=page.locator('iframe[title="PDF导出文档"]');await expect(frame).toHaveAttribute('data-native-called','true');await expect(page.frameLocator('iframe[title="PDF导出文档"]').locator('body')).toContainText('EXW0_FINAL_MARKER');
 await frame.evaluate(element=>(element as HTMLIFrameElement).contentWindow!.dispatchEvent(new Event('afterprint')));await expect(frame).toHaveCount(0);
});
