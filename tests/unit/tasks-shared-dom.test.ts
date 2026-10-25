// @vitest-environment jsdom
import {it,expect} from 'vitest';
import {SharedDom} from '../../src/application/tasks/sharedDom';
import {FakeClock} from './task-fixtures';
const flush=async()=>{for(let i=0;i<40;i++)await Promise.resolve()};
const signal=()=>new AbortController().signal;
it('selects export then foreground then background at each completed step, FIFO within a priority',async()=>{
 const clock=new FakeClock(),dom=new SharedDom(clock),order:string[]=[];let done=()=>{};
 const first=dom.step('background','engine',signal(),()=>new Promise<void>(resolve=>{order.push('active');done=resolve}));await flush();
 const background=dom.step('background','engine',signal(),()=>{order.push('background')});
 const foreground=dom.step('foreground','engine',signal(),()=>{order.push('foreground')});
 const export1=dom.step('export','engine',signal(),()=>{order.push('export1')});
 const export2=dom.step('export','engine',signal(),()=>{order.push('export2')});
 await flush();expect(order).toEqual(['active']);done();await Promise.all([first,background,foreground,export1,export2]);expect(order).toEqual(['active','export1','export2','foreground','background']);await flush();expect(clock.pending).toBe(0);
});
it('permits higher priority work between the steps of a single render',async()=>{
 const dom=new SharedDom(new FakeClock()),order:string[]=[];
 const render=(async()=>{await dom.step('background','engine',signal(),()=>{order.push('parse');void dom.step('export','engine',signal(),()=>{order.push('export')})});await dom.step('background','engine',signal(),()=>{order.push('layout')})})();
 await render;expect(order).toEqual(['parse','export','layout']);
});
it('removes cancelled waiting steps without running them or starting their timer',async()=>{
 const clock=new FakeClock(),dom=new SharedDom(clock);let done=()=>{};let ran=false;
 const first=dom.step('foreground','engine',signal(),()=>new Promise<void>(resolve=>{done=resolve}));await flush();
 const abort=new AbortController();const cancelled=dom.step('export','engine',abort.signal,()=>{ran=true}).catch(error=>String(error));abort.abort();expect(await cancelled).toContain('cancelled');expect(clock.pending).toBe(1);expect(ran).toBe(false);done();await first;
});
it('retains ownership through timeout and asynchronous local cleanup',async()=>{
 const clock=new FakeClock(),dom=new SharedDom(clock),abort=new AbortController();let settle=()=>{},clean=()=>{},ran=false;let stepSignal:AbortSignal|undefined;
 const first=dom.step('background','engine',abort.signal,({signal:current,resources})=>{stepSignal=current;const host=document.createElement('div');document.body.append(host);resources.register('host','host',0,async()=>{await new Promise<void>(resolve=>{clean=resolve});host.remove()});return new Promise<void>(resolve=>{settle=resolve})}).catch(error=>String(error));await flush();
 const next=dom.step('export','engine',signal(),()=>{ran=true});clock.advance(20000);await flush();expect(stepSignal?.aborted).toBe(true);expect(ran).toBe(false);settle();await flush();expect(ran).toBe(false);expect(document.body.children).toHaveLength(1);clean();expect(await first).toContain('timed out');await next;expect(document.body.children).toHaveLength(0);expect(clock.pending).toBe(0);
});
it('blocks DOM reuse after failed cleanup and resumes only after successful explicit retry',async()=>{
 const dom=new SharedDom(new FakeClock());let fail=true,ran=false;
 await expect(dom.step('foreground','engine',signal(),({resources})=>{resources.register('host','host',0,()=>{if(fail)throw new Error('held')})})).rejects.toThrow('cleanup');
 const next=dom.step('export','engine',signal(),()=>{ran=true});await flush();expect(dom.snapshot().blocked).toBe(true);expect(ran).toBe(false);fail=false;await dom.retryCleanup();await next;expect(ran).toBe(true);
});
it('enforces resource and pagination execution limits and observes synchronous overrun after return',async()=>{
 for(const [kind,duration] of [['resources',15000],['pagination',60000]] as const){const clock=new FakeClock(),dom=new SharedDom(clock);await expect(dom.step('export',kind,signal(),()=>{clock.time+=duration})).rejects.toThrow('timed out');expect(clock.pending).toBe(0)}
});
it('cleans a throwing step and continues the serial queue',async()=>{
 const dom=new SharedDom(new FakeClock());let cleaned=false;
 await expect(dom.step('foreground','engine',signal(),({resources})=>{resources.register('local','host',0,()=>{cleaned=true});throw new Error('engine failure')})).rejects.toThrow('engine failure');expect(cleaned).toBe(true);expect(await dom.step('background','engine',signal(),()=>42)).toBe(42);
});
