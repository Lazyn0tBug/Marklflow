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
