import {test,expect} from '@playwright/test';
import {z} from 'zod';
import {writeFile} from 'node:fs/promises';
const reportSchema=z.object({modes:z.array(z.object({mode:z.string(),a:z.array(z.string()),b:z.array(z.string()),svgCount:z.number()})),corpus:z.array(z.object({mode:z.string(),math:z.number(),svg:z.number(),mapped:z.number()})),footnote:z.array(z.string()),unknown:z.string(),cancelled:z.string(),cancelSeen:z.boolean(),after:z.string(),maxActive:z.number(),baselineRestored:z.boolean(),dom:z.object({waiting:z.array(z.string()),blocked:z.boolean()}),secure:z.boolean(),version:z.string(),events:z.array(z.string())});
for(const environment of ['development','built','http'] as const)test(`MathJax documents share DOM without leaking macros or numbering in ${environment}`,async({page},testInfo)=>{
 if(environment==='http')await page.route('http://markflow-math.test/**',async route=>{const url=new URL(route.request().url()),response=await route.fetch({url:'http://127.0.0.1:4176'+url.pathname+url.search});await route.fulfill({response})});
 const origin=environment==='development'?'http://127.0.0.1:4175':environment==='built'?'http://127.0.0.1:4176':'http://markflow-math.test';
 await page.goto(origin+'/tests/fixtures/architecture/math-dom-probe.html');const output=page.locator('[data-state]');await expect(output).toHaveAttribute('data-state','ready',{timeout:25000});
 const raw=await output.textContent()||'null';await testInfo.attach('math-dom-report.json',{body:raw,contentType:'application/json'});await writeFile(testInfo.outputPath('math-dom-report.json'),raw);const report=reportSchema.parse(JSON.parse(raw));
 expect(report).toMatchObject({cancelSeen:true,maxActive:1,baselineRestored:true,version:'3.2.2',dom:{waiting:[],blocked:false}});expect(report.footnote).toEqual(['a','c','b']);expect(report.events[0]).toContain('ALPHA');expect(report.events[1]).toContain('BETA');expect(report.dom).not.toHaveProperty('active');expect(report.cancelled).toContain('cancelled');expect(report.unknown).toContain('公式解析失败');expect(report.after).toContain('(1)');
 for(const mode of report.modes){expect(mode.a[0]).toContain('ALPHA');expect(mode.a[1]).toContain('ALPHA');expect(mode.b[0]).toContain('BETA');expect(mode.b[1]).toContain('BETA');expect(mode.a[2]).toContain('(1)');expect(mode.a[3]).toContain('(2)');expect(mode.b[2]).toContain('(1)');expect(mode.svgCount).toBe(mode.mode==='svg'?4:0)}
 for(const corpus of report.corpus){expect(corpus.mapped).toBeGreaterThan(0);expect(corpus.mode==='svg'?corpus.svg:corpus.math).toBe(2)}
 if(environment==='http')expect(report.secure).toBe(false);
});
