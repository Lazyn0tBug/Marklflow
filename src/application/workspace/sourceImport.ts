import type {DocumentRecord} from '../../core/model/document';
import {documentSchema} from '../../core/model/documentSchema';
import {taskBudget} from '../tasks/budget';
export interface ImportFile {name:string;size:number}

/**
 * 一个**已经绑在某个文档上**的文件 ✓。
 *
 * **"磁盘上那份变了没有"也在这儿答** ✓ ⇒ ⇒ 批次不自己判断 ✓ ⇒ ⇒ 判断只有一处 ✓（§5.2 ✓）。
 */
export interface BoundSelection{
 /** 已经绑在哪个文档上 ✓ ⇒ ⇒ 命中就聚焦那个标签页 ✓ ⇒ ⇒ 不新建 ✓。 */
 documentId:string;
 /** 磁盘上那份还是不是应用手上那一版 ✓ ⇒ ⇒ 变了要问用户 ✓ ⇒ ⇒ 不静默覆盖 ✓。 */
 changed:boolean;
}

/**
 * 打开的结果 ✓。
 *
 * **聚焦时把工作区里那一份给出来** ✓ ⇒ ⇒ 归属命中时它就是这份文件对应的那份内容 ✓
 * ⇒ ⇒ 好按内容比较基线 ✓（§2.3 ✓）。
 */
export interface OpenResult{
 /** 打开了新的一份 ✓，还是聚焦了工作区里已有的那一份 ✓。 */
 status:'opened'|'focused';
 /** 聚焦时的那一份 ✓ ⇒ ⇒ 没有就是 undefined ✓。 */
 existing?:DocumentRecord|undefined;
}

