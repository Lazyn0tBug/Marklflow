import {expect,it,vi} from 'vitest';
import {loadMathJaxAdapter} from '../../src/core/render/mathJaxAdapter';
function runtime(){return {
 startup:{promise:Promise.resolve(),getInputJax:()=>[{name:'TeX',compile:()=>{}}],getDocument:()=>({convert:()=>{}}),makeMethods:()=>{}},
 tex2mmlPromise:vi.fn(async()=>'<math><mi>x</mi></math>'),
 tex2svgPromise:async()=>{const node=document.createElement('mjx-container');node.innerHTML='<svg xmlns="http://www.w3.org/2000/svg"/>';return node}
}}
it('rejects a Promise masquerading as a synchronous MathJax document',async()=>{
 const source=runtime();const adapter=await loadMathJaxAdapter({...source,startup:{...source.startup,getDocument:()=>Promise.resolve({convert:()=>{}})}});
 expect(()=>adapter.resetDocument()).toThrow('文档');
});
it('requires input jax compile capabilities rather than arbitrary objects',async()=>{
 const source=runtime();const adapter=await loadMathJaxAdapter({...source,startup:{...source.startup,getInputJax:()=>[{}]}});
 expect(()=>adapter.resetDocument()).toThrow('输入引擎');
});
it('does not mistake diagnostic-like literal text for a MathJax error',async()=>{
 const source=runtime();source.tex2mmlPromise.mockResolvedValue('<math><mtext>data-mjx-error and mjx-merror</mtext></math>');
 const adapter=await loadMathJaxAdapter(source);adapter.resetDocument();
 await expect(adapter.convert('text',false,'mathml')).resolves.toContain('<mtext>');
});
it('rejects non-whitespace text outside the MathML root',async()=>{
 const source=runtime();source.tex2mmlPromise.mockResolvedValue('unexpected<math><mi>x</mi></math>');
 const adapter=await loadMathJaxAdapter(source);adapter.resetDocument();
 await expect(adapter.convert('x',false,'mathml')).rejects.toThrow('结构');
});
it('rejects SVG output mixed with non-math wrapper content',async()=>{
 const source=runtime();const node=document.createElement('div');node.innerHTML='unexpected<svg/>';
 const adapter=await loadMathJaxAdapter({...source,tex2svgPromise:async()=>node});adapter.resetDocument();
 await expect(adapter.convert('x',false,'svg')).rejects.toThrow('结构');
});
it('requires a successfully initialized document before conversion',async()=>{
 const adapter=await loadMathJaxAdapter(runtime());
 await expect(adapter.convert('x',false,'mathml')).rejects.toThrow('文档');
});
it('prevents document reset or a second conversion during an active conversion',async()=>{
 const source=runtime();let resolve:(value:string)=>void=()=>{};
 source.tex2mmlPromise.mockImplementationOnce(()=>new Promise<string>(done=>{resolve=done}));
 const adapter=await loadMathJaxAdapter(source);adapter.resetDocument();const first=adapter.convert('x',false,'mathml');
 try{
  expect(()=>adapter.resetDocument()).toThrow('转换');
  await expect(adapter.convert('y',false,'mathml')).rejects.toThrow('转换');
 }finally{resolve('<math><mi>x</mi></math>');await first}
});

it('rejects and observes asynchronous setup factories without unhandled rejections',async()=>{
 const source=runtime();
 for(const factory of ['getInputJax','getDocument','makeMethods']){
  const adapter=await loadMathJaxAdapter({...source,startup:{...source.startup,[factory]:()=>Promise.reject(new Error('late factory failure'))}});
  expect(()=>adapter.resetDocument()).toThrow('同步');
  await expect(adapter.convert('x',false,'mathml')).rejects.toThrow('文档');
 }
});
it('detects error elements and attributes while allowing surrounding whitespace',async()=>{
 const source=runtime(),adapter=await loadMathJaxAdapter(source);adapter.resetDocument();
 source.tex2mmlPromise.mockResolvedValue(' \n<math><mi>x</mi></math> \n');
 await expect(adapter.convert('x',false,'mathml')).resolves.toContain('<math>');
 for(const html of ['<math data-mjx-error="bad"><mi>x</mi></math>','<math><merror>bad</merror></math>']){
  source.tex2mmlPromise.mockResolvedValue(html);await expect(adapter.convert('x',false,'mathml')).rejects.toThrow('公式解析失败');
 }
});

it('serializes the same compilation root for SVG semantics and restores the input method',async()=>{
 const compile=vi.fn(()=>({kind:'math',value:'same'})),input={name:'TeX',compile};
 const toMML=vi.fn((root:unknown)=>{expect(root).toEqual({kind:'math',value:'same'});return '<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>same</mi></math>'});
 const source=runtime();source.startup.getInputJax=()=>[input];
 const adapter=await loadMathJaxAdapter({...source,startup:{...source.startup,toMML},tex2svgPromise:async()=>{input.compile();const node=document.createElement('mjx-container');node.innerHTML='<svg xmlns="http://www.w3.org/2000/svg"/>';return node}});adapter.resetDocument();
 const html=await adapter.convert('same',false,'svg',true),root=document.createElement('div');root.innerHTML=html;
 expect(compile).toHaveBeenCalledOnce();expect(source.tex2mmlPromise).not.toHaveBeenCalled();expect(toMML).toHaveBeenCalledOnce();expect(root.querySelector('.mf-math-semantics[hidden] math')?.textContent).toBe('same');expect(input.compile).toBe(compile);
 adapter.releaseDocument();
});
it('fails closed if SVG semantics cannot be captured and leaves future documents usable',async()=>{
 const input={name:'TeX',compile:vi.fn(()=>({kind:'math'}))},source=runtime();source.startup.getInputJax=()=>[input];const original=input.compile;
 const adapter=await loadMathJaxAdapter({...source,startup:{...source.startup,toMML:()=>'<math><merror>broken</merror></math>'},tex2svgPromise:async()=>{input.compile();const node=document.createElement('mjx-container');node.innerHTML='<svg xmlns="http://www.w3.org/2000/svg"/>';return node}});adapter.resetDocument();
 await expect(adapter.convert('same',false,'svg',true)).rejects.toThrow('公式解析失败');expect(input.compile).toBe(original);adapter.releaseDocument();adapter.resetDocument();await expect(adapter.convert('x',false,'mathml')).resolves.toContain('<mi>x');adapter.releaseDocument();
});
