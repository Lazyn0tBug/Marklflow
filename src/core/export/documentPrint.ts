import type {DocumentRecord} from '../model/document';
import {themeSchema} from '../render/htmlPolicy';
export function printCss(doc:DocumentRecord):string {
 const m=themeSchema.parse(doc.theme).margins;
 return '@page{size:A4;margin:'+m.top+'mm '+m.right+'mm '+m.bottom+'mm '+m.left+'mm;@bottom-center{content:counter(page)}}'+
 '@media print{.mf-document-shell{max-width:none!important;margin:0!important;padding:0!important}.mf-doc{--mf-paper:#fff!important;--mf-ink:#1f2937!important}.mf-doc .mf-table-scroll,.mf-doc .mf-math,.mf-doc .mf-diagram,.mf-doc math[display=block]{overflow:visible}.mf-doc pre{white-space:pre-wrap;overflow-wrap:anywhere;overflow:visible}.mf-doc thead{display:table-header-group}.mf-doc tr{break-inside:avoid}.mf-doc h1,.mf-doc h2,.mf-doc h3{break-after:avoid}.mf-doc p{orphans:3;widows:3}.no-print{display:none!important}}'+
 '.mf-doc .mf-diagram svg,.mf-doc .mf-math svg,.mf-doc img{object-fit:contain;max-height:'+ (297-m.top-m.bottom-10)+'mm}.mf-doc .mf-page-break{break-after:page;page-break-after:always;border:0}.mf-doc details{display:block}';
}
export function withDeadline<T>(promise:Promise<T>,message:string,ms=20000):Promise<T>{
 return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error(message)),ms);promise.then(v=>{clearTimeout(timer);resolve(v)},e=>{clearTimeout(timer);reject(e)})});
}
export async function waitForLayout(root:ParentNode,doc:Document=document):Promise<void>{
 await withDeadline(Promise.all(Array.from(root.querySelectorAll('img,svg image')).map(async element=>{
  const isHtmlImage=element.localName==='img';
  const image=isHtmlImage?element as HTMLImageElement:new Image();
  if(!isHtmlImage)image.src=element.getAttribute('href')||element.getAttribute('xlink:href')||'';
  if(typeof image.decode==='function')await image.decode();
  if(!image.complete||!image.naturalWidth)throw new Error('图片未就绪：'+image.getAttribute('src')?.slice(0,100));
 })),'图片就绪超时');
 if(doc.fonts)await withDeadline(doc.fonts.ready,'字体就绪超时');
 const view=doc.defaultView||window;
 await withDeadline(new Promise<void>(resolve=>view.requestAnimationFrame(()=>view.requestAnimationFrame(()=>resolve()))),'布局就绪超时');
}
let activePrintFrame: HTMLIFrameElement | null = null;

export function cleanupActivePrintFrame(): void {
 if (activePrintFrame) {
  try { activePrintFrame.remove(); } catch {}
  activePrintFrame = null;
 }
}

export async function preparePrintFrame(html:string):Promise<HTMLIFrameElement>{
 cleanupActivePrintFrame();
 const frame=document.createElement('iframe');frame.title='打印冻结文档';
 frame.setAttribute('sandbox','allow-same-origin allow-modals allow-scripts');
 // 保持在激活视口渲染流水线中，避免离屏视口裁剪导致后台打印 Spooler 挂起或第二次点击才唤醒
 frame.style.cssText='position:fixed;top:0;left:0;width:100%;height:100%;opacity:0;pointer-events:none;z-index:-9999;border:0';
 const loaded=new Promise<void>((resolve,reject)=>{frame.onload=()=>resolve();frame.onerror=()=>reject(new Error('打印文档加载失败'))});
 frame.srcdoc=html;document.body.append(frame);
 activePrintFrame=frame;
 try{
  await withDeadline(loaded,'打印文档就绪超时');
  await waitForLayout(frame.contentDocument!,frame.contentDocument!);
  return frame;
 }catch(error){
  cleanupActivePrintFrame();
  throw error;
 }
}

export async function printFrozenHtml(html:string):Promise<void>{
 const frame=await preparePrintFrame(html);
 const win=frame.contentWindow;
 if(!win){
  cleanupActivePrintFrame();
  throw new Error('打印窗口不可用');
 }
 const scheduleRelease=()=>{
  // 延迟销毁 iframe，给操作系统 Spooler 与浏览器打印进程充足的写盘/管道刷写时间
  setTimeout(()=>{
   if(activePrintFrame===frame){
    cleanupActivePrintFrame();
   }else{
    try{frame.remove()}catch{}
   }
  },1500);
 };
 win.addEventListener('afterprint',scheduleRelease,{once:true});
 window.addEventListener('afterprint',scheduleRelease,{once:true});

 const view=frame.contentDocument?.defaultView||win;
 await new Promise<void>(resolve=>view.requestAnimationFrame(()=>view.requestAnimationFrame(()=>resolve())));

 try{
  win.focus();
  win.print();
 }catch(error){
  cleanupActivePrintFrame();
  throw error;
 }
}
