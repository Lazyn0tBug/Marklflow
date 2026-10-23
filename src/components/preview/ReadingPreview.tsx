import { applyDocumentAssets } from '../../core/export/documentAssets';
import type { DocumentAsset } from '../../core/model/document';
import React,{useEffect,useRef,useState} from 'react';
import { renderDocument,type DocumentArtifact } from '../../core/render/documentRenderer';
import { documentStyle } from '../../core/render/documentPresentation';
import { DEFAULT_THEME,type ThemeSpec } from '../../core/model/document';
import { escapeHtml } from '../../core/render/htmlPolicy';
interface ReadingPreviewProps {
 assets?:DocumentAsset[];markdown:string;mathMode:'mathml'|'svg';isDark:boolean;fontSize:number;lineHeight:number;theme?:ThemeSpec;
 containerRef?:React.RefObject<HTMLDivElement|null>;onScroll?:(ratio:number,scrollTop:number)=>void;maxWidth?:number|'full';
}
export const ReadingPreview:React.FC<ReadingPreviewProps>=({assets,markdown,mathMode,fontSize,lineHeight,theme,containerRef,onScroll,maxWidth=1024})=>{
 const internal=useRef<HTMLDivElement>(null),ref=containerRef||internal;
 const [artifact,setArtifact]=useState<DocumentArtifact>({html:'',diagnostics:[]}),[busy,setBusy]=useState(true);
 useEffect(()=>{
  const controller=new AbortController();setBusy(true);
  renderDocument(markdown,mathMode,controller.signal).then(result=>{if(!controller.signal.aborted){setArtifact(result);setBusy(false)}}).catch(error=>{
   if(!controller.signal.aborted){setArtifact({html:'<pre class="mf-diagnostic">'+escapeHtml(String(error))+'</pre>',diagnostics:[{nodeId:'document',message:String(error),severity:'error'}]});setBusy(false)}
  });return()=>controller.abort();
 },[markdown,mathMode]);
 return <div ref={ref} onScroll={e=>{const el=e.currentTarget;onScroll?.(el.scrollTop/Math.max(1,el.scrollHeight-el.clientHeight),el.scrollTop)}} className="flex-1 h-full overflow-auto p-6 bg-neutral-100 dark:bg-neutral-900 select-text" aria-busy={busy}>
  {busy&&<p role="status" className="no-print text-xs text-neutral-500">预览更新中</p>}
  <article className="mf-document-shell mf-doc mx-auto w-full" data-render-state={busy?'pending':artifact.diagnostics.length?'error':'ready'} style={{...documentStyle(theme||{...DEFAULT_THEME,fontSize,lineHeight}),maxWidth:maxWidth==='full'?'100%':maxWidth}} dangerouslySetInnerHTML={{__html:applyDocumentAssets(artifact.html,assets)}}/>
 </div>;
};
