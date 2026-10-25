import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {WebDocumentRepository,recoveryJson} from '../../src/core/platform/web/documentRepository';
import {createNewDocument} from '../../src/core/storage/storage';
beforeEach(()=>{vi.stubGlobal('indexedDB',undefined);localStorage.clear()});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();localStorage.clear()});
it('keeps the selected fallback backend when IDB availability changes',async()=>{
 const doc=createNewDocument('fallback');localStorage.setItem('markflow_docs',JSON.stringify([doc]));const repo=new WebDocumentRepository();await repo.load();
 const open=vi.fn(()=>{throw new Error('backend unexpectedly switched')});vi.stubGlobal('indexedDB',{open});
 await expect(repo.save({...doc,revision:2})).resolves.toBeUndefined();expect(open).not.toHaveBeenCalled();
});
it('keeps valid documents readable when persisting quarantine fails',async()=>{
 const good=createNewDocument('good'),bad={id:'bad',schemaVersion:99};const raw=JSON.stringify([good,bad]);localStorage.setItem('markflow_docs',raw);
 const original=Storage.prototype.setItem;vi.spyOn(Storage.prototype,'setItem').mockImplementation(function(this:Storage,key,value){if(key==='markflow_recovery_v1')throw new DOMException('full','QuotaExceededError');original.call(this,key,value)});
 const repo=new WebDocumentRepository();const result=await repo.load();expect(result.documents).toEqual([good]);expect(result.warnings.length).toBeGreaterThan(0);
 expect(localStorage.getItem('markflow_docs')).toBe(raw);expect((await repo.recoveries())[0]?.raw).toEqual(bad);
});
it('rejects conflicting content at the same revision and accepts idempotent retry',async()=>{
 const repo=new WebDocumentRepository(),doc=createNewDocument('revision');await repo.save(doc);
 await expect(repo.save({...doc,markdown:'conflict'})).rejects.toThrow('修订冲突');
 await expect(repo.save({...doc,meta:{...doc.meta,updatedAt:new Date().toISOString()}})).resolves.toBeUndefined();
 expect((await repo.load()).documents[0]?.markdown).toBe(doc.markdown);
});
it('does not let a stale transient copy shadow the persisted recovery index',async()=>{
 localStorage.setItem('markflow_docs',JSON.stringify([{id:'bad',schemaVersion:99}]));const repo=new WebDocumentRepository();await repo.load();
 localStorage.setItem('markflow_recovery_v1','[]');expect(await repo.recoveries()).toEqual([]);
});
it('serializes shared JSON values completely and marks real cycles with a path',()=>{
 const shared={markdown:'KEEP_ALL'};const raw={first:shared,second:shared};expect(JSON.parse(recoveryJson(raw))).toEqual(raw);
 const cycle:Record<string,unknown>={};cycle.self=cycle;expect(recoveryJson(cycle)).toContain('$reference');
 expect(recoveryJson(new Map([['key','MAP_VALUE']]))).toContain('MAP_VALUE');
 expect(recoveryJson(new Uint8Array([7,8]))).toContain('7');
 expect(typeof recoveryJson(undefined)).toBe('string');
});

it('distinguishes native recovery values and avoids content-deduplication of opaque values',async()=>{
 const {recoveryIdentity}=await import('../../src/core/model/recoveryEncoding');
 expect(recoveryIdentity({x:/a/}).text).not.toBe(recoveryIdentity({x:/b/}).text);
 expect(recoveryIdentity(new Map([['x',1]])).text).not.toBe(recoveryIdentity({$type:'Map',entries:[['x',1]]}).text);
 expect(recoveryIdentity(new Blob(['opaque bytes'])).complete).toBe(false);
});
