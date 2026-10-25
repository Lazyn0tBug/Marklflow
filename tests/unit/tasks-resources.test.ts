// @vitest-environment node
import {it,expect,vi} from 'vitest';
import {ResourceLedger,type ResourceSpec} from '../../src/application/tasks/resources';
import {taskBudget} from '../../src/application/tasks/budget';
const owner={kind:'task',id:'task'} as const;
function spec(id='r',bytes=8):ResourceSpec{return {id,kind:'buffer',owner,group:'inFlight',bytes,taskId:'task',snapshotId:'snap',documentId:'A',sessionGeneration:1,executorGeneration:1}}
it('counts shared bytes once and keeps referenced allocations alive',async()=>{
 const ledger=new ResourceLedger(),clean=vi.fn();ledger.register(spec(),clean);const a=ledger.acquire('r'),b=ledger.acquire('r');expect(ledger.totalBytes).toBe(8);
 await expect(ledger.release('r',owner)).rejects.toThrow('leased');a();a();b();await Promise.all([ledger.release('r',owner),ledger.release('r',owner)]);expect(clean).toHaveBeenCalledTimes(1);expect(ledger.totalBytes).toBe(0);
});
it('transfers release responsibility and checks destination budget atomically',async()=>{
 const ledger=new ResourceLedger();ledger.register(spec(),()=>{});const artifactOwner={kind:'artifact',id:'output'} as const;ledger.transfer('r',owner,artifactOwner,'activeArtifact');
 await expect(ledger.release('r',owner)).rejects.toThrow('ownership');expect(ledger.totalBytes).toBe(8);await ledger.release('r',artifactOwner);
 ledger.register(spec('large',taskBudget.memory.singleCacheEntryBytes+1),()=>{});
 // A ledger group limit is enforced separately from later per-cache-entry admission.
 ledger.register(spec('limit',taskBudget.memory.inFlightBytes-ledger.totalBytes),()=>{});
 expect(()=>ledger.register(spec('overflow',1),()=>{})).toThrow('budget');expect(ledger.snapshot()).toHaveLength(2);
});
it('attempts every cleanup, retains failures and allows an explicit retry',async()=>{
 const ledger=new ResourceLedger(),broken=vi.fn().mockRejectedValueOnce(new Error('cleanup failed')).mockResolvedValue(undefined),good=vi.fn();ledger.register(spec('bad'),broken);ledger.register(spec('good'),good);
 const errors=await ledger.releaseOwner(owner);expect(errors).toHaveLength(1);expect(good).toHaveBeenCalledOnce();expect(ledger.snapshot()[0]?.error).toContain('cleanup failed');expect(ledger.totalBytes).toBe(8);
 expect(await ledger.releaseOwner(owner)).toEqual([]);expect(ledger.totalBytes).toBe(0);
});
it('does not mutate allocation ownership or counts after rejected operations',()=>{
 const ledger=new ResourceLedger();expect(()=>ledger.register(spec('negative',-1),()=>{})).toThrow();ledger.register(spec(),()=>{});expect(()=>ledger.register(spec(),()=>{})).toThrow();expect(()=>ledger.transfer('r',{kind:'task',id:'wrong'},{kind:'cache',id:'cache'},'cache')).toThrow();expect(ledger.totalBytes).toBe(8);
});

it('leaves original ownership intact when a destination group is full',()=>{const ledger=new ResourceLedger();ledger.register({...spec('active',taskBudget.memory.activeArtifactBytes),group:'activeArtifact'},()=>{});ledger.register(spec('moving'),()=>{});expect(()=>ledger.transfer('moving',owner,{kind:'view',id:'preview'},'activeArtifact')).toThrow('budget');expect(ledger.snapshot().find(entry=>entry.id==='moving')?.owner).toEqual(owner);expect(ledger.snapshot().find(entry=>entry.id==='moving')?.group).toBe('inFlight')});
