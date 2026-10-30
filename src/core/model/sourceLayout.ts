/** Logical source lines remain independent of visual rows and Markdown source offsets. */
export interface SourceAnchor {line:number;offset:number}
export interface SourceGeometry {lineHeight:number;paddingTop:number;lineTops?:readonly number[];layoutKey?:string}
export function sourceLayout(heights:readonly number[],paddingTop:number,layoutKey:string):SourceGeometry {
 if(!heights.length||!Number.isFinite(paddingTop)||paddingTop<0||heights.some(height=>!Number.isFinite(height)||height<=0))throw new Error('Invalid source layout');
 const lineTops=[paddingTop];
 for(const height of heights)lineTops.push(lineTops[lineTops.length-1]!+height);
 return {lineHeight:heights[0]!,paddingTop,lineTops,layoutKey};
}
export function sourceTopAt(line:number,geometry:SourceGeometry):number {
 const tops=geometry.lineTops;
 if(!tops?.length)return Math.max(0,(line-1)*geometry.lineHeight+geometry.paddingTop);
 const coordinate=Math.max(0,Math.min(line-1,tops.length-1)),index=Math.floor(coordinate),start=tops[index]!;
 return start+(coordinate-index)*((tops[index+1]??start)-start);
}
export function sourceLineAt(top:number,geometry:SourceGeometry):number {
 const tops=geometry.lineTops;
 if(!tops?.length)return Math.max(1,(top-geometry.paddingTop)/geometry.lineHeight+1);
 if(top<=tops[0]!)return 1;
 if(top>=tops[tops.length-1]!)return tops.length;
 let low=0,high=tops.length-1;
 while(high-low>1){const middle=Math.floor((low+high)/2);if(tops[middle]!<=top)low=middle;else high=middle}
 return low+1+(top-tops[low]!)/(tops[high]!-tops[low]!);
}
export function sourceAnchorAt(top:number,geometry:SourceGeometry):SourceAnchor {
 const maxLine=geometry.lineTops?geometry.lineTops.length-1:Infinity;
 const line=Math.max(1,Math.min(Math.floor(sourceLineAt(top,geometry)),maxLine));
 const start=sourceTopAt(line,geometry),height=geometry.lineTops?geometry.lineTops[line]!-start:geometry.lineHeight;
 // A negative offset on line 1 represents the editor's top padding (scrollTop=0).
 return {line,offset:Math.max(line===1?-geometry.paddingTop:0,Math.min(top-start,Math.max(0,height-0.001)))};
}
export function sourceAnchorTop(anchor:SourceAnchor,geometry:SourceGeometry):number {
 const count=geometry.lineTops?geometry.lineTops.length-1:Infinity;
 const line=Math.max(1,Math.min(anchor.line,count)),start=sourceTopAt(line,geometry);
 const height=geometry.lineTops?geometry.lineTops[line]!-start:geometry.lineHeight;
 return Math.max(0,start+Math.max(line===1?-geometry.paddingTop:0,Math.min(anchor.offset,Math.max(0,height-0.001))));
}
