import React,{useRef} from 'react';
import type {PreviewView} from '../../core/platform/web/workbenchPreviewRuntime';
interface Props {view:PreviewView;containerRef?:React.RefObject<HTMLDivElement|null>;onScroll?:(ratio:number,top:number)=>void}
/** A4 display consumes the same complete-artifact cache as flow display. */
export function A4PagePreview({view,containerRef,onScroll}:Props){
 const internal=useRef<HTMLDivElement>(null),pages=view.rendered;
 return <div ref={containerRef??internal} className="mf-pagination flex-1 h-full overflow-auto bg-neutral-800 p-6 select-text" aria-busy={view.state==='pending'} data-pagination-state={view.state==='ready'?'ready':view.state==='error'?'error':'pending'} aria-label="A4 分页预览" onScroll={event=>{const el=event.currentTarget;onScroll?.(el.scrollTop/Math.max(1,el.scrollHeight-el.clientHeight),el.scrollTop)}}>
  <p role="status" className="no-print text-xs text-neutral-300">{view.state==='pending'?'排版更新中':view.state==='error'?'排版失败：'+view.error:'共 '+pages?.total+' 页'}</p>
  {pages&&view.state==='ready'&&<><style>{pages.css}</style><div data-page-count={pages.total} data-preview-reference={view.referenceId} dangerouslySetInnerHTML={{__html:pages.html}}/></>}
 </div>;
}
