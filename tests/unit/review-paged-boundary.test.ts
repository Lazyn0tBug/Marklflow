import {expect,it,vi} from 'vitest';
import {createPagedAdapter,loadPagedAdapter} from '../../src/core/render/pagedJsAdapter';
function runtime(){
 const chunkerDestroy=vi.fn(),polisherDestroy=vi.fn(),preview=vi.fn(async()=>({total:1}));
 class Previewer {
  chunker={destroy:chunkerDestroy,hooks:{beforeParsed:{register:vi.fn()},beforePageLayout:{register:vi.fn()},afterPageLayout:{register:vi.fn()}}};
  polisher={destroy:polisherDestroy};preview=preview;
 }
 return {module:{Previewer},preview,chunkerDestroy,polisherDestroy};
}
it('cleans available components when another component is missing during initialization',()=>{
 const destroy=vi.fn();
 expect(()=>createPagedAdapter({Previewer:class{chunker=null;polisher={destroy}}})).toThrow('chunker');
 expect(destroy).toHaveBeenCalledOnce();
});
it('preserves both destruction errors',()=>{
 const source=runtime(),first=new Error('chunker failed'),second=new Error('polisher failed');
 source.chunkerDestroy.mockImplementation(()=>{throw first});source.polisherDestroy.mockImplementation(()=>{throw second});
 const adapter=createPagedAdapter(source.module);
 try{adapter.destroy();throw new Error('Expected cleanup failure')}catch(error){expect(error).toBeInstanceOf(AggregateError);if(error instanceof AggregateError)expect(error.errors).toEqual([first,second])}
});
it('prevents destruction and a second preview while pagination is active',async()=>{
 const source=runtime();let resolve:(value:{total:number})=>void=()=>{};
 source.preview.mockImplementationOnce(()=>new Promise<{total:number}>(done=>{resolve=done}));
 const adapter=createPagedAdapter(source.module),first=adapter.preview('text',[],document.createElement('div'));
 try{
  expect(()=>adapter.destroy()).toThrow('未结束');expect(source.chunkerDestroy).not.toHaveBeenCalled();
  await expect(adapter.preview('second',[],document.createElement('div'))).rejects.toThrow('已开始');
 }finally{resolve({total:1});await first;adapter.destroy()}
});
it('can dispose the real uninitialized Paged.js instance safely',async()=>{
 const adapter=await loadPagedAdapter();expect(()=>adapter.destroy()).not.toThrow();
});
it('bounds loading before constructing any late-arriving instance',async()=>{
 vi.useFakeTimers();let resolve:(value:unknown)=>void=()=>{};const constructed=vi.fn();
 try{
  const result=loadPagedAdapter(()=>new Promise<unknown>(done=>{resolve=done})).catch(error=>error);
  await vi.advanceTimersByTimeAsync(20001);expect(String(await result)).toContain('加载超时');
  resolve({Previewer:class{constructor(){constructed()}}});await Promise.resolve();await Promise.resolve();expect(constructed).not.toHaveBeenCalled();
 }finally{vi.useRealTimers()}
});

it('removes already allocated nodes during partial 0.4.3 setup without unsafe destroy calls',()=>{
 const area=document.createElement('div'),style=document.createElement('style');document.body.append(area);document.head.append(style);
 const destroy=vi.fn(()=>{throw new Error('unsafe partial destroy')});
 expect(()=>createPagedAdapter({Previewer:class{
  chunker={pages:[],pagesArea:area,destroy,hooks:{}};
  polisher={inserted:[style],sheets:[],destroy};
  preview(){return Promise.resolve({total:1})}
 }})).toThrow('beforeParsed');
 expect(area.isConnected).toBe(false);expect(style.isConnected).toBe(false);expect(destroy).not.toHaveBeenCalled();
});
it('requires a fresh adapter after a preview settles',async()=>{
 const source=runtime(),adapter=createPagedAdapter(source.module);
 try{
  await adapter.preview('first',[],document.createElement('div'));
  await expect(adapter.preview('second',[],document.createElement('div'))).rejects.toThrow('已开始');
  expect(()=>adapter.beforeParsed(()=>{})).toThrow('已开始');expect(source.preview).toHaveBeenCalledOnce();
 }finally{adapter.destroy()}
});
