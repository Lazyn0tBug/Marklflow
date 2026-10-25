import {documentSchema} from '../../model/documentSchema';
import {inspectStoredCollection,replaceStoredRecords,storedRecordId,recoverySchema,type DocumentRepository,type RecoveryEntry,type DocumentLoadResult} from '../../model/documentRepository';
import type {DocumentRecord} from '../../model/document';
import {sha256Hex} from '../crypto';
const DOCS='documents',RECOVERY='metadata',PREFIX='markflow-recovery:',LOCAL='markflow_docs',BACKUP='markflow_recovery_v1';
/** JSON download is inspectable; original structured-clone records remain untouched in IndexedDB. */
export function recoveryJson(value:unknown):string{
 const seen=new WeakSet<object>();
 return JSON.stringify(value,(_key,item:unknown)=>{
  if(typeof item==='bigint')return {$bigint:String(item)};
  if(item&&typeof item==='object'){if(seen.has(item))return {$reference:'previous object'};seen.add(item)}
  return item;
 },2);
}
export class WebDocumentRepository implements DocumentRepository{
 private connection:Promise<IDBDatabase>|undefined;
 private writes:Promise<void>=Promise.resolve();
 private transient=new Map<string,RecoveryEntry>();
 private async database():Promise<IDBDatabase|undefined>{
  if(typeof indexedDB==='undefined')return undefined;
  if(!this.connection){
   this.connection=new Promise((resolve,reject)=>{
    let abandoned=false;const request=indexedDB.open('markflow_db',1);
    request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains(DOCS))db.createObjectStore(DOCS,{keyPath:'id'});if(!db.objectStoreNames.contains('metadata'))db.createObjectStore('metadata',{keyPath:'key'});if(!db.objectStoreNames.contains(RECOVERY))db.createObjectStore(RECOVERY,{keyPath:'key'})};
    request.onsuccess=()=>{const db=request.result;if(abandoned){db.close();return}db.onversionchange=()=>{db.close();this.connection=undefined};resolve(db)};
    request.onerror=()=>reject(request.error||new Error('无法打开文档数据库'));
    request.onblocked=()=>{abandoned=true;reject(new Error('文档数据库升级被其他窗口占用，请关闭其他窗口后重试'))};
   });
  }
  try{return await this.connection}catch(error){this.connection=undefined;if(error instanceof DOMException&&error.name==='SecurityError')return undefined;throw error}
 }
 private transaction<T>(db:IDBDatabase,store:string,mode:IDBTransactionMode,run:(objectStore:IDBObjectStore,accept:(value:T)=>void,abort:(reason:Error)=>void)=>void):Promise<T>{
  return new Promise((resolve,reject)=>{
   const tx=db.transaction(store,mode);let result:T;let failure:Error|undefined;
   tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(failure||tx.error||new Error('存储事务已中止'));tx.onerror=()=>reject(tx.error||new Error('存储事务失败'));
   try{run(tx.objectStore(store),value=>{result=value},reason=>{failure=reason;tx.abort()})}catch(error){tx.abort();reject(error)}
  });
 }
 private async capture(db:IDBDatabase|undefined,source:string,raw:unknown,reason:string):Promise<void>{
  const key=PREFIX+source+':'+await sha256Hex(new TextEncoder().encode(recoveryJson(raw)));
  const entry:RecoveryEntry={key,source,capturedAt:new Date().toISOString(),raw,reason};this.transient.set(key,entry);
  if(db)await this.transaction<void>(db,RECOVERY,'readwrite',(store,accept)=>{store.put(entry);accept()});
  else{
   const entries=this.localRecoveries();if(!entries.some(e=>e.key===key))entries.push(entry);
   localStorage.setItem(BACKUP,recoveryJson(entries));
  }
 }
 private localRecoveries():RecoveryEntry[]{
  const raw=localStorage.getItem(BACKUP);if(!raw)return [];
  const parsed:unknown=JSON.parse(raw);
  if(!Array.isArray(parsed))throw new Error('恢复备份索引损坏，原文档未改写');
  return parsed.map(value=>recoverySchema.parse(value));
 }
 private async localCollection():Promise<unknown>{
  const raw=localStorage.getItem(LOCAL);if(raw===null)return [];
  try{const parsed:unknown=JSON.parse(raw);return parsed}catch{
   await this.capture(undefined,'localStorage:'+LOCAL,raw,'文档集合JSON损坏，原字符串保持不变');
   throw new Error('草稿存储损坏，请下载恢复备份；原始数据未覆盖');
  }
 }
 async load():Promise<DocumentLoadResult>{
  const db=await this.database();
  const raw:unknown=db?await this.transaction<unknown>(db,DOCS,'readonly',(store,accept)=>{const request=store.getAll();request.onsuccess=()=>accept(request.result)}):await this.localCollection();
  const inspected=inspectStoredCollection(raw);
  for(const issue of inspected.invalid)await this.capture(db,(db?'indexedDB:':'localStorage:')+String(storedRecordId(issue.raw)??issue.index),issue.raw,issue.reason);
  return {documents:inspected.documents,canInitialize:inspected.format!=='invalid'&&inspected.records.length===0};
 }
 async save(input:DocumentRecord):Promise<void>{
  const snapshot=documentSchema.parse(input);
  const work=this.writes.then(()=>this.saveNow(snapshot));this.writes=work.catch(()=>undefined);return work;
 }
 private async saveNow(input:DocumentRecord):Promise<void>{
  const doc=documentSchema.parse(input),db=await this.database();
  if(db){
   await this.transaction<void>(db,DOCS,'readwrite',(store,accept,abort)=>{
    const get=store.get(doc.id);get.onsuccess=()=>{
     const old:unknown=get.result;
     if(old!==undefined&&!documentSchema.safeParse(old).success){abort(new Error('原记录损坏，已拒绝覆盖或删除，请先下载恢复备份'));return}
     const parsed=documentSchema.safeParse(old);
     if(parsed.success&&parsed.data.revision>doc.revision){abort(new Error('拒绝过期修订保存，较新文档已保留'));return}
     store.put(doc);accept();
    };
   });return;
  }
  const raw=await this.localCollection(),inspection=inspectStoredCollection(raw);
  if(inspection.format==='invalid'||inspection.invalid.some(i=>storedRecordId(i.raw)===doc.id))throw new Error('不能覆盖损坏文档，请先下载恢复备份');
  const existing=inspection.documents.find(value=>value.id===doc.id);if(existing&&existing.revision>doc.revision)throw new Error('拒绝过期修订保存，较新文档已保留');
  let found=false;const records=inspection.records.map(value=>{if(storedRecordId(value)===doc.id){found=true;return doc}return value});if(!found)records.push(doc);
  localStorage.setItem(LOCAL,JSON.stringify(replaceStoredRecords(raw,records)));
 }
 async delete(id:string):Promise<void>{
  const work=this.writes.then(()=>this.deleteNow(id));this.writes=work.catch(()=>undefined);return work;
 }
 private async deleteNow(id:string):Promise<void>{
  const db=await this.database();
  if(db){await this.transaction<void>(db,DOCS,'readwrite',(store,accept,abort)=>{
   const get=store.get(id);get.onsuccess=()=>{const old:unknown=get.result;if(old!==undefined&&!documentSchema.safeParse(old).success){abort(new Error('原记录损坏，已拒绝覆盖或删除，请先下载恢复备份'));return}store.delete(id);accept()};
  });return}
  const raw=await this.localCollection(),inspection=inspectStoredCollection(raw);
  if(inspection.format==='invalid'||inspection.invalid.some(i=>storedRecordId(i.raw)===id))throw new Error('不能删除损坏原始记录，请先下载恢复备份');
  localStorage.setItem(LOCAL,JSON.stringify(replaceStoredRecords(raw,inspection.records.filter(value=>storedRecordId(value)!==id))));
 }
 async recoveries():Promise<RecoveryEntry[]>{
  const db=await this.database();
  let stored:RecoveryEntry[]=[];
  if(db){const raw:unknown=await this.transaction<unknown>(db,RECOVERY,'readonly',(store,accept)=>{const req=store.getAll();req.onsuccess=()=>accept(req.result)});if(Array.isArray(raw))stored=raw.filter((value:unknown)=>value!==null&&typeof value==='object'&&'key'in value&&typeof value.key==='string'&&value.key.startsWith(PREFIX)).map(value=>recoverySchema.parse(value))}
  else{
   try{stored=this.localRecoveries()}catch(error){
    stored=[{key:'unreadable-recovery-index',source:'localStorage:'+BACKUP,capturedAt:new Date().toISOString(),reason:String(error),raw:localStorage.getItem(BACKUP)}];
   }
  }
  return [...new Map([...stored,...this.transient.values()].map(e=>[e.key,e])).values()];
 }
}
export const webDocumentRepository=new WebDocumentRepository();
