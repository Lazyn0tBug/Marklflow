import {withDeadline,waitForLayout} from '../../export/documentPrint';
import type {PdfDeliveryReceipt} from '../../../application/exports/exportService';
/** Web-only native PDF handoff. Input is complete frozen HTML, never source or PDF bytes. */
/** The system spooler keeps reading after the print dialog closes; destroying the frame too early truncates the output. */
export const FRAME_RELEASE_DELAY=1500;
/**
 * The print host lives inside the viewport and is invisible there. A host parked outside the viewport is not
 * part of the rendered output, and printing a frame the browser never rendered yields an empty first print.
 */
export const PRINT_FRAME_STYLE='position:fixed;left:0;top:0;width:794px;height:1123px;border:0;opacity:0;pointer-events:none';
let activeFrame:HTMLIFrameElement|null=null;

function removeFrame(frame:HTMLIFrameElement):void{
 try{frame.remove()}catch{}
 if(activeFrame===frame)activeFrame=null;
}
/** Release the print host after the spooler had time to flush, never before. */
export function scheduleFrameRelease(frame:HTMLIFrameElement):void{
 setTimeout(()=>removeFrame(frame),FRAME_RELEASE_DELAY);
}
async function preparePrintFrame(html:string):Promise<HTMLIFrameElement>{
 if(activeFrame)removeFrame(activeFrame);
 const frame=document.createElement('iframe');frame.title='PDF导出文档';frame.setAttribute('aria-hidden','true');
 frame.setAttribute('sandbox','allow-same-origin allow-modals');
 frame.style.cssText=PRINT_FRAME_STYLE;
 const loaded=new Promise<void>((resolve,reject)=>{frame.onload=()=>resolve();frame.onerror=()=>reject(new Error('打印文档加载失败'))});
 const controller=new AbortController();
 const leave=()=>{controller.abort(new Error('PDF导出页面已离开'));removeFrame(frame)};
 frame.srcdoc=html;
 try{
  window.addEventListener('pagehide',leave,{once:true});document.body.append(frame);
  await withDeadline(loaded,'打印文档就绪超时',20000,controller.signal);
  const doc=frame.contentDocument;if(!doc)throw new Error('PDF导出文档不可读取');
  await waitForLayout(doc,doc,controller.signal);controller.signal.throwIfAborted();
  activeFrame=frame;return frame;
 }catch(error){removeFrame(frame);throw error}
 finally{window.removeEventListener('pagehide',leave);frame.onload=null;frame.onerror=null}
}
export async function deliverPdfHtml(html:string):Promise<PdfDeliveryReceipt>{
 const frame=await preparePrintFrame(html);
 const view=frame.contentWindow;if(!view){removeFrame(frame);throw new Error('PDF导出窗口不可读取')}
 const cleanup=()=>{view.removeEventListener('afterprint',cleanup);window.removeEventListener('pagehide',cleanup);removeFrame(frame)};
 // Print readiness comes from load/decode/fonts/layout inside the host document, never from an arbitrary sleep.
 try{
  view.addEventListener('afterprint',()=>scheduleFrameRelease(frame),{once:true});
  window.addEventListener('afterprint',()=>scheduleFrameRelease(frame),{once:true});
  window.addEventListener('pagehide',cleanup,{once:true});
  view.focus();view.print();
 }catch(error){cleanup();throw error}
 // 交给浏览器之后**说不准** ✓：打印对话框是系统窗口 ✓，它自己那边发生了什么
 // 这里看不到 ✓ —— 所以只说"已交由浏览器处理" ✓，不冒充 saved ✓。
 return 'handed-off';
}
