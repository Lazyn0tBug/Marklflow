import type {DocumentRecord} from '../../core/model/document';
import type {ExportHtmlArtifact} from '../../core/model/exportHtml';
import type {OutputIssue} from '../../core/model/exportDiagnostics';
import {documentSchema} from '../../core/model/documentSchema';
import {exportFile,type ExportFile,type ExportFormat} from './exportFile';
export type {ExportFormat} from './exportFile';
export interface ExportInput {document:DocumentRecord;format:ExportFormat;fileName:string;mathMode:'mathml'|'svg';allowRemoteAssets:boolean}
/** saved: the chosen path holds the bytes. download-started: the browser owns the delivery. recovered-download: the chosen path stayed empty, so the browser took over. activation-expired: the browser refused a destination picker outside a fresh user gesture. */
export type SaveReceipt='saved'|'download-started'|'recovered-download'|'activation-expired';
export interface ByteSaveTarget {save(blob:Blob):Promise<SaveReceipt>}
export interface ExportPorts {
 prepare(doc:DocumentRecord,options:{mathMode:'mathml'|'svg';allowRemoteAssets:boolean}):Promise<ExportHtmlArtifact>;
 inspectDocx(artifact:ExportHtmlArtifact):readonly OutputIssue[];
 encodeEditableSource(doc:DocumentRecord,artifact:ExportHtmlArtifact):Promise<string>;
 generatePdfHtml(artifact:ExportHtmlArtifact,options:{title:string}):Promise<string>;
 generateMarkdownBundle(doc:DocumentRecord,options:{allowRemoteAssets:boolean}):Promise<Blob>;
 generateHtml(artifact:ExportHtmlArtifact,options:{editablePayload?:string}):Promise<string>;
 generateDocx(artifact:ExportHtmlArtifact,options:{allowSourceFallback:boolean}):Promise<Blob>;
 selectSave(file:ExportFile):Promise<ByteSaveTarget|undefined>;
 deliverPdf(html:string):Promise<void>;
}
export interface ExportReview {confirmDocx(issues:readonly OutputIssue[],sourceLabel:string):Promise<boolean>}
export type ExportResult={status:'busy'}|{status:'completed'|'cancelled'|'blocked';documentId:string;revision:number;message:string;issues?:readonly OutputIssue[]};
/** One accepted export, one canonical HTML preparation, no preview/cache dependency or retry queue. */
export class ExportService{
 private active=false;private label:string|undefined;
 constructor(private readonly ports:ExportPorts){}
 get busy():boolean{return this.active}
 get sourceLabel():string|undefined{return this.label}
 async run(input:ExportInput,review?:ExportReview):Promise<ExportResult>{
  if(this.active)return {status:'busy'};this.active=true;
  try{
   const {format,mathMode,allowRemoteAssets}=input,confirmDocx=review?.confirmDocx;
   const doc=documentSchema.parse(input.document),file=exportFile(input.fileName,format);
   const label=(doc.meta.title||doc.id)+'，Rev '+doc.revision;this.label=label;
   const result=(status:'completed'|'cancelled'|'blocked',message:string,issues?:readonly OutputIssue[]):ExportResult=>({status,documentId:doc.id,revision:doc.revision,message:message+'（来源：'+label+'）',...(issues?{issues}:{})});
   /**
    * The bytes are produced before a destination is chosen, so the picker and the write happen in one
    * gesture, and a refused or unsupported output never asks the user for a location.
    */
   const deliver=async(blob:Blob):Promise<ExportResult>=>{
    const target=await this.ports.selectSave(file);
    if(!target)return result('cancelled','已取消保存');
    const receipt=await target.save(blob);
    // The receipt states where the bytes are, never that a call merely resolved.
    return result('completed',receipt==='saved'?'已保存文件':receipt==='recovered-download'?'所选位置未生成文件，已改为浏览器下载':receipt==='activation-expired'?'未能唤起保存位置选择框，已改为浏览器下载':'已生成并发起下载');
   };
   // Source saving is deliberately separate and never renders formulas or diagrams.
   if(format==='markdown'){return await deliver(new Blob([doc.markdown],{type:'text/markdown;charset=utf-8'}))}
   if(format==='markdown-bundle'){return await deliver(await this.ports.generateMarkdownBundle(doc,{allowRemoteAssets}))}
   const artifact=await this.ports.prepare(doc,{mathMode:format==='docx'?'svg':mathMode,allowRemoteAssets});
   switch(format){
    case 'docx':{
     const issues=this.ports.inspectDocx(artifact);
     if(issues.some(issue=>issue.adaptation==='unsupported'))return result('blocked','存在不支持的内容，请修改后再导出',issues);
     if(issues.length&&!(await confirmDocx?.(issues,label)))return result('cancelled','未确认转换，已取消导出',issues);
     return await deliver(await this.ports.generateDocx(artifact,{allowSourceFallback:issues.length>0}));
    }
    case 'print-pdf':await this.ports.deliverPdf(await this.ports.generatePdfHtml(artifact,{title:file.baseName}));return result('completed','PDF导出已交由浏览器处理');
    case 'editable-html':case 'reading-html':{
     const options=format==='editable-html'?{editablePayload:await this.ports.encodeEditableSource(doc,artifact)}:{};
     return await deliver(new Blob([await this.ports.generateHtml(artifact,options)],{type:'text/html;charset=utf-8'}));
    }
    default:throw new Error('不支持的导出格式');
   }
  }finally{this.active=false;this.label=undefined}
 }
}
