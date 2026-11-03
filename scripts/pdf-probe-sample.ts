/**
 * D0 受控样本固化：在真实浏览器中经生产路径 prepareExportContent + generatePdfHtml
 * 产出固化分页 HTML，作为 D1 的固定输入。不改产品代码，只读既有生成路径。
 *
 * 产物非字节可复现：Paged.js 为元素写入随机 UUID 属性（data-ref、data-split-to、
 * data-split-from 等）。仓库的既有产出身份模型从不对产出字节做哈希，而以输入哈希
 * 承担（见 exportContent.ts 的 mdHash 与 renderConfigVersion、previewIdentity.ts 的
 * 缓存键），对可能不完整的产出另用 render nonce 区分。故本脚本沿用同一模型：
 * 交接 mdHash 与 renderConfigVersion 作为"同一输入"的稳定标识，固化文件自身的
 * sha256 只作为该文件的完整性校验。
 *
 * 运行环境须与交付宿主同环境：固化分页的页面盒高度按生成时的系统字体度量算得，
 * 跨环境加载会以宿主字体重新排版，固定高度页面盒可能溢出或截断，而流程不重复分页。
 * 故本脚本额外记录宿主实际解析到的平台字体（CDP CSS.getPlatformFontsForNode，
 * 不可用时退回逐族测宽），使"样本来自哪个字体环境"可核。
 *
 * 用法：bun scripts/pdf-probe-sample.ts [--origin http://127.0.0.1:4175]
 */
import {chromium,type Page} from '@playwright/test';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {arch,platform,release} from 'node:os';
import {relative,resolve,sep} from 'node:path';

const repo=resolve(import.meta.dirname,'..');
const originArg=process.argv.indexOf('--origin');
const origin=originArg>=0?process.argv[originArg+1]!:'http://127.0.0.1:4175';
const samplePath=resolve(repo,'tests/fixtures/export-source/pdf-probe-sample.md');
const corpusPath=resolve(repo,'tests/fixtures/export-source/corpus.json');
const outDir=resolve(repo,'docs/acceptance/pdf-probe');
const outFile=resolve(outDir,'frozen-sample.html');
const metaFile=resolve(outDir,'frozen-sample.meta.json');
const HEAD_MARKER='MF-PROBE-HEAD-20261102-7f3dd5e';
const TAIL_MARKER='MF-PROBE-TAIL-20261102-7f3dd5e';
const VITE_ENTRY='node_modules/vite/bin/vite.js';
/** 仓库相对路径（正斜杠）：meta 不记宿主绝对路径——归档要能被别人读懂。 */
const repoRelative=(path:string):string=>relative(repo,path).split(sep).join('/');
const PROBE_PAGE='/tests/fixtures/architecture/export-html-probe.html';
// 逐族测宽用；MISSING_FAMILY 是故意不存在的族，作为"落到默认字体"的基线。
const FONT_FAMILIES=['"Microsoft YaHei"','"Microsoft YaHei UI"','"PingFang SC"','system-ui','sans-serif'];
const MISSING_FAMILY='"__mf_probe_missing_family__"';

function runtimeCandidates():string[]{
  return [...new Set(['node','bun',process.execPath].filter(candidate=>candidate.length>0))];
}