export interface SourceImportPorts<F extends ImportFile> {
 read(file:F):Promise<string>;
 decodeHtml(content:string):DocumentRecord|null;
 createMarkdown(name:string,content:string):DocumentRecord;
 verify(doc:DocumentRecord):Promise<void>;
 /**
  * 文档键 ✓：这份内容属不属于同一个文档 ✓。
  *
  * **文件也一并给** ✓ ⇒ ⇒ **来源不同的两份内容不该并成一个文档** ✓ ⇒ ⇒ 键由平台自己定 ✓（§5.1 ✓）。
  *
  * **原生端按文件引用归属** ✓ ⇒ ⇒ 同一个文件恒对应同一份内容 ✓ ⇒ ⇒ 键里不看内容摘要 ✓（§5.3 ✓）。
  */
 documentKey(file:F,name:string,content:string):Promise<string>;
 /**
  * 打开这份载荷 ✓。
  *
  * **文件也一并给** ✓ ⇒ ⇒ 打开与绑定是同一件事的两面 ✓ ⇒ ⇒ 桌面端据此建立绑定 ✓
  * ⇒ ⇒ Web 端没有文件引用 ✓ ⇒ ⇒ 它不用这个参数 ✓。
  */
 open(doc:DocumentRecord,file:F):Promise<OpenResult>;
 /**
  * 这个文件是不是**已经绑在某个文档上** ✓ ⇒ ⇒ 命中就是聚焦 ✓ ⇒ ⇒ 不新建 ✓（§5.2 ✓）。
  *
  * **归属按文件引用** ✓ ⇒ ⇒ 内容哈希是二级 ✓（§5.3 ✓）⇒ ⇒ 同一个文件不会开出两个文档 ✓。
  */
 boundSelection(file:F):Promise<BoundSelection|undefined>;
 /**
  * 放掉这一项的句柄 ✓ ⇒ ⇒ **没采用的不留着** ✓（§5.1 ✓、M4-5 ✓）。
  *
  * **打开成功的那一项不放掉** ✓ ⇒ ⇒ 它的句柄是那个文档的绑定 ✓ ⇒ ⇒ 放掉了绑定就断了 ✓。
  */
 release(file:F):Promise<void>;
}
export interface ImportItemResult {name:string;status:'opened'|'focused'|'changed'|'failed';documentId?:string;message:string}
export type ImportResult={status:'busy'}|{status:'completed';items:ImportItemResult[]};
/** A single user-selected batch, processed in selection order. No preview tasks or retry queue. */
export class SourceImport<F extends ImportFile> {
 private active=false;private markdownIds=new Map<string,string>();
 constructor(private readonly ports:SourceImportPorts<F>){}
 get busy():boolean{return this.active}
 async run(selection:readonly F[]):Promise<ImportResult>{
  if(this.active){
   // **上一批还没走完 ⇒ ⇒ 这一批不用** ✓ ⇒ ⇒ 原生侧已经为它们签发了句柄 ✓
   // ⇒ ⇒ 放掉 ✓ ⇒ ⇒ 原生侧不留无主的凭据 ✓（§5.1 ✓、M4-5 ✓）。
   for(const file of selection)await this.ports.release(file).catch(()=>{});
   return {status:'busy'};
  }
  this.active=true;const files=[...selection],items:ImportItemResult[]=[];
  try{
   for(const file of files){
    /*
     * **一项一条结果** ✓ ⇒ ⇒ 释放失败不会多出一条 ✓ ⇒ ⇒ 批次的形状不变 ✓。
     * **要不要释放这一项** ✓ ⇒ ⇒ 聚焦的、失败的都释放 ✓ ⇒ ⇒ 打开成功的不释放 ✓。
     */
    let item:ImportItemResult;let release=false;
    try{
     const bound=await this.ports.boundSelection(file);
     if(bound){
      // **命中既有绑定** ✓ ⇒ ⇒ 聚焦那个标签页 ✓ ⇒ ⇒ 不新建、不覆盖、不清未同步提示 ✓（§5.2 ✓）。
      // **磁盘变了** ⇒ ⇒ 交给用户决定要不要重新载入 ✓ ⇒ ⇒ 不静默覆盖内存中的修改 ✓。
      release=true;
      item=bound.changed
       ? {name:file.name,status:'changed',documentId:bound.documentId,message:'磁盘上的文件已变化，是否重新载入由你决定'}
       : {name:file.name,status:'focused',documentId:bound.documentId,message:'已聚焦工作区已有文档，导入内容未覆盖'};
     }else{
      if(!/\.(md|markdown|txt|html|htm)$/i.test(file.name))throw new Error('仅支持 .md、.markdown、.txt 和可编辑 .html/.htm');
      if(!Number.isSafeInteger(file.size)||file.size<0||file.size>50*1024*1024)throw new Error('导入文件超过50MB限制或大小无效');
      const content=await this.ports.read(file);
      if(content.includes('\0'))throw new Error('文件含二进制空字节，不能按文本导入');
      const html=/\.html?$/i.test(file.name);let key:string|undefined;
      let candidate:DocumentRecord;
      if(html){const parsed=this.ports.decodeHtml(content);if(!parsed)throw new Error('HTML 没有有效源载荷或结构不受支持；不会按 Markdown 导入');candidate=parsed}
      else{if(new TextEncoder().encode(content).byteLength>taskBudget.input.markdownUtf8Bytes)throw new Error('Markdown 超过源文大小限制');key=await this.ports.documentKey(file,file.name,content);candidate=this.ports.createMarkdown(file.name,content);const id=this.markdownIds.get(key);if(id)candidate={...candidate,id}}
      const doc=documentSchema.parse(candidate);
      if(!Number.isSafeInteger(doc.revision)||new TextEncoder().encode(doc.markdown).byteLength>taskBudget.input.markdownUtf8Bytes)throw new Error('Markdown 超过源文大小限制或修订无效');
      await this.ports.verify(doc);
      const result=await this.ports.open(doc,file);
      const status=result.status;
      if(key)this.markdownIds.set(key,doc.id);
      item={name:file.name,status,documentId:doc.id,message:status==='focused'?'已聚焦工作区已有文档，导入内容未覆盖':'已导入并打开'};
     }
    }catch(error){
     // **失败项不建绑定** ✓ ⇒ ⇒ 它的句柄要放掉 ✓ ⇒ ⇒ 不留要回收的凭据 ✓（M4-5 ✓）。
     release=true;
     item={name:file.name,status:'failed',message:error instanceof Error?error.message:String(error)};
    }
    items.push(item);
    if(release)await this.ports.release(file).catch(()=>{});
   }
   return {status:'completed',items};
  }finally{this.active=false}
 }
}
