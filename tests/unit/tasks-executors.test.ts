// @vitest-environment node
import {it,expect,vi} from 'vitest';
import {ExecutorPool} from '../../src/application/tasks/executors';
import {ResourceLedger} from '../../src/application/tasks/resources';
import type {TaskExecutor,ExecutionIdentity} from '../../src/application/tasks/contracts';
import {FakeClock,request,artifact} from './task-fixtures';
const flush=async()=>{for(let i=0;i<10;i++)await Promise.resolve()};
function setup(){const clock=new FakeClock(),ledger=new ResourceLedger(),events={message:vi.fn(),fault:vi.fn(),stopTimeout:vi.fn(),available:vi.fn()},pool=new ExecutorPool(clock,ledger,events);let send:(message:unknown)=>void=()=>{};let identity:ExecutionIdentity|undefined;
 const executor:TaskExecutor={id:'dom',generation:1,lane:'dom',cancellation:'cooperative',capabilities:{requiresDOM:true,isolation:'shared-realm',rebuildable:true,concurrency:1},supportedKinds:['preview.flow'],start:(_request,execution,receive,resources)=>{identity=execution;send=receive;resources.register('host','host',8,()=>{})},stop:vi.fn()};pool.install(executor);pool.start('dom',request());return {clock,ledger,events,pool,executor,send:(type:string)=>send({protocolVersion:1,execution:identity,type,artifact:artifact()}),raw:(message:unknown)=>send(message),identity:()=>identity};}
it('holds a cancelled executor until proof of stop and host cleanup',async()=>{const s=setup();s.pool.stop('task-1');expect(s.pool.ready('dom')).toBe(false);expect(s.ledger.totalBytes).toBe(8);s.raw({protocolVersion:1,execution:s.identity(),type:'stop-ack',proof:'cooperative'});await flush();expect(s.pool.ready('dom')).toBe(true);expect(s.ledger.totalBytes).toBe(0)});
it('quarantines missing stop proof and forbids unlimited replacement',()=>{const s=setup();s.pool.stop('task-1');s.clock.advance(1000);expect(s.events.stopTimeout).toHaveBeenCalledOnce();expect(s.pool.snapshot()[0]?.state).toBe('quarantined');expect(()=>s.pool.install({...s.executor,generation:2})).toThrow('released');expect(s.ledger.totalBytes).toBe(8)});
it('rejects old-generation messages without poisoning current work',async()=>{const s=setup(),identity=s.identity()!;s.raw({protocolVersion:1,execution:{...identity,executorGeneration:0},type:'result',artifact:artifact()});expect(s.events.message).not.toHaveBeenCalled();s.send('result');await flush();expect(s.events.message).toHaveBeenCalledOnce();expect(s.pool.ready('dom')).toBe(true)});
it('malformed current messages quarantine the executor without releasing a live host',()=>{const s=setup();s.raw({type:'mystery'});expect(s.events.fault).toHaveBeenCalledOnce();expect(s.pool.ready('dom')).toBe(false);expect(s.ledger.totalBytes).toBe(8)});

it('drops malformed old-generation envelopes without failing the current lease',()=>{const s=setup();s.raw({type:'unknown',execution:{executorId:'dom',executorGeneration:0}});expect(s.events.fault).not.toHaveBeenCalled();expect(s.pool.snapshot()[0]?.state).toBe('busy')});