/** 依次尝试可用的运行时启动 vite，谁先提供探针页就用谁。 */
async function startDevServer():Promise<{stop:()=>void;runtime:string}>{
  const port=new URL(origin).port;
  const failures:string[]=[];
  for(const runtime of runtimeCandidates()){
    const child=spawn(runtime,[VITE_ENTRY,'--host','127.0.0.1','--port',port,'--strictPort'],{cwd:repo,stdio:['ignore','ignore','pipe']});
    let spawnFailed=false;
    let diagnostics='';
    child.stderr?.on('data',chunk=>{diagnostics=(diagnostics+String(chunk)).slice(-800);});
    child.on('error',()=>{spawnFailed=true;});
    for(let attempt=0;attempt<60&&!spawnFailed;attempt++){
      try{
        const response=await fetch(origin+PROBE_PAGE);
        if(response.ok)return {stop:()=>{try{child.kill();}catch{}},runtime};
      }catch{}
      await new Promise<void>(done=>setTimeout(done,500));
    }
    try{child.kill();}catch{}
    failures.push(runtime+(spawnFailed?'（无法启动）':'（未能提供探针页）')+(diagnostics.trim()?'：'+diagnostics.trim().replace(/\s+/g,' '):''));
  }
  throw new Error('无法启动 vite 开发服务器：'+failures.join('；'));
}

/** 读出浏览器实际用于渲染的字体的平台字体名。只对直接含文本的节点有结果，故遍历正文节点聚合。 */
async function readPlatformFonts(page:Page):Promise<{fonts?:unknown;error?:string}>{
  try{
    const session=await page.context().newCDPSession(page);
    await session.send('DOM.enable');
    await session.send('CSS.enable');
    const documentNode=await session.send('DOM.getDocument') as {root:{nodeId:number}};
    const queried=await session.send('DOM.querySelectorAll',{nodeId:documentNode.root.nodeId,selector:'p,li,td,th,code,h1,h2,h3'}) as {nodeIds:number[]};
    const tally=new Map<string,{glyphCount:number;nodes:number}>();
    for(const nodeId of queried.nodeIds){
      const result=await session.send('CSS.getPlatformFontsForNode',{nodeId}) as {fonts?:{familyName:string;glyphCount:number}[]};
      for(const font of result.fonts??[]){
        const entry=tally.get(font.familyName)??{glyphCount:0,nodes:0};
        entry.glyphCount+=font.glyphCount;
        entry.nodes+=1;
        tally.set(font.familyName,entry);
      }
    }
    await session.detach();
    return {fonts:[...tally].map(([familyName,entry])=>({familyName,...entry})).sort((a,b)=>b.glyphCount-a.glyphCount)};
  }catch(error){return {error:String(error)};}
}

const markdown=await readFile(samplePath,'utf8');
const corpus=JSON.parse(await readFile(corpusPath,'utf8')) as {asset:{source:string;data:string}};

