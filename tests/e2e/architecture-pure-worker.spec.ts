import {test,expect} from '@playwright/test';
test('pure parser and schema load in a real Worker without DOM or renderer setup',async({page})=>{
 // Source-module smoke uses the existing dev harness, not production task scheduling (A3).
 await page.route('**/tests/fixtures/architecture/host.html',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Worker import smoke</title>'}));
 await page.goto('http://127.0.0.1:4175/tests/fixtures/architecture/host.html');
 const result=await page.evaluate(()=>new Promise<unknown>((resolve,reject)=>{
  const worker=new Worker('/tests/fixtures/architecture/pure-worker.ts',{type:'module'});
  const timer=setTimeout(()=>{worker.terminate();reject(new Error('Worker import timeout'))},10000);
  worker.onmessage=e=>{clearTimeout(timer);worker.terminate();resolve(e.data)};worker.onerror=e=>{clearTimeout(timer);worker.terminate();reject(new Error(e.message))};
 }));
 expect(result).toMatchObject({kind:'ready',text:'Worker © ≂̸',validAccepted:true,invalidAccepted:false,hasDOM:false,blocks:[{kind:'heading',sourceRange:{start:{line:1,offset:0}}},{kind:'paragraph',sourceRange:{start:{line:3,offset:15}}}]});
});

test('runs the Vite-built worker bundle with valid schema/CSS and no DOM',async({page})=>{
 const workers:string[]=[];page.on('worker',worker=>workers.push(worker.url()));
 await page.goto('http://127.0.0.1:4176/tests/fixtures/architecture/worker-probe.html');
 const output=page.locator('[data-worker-state]');await expect(output).toHaveAttribute('data-worker-state','ready');
 const result:unknown=JSON.parse(await output.textContent()||'null');expect(result).toMatchObject({kind:'ready',validAccepted:true,invalidAccepted:false,hasDOM:false,text:'Worker © ≂̸'});
 expect(workers.some(url=>url.includes('/assets/pure-worker-')&&url.endsWith('.js'))).toBe(true);
});
