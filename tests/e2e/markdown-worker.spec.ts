import {test,expect} from '@playwright/test';
import {z} from 'zod';
import {summarizeMarkdown} from '../../src/core/parse/markdownSummary';
for(const environment of ['development','built','http'] as const)test(`single Markdown worker parses and reports errors consistently in ${environment}`,async({page})=>{
 const workerUrls:string[]=[];page.on('worker',worker=>workerUrls.push(worker.url()));
 if(environment==='http')await page.route('http://markflow-worker.test/**',async route=>{const url=new URL(route.request().url()),response=await route.fetch({url:'http://127.0.0.1:4176'+url.pathname+url.search});await route.fulfill({response})});
 const origin=environment==='development'?'http://127.0.0.1:4175':environment==='built'?'http://127.0.0.1:4176':'http://markflow-worker.test';
 await page.goto(origin+'/tests/fixtures/architecture/markdown-worker-probe.html');const output=page.locator('[data-parse-state]');await expect(output).toHaveAttribute('data-parse-state','ready',{timeout:25000});
 const raw:unknown=JSON.parse(await output.textContent()||'null');
 const reportSchema=z.object({source:z.string(),first:z.object({summary:z.unknown(),sourceMap:z.unknown()}),second:z.object({summary:z.unknown()}),starts:z.number(),startsAfterHit:z.number(),cacheHit:z.boolean()});
 const report=reportSchema.parse(raw),expected=summarizeMarkdown(report.source);expect(report.first.summary).toEqual(expected);expect(report.first.sourceMap).toEqual(expected.blocks.map(b=>({nodeId:b.nodeId,...b.sourceRange})));expect(report.second.summary).toEqual(summarizeMarkdown('# 第二次 🧪\r\n\r\n新段落'));expect(report).toMatchObject({starts:2,startsAfterHit:1,cacheHit:true});expect(raw).toMatchObject({error:{type:'error',code:'input',execution:{task:{taskId:'raw-probe'}}}});
 if(environment==='http')expect(raw).toMatchObject({secure:false,uuid:'undefined',subtle:'undefined'});
 expect(workerUrls).toHaveLength(2);if(environment!=='development')expect(workerUrls.every(url=>/\/assets\/markdownWorker-[^/]+\.js$/.test(url))).toBe(true);
});