const server=await startDevServer();
const stopServer=server.stop;
process.on('exit',stopServer);
try{
  const browser=await chromium.launch();
  const page=await browser.newPage();
  const problems:string[]=[];
  page.on('pageerror',error=>problems.push(String(error)));
  // 探针页已加载 MathJax 并跑通既有检查，等其就绪后再走生产路径。
  await page.goto(origin+PROBE_PAGE);
  await page.waitForSelector('[data-state="ready"]',{timeout:60000});
  const produced=await page.evaluate(async ({markdown,asset})=>{
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
      const fontVariables=Object.fromEntries(Object.entries(artifact.presentation.variables).filter(([key])=>key.includes('font')));
      const fontFamily=artifact.presentation.css.match(/font-family\s*:[^;]+/)?.[0]??null;
      return {html:await generatePdfHtml(artifact,{title:'静默 PDF 探针受控样本'}),fontVariables,fontFamily,mdHash:artifact.source.mdHash,renderConfigVersion:artifact.source.renderConfigVersion};
    }finally{window.fetch=originalFetch}
  },{markdown,asset:corpus.asset});
  // 字体证据：把固化产物放进同一浏览器的另一个页面，读宿主实际解析到的平台字体。
  const fontPage=await browser.newPage();
  await fontPage.setContent(produced.html,{waitUntil:'load'});
  const platformFonts=await readPlatformFonts(fontPage);
  const fontWidths=await fontPage.evaluate(({families,missing}:{families:string[];missing:string})=>{
    const canvas=document.createElement('canvas');
    const context=canvas.getContext('2d');
    if(!context)return null;
    const text='静默 PDF 探针受控样本 MF-PROBE';
    const measure=(family:string)=>{context.font='72px '+family;return context.measureText(text).width;};
    const widths:Record<string,number>={};
    for(const family of families)widths[family]=measure(family);
    return {baseline:measure(missing),widths};
  },{families:FONT_FAMILIES,missing:MISSING_FAMILY});
  await fontPage.close();
  await browser.close();
  const {html,fontVariables,fontFamily,mdHash,renderConfigVersion}=produced;

  const chunks=html.split(/<div class="pagedjs_page[ "]/);
  const locate=(marker:string)=>{for(let i=1;i<chunks.length;i++){if(chunks[i]!.includes(marker))return i;}return null;};
  const fontStacks=[...new Set([...html.matchAll(/font-family\s*:\s*([^;}\n]+)/g)].map(match=>match[1]!.trim()))];
  const meta={
    file:repoRelative(outFile),
    source:repoRelative(samplePath),
    bytes:Buffer.byteLength(html,'utf8'),
    sha256:createHash('sha256').update(html).digest('hex'),
    mdHash,
    renderConfigVersion,
    dataExportPages:Number(html.match(/data-export-pages="(\d+)"/)?.[1]??0),
    pageElements:(html.match(/<div class="pagedjs_page[ "]/g)||[]).length,
    headMarkerPage:locate(HEAD_MARKER),
    tailMarkerPage:locate(TAIL_MARKER),
    headMarkerOccurrences:(html.match(new RegExp(HEAD_MARKER,'g'))||[]).length,
    tailMarkerOccurrences:(html.match(new RegExp(TAIL_MARKER,'g'))||[]).length,
    randomUuidAttributes:(html.match(/[A-Za-z-]+="[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"/g)||[]).length,
    hasImage:html.includes('data:image/png;base64'),
    hasFormulaSvg:html.includes('<svg'),
    fontStacks,
    platformFonts:platformFonts.fonts??null,
    platformFontsError:platformFonts.error??null,
    fontWidths,
    environment:{platform:platform(),arch:arch(),osRelease:release(),viteRuntime:server.runtime,fontVariables,fontFamily},
    pageProblems:problems,
    note:'sha256 只锁定本文件；mdHash 与 renderConfigVersion 承担"同一输入"的稳定身份，沿用仓库既有产出身份模型。交付宿主字体环境须与本 environment 一致，否则固化分页的页面盒度量不匹配。platformFonts 与 fontWidths 记录宿主实际解析到的字体，用于核对字体环境。',
  };
  // 自检断言的是交接物表写下的期望值本身，不是"某项非空"。
  // 只断言非空时，字体度量把标记挪位、或平台字体证据退化为空，都会照样写盘并报成功。
  const expectations:Array<[string,boolean]>=[
    ['声明页数与页面盒数一致',meta.dataExportPages===meta.pageElements],
    ['页面盒多于一页（首尾标记须落在不同页）',meta.pageElements>1],
    ['HEAD 标记在第 1 页',meta.headMarkerPage===1],
    ['TAIL 标记在末页',meta.tailMarkerPage===meta.pageElements],
    ['HEAD 标记只出现一次',meta.headMarkerOccurrences===1],
    ['TAIL 标记只出现一次',meta.tailMarkerOccurrences===1],
    ['平台字体证据非空',Array.isArray(meta.platformFonts)&&meta.platformFonts.length>0],
  ];
  const failed=expectations.filter(([,ok])=>!ok).map(([name])=>name);
  if(failed.length)throw new Error('固化样本自检失败：'+failed.join('；'));
  // 自检通过才落盘：失败的产物不得替换归档。
  await mkdir(outDir,{recursive:true});
  await writeFile(outFile,html,'utf8');
  await writeFile(metaFile,JSON.stringify(meta,null,2)+'\n','utf8');
  console.log(JSON.stringify(meta,null,2));
}finally{stopServer()}
