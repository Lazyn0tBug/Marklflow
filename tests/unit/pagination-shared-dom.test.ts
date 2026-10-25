import {afterEach,beforeEach,it,expect,vi} from 'vitest';
const state=vi.hoisted(()=>({calls:[] as string[],hold:false,finish:()=>{},reported:1,pages:1}));
vi.mock('pagedjs',()=>({Previewer:class{
 chunker={destroy:vi.fn(),hooks:{beforeParsed:{register(){}},beforePageLayout:{register(){}},afterPageLayout:{register(){}}}};polisher={destroy:vi.fn()};
 async preview(content:string,_styles:unknown,target:HTMLElement){state.calls.push(content);target.innerHTML='<div class="pagedjs_pages">'+Array.from({length:state.pages},()=>'<div class="pagedjs_page">'+content+'</div>').join('')+'</div>';if(state.hold){state.hold=false;await new Promise<void>(resolve=>{state.finish=resolve})}return {total:state.reported}}
}}));
vi.mock('../../src/core/export/documentPrint',async()=>{const actual=await vi.importActual<object>('../../src/core/export/documentPrint');return {...actual,waitForLayout:async()=>{}}});
import {paginateDocument} from '../../src/core/render/documentPaginator';
import {createNewDocument} from '../../src/core/storage/storage';
import {sharedDom} from '../../src/core/platform/web/sharedDom';
const flush=async()=>{for(let i=0;i<90;i++)await Promise.resolve()};
const doc=(name:string)=>{const value=createNewDocument(name);value.markdown='# '+name;return value};
beforeEach(()=>{state.calls=[];state.hold=false;state.reported=1;state.pages=1});
afterEach(()=>{expect(document.querySelectorAll('body > .mf-pagination')).toHaveLength(0);expect(sharedDom.snapshot()).toEqual({active:undefined,waiting:[],blocked:false})});
it('selects export before foreground before background at pagination step boundaries',async()=>{
 let release=()=>{};const blocker=sharedDom.step('foreground','engine',new AbortController().signal,()=>new Promise<void>(resolve=>{release=resolve}));await flush();
 const background=paginateDocument(doc('BACKGROUND'),undefined,{priority:'background'}),foreground=paginateDocument(doc('FOREGROUND')),exported=paginateDocument(doc('EXPORT'),undefined,{priority:'export'});await flush();expect(state.calls).toHaveLength(0);release();await Promise.all([blocker,background,foreground,exported]);expect(state.calls.map(value=>value.includes('BACKGROUND')?'background':value.includes('FOREGROUND')?'foreground':'export')).toEqual(['export','foreground','background']);
});
it('freezes source and theme before awaiting shared DOM',async()=>{
 const source=doc('FROZEN'),options={priority:'background' as const};const pending=paginateDocument(source,undefined,options);source.markdown='# MUTATED';source.theme.fontSize=23;const result=await pending;expect(result.html).toContain('FROZEN');expect(result.html).not.toContain('MUTATED');expect(result.html).toContain('data-line="1"');expect(result.css).toContain('.mf-doc');expect(result.html).not.toContain('--mf-size:23');
});
it('removes a cancelled waiting pagination without constructing its native instance',async()=>{
 let release=()=>{};const blocker=sharedDom.step('foreground','engine',new AbortController().signal,()=>new Promise<void>(resolve=>{release=resolve}));await flush();const abort=new AbortController(),cancelled=paginateDocument(doc('WAITING'),abort.signal).catch(error=>String(error));await flush();abort.abort();expect(await cancelled).toContain('cancelled');expect(state.calls).toHaveLength(0);release();await blocker;
});
it('holds active pagination through cancellation and starts the next only after settlement',async()=>{
 state.hold=true;const abort=new AbortController(),first=paginateDocument(doc('FIRST'),abort.signal).catch(error=>String(error));await flush();expect(state.calls).toHaveLength(1);abort.abort();const next=paginateDocument(doc('SECOND'));await flush();expect(state.calls).toHaveLength(1);expect(document.querySelectorAll('.mf-pagination')).toHaveLength(1);state.finish();expect(await first).toContain('cancelled');expect((await next).html).toContain('SECOND');
});
it('rejects incomplete page counts instead of publishing a partial A4 artifact',async()=>{
 state.reported=2;await expect(paginateDocument(doc('INCOMPLETE'))).rejects.toThrow('数量');state.reported=1;expect((await paginateDocument(doc('RECOVERED'))).total).toBe(1);
});
