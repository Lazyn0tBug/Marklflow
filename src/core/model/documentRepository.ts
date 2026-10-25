import {z} from 'zod';
import {documentSchema} from './documentSchema';
import type {DocumentRecord} from './document';
export interface RecoveryEntry {key:string;source:string;capturedAt:string;reason:string;raw:unknown;persistence:'persisted'|'session'|'source-only'}
export interface DocumentLoadResult {documents:DocumentRecord[];canInitialize:boolean;warnings:string[]}
export interface DocumentRepository {
 load():Promise<DocumentLoadResult>;
 save(document:DocumentRecord):Promise<void>;
 delete(id:string):Promise<void>;
 recoveries():Promise<RecoveryEntry[]>;
}
const envelope=z.object({storageVersion:z.literal(1),documents:z.array(z.unknown())}).passthrough();
export interface CollectionInspection {format:'legacy-array'|'v1'|'invalid';records:unknown[];documents:DocumentRecord[];invalid:{index:number;raw:unknown;reason:string}[]}
/** Legacy arrays are the existing format, not guessed migrations of unknown record versions. */
export function inspectStoredCollection(input:unknown):CollectionInspection{
 const parsed=envelope.safeParse(input);
 const records:unknown[]=Array.isArray(input)?input:parsed.success?parsed.data.documents:[];
 const format=Array.isArray(input)?'legacy-array':parsed.success?'v1':'invalid';
 const result:CollectionInspection={format,records,documents:[],invalid:[]};
 if(format==='invalid'){result.invalid.push({index:-1,raw:input,reason:'不支持或损坏的文档存储版本/集合'});return result}
 const ids=new Set<string>();
 records.forEach((raw,index)=>{
  const doc=documentSchema.safeParse(raw);
  if(!doc.success)result.invalid.push({index,raw,reason:doc.error.issues.map(i=>i.path.join('.')+': '+i.message).join('; ')});
  else if(ids.has(doc.data.id))result.invalid.push({index,raw,reason:'重复的文档标识'});
  else{ids.add(doc.data.id);result.documents.push(doc.data)}
 });return result;
}
export function replaceStoredRecords(input:unknown,records:unknown[]):unknown{
 if(Array.isArray(input))return records;
 const parsed=envelope.safeParse(input);if(!parsed.success)throw new Error('原始存储不可安全修改，请先下载恢复备份');
 return {...parsed.data,documents:records};
}
export function storedRecordId(raw:unknown):string|undefined{
 const result=z.object({id:z.string()}).safeParse(raw);return result.success?result.data.id:undefined;
}
export const recoverySchema=z.object({key:z.string(),source:z.string(),capturedAt:z.string(),reason:z.string(),raw:z.unknown(),persistence:z.enum(['persisted','session','source-only']).default('persisted')}).refine(value=>Object.hasOwn(value,'raw'),'缺少原始恢复数据');

export function assertDocumentWrite(current:unknown,next:DocumentRecord):void{
 if(current===undefined)return;
 const existing=documentSchema.safeParse(current);if(!existing.success)throw new Error('原记录损坏，已拒绝覆盖或删除，请先下载恢复备份');
 if(existing.data.revision>next.revision)throw new Error('拒绝过期修订保存，较新文档已保留');
 const content=(doc:DocumentRecord)=>({markdown:doc.markdown,theme:doc.theme,options:doc.options,assets:doc.assets,meta:{title:doc.meta.title,author:doc.meta.author,tags:doc.meta.tags}});
 if(existing.data.revision===next.revision&&JSON.stringify(content(existing.data))!==JSON.stringify(content(next)))throw new Error('修订冲突：同一修订包含不同内容，原文档已保留');
}
