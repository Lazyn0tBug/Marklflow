/**
 * D0 受控样本固化：在真实浏览器中经生产路径 prepareExportContent + generatePdfHtml
 * 产出固化分页 HTML，作为 D1 的固定输入。不改产品代码，只读既有生成路径。
 *
 * 用法：bun scripts/pdf-probe-sample.ts [--origin http://127.0.0.1:4175]
 */
import {chromium} from '@playwright/test';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const repo=resolve(import.meta.dirname,'..');
const originArg=process.argv.indexOf('--origin');
const origin=originArg>=0?process.argv[originArg+1]!:'http://127.0.0.1:4175';
const samplePath=resolve(repo,'tests/fixtures/export-source/pdf-probe-sample.md');
const corpusPath=resolve(repo,'tests/fixtures/export-source/corpus.json');
const outDir=resolve(repo,'docs/acceptance/pdf-probe');
const outFile=resolve(outDir,'frozen-sample.html');
const HEAD_MARKER='MF-PROBE-HEAD-20261102-7f3dd5e';
const TAIL_MARKER='MF-PROBE-TAIL-20261102-7f3dd5e';

const markdown=await readFile(samplePath,'utf8');
const corpus=JSON.parse(await readFile(corpusPath,'utf8')) as {asset:{source:string;data:string}};

const server=spawn('node',['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',new URL(origin).port,'--strictPort'],{cwd:repo,stdio:'ignore'});
const stopServer=()=>{try{server.kill();}catch{}};
process.on('exit',stopServer);
try{
  for(let attempt=0;attempt<60;attempt++){
    try{const response=await fetch(origin+'/tests/fixtures/architecture/export-html-probe.html');if(response.ok)break;}catch{}
    await new Promise<void>(resolve=>setTimeout(resolve,500));
  }
  const browser=await chromium.launch();
  const page=await browser.newPage();
  const problems:string[]=[];
  page.on('pageerror',error=>problems.push(String(error)));
  // 探针页已加载 MathJax 并跑通既有检查，等其就绪后再走生产路径。
  await page.goto(origin+'/tests/fixtures/architecture/export-html-probe.html');
  await page.waitForSelector('[data-state="ready"]',{timeout:60000});
  const html=await page.evaluate(async ({markdown,asset})=>{
    const originalFetch=window.fetch;
    window.fetch=async(input:RequestInfo|URL)=>{
      const url=typeof input==='string'?input:String((input as Request).url??input);
      if(url.includes('/baseline.png')){
        const bytes=Uint8Array.from(atob(asset.data.split(',')[1]!),char=>char.charCodeAt(0));
        return new Response(bytes,{headers:{'content-type':'image/png'}});
      }
      return originalFetch(input);
    };
    try{
      const [{generatePdfHtml},{prepareExportContent},{createNewDocument}]=await Promise.all([
        import('/src/core/export/pdfExporter.ts'),
        import('/src/core/export/exportContent.ts'),
        import('/src/core/storage/storage.ts'),
      ]);
      const doc=createNewDocument('静默 PDF 探针受控样本');
      doc.markdown=markdown;
      const artifact=await prepareExportContent(doc,{mathMode:'svg'});
      return await generatePdfHtml(artifact,{title:'静默 PDF 探针受控样本'});
    }finally{window.fetch=originalFetch}
  },{markdown,asset:corpus.asset});
  await browser.close();
  await mkdir(outDir,{recursive:true});
  await writeFile(outFile,html,'utf8');
  const chunks=html.split(/<div class="pagedjs_page[ "]/);
  const locate=(marker:string)=>{for(let i=1;i<chunks.length;i++){if(chunks[i]!.includes(marker))return i;}return null;};
  const report={
    file:outFile,
    bytes:Buffer.byteLength(html,'utf8'),
    sha256:createHash('sha256').update(html).digest('hex'),
    dataExportPages:html.match(/data-export-pages="(\d+)"/)?.[1]??null,
    pageElements:(html.match(/<div class="pagedjs_page[ "]/g)||[]).length,
    headMarkerPage:locate(HEAD_MARKER),
    tailMarkerPage:locate(TAIL_MARKER),
    headMarkerOccurrences:(html.match(new RegExp(HEAD_MARKER,'g'))||[]).length,
    tailMarkerOccurrences:(html.match(new RegExp(TAIL_MARKER,'g'))||[]).length,
    dataRefOccurrences:(html.match(/data-ref=/g)||[]).length,
    hasImage:html.includes('data:image/png;base64'),
    hasFormulaSvg:html.includes('<svg'),
    pageProblems:problems,
  };
  console.log(JSON.stringify(report,null,2));
  if(report.dataExportPages!==String(report.pageElements)||report.headMarkerPage===null||report.tailMarkerPage===null){
    throw new Error('固化样本自检失败：页数、标记或页盒数不一致');
  }
}finally{stopServer()}
