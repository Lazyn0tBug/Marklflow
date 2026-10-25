import {chromium} from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {cpus,platform,release,totalmem} from 'node:os';
import {execFileSync} from 'node:child_process';
import {z} from 'zod';
import {dirname} from 'node:path';
import {measurementOutput} from './architecture-baseline-contract';
const output=measurementOutput(process.env.BASELINE_OUTPUT||'test-results/architecture-measurement.json');
const manifest=z.object({workloads:z.array(z.object({id:z.string(),file:z.string(),sha256:z.string(),expectedEnd:z.string(),bytes:z.number(),sections:z.number()})),negative:z.object({file:z.string(),sha256:z.string(),expectedDiagnostics:z.array(z.string())})}).parse(JSON.parse(await readFile('tests/fixtures/architecture/manifest.json','utf8')));
const negative=await readFile('tests/fixtures/architecture/'+manifest.negative.file,'utf8');
if(createHash('sha256').update(negative).digest('hex')!==manifest.negative.sha256)throw new Error('Negative fixture changed');
const sourceStatus=execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim();
const fingerprintFiles=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','src','scripts','bun.lock','package.json','vite.config.ts'],{encoding:'utf8'}).trim().split(/\r?\n/);
const sourceFingerprints=Object.fromEntries(await Promise.all(fingerprintFiles.map(async file=>[file,createHash('sha256').update((await readFile(file,'utf8')).replaceAll('\r\n','\n')).digest('hex')])));
const browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 await page.goto(process.env.BASELINE_URL||'http://127.0.0.1:4175');
 await page.locator('[data-render-state="ready"]').waitFor({timeout:60000});
 const results=[];
 for(const fixture of manifest.workloads){
  const markdown=await readFile('tests/fixtures/architecture/'+fixture.file,'utf8');
  if(Buffer.byteLength(markdown)!==fixture.bytes)throw new Error('Fixture byte size changed');
  if(createHash('sha256').update(markdown).digest('hex')!==fixture.sha256)throw new Error('Fixture changed: '+fixture.id);
  const result=await page.evaluate(async({markdown,end,sections})=>{
   const renderer:typeof import('../src/core/render/documentRenderer')=await import(new URL('/src/core/render/documentRenderer.ts',location.href).href);
   const paginator:typeof import('../src/core/render/documentPaginator')=await import(new URL('/src/core/render/documentPaginator.ts',location.href).href);
   const parser:typeof import('../src/core/parser/markdownParser')=await import(new URL('/src/core/parser/markdownParser.ts',location.href).href);
   const storage:typeof import('../src/core/storage/storage')=await import(new URL('/src/core/storage/storage.ts',location.href).href);
   const pure:typeof import('../src/core/parse/markdown')=await import(new URL('/src/core/parse/markdown.ts',location.href).href);
   const analysis=pure.analyzeMarkdown(markdown);
   if(pure.extractOutline(markdown).filter(h=>h.level===2&&/^Section \d+$/.test(h.text)).length!==sections)throw new Error('Section count mismatch');
   for(const block of analysis.blocks)if(block.sourceRange.start.offset<0||block.sourceRange.end.offset>markdown.length||block.sourceRange.end.offset<block.sourceRange.start.offset)throw new Error('Invalid source range');
   const parseMs:number[]=[],renderMs:number[]=[];
   const before={stages:document.querySelectorAll('.mf-pagination').length,styles:document.querySelectorAll('style').length};
   for(let i=0;i<3;i++){let t=performance.now();parser.extractOutline(markdown);parseMs.push(performance.now()-t);t=performance.now();const art=await renderer.renderDocument(markdown,'mathml');renderer.assertArtifact(art);if(!art.html.includes(end))throw new Error('Missing flow end');renderMs.push(performance.now()-t)}
   const doc=storage.createNewDocument('baseline');doc.markdown=markdown;
   const t=performance.now(),pages=await paginator.paginateDocument(doc);const paginateMs=performance.now()-t;
   if(!pages.html.includes(end))throw new Error('Missing paginated end');
   const after={stages:document.querySelectorAll('.mf-pagination').length,styles:document.querySelectorAll('style').length};
   return {parseMs,renderMs,paginateMs,pages:pages.total,artifactBytes:new TextEncoder().encode(pages.html+pages.css).byteLength,before,after,fonts:Array.from(document.fonts).map(f=>({family:f.family,status:f.status})),bodyFont:getComputedStyle(document.body).fontFamily};
  },{markdown,end:fixture.expectedEnd,sections:fixture.sections});
  results.push({id:fixture.id,sha256:fixture.sha256,...result});console.log(fixture.id+': '+JSON.stringify(result));
 }
 await page.route('https://invalid.example/**',route=>route.fulfill({status:404,body:'missing'}));
 const negativeResult=await page.evaluate(async({markdown,expected})=>{
  const renderer:typeof import('../src/core/render/documentRenderer')=await import(new URL('/src/core/render/documentRenderer.ts',location.href).href);
  const messages:string[]=[];
  try{await renderer.renderDocument(markdown,'mathml');throw new Error('Invalid formula unexpectedly rendered')}catch(error){const message=String(error);if(!message.includes('公式'))throw error;messages.push(message)}
  const artifact=await renderer.renderDocument(markdown.replace(/\$\\unknowncommand\{x\}\$/g,''),'mathml');
  messages.push(...artifact.diagnostics.map(item=>item.message));
  for(const text of expected)if(!messages.some(message=>message.includes(text)))throw new Error('Missing negative diagnostic: '+text);
  const assets:typeof import('../src/core/export/documentAssets')=await import(new URL('/src/core/export/documentAssets.ts',location.href).href);
  let missingRejected=false;try{await assets.collectAssets(artifact.html,[],true)}catch(error){if(!String(error).includes('图片读取失败'))throw error;missingRejected=true;messages.push(String(error))}if(!missingRejected)throw new Error('Missing image accepted');
  return messages;
 },{markdown:negative,expected:manifest.negative.expectedDiagnostics});
 const evidence={schemaVersion:1,capturedAt:new Date().toISOString(),sourceStatus,sourceFingerprints,negativeDiagnostics:negativeResult,sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),harness:'Vite development source modules, real Chromium, 3 sequential render samples and 1 pagination sample per workload; not production performance or release coverage',environment:{os:platform(),release:release(),cpu:cpus()[0]?.model,logicalCpus:cpus().length,memoryBytes:totalmem(),browser:browser.version(),viewport:{width:1440,height:1000}},results};
 await mkdir(dirname(output),{recursive:true});
 await writeFile(output,JSON.stringify(evidence,null,2)+'\n');
}finally{await browser.close()}
