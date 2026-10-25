import {z} from 'zod';
import proposed from '../../../docs/contracts/architecture-dual-worker-budget.json';
import {taskBudget} from './budget';
export const dualWorkerPolicySchema=z.object({schemaVersion:z.literal(5),status:z.string(),baseBudget:z.literal('architecture-runtime-budget.json'),workers:z.object({foreground:z.literal(1),background:z.literal(1),maxActivePerWorker:z.literal(1),maxLiveComputeWorkers:z.literal(2),sharedDomLanes:z.literal(1)}).strict(),queue:z.object({previewKinds:z.literal(2),foregroundPending:z.literal(1),backgroundPendingPerDocumentAndKind:z.literal(1),backgroundPendingMaximum:z.literal(64),backgroundExecutionDeadlineStarts:z.literal('dispatch')}).strict(),memory:z.object({accounting:z.string(),overflow:z.string()}).strict(),mapping:z.object({legacyComputeDom:z.string(),unchanged:z.string()}).strict()}).strict().superRefine((policy,context)=>{
 if(policy.queue.backgroundPendingMaximum!==taskBudget.memory.sessions*policy.queue.previewKinds)context.addIssue({code:'custom',message:'Dual-worker policy exceeds base capacity'});
});
function freeze<T extends object>(value:T):Readonly<T>{for(const child of Object.values(value))if(child&&typeof child==='object')freeze(child);return Object.freeze(value)}
export const dualWorkerPolicy=freeze(dualWorkerPolicySchema.parse(proposed));
export function backgroundPendingCapacity(openSessions:number):number{
 if(!Number.isSafeInteger(openSessions)||openSessions<0||openSessions>taskBudget.memory.sessions)throw new Error('Invalid session count');
 return Math.min(dualWorkerPolicy.queue.backgroundPendingMaximum,openSessions*dualWorkerPolicy.queue.previewKinds);
}
