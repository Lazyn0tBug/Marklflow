import {withDeadline,waitForLayout} from '../../export/documentPrint';
/** Web-only native PDF handoff. Input is complete frozen HTML, never source or PDF bytes. */
async function preparePrintFrame(html:string):Promise<HTMLIFrameElement>{
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
export async function deliverPdfHtml(html:string):Promise<void>{
 const frame=await preparePrintFrame(html);
 const view=frame.contentWindow;if(!view){frame.remove();throw new Error('PDF导出窗口不可读取')}
 const cleanup=()=>{view.removeEventListener('afterprint',cleanup);window.removeEventListener('pagehide',cleanup);frame.remove()};
 // Print readiness comes from load/decode/fonts/layout, never an arbitrary sleep.
 try{view.addEventListener('afterprint',cleanup,{once:true});window.addEventListener('pagehide',cleanup,{once:true});view.focus();view.print()}catch(error){cleanup();throw error}
}
