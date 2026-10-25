import {it,expect} from 'vitest';
import {editorLineAt,editorTopAt,interpolate,previewSourcePoints} from '../../src/components/workspace/sourceScroll';
it('interpolates within source blocks in either direction instead of using document ratios',()=>{
 const points=[{line:1,top:0},{line:30,top:900},{line:90,top:1200}];
 expect(interpolate(points,60,'line')).toBe(1050);expect(interpolate(points,1050,'top')).toBe(60);
 expect(interpolate(points,-2,'top')).toBe(1);expect(interpolate(points,100,'line')).toBe(1200);
});
it('resolves flat source edges and empty maps safely',()=>{
 expect(interpolate([],10,'line')).toBe(0);expect(interpolate([],10,'top')).toBe(1);
 expect(interpolate([{line:1,top:0},{line:3,top:0},{line:8,top:100}],0,'top')).toBe(1);
});
it('uses measured editor line height and padding with fractional lines',()=>{
 const geometry={lineHeight:30,paddingTop:16};expect(editorTopAt(20,geometry)).toBe(586);expect(editorLineAt(586,geometry)).toBe(20);expect(editorLineAt(0,geometry)).toBe(1);
});
function fixture(html:string){const view=document.createElement('div');view.innerHTML=html;Object.defineProperty(view,'scrollHeight',{value:1000});view.getBoundingClientRect=()=>({top:0} as DOMRect);for(const el of view.querySelectorAll<HTMLElement>('[data-line]')){const top=Number(el.dataset.top),height=Number(el.dataset.height??100);el.getBoundingClientRect=()=>({top,bottom:top+height,height} as DOMRect)}return view}
it('combines split A4 code fragments into their source range and ignores repeated table headers',()=>{
 const view=fixture('<pre data-line="10" data-source-end="49" data-top="100" data-height="150"></pre><pre data-line="10" data-source-end="49" data-top="300" data-height="150"></pre><table><thead><tr data-line="51" data-top="500"></tr></thead><thead><tr data-line="51" data-top="900"></tr></thead></table>');
 const points=previewSourcePoints(view,100);expect(interpolate(points,30,'line')).toBe(275);expect(interpolate(points,50,'line')).toBe(450);expect(interpolate(points,52,'line')).toBe(600);
});
it('prefers inner mapped blocks, rejects invalid ranges and returns monotonic geometry',()=>{
 const view=fixture('<li data-line="2" data-source-end="20" data-top="100"><p data-line="3" data-source-end="4" data-top="120"></p></li><p data-line="oops" data-top="5"></p><p data-line="8" data-top="90"></p>');
 const points=previewSourcePoints(view,30);expect(points.some(value=>value.line===2)).toBe(false);expect(points.every((value,i)=>i===0||value.top>=points[i-1]!.top)).toBe(true);expect(points.some(value=>!Number.isFinite(value.line))).toBe(false);
});
