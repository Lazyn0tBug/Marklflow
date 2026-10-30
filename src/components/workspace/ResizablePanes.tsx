import {useCallback,useEffect,useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import {constrainSplit,splitBounds,splitHandleWidth,minimumPaneWidth} from '../../core/model/paneSplit';
import {readSplitPreference,writeSplitPreference} from '../../core/platform/web/splitPreferences';
interface Props {editor:ReactNode;preview:ReactNode;labelledBy:string;onBeforeResize:()=>void;onDirectScroll:(pane:'editor'|'preview')=>void}
interface Drag {pointerId:number;startRatio:number;startEffective:number;startX:number;latestX:number;moved:boolean}
export function ResizablePanes({editor,preview,labelledBy,onBeforeResize,onDirectScroll}:Props){
 const container=useRef<HTMLDivElement>(null),handle=useRef<HTMLDivElement>(null);
 const drag=useRef<Drag|undefined>(undefined),frame=useRef<number|undefined>(undefined);
 const [ratio,setRatio]=useState(readSplitPreference),[width,setWidth]=useState(0);
 const enabled=Boolean(editor&&preview),bounds=splitBounds(width),effective=constrainSplit(ratio,width);
 const stop=useCallback((restore:boolean)=>{
  const active=drag.current;drag.current=undefined;
  if(frame.current!==undefined){cancelAnimationFrame(frame.current);frame.current=undefined}
  if(active){if(restore)setRatio(active.startRatio);const element=handle.current;if(element?.hasPointerCapture(active.pointerId))element.releasePointerCapture(active.pointerId)}
 },[]);
 useLayoutEffect(()=>{stop(true)},[enabled,labelledBy,stop]);
 useLayoutEffect(()=>{
  const element=container.current;if(!element)return;let resizeFrame:number|undefined;
  const measure=()=>{resizeFrame=undefined;setWidth(element.getBoundingClientRect().width)};
  measure();const observer=new ResizeObserver(()=>{if(resizeFrame===undefined)resizeFrame=requestAnimationFrame(measure)});observer.observe(element);
  return()=>{observer.disconnect();if(resizeFrame!==undefined)cancelAnimationFrame(resizeFrame)};
 },[]);
 useEffect(()=>{const blur=()=>stop(true);window.addEventListener('blur',blur);return()=>{window.removeEventListener('blur',blur);stop(false)}},[stop]);
 const apply=(clientX:number):number=>{
  const rect=container.current?.getBoundingClientRect();if(!rect)return effective;
  const next=constrainSplit((clientX-rect.left-splitHandleWidth/2)/splitBounds(rect.width).available,rect.width);setRatio(next);return next;
 };
 const finish=(pointerId:number,clientX:number)=>{
  const active=drag.current;if(!active||active.pointerId!==pointerId)return;
  if(active.moved||Math.abs(clientX-active.startX)>=1){const next=apply(clientX);if(Math.abs(next-active.startEffective)>0.000001)writeSplitPreference(next);else setRatio(active.startRatio)}
  stop(false);
 };
 const change=(next:number,reset=false)=>{const value=constrainSplit(next,container.current?.getBoundingClientRect().width??width);if(!reset&&Math.abs(value-effective)<0.000001)return;stop(false);onBeforeResize();setRatio(value);writeSplitPreference(value)};
 return <div ref={container} id="workbench-document" role="tabpanel" aria-labelledby={labelledBy} className="flex-1 flex overflow-hidden min-h-0" style={{minWidth:enabled?minimumPaneWidth*2+splitHandleWidth:0}}>
  {editor&&<div id="workbench-editor-pane" data-view="editor" onWheelCapture={()=>onDirectScroll('editor')} onPointerDownCapture={()=>onDirectScroll('editor')} onKeyDownCapture={()=>onDirectScroll('editor')} className="h-full min-w-0 flex flex-col" style={{flex:enabled?effective+' 0 0px':'1 1 0px',minWidth:enabled?minimumPaneWidth:0}}>{editor}</div>}
  {enabled&&<div ref={handle} role="separator" tabIndex={0} aria-label="调整编辑器与 HTML 视图宽度" aria-orientation="vertical" aria-controls="workbench-editor-pane workbench-html-pane" aria-valuemin={Math.round(bounds.minimum*100)} aria-valuemax={Math.round(bounds.maximum*100)} aria-valuenow={Math.round(effective*100)} aria-valuetext={'编辑器 '+Math.round(effective*100)+'%，HTML '+Math.round((1-effective)*100)+'%'} title="拖动或方向键调整；Home、Enter 或双击恢复均分" className="w-2 shrink-0 cursor-col-resize bg-neutral-950 hover:bg-teal-950 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-teal-400 flex justify-center" style={{touchAction:'none'}}
   onPointerDown={event=>{if(event.button!==0||drag.current)return;event.preventDefault();onBeforeResize();drag.current={pointerId:event.pointerId,startRatio:ratio,startEffective:effective,startX:event.clientX,latestX:event.clientX,moved:false};try{event.currentTarget.setPointerCapture(event.pointerId)}catch{stop(true)}}}
   onPointerMove={event=>{const active=drag.current;if(!active||active.pointerId!==event.pointerId)return;active.latestX=event.clientX;active.moved ||=Math.abs(event.clientX-active.startX)>=1;if(frame.current===undefined)frame.current=requestAnimationFrame(()=>{frame.current=undefined;const current=drag.current;if(current?.moved)apply(current.latestX)})}}
   onPointerUp={event=>finish(event.pointerId,event.clientX)} onPointerCancel={event=>{if(drag.current?.pointerId===event.pointerId)stop(true)}} onLostPointerCapture={event=>{if(drag.current?.pointerId===event.pointerId)stop(true)}}
   onDoubleClick={()=>change(0.5,true)} onKeyDown={event=>{if(event.key==='Escape'){stop(true);return}if(['ArrowLeft','ArrowRight','Home','Enter'].includes(event.key)){event.preventDefault();change(event.key==='ArrowLeft'?effective-0.02:event.key==='ArrowRight'?effective+0.02:0.5,event.key==='Home'||event.key==='Enter')}}}>
   <span className="w-px bg-neutral-700 pointer-events-none"/>
  </div>}
  {preview&&<div id="workbench-html-pane" data-view="html" onWheelCapture={()=>onDirectScroll('preview')} onPointerDownCapture={()=>onDirectScroll('preview')} onKeyDownCapture={()=>onDirectScroll('preview')} className="h-full min-w-0 flex flex-col" style={{flex:enabled?(1-effective)+' 0 0px':'1 1 0px',minWidth:enabled?minimumPaneWidth:0}}>{preview}</div>}
 </div>;
}
