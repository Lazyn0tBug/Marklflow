import React,{useEffect,useRef,useState} from 'react';
import type {DocumentMeta,ThemeSpec,DocumentAsset} from '../../core/model/document';
import {DEFAULT_THEME} from '../../core/model/document';
import {paginateDocument,type PaginatedDocument} from '../../core/render/documentPaginator';
interface Props {
 markdown:string;mathMode:'mathml'|'svg';meta:DocumentMeta;fontSize:number;lineHeight:number;theme?:ThemeSpec;assets?:DocumentAsset[];
 containerRef?:React.RefObject<HTMLDivElement|null>;onScroll?:(ratio:number,scrollTop:number)=>void;
}
export const A4PagePreview:React.FC<Props>=({markdown,mathMode,meta,fontSize,lineHeight,theme,assets,containerRef,onScroll})=>{
 const internal=useRef<HTMLDivElement>(null),ref=containerRef||internal;
 const [pages,setPages]=useState<PaginatedDocument|null>(null),[status,setStatus]=useState('排版中');
 useEffect(()=>{
  const controller=new AbortController();setStatus('排版更新中');
  const now=new Date().toISOString();
  paginateDocument({schemaVersion:1,id:'a4-preview',revision:0,markdown,meta:{...meta,createdAt:meta.createdAt||now,updatedAt:meta.updatedAt||now},theme:theme||{...DEFAULT_THEME,fontSize,lineHeight},options:{syntaxProfile:'commonmark-gfm-v1',mathMode},...(assets===undefined?{}:{assets})},controller.signal)
   .then(result=>{if(!controller.signal.aborted){setPages(result);setStatus('共 '+result.total+' 页')}})
   .catch(error=>{if(!controller.signal.aborted)setStatus('排版失败：'+String(error))});
  return()=>controller.abort();
 },[markdown,mathMode,meta,theme,fontSize,lineHeight,assets]);
 return <div ref={ref} className="mf-pagination flex-1 h-full overflow-auto bg-neutral-800 p-6 select-text" aria-busy={status==='排版更新中'} data-pagination-state={status.startsWith('排版失败')?'error':status==='排版更新中'?'pending':'ready'} aria-label="A4 分页预览" onScroll={e=>{const el=e.currentTarget;onScroll?.(el.scrollTop/Math.max(1,el.scrollHeight-el.clientHeight),el.scrollTop)}}>
  <p role="status" className="no-print text-xs text-neutral-300">{status}</p>
  {pages&&<><style>{pages.css}</style><div data-page-count={pages.total} dangerouslySetInnerHTML={{__html:pages.html}}/></>}
 </div>;
};
