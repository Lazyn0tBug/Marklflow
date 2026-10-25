import React,{useRef} from 'react';
import type {ThemeSpec} from '../../core/model/document';
import {documentStyle} from '../../core/render/documentPresentation';
import type {PreviewView} from '../../core/platform/web/workbenchPreviewRuntime';
import {escapeHtml} from '../../core/render/htmlPolicy';
interface Props {view:PreviewView;theme:ThemeSpec;containerRef?:React.RefObject<HTMLDivElement|null>;onScroll?:(ratio:number,top:number)=>void;maxWidth?:number|'full'}
/** Presentation only; all production generation belongs to WorkbenchPreviewRuntime. */
export function ReadingPreview({view,theme,containerRef,onScroll,maxWidth=1024}:Props){
 const internal=useRef<HTMLDivElement>(null);const busy=view.state==='pending',html=view.state==='error'?'<pre class="mf-diagnostic">'+escapeHtml(view.error??'预览失败')+'</pre>':view.rendered?.html??'';
 return <div ref={containerRef??internal} onScroll={event=>{const el=event.currentTarget;onScroll?.(el.scrollTop/Math.max(1,el.scrollHeight-el.clientHeight),el.scrollTop)}} className="flex-1 h-full overflow-auto p-6 bg-neutral-100 dark:bg-neutral-900 select-text" aria-busy={busy}>
  {busy&&<p role="status" className="no-print text-xs text-neutral-500">预览更新中</p>}
  <article className="mf-document-shell mf-doc mx-auto w-full" data-render-state={view.state==='ready'?'ready':view.state==='error'?'error':'pending'} data-preview-reference={view.referenceId} style={{...documentStyle(theme),maxWidth:maxWidth==='full'?'100%':maxWidth}} dangerouslySetInnerHTML={{__html:html}}/>
 </div>;
}
