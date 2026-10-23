import type {DocumentRecord} from '../model/document';
import {themeSchema} from '../render/htmlPolicy';
export function printCss(doc:DocumentRecord):string {
 const m=themeSchema.parse(doc.theme).margins;
 return '@page{size:A4;margin:'+m.top+'mm '+m.right+'mm '+m.bottom+'mm '+m.left+'mm;@bottom-center{content:counter(page)}}'+
 '@media print{.mf-document-shell{max-width:none!important;margin:0!important;padding:0!important}.mf-doc{--mf-paper:#fff!important;--mf-ink:#1f2937!important}.mf-doc pre{white-space:pre-wrap;overflow-wrap:anywhere;overflow:visible}.mf-doc thead{display:table-header-group}.mf-doc tr{break-inside:avoid}.mf-doc h1,.mf-doc h2,.mf-doc h3{break-after:avoid}.mf-doc p{orphans:3;widows:3}.no-print{display:none!important}}'+
 '.mf-doc .mf-diagram svg,.mf-doc img{object-fit:contain;max-height:'+ (297-m.top-m.bottom-10)+'mm}.mf-doc .mf-page-break{break-after:page;page-break-after:always;border:0}.mf-doc details{display:block}';
}
export function withDeadline<T>(promise:Promise<T>,message:string,ms=20000):Promise<T>{
 return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error(message)),ms);promise.then(v=>{clearTimeout(timer);resolve(v)},e=>{clearTimeout(timer);reject(e)})});
}
export async function waitForLayout(root:ParentNode,doc:Document=document):Promise<void>{
 await withDeadline(Promise.all(Array.from(root.querySelectorAll('img')).map(async image=>{
  if(typeof image.decode==='function')await image.decode();
  if(!image.complete||!image.naturalWidth)throw new Error('图片未就绪：'+image.getAttribute('src')?.slice(0,100));
 })),'图片就绪超时');
 if(doc.fonts)await withDeadline(doc.fonts.ready,'字体就绪超时');
 await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
}
export async function preparePrintFrame(html:string):Promise<HTMLIFrameElement>{
 const frame=document.createElement('iframe');frame.title='打印冻结文档';
 frame.setAttribute('sandbox','allow-same-origin allow-modals');
 frame.style.cssText='position:fixed;left:-20000px;top:0;width:794px;height:1123px;border:0';
 const loaded=new Promise<void>((resolve,reject)=>{frame.onload=()=>resolve();frame.onerror=()=>reject(new Error('打印文档加载失败'))});
 frame.srcdoc=html;document.body.append(frame);
 try{await withDeadline(loaded,'打印文档就绪超时');await waitForLayout(frame.contentDocument!,frame.contentDocument!);return frame}catch(error){frame.remove();throw error}
}
export async function printFrozenHtml(html:string):Promise<void>{
 const frame=await preparePrintFrame(html);
 frame.contentWindow!.addEventListener('afterprint',()=>frame.remove(),{once:true});
 // Print readiness comes from load/decode/fonts/layout, never an arbitrary sleep.
 frame.contentWindow!.focus();frame.contentWindow!.print();
}
