/** Workbench geometry only; never part of document/render identity. */
export const splitHandleWidth=8;
export const minimumPaneWidth=360;
export function splitBounds(width:number):{minimum:number;maximum:number;available:number}{
 const available=Math.max(minimumPaneWidth*2,Number.isFinite(width)?width-splitHandleWidth:0);
 const minimum=Math.max(0.15,minimumPaneWidth/available);
 return {minimum,maximum:Math.min(0.85,1-minimumPaneWidth/available),available};
}
export function constrainSplit(ratio:number,width:number):number{
 const {minimum,maximum}=splitBounds(width);return Math.max(minimum,Math.min(maximum,Number.isFinite(ratio)?ratio:0.5));
}
