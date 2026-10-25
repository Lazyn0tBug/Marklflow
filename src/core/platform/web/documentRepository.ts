import {documentSchema} from '../../model/documentSchema';
import {inspectStoredCollection,replaceStoredRecords,storedRecordId,recoverySchema,assertDocumentWrite,type DocumentRepository,type RecoveryEntry,type DocumentLoadResult} from '../../model/documentRepository';
import {recoveryJson,recoveryIdentity} from '../../model/recoveryEncoding';
import type {DocumentRecord} from '../../model/document';
import {sha256Hex,createRenderNonce} from '../crypto';
export {recoveryJson};
const DOCS='documents',RECOVERY='metadata',PREFIX='markflow-recovery:',LOCAL='markflow_docs',BACKUP='markflow_recovery_v1';
export class WebDocumentRepository implements DocumentRepository{
 private connection:Promise<IDBDatabase>|undefined;
 private selection:Promise<IDBDatabase|undefined>|undefined;
 private backend:'indexedDB'|'localStorage'|undefined;
 private backendWarnings:string[]=[];
 private writes:Promise<void>=Promise.resolve();
 private transient=new Map<string,RecoveryEntry>();
 private async open():Promise<IDBDatabase>{
  if(typeof indexedDB==='undefined')throw new Error('原IndexedDB当前不可访问，未切换存储后端');
  if(!this.connection)this.connection=new Promise((resolve,reject)=>{
   let abandoned=false;const request=indexedDB.open('markflow_db',1);
   request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains(DOCS))db.createObjectStore(DOCS,{keyPath:'id'});if(!db.objectStoreNames.contains(RECOVERY))db.createObjectStore(RECOVERY,{keyPath:'key'})};
   request.onsuccess=()=>{const db=request.result;if(abandoned){db.close();return}db.onversionchange=()=>{db.close();this.connection=undefined;this.selection=undefined};resolve(db)};
   request.onerror=()=>reject(request.error||new Error('无法打开文档数据库'));
   request.onblocked=()=>{abandoned=true;reject(new Error('文档数据库被其他窗口占用，请关闭其他窗口后重试'))};
  });
  try{return await this.connection}catch(error){this.connection=undefined;throw error}
 }
 private async database():Promise<IDBDatabase|undefined>{
  if(this.backend==='localStorage')return undefined;
  if(!this.selection)this.selection=(async()=>{
   if(this.backend==='indexedDB')return this.open();
   if(typeof indexedDB==='undefined'){this.backend='localStorage';return undefined}
   let db:IDBDatabase;
   try{db=await this.open()}catch(error){if(error instanceof DOMException&&error.name==='SecurityError'){this.backend='localStorage';return undefined}throw error}
   const count=await this.transaction<number>(db,DOCS,'readonly',(store,accept)=>{const req=store.count();req.onsuccess=()=>accept(req.result)});
   let fallback:string|null=null;try{fallback=localStorage.getItem(LOCAL)}catch(error){this.backendWarnings.push('旧版草稿位置不可读取：'+String(error))}
   if(count===0&&fallback!==null){this.backend='localStorage';this.backendWarnings.push('检测到已有localStorage草稿，本会话保留原后端，未自动迁移');db.close();this.connection=undefined;return undefined}
   this.backend='indexedDB';return db;
  })();
  try{return await this.selection}catch(error){this.selection=undefined;throw error}
 }
 private transaction<T>(db:IDBDatabase,store:string,mode:IDBTransactionMode,run:(objectStore:IDBObjectStore,accept:(value:T)=>void,abort:(reason:Error)=>void)=>void):Promise<T>{
  return new Promise((resolve,reject)=>{
   const tx=db.transaction(store,mode);let result:{value:T}|undefined;let failure:Error|undefined;
   tx.oncomplete=()=>result?resolve(result.value):reject(new Error('存储事务未返回结果'));
   tx.onabort=()=>reject(failure||tx.error||new Error('存储事务已中止'));tx.onerror=()=>reject(tx.error||new Error('存储事务失败'));
   try{run(tx.objectStore(store),value=>{result={value}},reason=>{failure=reason;tx.abort()})}catch(error){try{tx.abort()}catch{/* Already inactive. */}reject(error)}
  });
 }
 private async capture(db:IDBDatabase|undefined,source:string,raw:unknown,reason:string):Promise<void>{
  const identity=recoveryIdentity(raw);
  const key=PREFIX+source+':'+await sha256Hex(new TextEncoder().encode(identity.text))+(identity.complete?'':':'+createRenderNonce());
  const entry:RecoveryEntry={key,source,capturedAt:new Date().toISOString(),raw,reason,persistence:'session'};this.transient.set(key,entry);
  try{
   const persisted:RecoveryEntry={...entry,persistence:'persisted'};
   if(db)await this.transaction<void>(db,RECOVERY,'readwrite',(store,accept)=>{store.put(persisted);accept()});
   else{const entries=this.localRecoveries(true);if(!entries.some(e=>e.key===key))entries.push(persisted);localStorage.setItem(BACKUP,recoveryJson(entries))}
   this.transient.delete(key);
  }catch(error){entry.reason+='；持久备份未完成，请在当前会话下载：'+String(error);throw error}
 }
 private invalidIndex(source:string,raw:unknown,reason:string):RecoveryEntry{return {key:'unreadable-index:'+source,source,capturedAt:new Date().toISOString(),reason,raw,persistence:'source-only'}}
 private localRecoveries(strict=false):RecoveryEntry[]{
  const raw=localStorage.getItem(BACKUP);if(!raw)return [];
  let parsed:unknown;try{parsed=JSON.parse(raw)}catch(error){if(strict)throw error;return [this.invalidIndex('localStorage:'+BACKUP,raw,'恢复索引JSON损坏，原字符串未修改')]}
  if(!Array.isArray(parsed)){if(strict)throw new Error('恢复备份索引损坏，原文档未改写');return [this.invalidIndex('localStorage:'+BACKUP,raw,'恢复索引结构不受支持')]}
  const entries:RecoveryEntry[]=[];
  parsed.forEach((value:unknown,index)=>{const entry=recoverySchema.safeParse(value);if(entry.success)entries.push(entry.data);else{if(strict)throw new Error('恢复备份条目损坏，未覆盖索引');entries.push(this.invalidIndex('localStorage:'+BACKUP+':'+index,value,'恢复条目无效，保留原值'))}});
  return entries;
 }
 private async localCollection():Promise<unknown>{
  const raw=localStorage.getItem(LOCAL);if(raw===null)return [];
  try{const parsed:unknown=JSON.parse(raw);return parsed}catch{
   try{await this.capture(undefined,'localStorage:'+LOCAL,raw,'文档集合JSON损坏，原字符串保持不变')}catch{/* Original and session copy remain available. */}
   throw new Error('草稿存储损坏，请下载恢复备份；原始数据未覆盖');
  }
 }
 async load():Promise<DocumentLoadResult>{
  await this.writes;const db=await this.database(),warnings=[...this.backendWarnings];
  const raw:unknown=db?await this.transaction<unknown>(db,DOCS,'readonly',(store,accept)=>{const request=store.getAll();request.onsuccess=()=>accept(request.result)}):await this.localCollection();
  const inspected=inspectStoredCollection(raw);
  for(const issue of inspected.invalid)try{await this.capture(db,(db?'indexedDB:':'localStorage:')+String(storedRecordId(issue.raw)??issue.index),issue.raw,issue.reason)}catch(error){warnings.push('恢复备份仅在本会话可下载，原件未改写：'+String(error))}
  return {documents:inspected.documents,canInitialize:inspected.format!=='invalid'&&inspected.records.length===0,warnings:[...new Set(warnings)]};
 }
 async save(input:DocumentRecord):Promise<void>{const snapshot=documentSchema.parse(input);const work=this.writes.then(()=>this.saveNow(snapshot));this.writes=work.catch(()=>undefined);return work}
 private async saveNow(doc:DocumentRecord):Promise<void>{
  const db=await this.database();
  if(db){await this.transaction<void>(db,DOCS,'readwrite',(store,accept,abort)=>{
   const get=store.get(doc.id);get.onsuccess=()=>{try{const old:unknown=get.result;assertDocumentWrite(old,doc);store.put(doc);accept()}catch(error){abort(error instanceof Error?error:new Error(String(error)))}};
  });return}
  const raw=await this.localCollection(),inspection=inspectStoredCollection(raw);
  if(inspection.format==='invalid'||inspection.invalid.some(i=>storedRecordId(i.raw)===doc.id))throw new Error('不能覆盖损坏文档，请先下载恢复备份');
  assertDocumentWrite(inspection.documents.find(value=>value.id===doc.id),doc);
  let found=false;const records=inspection.records.map(value=>{if(storedRecordId(value)===doc.id){found=true;return doc}return value});if(!found)records.push(doc);
  localStorage.setItem(LOCAL,JSON.stringify(replaceStoredRecords(raw,records)));
 }
 async delete(id:string):Promise<void>{const work=this.writes.then(()=>this.deleteNow(id));this.writes=work.catch(()=>undefined);return work}
 private async deleteNow(id:string):Promise<void>{
  const db=await this.database();
  if(db){await this.transaction<void>(db,DOCS,'readwrite',(store,accept,abort)=>{
   const get=store.get(id);get.onsuccess=()=>{try{const old:unknown=get.result;if(old!==undefined&&!documentSchema.safeParse(old).success)throw new Error('原记录损坏，已拒绝删除');store.delete(id);accept()}catch(error){abort(error instanceof Error?error:new Error(String(error)))}};
  });return}
  const raw=await this.localCollection(),inspection=inspectStoredCollection(raw);
  if(inspection.format==='invalid'||inspection.invalid.some(i=>storedRecordId(i.raw)===id))throw new Error('不能删除损坏原始记录，请先下载恢复备份');
  localStorage.setItem(LOCAL,JSON.stringify(replaceStoredRecords(raw,inspection.records.filter(value=>storedRecordId(value)!==id))));
 }
 async recoveries():Promise<RecoveryEntry[]>{
  let stored:RecoveryEntry[]=[];
  try{
   const db=await this.database();
   if(db){
    const raw:unknown=await this.transaction<unknown>(db,RECOVERY,'readonly',(store,accept)=>{const req=store.getAll();req.onsuccess=()=>accept(req.result)});
    if(!Array.isArray(raw))throw new Error('恢复索引读取结果无效');
    raw.forEach((value:unknown)=>{if(value!==null&&typeof value==='object'&&'key'in value&&typeof value.key==='string'&&value.key.startsWith(PREFIX)){const parsed=recoverySchema.safeParse(value);stored.push(parsed.success?parsed.data:this.invalidIndex('indexedDB:metadata:'+value.key,value,'恢复索引条目无效，原值保留'))}});
    try{const fallback=localStorage.getItem(LOCAL);if(fallback!==null)stored.push(this.invalidIndex('localStorage:'+LOCAL,fallback,'存在独立旧版草稿，未自动合并；原字符串保留'))}catch{/* An inaccessible optional legacy store must not hide valid IDB backups. */}
   }else stored=this.localRecoveries();
  }catch(error){if(this.transient.size===0)throw error;stored=[...this.transient.values()].map(entry=>({...entry,reason:entry.reason+'；持久索引暂不可读取：'+String(error)}))}
  return [...new Map([...this.transient.values(),...stored].map(entry=>[entry.key,entry])).values()];
 }
}
export const webDocumentRepository=new WebDocumentRepository();
