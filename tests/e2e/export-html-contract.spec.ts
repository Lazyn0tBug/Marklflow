import {test,expect} from '@playwright/test';
import {z} from 'zod';
const math=z.object({id:z.string(),line:z.string(),end:z.string(),text:z.string(),display:z.boolean(),hasSvg:z.boolean(),hasHidden:z.boolean()});
const reportSchema=z.object({reports:z.array(z.object({mathMode:z.enum(['mathml','svg']),math:z.array(math),hiddenInvisible:z.boolean(),html:z.string(),other:z.string(),repeat:z.array(z.string()),unknown:z.string(),recovered:z.boolean(),config:z.string(),serialized:z.number(),frozen:z.boolean(),sourceAttached:z.boolean()})),assetReport:z.object({reads:z.number(),assets:z.number(),title:z.string(),images:z.number(),hash:z.string(),immutable:z.boolean(),size:z.string()}),baselineRestored:z.boolean(),secure:z.boolean(),version:z.string(),dom:z.object({waiting:z.array(z.string()),blocked:z.boolean()})});
for(const environment of ['development','built','http'] as const)test(`canonical export HTML retains same-compilation math and frozen resources in ${environment}`,async({page},testInfo)=>{
 if(environment==='http')await page.route('http://markflow-export.test/**',async route=>{const url=new URL(route.request().url()),response=await route.fetch({url:'http://127.0.0.1:4176'+url.pathname+url.search});await route.fulfill({response})});
 const origin=environment==='development'?'http://127.0.0.1:4175':environment==='built'?'http://127.0.0.1:4176':'http://markflow-export.test';
 await page.goto(origin+'/tests/fixtures/architecture/export-html-probe.html');const output=page.locator('[data-state]');await expect(output).not.toHaveAttribute('data-state','loading',{timeout:30000});expect(await output.getAttribute('data-state'),await output.textContent()||'probe error').toBe('ready');
 const raw=await output.textContent()||'null';await testInfo.attach('export-html-report.json',{body:raw,contentType:'application/json'});const report=reportSchema.parse(JSON.parse(raw));
 expect(report).toMatchObject({baselineRestored:true,version:'3.2.2',dom:{waiting:[],blocked:false},assetReport:{reads:1,assets:1,title:'Frozen',images:2,immutable:true,size:'15px'}});expect(report.assetReport.hash).toMatch(/^[a-f0-9]{64}$/);
 for(const item of report.reports){
  expect(item).toMatchObject({hiddenInvisible:true,recovered:true,serialized:1,frozen:true,sourceAttached:false});expect(item.math).toHaveLength(7);expect(item.math.filter(node=>node.display)).toHaveLength(3);expect(new Set(item.math.map(node=>node.id)).size).toBe(7);
  for(const node of item.math){expect(Number(node.line)).toBeGreaterThan(0);expect(Number(node.end)).toBeGreaterThanOrEqual(Number(node.line));expect(node.hasSvg).toBe(item.mathMode==='svg');expect(node.hasHidden).toBe(item.mathMode==='svg')}
  expect(item.math[1]?.text).toContain('Q');expect(item.math[2]?.text).toContain('Q');expect(item.math[2]?.text).toContain('(1)');expect(item.math[3]?.text).toContain('(2)');expect(item.other).toContain('(1)');expect(item.repeat).toEqual(item.math.map(node=>node.text));
  expect(item.math.slice(-3).map(node=>node.text.trim())).toEqual(['a','c','b']);expect(item.unknown).toContain('公式解析失败');expect(item.config).toMatch(/^[a-f0-9]{64}$/);
  expect(item.html).toContain('start="3"');expect(item.html).toContain('colspan="2"');expect(item.html).toContain('language-typescript');expect(item.html).not.toContain('<script');expect(item.html).toContain('href="#mf_author_%E7%9B%AE%E6%A0%87"');
 }
 expect(report.reports[1]?.math.map(node=>node.text.replace(/\s+/g,''))).toEqual(report.reports[0]?.math.map(node=>node.text.replace(/\s+/g,'')));
 if(environment==='http')expect(report.secure).toBe(false);
});
