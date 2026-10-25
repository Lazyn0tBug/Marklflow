import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {WebDocumentRepository} from '../../src/core/platform/web/documentRepository';
import {createNewDocument} from '../../src/core/storage/storage';
import {inspectStoredCollection} from '../../src/core/model/documentRepository';
beforeEach(()=>{vi.stubGlobal('indexedDB',undefined);localStorage.clear()});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();localStorage.clear()});
it('loads valid legacy records, quarantines invalid records without changing source bytes',async()=>{
 const good=createNewDocument('good'),bad={id:'bad',schemaVersion:99,markdown:'KEEP_RAW'};
 const raw=JSON.stringify([good,bad]);localStorage.setItem('markflow_docs',raw);
 const repo=new WebDocumentRepository();expect((await repo.load()).documents).toEqual([good]);
 expect(localStorage.getItem('markflow_docs')).toBe(raw);
 expect((await repo.recoveries())[0]?.raw).toEqual(bad);
 await repo.save({...good,revision:2,markdown:'# changed'});
 expect(JSON.parse(localStorage.getItem('markflow_docs')||'[]')[1]).toEqual(bad);
 await expect(repo.save({...good,id:'bad'})).rejects.toThrow('不能覆盖');
 await expect(repo.delete('bad')).rejects.toThrow('不能删除');
});
it('keeps malformed JSON intact and makes its raw backup accessible',async()=>{
 const raw='[{broken 🧪';localStorage.setItem('markflow_docs',raw);const repo=new WebDocumentRepository();
 await expect(repo.load()).rejects.toThrow('损坏');
 expect(localStorage.getItem('markflow_docs')).toBe(raw);expect((await repo.recoveries())[0]?.raw).toBe(raw);
});
it('reads known envelopes and refuses unknown migrations instead of resetting them',async()=>{
 const good=createNewDocument('v1');
 localStorage.setItem('markflow_docs',JSON.stringify({storageVersion:1,documents:[good],custom:'keep'}));
 const repo=new WebDocumentRepository();expect((await repo.load()).documents).toEqual([good]);
 await repo.save({...good,revision:2,markdown:'# update'});expect(JSON.parse(localStorage.getItem('markflow_docs')||'{}').custom).toBe('keep');
 const unknown=JSON.stringify({storageVersion:42,documents:[good]});localStorage.setItem('markflow_docs',unknown);
 expect(await repo.load()).toEqual({documents:[],canInitialize:false,warnings:[]});
 await expect(repo.save(good)).rejects.toThrow('不能覆盖');expect(localStorage.getItem('markflow_docs')).toBe(unknown);
});
it('preserves source when quarantine storage is full; transient backup remains downloadable',async()=>{
 const raw=JSON.stringify([{id:'bad',schemaVersion:99}]);localStorage.setItem('markflow_docs',raw);
 const original=Storage.prototype.setItem;vi.spyOn(Storage.prototype,'setItem').mockImplementation(function(this:Storage,key,value){if(key==='markflow_recovery_v1')throw new DOMException('full','QuotaExceededError');original.call(this,key,value)});
 const repo=new WebDocumentRepository();expect((await repo.load()).warnings.length).toBeGreaterThan(0);
 expect(localStorage.getItem('markflow_docs')).toBe(raw);expect((await repo.recoveries()).length).toBe(1);
});
it('rejects invalid writes before mutation and isolates duplicate identifiers',async()=>{
 const repo=new WebDocumentRepository(),good=createNewDocument('good');
 await expect(repo.save({...good,theme:{...good.theme,primaryColor:'javascript:invalid'}})).rejects.toThrow();expect(localStorage.getItem('markflow_docs')).toBeNull();
 const result=inspectStoredCollection([good,good]);expect(result.documents).toHaveLength(1);expect(result.invalid[0]?.reason).toContain('重复');
});
it('creates independent nested theme margins',()=>{
 const a=createNewDocument(),b=createNewDocument();a.theme.margins.left=7;expect(b.theme.margins.left).toBe(20);
});

it('serializes fallback writes so concurrent document saves cannot erase one another',async()=>{
 const repo=new WebDocumentRepository(),a=createNewDocument('A'),b=createNewDocument('B');
 const pending=repo.save(a);a.markdown='changed after submission';
 await Promise.all([pending,repo.save(b)]);
 const docs=(await repo.load()).documents;expect(docs).toHaveLength(2);expect(docs.find(d=>d.id===a.id)?.markdown).not.toBe(a.markdown);
});
it('does not overwrite a damaged recovery index and still exposes both raw sources',async()=>{
 localStorage.setItem('markflow_docs','bad docs');localStorage.setItem('markflow_recovery_v1','bad backup');
 const repo=new WebDocumentRepository();await expect(repo.load()).rejects.toThrow();
 expect(localStorage.getItem('markflow_recovery_v1')).toBe('bad backup');
 const entries=await repo.recoveries();expect(entries.some(e=>e.raw==='bad docs')).toBe(true);expect(entries.some(e=>e.raw==='bad backup')).toBe(true);
});

it('rejects stale revisions without poisoning the next valid write',async()=>{
 const repo=new WebDocumentRepository(),doc={...createNewDocument('revision'),revision:3};
 await repo.save(doc);await expect(repo.save({...doc,revision:2,markdown:'stale'})).rejects.toThrow('过期修订');
 expect((await repo.load()).documents[0]?.revision).toBe(3);
 await repo.save({...doc,revision:4});expect((await repo.load()).documents[0]?.revision).toBe(4);
});
