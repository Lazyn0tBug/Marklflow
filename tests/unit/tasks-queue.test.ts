// @vitest-environment node
import {it,expect} from 'vitest';
import {IdentityGate} from '../../src/application/tasks/identity';
import {TaskQueue} from '../../src/application/tasks/queue';
import {request} from './task-fixtures';
function setup(){const gate=new IdentityGate();gate.open('A');gate.activate('A');return {gate,queue:new TaskQueue(gate)}}
const entry=(r:ReturnType<typeof request>)=>({request:r,lane:'dom' as const,acceptedAt:0,queueDeadline:15000});
it('coalesces 100 edits independently by preview kind and gives accepted export the next slot',()=>{
 const {gate,queue}=setup();for(let i=1;i<=100;i++){queue.enqueue(entry(request('flow-'+i,'A','preview.flow',i)));queue.enqueue(entry(request('a4-'+i,'A','preview.a4',i)));expect(queue.size).toBeLessThanOrEqual(2)}
 expect(queue.enqueue(entry(request('export','A','export.html'))).status).toBe('accepted');expect(queue.enqueue(entry(request('extra','A','export.md'))).status).toBe('busy');expect(queue.size).toBe(3);expect(queue.take('dom')?.request.identity.taskId).toBe('export');
 gate.open('B');gate.activate('B');expect(queue.invalidatePreviews()).toHaveLength(2);expect(queue.enqueue(entry(request('background'))).status).toBe('inactive');queue.finish('export');
});
it('rejects A→B→A and closed-session identities without cancelling frozen export',()=>{
 const {gate,queue}=setup(),old=request();queue.enqueue(entry(old));queue.enqueue(entry(request('export','A','export.html')));
 gate.open('B');gate.activate('B');gate.activate('A');expect(gate.current(old)).toBe(false);expect(queue.invalidatePreviews()).toEqual(['task-1']);expect(queue.take('dom')?.request.kind).toBe('export.html');
 gate.close('A');expect(gate.open('A')).not.toBe(1);expect(gate.sessionMatches(old)).toBe(false);
});
it('invalidates async restore tokens after new lookup, activation or explicit authorization revocation',()=>{
 const {gate,queue}=setup(),r=request();queue.enqueue(entry(r));const first=gate.beginRestore(r),second=gate.beginRestore(r);expect(gate.restoreCurrent(first)).toBe(false);expect(gate.restoreCurrent(second)).toBe(true);gate.revokeBefore(2);expect(gate.restoreCurrent(second)).toBe(false);expect(gate.current(r)).toBe(false);
});
it('bounds sessions and does not silently close existing dirty sessions',()=>{const gate=new IdentityGate();for(let i=0;i<32;i++)gate.open(String(i));expect(()=>gate.open('overflow')).toThrow('capacity');expect(gate.open('0')).toBe(1)});
