import {z} from 'zod';
import proposed from '../../../docs/contracts/architecture-dual-worker-budget.json';
import {taskBudget} from './budget';
const safe=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const dualWorkerPolicySchema=z.object({schemaVersion:z.literal(2),status:z.string(),baseBudget:z.literal('architecture-runtime-budget.json'),workers:z.object({foreground:z.literal(1),background:z.literal(1),maxActivePerWorker:z.literal(1),maxLiveComputeWorkers:z.literal(2),sharedDomLanes:z.literal(1)}).strict(),queue:z.object({previewKinds:z.literal(2),foregroundPending:z.literal(2),backgroundPendingPerDocumentAndKind:z.literal(1),backgroundPendingMaximum:z.literal(64),backgroundQueueWaitMs:safe,backgroundExpiry:z.literal('dequeue-and-retain-needs-render; no implicit retry'),backgroundExecutionDeadlineStarts:z.literal('dispatch'),activeExports:z.literal(1)}).strict(),memory:z.object({reservedRuntimeBytesPerWorker:safe,reservationStatus:z.string(),accounting:z.string(),overflow:z.string()}).strict(),mapping:z.object({legacyComputeDom:z.string(),unchanged:z.string()}).strict()}).strict().superRefine((policy,context)=>{
 if(policy.queue.backgroundPendingMaximum!==taskBudget.memory.sessions*policy.queue.previewKinds||policy.memory.reservedRuntimeBytesPerWorker*2>=taskBudget.memory.inFlightBytes)context.addIssue({code:'custom',message:'Dual-worker policy exceeds base capacity'});
});
function freeze<T extends object>(value:T):Readonly<T>{for(const child of Object.values(value))if(child&&typeof child==='object')freeze(child);return Object.freeze(value)}
export const dualWorkerPolicy=freeze(dualWorkerPolicySchema.parse(proposed));
const memorySchema=z.object({foregroundRuntimeBytes:safe,backgroundRuntimeBytes:safe,ownedTaskBytes:safe,clonePeakBytes:safe,otherOwnedBytes:safe}).strict();
/** Estimates, not browser heap measurement. Shared allocations must be entered once. */
export function assessDualWorkerMemory(input:unknown){
 const usage=memorySchema.parse(input),floor=dualWorkerPolicy.memory.reservedRuntimeBytesPerWorker;
 const inFlightBytes=Math.max(floor,usage.foregroundRuntimeBytes)+Math.max(floor,usage.backgroundRuntimeBytes)+usage.ownedTaskBytes+usage.clonePeakBytes;
 const totalOwnedBytes=inFlightBytes+usage.otherOwnedBytes;
 return {inFlightBytes,totalOwnedBytes,accepted:inFlightBytes<=taskBudget.memory.inFlightBytes&&totalOwnedBytes<=taskBudget.memory.totalOwnedBytes};
}
export function backgroundPendingCapacity(openSessions:number):number{
 if(!Number.isSafeInteger(openSessions)||openSessions<0||openSessions>taskBudget.memory.sessions)throw new Error('Invalid session count');
 return Math.min(dualWorkerPolicy.queue.backgroundPendingMaximum,openSessions*dualWorkerPolicy.queue.previewKinds);
}
export function backgroundWaitOutcome(){return {dequeue:true,needsRender:true,automaticRetry:false} as const}
