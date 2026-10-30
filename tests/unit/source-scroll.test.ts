import {it,expect,vi} from 'vitest';
import {editorGeometry,editorLineAt,editorTopAt,interpolate,previewSourcePoints,invalidateEditorGeometry,setEditorComposing} from '../../src/components/workspace/sourceScroll';
import {sourceAnchorAt,sourceAnchorTop,sourceLayout,sourceLineAt,sourceTopAt} from '../../src/core/model/sourceLayout';
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
it('reuses editor geometry and invalidates it for source, width and font metrics',()=>{
 const editor=document.createElement('textarea');editor.value='first\nsecond';editor.style.fontFamily='monospace';editor.style.fontSize='14px';editor.style.lineHeight='24px';editor.style.paddingTop='12px';
 let font='14px monospace';vi.spyOn(window,'getComputedStyle').mockImplementation(()=>({font,lineHeight:'24px',paddingTop:'12px',letterSpacing:'normal',tabSize:'8'} as CSSStyleDeclaration));
 let width=400;Object.defineProperty(editor,'clientWidth',{configurable:true,get:()=>width});
 const initial=editorGeometry(editor);expect(editorGeometry(editor)).toBe(initial);expect(initial.lineTops).toHaveLength(3);
 width=500;const resized=editorGeometry(editor);expect(resized).not.toBe(initial);expect(editorGeometry(editor)).toBe(resized);
 font='italic 16px monospace';const restyled=editorGeometry(editor);expect(restyled).not.toBe(resized);
 editor.value+='\n';const changed=editorGeometry(editor);expect(changed).not.toBe(restyled);expect(changed.lineTops).toHaveLength(4);
 vi.restoreAllMocks();
});
it('measures wrapped logical rows from safe text and reuses the result until layout metrics change',()=>{
 const editor=document.createElement('textarea');editor.value='中文🙂long-url-123\n\n<img>';editor.wrap='soft';
 const styleValues:Record<string,string>={'font-family':'monospace','font-size':'10px','font-weight':'400','font-style':'normal','font-stretch':'normal','font-variant':'normal','font-feature-settings':'normal','font-variation-settings':'normal','letter-spacing':'normal','word-spacing':'normal','tab-size':'4','text-indent':'0px','text-transform':'none','direction':'ltr','text-rendering':'auto'};
 const style={font:'10px monospace',lineHeight:'20px',paddingTop:'8px',paddingLeft:'8px',paddingRight:'8px',letterSpacing:'normal',tabSize:'4',getPropertyValue:(name:string)=>styleValues[name]??''} as unknown as CSSStyleDeclaration;
 vi.spyOn(window,'getComputedStyle').mockReturnValue(style);
 Object.defineProperty(editor,'clientWidth',{configurable:true,value:80});
 const original=HTMLElement.prototype.getBoundingClientRect;let measured=0,glyphWidth=10;
 vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockImplementation(function(this:HTMLElement){
  if(this.parentElement?.getAttribute('aria-hidden')==='true'){
   measured++;expect(this.parentElement.style.width).toBe('64px');
   expect(this.parentElement.style.getPropertyValue('tab-size')).toBe('4');
   const length=[...this.textContent!].length||1,height=Math.ceil(length*glyphWidth/64)*20;
   return {top:0,bottom:height,left:0,right:64,width:64,height,toJSON:()=>({})} as DOMRect;
  }
  return original.call(this);
 });
 const geometry=editorGeometry(editor);
 expect(geometry.lineTops).toEqual([8,68,88,108]);expect(measured).toBe(3);
 expect(editorGeometry(editor)).toBe(geometry);expect(measured).toBe(3);
 setEditorComposing(editor,true);glyphWidth=16;invalidateEditorGeometry(editor);expect(editorGeometry(editor)).toBe(geometry);expect(measured).toBe(3);
 setEditorComposing(editor,false);const fontReady=editorGeometry(editor);expect(fontReady).not.toBe(geometry);expect(fontReady.lineTops![1]).toBeGreaterThan(geometry.lineTops![1]!);expect(measured).toBe(6);
 expect([...document.body.querySelectorAll('[aria-hidden="true"]')]).toHaveLength(0);
 vi.restoreAllMocks();
});
it('maps variable logical line heights monotonically and preserves within-line anchors',()=>{
 const geometry=sourceLayout([24,48,30,18],12,'variable');
 expect([1,2,3,4,5].map(line=>sourceTopAt(line,geometry))).toEqual([12,36,84,114,132]);
 for(const top of [12,18,35.5,36,61,83.9,84,113,131.5])expect(sourceTopAt(sourceLineAt(top,geometry),geometry)).toBeCloseTo(top,6);
 const anchor=sourceAnchorAt(68,geometry);expect(anchor).toEqual({line:2,offset:32});
 const resized=sourceLayout([24,60,30,18],12,'resized');expect(sourceAnchorTop(anchor,resized)).toBe(68);
 expect(sourceAnchorTop({line:2,offset:1000},resized)).toBeLessThan(sourceTopAt(3,resized));
});
it('clamps source anchors at document boundaries and rejects invalid row geometry',()=>{
 const geometry=sourceLayout([24,36],8,'two-lines');
 expect(sourceLineAt(-50,geometry)).toBe(1);expect(sourceLineAt(1000,geometry)).toBe(3);
 expect(sourceAnchorAt(1000,geometry).offset).toBeLessThan(36);
 expect(sourceAnchorAt(1000,geometry).offset).toBeGreaterThanOrEqual(0);
 expect(sourceAnchorTop(sourceAnchorAt(0,geometry),geometry)).toBe(0);
 expect(sourceAnchorTop({line:99,offset:0},geometry)).toBe(32);
 expect(()=>sourceLayout([],0,'empty')).toThrow();expect(()=>sourceLayout([24,0],0,'zero')).toThrow();
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
