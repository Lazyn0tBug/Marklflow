import type {DocumentRecord} from '../../core/model/document';
import {documentSchema} from '../../core/model/documentSchema';
import {taskBudget} from '../tasks/budget';
export interface ImportFile {name:string;size:number}
export interface SourceImportPorts<F extends ImportFile> {
 read(file:F):Promise<string>;
 decodeHtml(content:string):DocumentRecord|null;
 createMarkdown(name:string,content:string):DocumentRecord;
 verify(doc:DocumentRecord):Promise<void>;
 markdownKey(name:string,content:string):Promise<string>;
 open(doc:DocumentRecord):Promise<'opened'|'focused'>;
}
export interface ImportItemResult {name:string;status:'opened'|'focused'|'failed';documentId?:string;message:string}
export type ImportResult={status:'busy'}|{status:'completed';items:ImportItemResult[]};
/** A single user-selected batch, processed in selection order. No preview tasks or retry queue. */
export class SourceImport<F extends ImportFile> {
 private active=false;private markdownIds=new Map<string,string>();
 constructor(private readonly ports:SourceImportPorts<F>){}
 get busy():boolean{return this.active}
 async run(selection:readonly F[]):Promise<ImportResult>{
  if(this.active)return {status:'busy'};
  this.active=true;const files=[...selection],items:ImportItemResult[]=[];
  try{
   for(const file of files){
    try{
     if(!/\.(md|markdown|txt|html|htm)$/i.test(file.name))throw new Error('仅支持 .md、.markdown、.txt 和可编辑 .html/.htm');
     if(!Number.isSafeInteger(file.size)||file.size<0||file.size>50*1024*1024)throw new Error('导入文件超过50MB限制或大小无效');
     const content=await this.ports.read(file);
     if(content.includes('\0'))throw new Error('文件含二进制空字节，不能按文本导入');
     const html=/\.html?$/i.test(file.name);let key:string|undefined;
     let candidate:DocumentRecord;
     if(html){const parsed=this.ports.decodeHtml(content);if(!parsed)throw new Error('HTML 没有有效源载荷或结构不受支持；不会按 Markdown 导入');candidate=parsed}
     else{if(new TextEncoder().encode(content).byteLength>taskBudget.input.markdownUtf8Bytes)throw new Error('Markdown 超过源文大小限制');key=await this.ports.markdownKey(file.name,content);candidate=this.ports.createMarkdown(file.name,content);const id=this.markdownIds.get(key);if(id)candidate={...candidate,id}}
     const doc=documentSchema.parse(candidate);
     if(!Number.isSafeInteger(doc.revision)||new TextEncoder().encode(doc.markdown).byteLength>taskBudget.input.markdownUtf8Bytes)throw new Error('Markdown 超过源文大小限制或修订无效');
     await this.ports.verify(doc);
     const status=await this.ports.open(doc);
     if(key)this.markdownIds.set(key,doc.id);
     items.push({name:file.name,status,documentId:doc.id,message:status==='focused'?'已聚焦工作区已有文档，导入内容未覆盖':'已导入并打开'});
    }catch(error){items.push({name:file.name,status:'failed',message:error instanceof Error?error.message:String(error)})}
   }
   return {status:'completed',items};
  }finally{this.active=false}
 }
}
