import {pageCss} from '../render/pagePresentation';
import type {DocumentRecord} from '../model/document';
import {themeSchema} from '../model/themeSchema';
export function printCss(doc:DocumentRecord):string {return pageCss(themeSchema.parse(doc.theme).margins)}
export function withDeadline<T>(promise:Promise<T>,message:string,ms=20000,signal?:AbortSignal):Promise<T>{
 return new Promise((resolve,reject)=>{
  const onAbort=()=>{cleanup();const reason:unknown=signal?.reason;reject(reason instanceof Error?reason:new Error('布局等待已取消'))};
  const cleanup=()=>{clearTimeout(timer);signal?.removeEventListener('abort',onAbort)};
  const timer=setTimeout(()=>{cleanup();reject(new Error(message))},ms);
  // Attach both handlers even for an already-aborted signal: late native failures stay observed.
  promise.then(value=>{cleanup();resolve(value)},error=>{cleanup();reject(error)});
  signal?.addEventListener('abort',onAbort,{once:true});if(signal?.aborted)onAbort();
 });
}
export async function waitForLayout(root:ParentNode,doc:Document=document,signal?:AbortSignal):Promise<void>{
 signal?.throwIfAborted();
 await withDeadline(Promise.all(Array.from(root.querySelectorAll('img,svg image')).map(async element=>{
  const isHtmlImage=element.localName==='img';
  const image=isHtmlImage?element as HTMLImageElement:new Image();
  if(!isHtmlImage)image.src=element.getAttribute('href')||element.getAttribute('xlink:href')||'';
  if(typeof image.decode==='function')await image.decode();
  if(!image.complete||!image.naturalWidth)throw new Error('图片未就绪：'+image.getAttribute('src')?.slice(0,100));
 })),'图片就绪超时',20000,signal);
 if(doc.fonts)await withDeadline(doc.fonts.ready,'字体就绪超时',20000,signal);
 const view=doc.defaultView||window;
 let first:number|undefined,second:number|undefined;
 try{await withDeadline(new Promise<void>(resolve=>{first=view.requestAnimationFrame(()=>{second=view.requestAnimationFrame(()=>resolve())})}),'布局就绪超时',20000,signal)}
 finally{if(first!==undefined)view.cancelAnimationFrame(first);if(second!==undefined)view.cancelAnimationFrame(second)}
}
export async function preparePrintFrame(html:string):Promise<HTMLIFrameElement>{
 const frame=document.createElement('iframe');frame.title='PDF导出文档';frame.setAttribute('aria-hidden','true');
 frame.setAttribute('sandbox','allow-same-origin allow-modals');
 frame.style.cssText='position:fixed;left:-20000px;top:0;width:794px;height:1123px;border:0';
 const loaded=new Promise<void>((resolve,reject)=>{frame.onload=()=>resolve();frame.onerror=()=>reject(new Error('打印文档加载失败'))});
 const controller=new AbortController();
 const leave=()=>{controller.abort(new Error('PDF导出页面已离开'));frame.remove()};
 frame.srcdoc=html;
 try{
  window.addEventListener('pagehide',leave,{once:true});document.body.append(frame);
  await withDeadline(loaded,'打印文档就绪超时',20000,controller.signal);
  const doc=frame.contentDocument;if(!doc)throw new Error('PDF导出文档不可读取');
  await waitForLayout(doc,doc,controller.signal);controller.signal.throwIfAborted();return frame;
 }catch(error){frame.remove();throw error}
 finally{window.removeEventListener('pagehide',leave);frame.onload=null;frame.onerror=null}
}
export async function printFrozenHtml(html:string):Promise<void>{
 const frame=await preparePrintFrame(html);
 const view=frame.contentWindow;if(!view){frame.remove();throw new Error('PDF导出窗口不可读取')}
 const cleanup=()=>{view.removeEventListener('afterprint',cleanup);window.removeEventListener('pagehide',cleanup);frame.remove()};
 // Print readiness comes from load/decode/fonts/layout, never an arbitrary sleep.
 try{view.addEventListener('afterprint',cleanup,{once:true});window.addEventListener('pagehide',cleanup,{once:true});view.focus();view.print()}catch(error){cleanup();throw error}
}
