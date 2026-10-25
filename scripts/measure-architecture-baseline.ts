import {chromium} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {cpus,platform,release,totalmem} from 'node:os';
import {execFileSync} from 'node:child_process';
import {z} from 'zod';
const manifest=z.object({workloads:z.array(z.object({id:z.string(),file:z.string(),sha256:z.string(),expectedEnd:z.string()}))}).parse(JSON.parse(await readFile('tests/fixtures/architecture/manifest.json','utf8')));
const browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 await page.goto(process.env.BASELINE_URL||'http://127.0.0.1:4175');
 await page.locator('[data-render-state="ready"]').waitFor({timeout:60000});
 const results=[];
 for(const fixture of manifest.workloads){
  const markdown=await readFile('tests/fixtures/architecture/'+fixture.file,'utf8');
  if(createHash('sha256').update(markdown).digest('hex')!==fixture.sha256)throw new Error('Fixture changed: '+fixture.id);
  const result=await page.evaluate(async({markdown,end})=>{
   const renderer:typeof import('../src/core/render/documentRenderer')=await import(new URL('/src/core/render/documentRenderer.ts',location.href).href);
   const paginator:typeof import('../src/core/render/documentPaginator')=await import(new URL('/src/core/render/documentPaginator.ts',location.href).href);
   const parser:typeof import('../src/core/parser/markdownParser')=await import(new URL('/src/core/parser/markdownParser.ts',location.href).href);
   const storage:typeof import('../src/core/storage/storage')=await import(new URL('/src/core/storage/storage.ts',location.href).href);
   const parseMs:number[]=[],renderMs:number[]=[];
   const before={stages:document.querySelectorAll('.mf-pagination').length,styles:document.querySelectorAll('style').length};
   for(let i=0;i<3;i++){let t=performance.now();parser.extractOutline(markdown);parseMs.push(performance.now()-t);t=performance.now();const art=await renderer.renderDocument(markdown,'mathml');renderer.assertArtifact(art);if(!art.html.includes(end))throw new Error('Missing flow end');renderMs.push(performance.now()-t)}
   const doc=storage.createNewDocument('baseline');doc.markdown=markdown;
   const t=performance.now(),pages=await paginator.paginateDocument(doc);const paginateMs=performance.now()-t;
   if(!pages.html.includes(end))throw new Error('Missing paginated end');
   const after={stages:document.querySelectorAll('.mf-pagination').length,styles:document.querySelectorAll('style').length};
   return {parseMs,renderMs,paginateMs,pages:pages.total,artifactBytes:new TextEncoder().encode(pages.html+pages.css).byteLength,before,after,fonts:Array.from(document.fonts).map(f=>({family:f.family,status:f.status})),bodyFont:getComputedStyle(document.body).fontFamily};
  },{markdown,end:fixture.expectedEnd});
  results.push({id:fixture.id,sha256:fixture.sha256,...result});console.log(fixture.id+': '+JSON.stringify(result));
 }
 const evidence={schemaVersion:1,capturedAt:new Date().toISOString(),sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),harness:'Vite development source modules, real Chromium, 3 sequential render samples and 1 pagination sample per workload; not production performance or release coverage',environment:{os:platform(),release:release(),cpu:cpus()[0]?.model,logicalCpus:cpus().length,memoryBytes:totalmem(),browser:browser.version(),viewport:{width:1440,height:1000}},results};
 await writeFile(process.env.BASELINE_OUTPUT||'docs/acceptance/architecture-a0-baseline.json',JSON.stringify(evidence,null,2)+'\n');
}finally{await browser.close()}
