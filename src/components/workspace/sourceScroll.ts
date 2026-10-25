/** Source-line coordinates shared by flow and paginated preview presentation. */
export interface SourcePoint {line:number;top:number}
export interface EditorGeometry {lineHeight:number;paddingTop:number}
export function editorGeometry(editor:HTMLTextAreaElement):EditorGeometry {
 const style=getComputedStyle(editor);
 return {lineHeight:parseFloat(style.lineHeight)||24,paddingTop:parseFloat(style.paddingTop)||0};
}
export function editorLineAt(top:number,geometry:EditorGeometry):number {
 return Math.max(1,(top-geometry.paddingTop)/geometry.lineHeight+1);
}
export function editorTopAt(line:number,geometry:EditorGeometry):number {
 return Math.max(0,(line-1)*geometry.lineHeight+geometry.paddingTop);
}
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
