import {expect,it,vi} from 'vitest';
import {loadMathJaxAdapter} from '../../src/core/render/mathJaxAdapter';
import {createPagedAdapter} from '../../src/core/render/pagedJsAdapter';

function mathRuntime(){
 return {startup:{promise:Promise.resolve(),getInputJax:vi.fn(()=>[{}]),getDocument:vi.fn(()=>({})),makeMethods:vi.fn()},
  tex2mmlPromise:vi.fn(async()=>'<math><mn>1</mn></math>'),tex2svgPromise:vi.fn(async()=>{const container=document.createElement('mjx-container');container.innerHTML='<svg><path d="M0 0"/></svg>';return container})};
}
it('rejects missing MathJax or malformed conversion capabilities',async()=>{
 await expect(loadMathJaxAdapter(undefined)).rejects.toThrow('MathJax');
 await expect(loadMathJaxAdapter({...mathRuntime(),tex2mmlPromise:42})).rejects.toThrow('tex2mmlPromise');
 const runtime=mathRuntime();await expect(loadMathJaxAdapter({...runtime,startup:{...runtime.startup,makeMethods:null}})).rejects.toThrow('文档隔离');
});
it('awaits startup and propagates startup failure',async()=>{
 const runtime=mathRuntime();let ready:()=>void=()=>{};runtime.startup.promise=new Promise<void>(resolve=>{ready=resolve});
 const pending=loadMathJaxAdapter(runtime);expect(runtime.startup.getInputJax).not.toHaveBeenCalled();ready();
 const adapter=await pending;adapter.resetDocument();expect(runtime.startup.makeMethods).toHaveBeenCalledOnce();
 await expect(loadMathJaxAdapter({...runtime,startup:{...runtime.startup,promise:Promise.reject(new Error('startup failed'))}})).rejects.toThrow('startup failed');
});
it('rejects malformed document factories rather than fabricating state',async()=>{
 const runtime=mathRuntime();runtime.startup.getInputJax.mockReturnValue([]);
 const adapter=await loadMathJaxAdapter(runtime);expect(()=>adapter.resetDocument()).toThrow('输入引擎');
 const invalid=await loadMathJaxAdapter({...mathRuntime(),startup:{...mathRuntime().startup,getDocument:()=>null}});
 expect(()=>invalid.resetDocument()).toThrow('文档');
});
it('validates MathML structure and MathJax diagnostics',async()=>{
 const runtime=mathRuntime(),adapter=await loadMathJaxAdapter(runtime);adapter.resetDocument();
 expect(await adapter.convert('1',false,'mathml')).toContain('<mn>1');
 runtime.tex2mmlPromise.mockResolvedValue('<span>not math</span>');await expect(adapter.convert('1',false,'mathml')).rejects.toThrow('结构');
 runtime.tex2mmlPromise.mockResolvedValue('<math><merror>bad</merror></math>');await expect(adapter.convert('bad',false,'mathml')).rejects.toThrow('公式解析失败');
 await expect((await loadMathJaxAdapter({...runtime,tex2mmlPromise:async()=>42})).convert('x',false,'mathml')).rejects.toThrow('类型');
});
it('accepts SVG containers and rejects empty SVG conversion results',async()=>{
 const runtime=mathRuntime(),adapter=await loadMathJaxAdapter(runtime);adapter.resetDocument();
 expect(await adapter.convert('1',false,'svg')).toContain('<svg');
 runtime.tex2svgPromise.mockResolvedValue(document.createElement('div'));
 await expect(adapter.convert('1',false,'svg')).rejects.toThrow('SVG 输出结构');
});
it('requires promise conversion APIs and preserves the engine receiver',async()=>{
 const runtime=mathRuntime();
 const adapter=await loadMathJaxAdapter({...runtime,tex2mmlPromise:()=>'<math/>'});
 await expect(adapter.convert('x',false,'mathml')).rejects.toThrow('Promise');
 const engine={...runtime,tex2mmlPromise(this:unknown){expect(this).toBe(engine);return Promise.resolve('<math><mi>x</mi></math>')}};
 expect(await (await loadMathJaxAdapter(engine)).convert('x',false,'mathml')).toContain('<mi>x');
});
function paginationRuntime(result:unknown){
 const chunkerDestroy=vi.fn(),polisherDestroy=vi.fn(),register=vi.fn();
 class Previewer {
  chunker={destroy:chunkerDestroy,hooks:{beforeParsed:{register},beforePageLayout:{register},afterPageLayout:{register}}};
  polisher={destroy:polisherDestroy};
  preview(){return Promise.resolve(result)}
 }
 return {module:{Previewer},chunkerDestroy,polisherDestroy,register};
}
it('rejects missing Paged.js constructors',()=>{
 expect(()=>createPagedAdapter({})).toThrow('构造器');expect(()=>createPagedAdapter(null)).toThrow('接口');
});
it('cleans both Paged.js components when hook validation fails',()=>{
 const chunkerDestroy=vi.fn(),polisherDestroy=vi.fn();
 expect(()=>createPagedAdapter({Previewer:class{chunker={destroy:chunkerDestroy,hooks:{}};polisher={destroy:polisherDestroy};preview(){return Promise.resolve({total:1})}}})).toThrow('beforeParsed');
 expect(chunkerDestroy).toHaveBeenCalledOnce();expect(polisherDestroy).toHaveBeenCalledOnce();
});
it('validates pagination output, registers hooks and destroys once',async()=>{
 const runtime=paginationRuntime({total:2}),adapter=createPagedAdapter(runtime.module),callback=vi.fn();
 adapter.beforeParsed(callback);adapter.beforePageLayout(callback);adapter.afterPageLayout(callback);expect(runtime.register).toHaveBeenCalledTimes(3);
 expect(await adapter.preview('text',[],document.createElement('div'))).toEqual({total:2});
 adapter.destroy();adapter.destroy();expect(runtime.chunkerDestroy).toHaveBeenCalledOnce();expect(runtime.polisherDestroy).toHaveBeenCalledOnce();
 await expect(adapter.preview('text',[],document.createElement('div'))).rejects.toThrow('已销毁');
});
it('rejects non-integral or absent page counts',async()=>{
 for(const result of [null,{}, {total:0},{total:-1},{total:1.5},{total:Infinity},{total:'1'}]){
  const adapter=createPagedAdapter(paginationRuntime(result).module);
  try{await expect(adapter.preview('text',[],document.createElement('div'))).rejects.toThrow('Paged.js')}finally{adapter.destroy()}
 }
});
it('cleans the polisher even if chunker destruction throws',()=>{
 const runtime=paginationRuntime({total:1}),adapter=createPagedAdapter(runtime.module);
 runtime.chunkerDestroy.mockImplementation(()=>{throw new Error('destroy failed')});
 expect(()=>adapter.destroy()).toThrow('destroy failed');expect(runtime.polisherDestroy).toHaveBeenCalledOnce();
});

it('bounds MathJax startup waits without declaring the engine ready',async()=>{
 vi.useFakeTimers();
 try{
  const runtime=mathRuntime();runtime.startup.promise=new Promise<void>(()=>{});
  const result=loadMathJaxAdapter(runtime).catch(error=>error);
  await vi.advanceTimersByTimeAsync(20001);expect(String(await result)).toContain('启动超时');
  expect(runtime.startup.getInputJax).not.toHaveBeenCalled();
 }finally{vi.useRealTimers()}
});
it('rejects synchronous Paged.js lookalikes instead of treating them as completed work',async()=>{
 const runtime=paginationRuntime({total:1});
 class InvalidPreviewer {chunker=new runtime.module.Previewer().chunker;polisher=new runtime.module.Previewer().polisher;preview(){return {total:1}}}
 const adapter=createPagedAdapter({Previewer:InvalidPreviewer});
 try{await expect(adapter.preview('text',[],document.createElement('div'))).rejects.toThrow('Promise')}finally{adapter.destroy()}
});
