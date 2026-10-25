import {afterEach,expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({cssFailure:false,previewFailure:false,destroyFailure:false}));
vi.mock('css-tree',async()=>{
 const actual=await vi.importActual<typeof import('css-tree')>('css-tree');
 return {...actual,parse:(...args:Parameters<typeof actual.parse>)=>{if(state.cssFailure&&args[0].length>1000)throw new Error('CSS parsing failed');return actual.parse(...args)}};
});
vi.mock('pagedjs',()=>({Previewer:class{
 chunker={destroy(){if(state.destroyFailure)throw new Error('chunker cleanup failed')},hooks:{beforeParsed:{register(){}},beforePageLayout:{register(){}},afterPageLayout:{register(){}}}};
 polisher={destroy(){}};
 async preview(_source:string,_styles:unknown,target:HTMLElement){if(state.previewFailure)throw new Error('preview failed');target.innerHTML='<div class="pagedjs_pages"><div class="pagedjs_page">page</div></div>';return {total:1}}
}}));
vi.mock('../../src/core/export/documentPrint',async()=>{const actual=await vi.importActual<object>('../../src/core/export/documentPrint');return {...actual,waitForLayout:async()=>{}}});
import {sharedDom} from '../../src/core/platform/web/sharedDom';
import {paginateDocument} from '../../src/core/render/documentPaginator';
import {createNewDocument} from '../../src/core/storage/storage';
afterEach(async()=>{state.cssFailure=false;state.previewFailure=false;state.destroyFailure=false;await sharedDom.retryCleanup();for(const host of document.querySelectorAll('.mf-pagination'))host.remove()});
it('removes the pagination host even when CSS preprocessing fails',async()=>{
 const doc=createNewDocument('CSS failure');doc.markdown='# title';state.cssFailure=true;
 await expect(paginateDocument(doc)).rejects.toThrow('CSS parsing failed');
 expect(document.querySelector('.mf-pagination')).toBeNull();
 state.cssFailure=false;expect((await paginateDocument(doc)).total).toBe(1);
});
it('preserves the render failure as well as cleanup failure and blocks reuse until explicit cleanup succeeds',async()=>{
 const doc=createNewDocument('cleanup failure');doc.markdown='# title';state.previewFailure=true;state.destroyFailure=true;
 const result=await paginateDocument(doc).catch(error=>error);
 expect(result).toBeInstanceOf(AggregateError);
 if(result instanceof AggregateError){expect(String(result.errors[0])).toContain('preview failed');expect(String(result.errors[1])).toContain('cleanup failed')}
 expect(document.querySelector('.mf-pagination')).toBeNull();
 state.previewFailure=false;state.destroyFailure=false;expect(sharedDom.snapshot().blocked).toBe(true);await sharedDom.retryCleanup();expect((await paginateDocument(doc)).total).toBe(1);
});
