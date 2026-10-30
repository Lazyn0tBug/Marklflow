import {sourceLayout,sourceLineAt,sourceTopAt} from '../../core/model/sourceLayout';
import type {SourceGeometry} from '../../core/model/sourceLayout';
export {sourceAnchorAt,sourceAnchorTop} from '../../core/model/sourceLayout';
/** Source-line coordinates shared by editor, flow and paginated presentation. */
export interface SourcePoint {line:number;top:number}
export type EditorGeometry=SourceGeometry;
const layouts=new WeakMap<HTMLTextAreaElement,{value:string;key:string;geometry:EditorGeometry}>();
export function invalidateEditorGeometry(editor:HTMLTextAreaElement):void {const cached=layouts.get(editor);if(cached)cached.key=''}
let layoutVersion=0;
const composingEditors=new WeakSet<HTMLTextAreaElement>();
export function setEditorComposing(editor:HTMLTextAreaElement,active:boolean):void {if(active)composingEditors.add(editor);else composingEditors.delete(editor)}
const mirroredProperties=['font-family','font-size','font-weight','font-style','font-stretch','font-variant','font-feature-settings','font-variation-settings','letter-spacing','word-spacing','tab-size','text-indent','text-transform','direction','text-rendering'] as const;
/** Read all row rectangles after constructing the mirror; never put document text into HTML. */
function wrappedHeights(editor:HTMLTextAreaElement,style:CSSStyleDeclaration,lines:readonly string[],lineHeight:number):number[]{
 const width=editor.clientWidth-(parseFloat(style.paddingLeft)||0)-(parseFloat(style.paddingRight)||0);
 if(width<=0)return lines.map(()=>lineHeight);
 const mirror=document.createElement('div');
 mirror.setAttribute('aria-hidden','true');
 mirror.style.cssText='position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none;box-sizing:content-box;padding:0;border:0;white-space:pre-wrap;overflow-wrap:anywhere;word-break:normal;';
 mirror.style.width=width+'px';mirror.style.font=style.font;mirror.style.lineHeight=lineHeight+'px';
 for(const property of mirroredProperties)if(typeof style.getPropertyValue==='function')mirror.style.setProperty(property,style.getPropertyValue(property));
 const rows=lines.map(line=>{const row=document.createElement('div');row.textContent=line||'\u200b';mirror.append(row);return row});
 try{document.body.append(mirror);return rows.map(row=>row.getBoundingClientRect().height||lineHeight)}finally{mirror.remove()}
}
/** Shared editor-owned layout: cache hits never rebuild or reread mirror rows. */
export function editorGeometry(editor:HTMLTextAreaElement):EditorGeometry {
 const prior=layouts.get(editor);if(composingEditors.has(editor)&&prior)return prior.geometry;
 const style=getComputedStyle(editor),lineHeight=parseFloat(style.lineHeight)||24,paddingTop=parseFloat(style.paddingTop)||0;
 const cached=layouts.get(editor),count=cached?.value===editor.value?cached.geometry.lineTops!.length-1:editor.value.split('\n').length;
 const key=JSON.stringify([editor.clientWidth,style.font,...mirroredProperties.map(property=>typeof style.getPropertyValue==='function'?style.getPropertyValue(property):''),style.letterSpacing,style.tabSize,lineHeight,paddingTop,style.paddingLeft,style.paddingRight,editor.wrap,count]);
 if(cached?.value===editor.value&&cached.key===key)return cached.geometry;
 const heights=editor.wrap==='off'?Array.from({length:count},()=>lineHeight):wrappedHeights(editor,style,editor.value.split('\n'),lineHeight);
 // A new generation may restore an equivalent layout by its lossless logical anchor.
 const geometry={...sourceLayout(heights,paddingTop,key+'#'+(++layoutVersion)),lineHeight};
 layouts.set(editor,{value:editor.value,key,geometry});return geometry;
}
export function editorLineAt(top:number,geometry:EditorGeometry):number {return sourceLineAt(top,geometry)}
export function editorTopAt(line:number,geometry:EditorGeometry):number {return sourceTopAt(line,geometry)}
/** Coordinates must be ordered on both axes; flat sections resolve to their first edge. */
export function interpolate(points:readonly SourcePoint[],value:number,from:'line'|'top'):number {
 const to=from==='line'?'top':'line',first=points[0],last=points.at(-1);
 if(!first||!last)return from==='line'?0:1;
 if(value<=first[from])return first[to];
 for(let i=1;i<points.length;i++){
  const next=points[i],previous=points[i-1];
  if(next&&previous&&value<=next[from]){
   const span=next[from]-previous[from];
   return span>0?previous[to]+(value-previous[from])/span*(next[to]-previous[to]):previous[to];
  }
 }
 return last[to];
}
/** Read current geometry instead of caching stale positions across widths, fonts or A4 mounts. */
export function previewSourcePoints(preview:HTMLElement,totalLines:number):SourcePoint[] {
 const selector='h1[data-line],h2[data-line],h3[data-line],h4[data-line],h5[data-line],h6[data-line],p[data-line],pre[data-line],figure[data-line],.mf-math[data-line],tr[data-line],li[data-line],hr[data-line]';
 const groups=new Map<string,{line:number;end:number;top:number;bottom:number}>();
 const origin=preview.getBoundingClientRect().top-preview.scrollTop;
 for(const element of preview.querySelectorAll<HTMLElement>(selector)){
  // Prefer inner semantic blocks over list/table containers carrying the same source range.
  if(element.querySelector(selector))continue;
  const rect=element.getBoundingClientRect();if(!rect.height)continue;
  const line=Number(element.dataset.line),end=Number(element.dataset.sourceEnd??line);
  if(!Number.isInteger(line)||!Number.isInteger(end)||line<1||end<line||line>totalLines)continue;
  const key=element.tagName+':'+line+':'+end,old=groups.get(key);
  // Paged.js repeats table headers; repeated headers do not advance the source document.
  if(old&&element.closest('thead'))continue;
  const top=rect.top-origin,bottom=rect.bottom-origin;
  if(old){old.top=Math.min(old.top,top);old.bottom=Math.max(old.bottom,bottom)}
  else groups.set(key,{line,end:Math.min(end,totalLines),top,bottom});
 }
 const starts=new Map<number,number>([[1,0]]),ends=new Map<number,number>();
 for(const group of groups.values()){
  starts.set(group.line,Math.min(starts.get(group.line)??Infinity,group.top));
  ends.set(group.end+1,Math.max(ends.get(group.end+1)??0,group.bottom));
 }
 const combined=new Map(ends);for(const [line,top] of starts)combined.set(line,top);
 combined.set(totalLines+1,preview.scrollHeight);
 let previousTop=0;
 return [...combined].sort(([a],[b])=>a-b).map(([line,top])=>({line,top:previousTop=Math.max(previousTop,top)}));
}
