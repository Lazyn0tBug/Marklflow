import {afterEach,expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({jobs:[] as {resolve:(v:{total:number})=>void;destroy:ReturnType<typeof vi.fn>;target:HTMLElement}[]}));
vi.mock('pagedjs',()=>({Previewer:class{
 polisher={destroy:vi.fn()};chunker={destroy:vi.fn(),hooks:{beforeParsed:{register:vi.fn()},beforePageLayout:{register:vi.fn()},afterPageLayout:{register:vi.fn()}}};
 preview(_content:string,_styles:unknown,target:HTMLElement){target.innerHTML='<div class="pagedjs_pages">page</div>';return new Promise<{total:number}>(resolve=>state.jobs.push({resolve,destroy:this.chunker.destroy,target}))}
}}));
vi.mock('../../src/core/export/documentPrint',async()=>{const actual=await vi.importActual<object>('../../src/core/export/documentPrint');return {...actual,waitForLayout:async()=>{}}});
import {paginateDocument} from '../../src/core/render/documentPaginator';
import {createNewDocument} from '../../src/core/storage/storage';
afterEach(()=>vi.useRealTimers());
it('keeps timed-out work alive and serial until underlying pagination settles',async()=>{
 vi.useFakeTimers();const doc=createNewDocument('lifecycle');doc.markdown='# 纯文本';
 const first=paginateDocument(doc).catch(error=>error);await vi.waitFor(()=>expect(state.jobs).toHaveLength(1));
 await vi.advanceTimersByTimeAsync(60001);expect(String(await first)).toContain('分页超时');expect(state.jobs[0].destroy).not.toHaveBeenCalled();
 const second=paginateDocument(doc);await vi.advanceTimersByTimeAsync(1);expect(state.jobs).toHaveLength(1);
 state.jobs[0].resolve({total:1});await vi.waitFor(()=>expect(state.jobs).toHaveLength(2));expect(state.jobs[0].destroy).toHaveBeenCalledOnce();
 state.jobs[1].resolve({total:1});expect((await second).total).toBe(1);expect(state.jobs[1].destroy).toHaveBeenCalledOnce();
});
