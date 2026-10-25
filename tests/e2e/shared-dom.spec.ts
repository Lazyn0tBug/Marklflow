import {test,expect} from '@playwright/test';
for(const environment of ['development','built','http'] as const)test(`shared DOM steps hold the real Worker role and yield to export in ${environment}`,async({page})=>{
 if(environment==='http')await page.route('http://markflow-dom.test/**',async route=>{const url=new URL(route.request().url()),response=await route.fetch({url:'http://127.0.0.1:4176'+url.pathname+url.search});await route.fulfill({response})});
 const origin=environment==='development'?'http://127.0.0.1:4175':environment==='built'?'http://127.0.0.1:4176':'http://markflow-dom.test';
 await page.goto(origin+'/tests/fixtures/architecture/shared-dom-probe.html');const output=page.locator('[data-state]');await expect(output).toHaveAttribute('data-state','ready');
 const report:unknown=JSON.parse(await output.textContent()||'null');expect(report).toMatchObject({order:['background','export','foreground','foreground'],waitingHeld:true,startsWhileWaiting:1,preparations:2,committed:1,first:'cancelled',hosts:0,active:0});if(environment==='http')expect(report).toMatchObject({secure:false});
});
