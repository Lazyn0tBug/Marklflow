import {it,expect,vi,afterEach} from 'vitest';
import {withDeadline,waitForLayout} from '../../src/core/export/documentPrint';
afterEach(()=>{vi.restoreAllMocks();vi.useRealTimers()});
it('aborting a pending readiness wait removes its listener and deadline',async()=>{
 vi.useFakeTimers();const controller=new AbortController(),remove=vi.spyOn(controller.signal,'removeEventListener'),pending=withDeadline(new Promise<void>(()=>{}),'timeout',1000,controller.signal);
 controller.abort(new Error('leaving'));await expect(pending).rejects.toThrow('leaving');expect(vi.getTimerCount()).toBe(0);expect(remove).toHaveBeenCalledWith('abort',expect.any(Function));
});
it('already-aborted readiness still observes a later native rejection',async()=>{
 vi.useFakeTimers();const controller=new AbortController();controller.abort(new Error('left'));
 await expect(withDeadline(Promise.reject(new Error('native failure')),'timeout',1000,controller.signal)).rejects.toThrow('left');expect(vi.getTimerCount()).toBe(0);
});
it('retains normal completion and timeout behavior without a signal',async()=>{
 vi.useFakeTimers();expect(await withDeadline(Promise.resolve('ready'),'timeout',1000)).toBe('ready');expect(vi.getTimerCount()).toBe(0);
 const pending=withDeadline(new Promise<void>(()=>{}),'timed out',1000),assertion=expect(pending).rejects.toThrow('timed out');await vi.advanceTimersByTimeAsync(1000);await assertion;expect(vi.getTimerCount()).toBe(0);
});
it('cancels queued layout frames when readiness is aborted',async()=>{
 const controller=new AbortController();let entered=()=>{};const scheduled=new Promise<void>(resolve=>{entered=resolve});
 vi.spyOn(window,'requestAnimationFrame').mockImplementation(()=>{entered();return 91});const cancel=vi.spyOn(window,'cancelAnimationFrame').mockImplementation(()=>{});
 const pending=waitForLayout(document.createElement('article'),document,controller.signal);await scheduled;controller.abort(new Error('layout cancelled'));await expect(pending).rejects.toThrow('layout cancelled');expect(cancel).toHaveBeenCalledWith(91);
});

it('aborts a pending font wait before scheduling layout frames',async()=>{
 const doc=document.implementation.createHTMLDocument('fonts'),controller=new AbortController();Object.defineProperty(doc,'fonts',{value:{ready:new Promise<void>(()=>{})}});
 const request=vi.spyOn(window,'requestAnimationFrame');const pending=waitForLayout(doc.body,doc,controller.signal);await Promise.resolve();await Promise.resolve();controller.abort(new Error('fonts cancelled'));
 await expect(pending).rejects.toThrow('fonts cancelled');expect(request).not.toHaveBeenCalled();
});
