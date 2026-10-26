import type {DocumentRecord} from '../../core/model/document';
import type {ExportHtmlArtifact} from '../../core/model/exportHtml';
import type {OutputIssue} from '../../core/model/exportDiagnostics';
import {documentSchema} from '../../core/model/documentSchema';
export type ExportFormat='editable-html'|'reading-html'|'docx'|'print-pdf'|'markdown'|'markdown-bundle';
export interface ExportInput {document:DocumentRecord;format:ExportFormat;fileName:string;mathMode:'mathml'|'svg';allowRemoteAssets:boolean}
export interface ExportPorts {
 prepare(doc:DocumentRecord,options:{mathMode:'mathml'|'svg';allowRemoteAssets:boolean}):Promise<ExportHtmlArtifact>;
 inspectDocx(artifact:ExportHtmlArtifact):readonly OutputIssue[];
 encodeEditableSource(doc:DocumentRecord,artifact:ExportHtmlArtifact):Promise<string>;
 generatePdfHtml(artifact:ExportHtmlArtifact,options:{title:string}):Promise<string>;
 generateMarkdownBundle(doc:DocumentRecord,options:{allowRemoteAssets:boolean}):Promise<Blob>;
 generateHtml(artifact:ExportHtmlArtifact,options:{editablePayload?:string}):Promise<string>;
 generateDocx(artifact:ExportHtmlArtifact,options:{allowSourceFallback:boolean}):Promise<Blob>;
 download(blob:Blob,name:string):void;
 print(html:string):Promise<void>;
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
   const doc=documentSchema.parse(input.document),name=input.fileName.trim()||'MarkFlow-Document';
   const label=(doc.meta.title||doc.id)+'，Rev '+doc.revision;this.label=label;
   const result=(status:'completed'|'cancelled'|'blocked',message:string,issues?:readonly OutputIssue[]):ExportResult=>({status,documentId:doc.id,revision:doc.revision,message:message+'（来源：'+label+'）',...(issues?{issues}:{})});
   // Source saving is deliberately separate and never renders formulas or diagrams.
   if(format==='markdown'){this.ports.download(new Blob([doc.markdown],{type:'text/markdown;charset=utf-8'}),name+'.md');return result('completed','已生成并发起下载')}
   if(format==='markdown-bundle'){this.ports.download(await this.ports.generateMarkdownBundle(doc,{allowRemoteAssets}),name+'.zip');return result('completed','已生成并发起下载')}
   const artifact=await this.ports.prepare(doc,{mathMode:format==='docx'?'svg':mathMode,allowRemoteAssets});
   switch(format){
    case 'docx':{
     const issues=this.ports.inspectDocx(artifact);
     if(issues.some(issue=>issue.adaptation==='unsupported'))return result('blocked','存在不支持的内容，请修改后再导出',issues);
     if(issues.length&&!(await confirmDocx?.(issues,label)))return result('cancelled','未确认转换，已取消导出',issues);
     this.ports.download(await this.ports.generateDocx(artifact,{allowSourceFallback:issues.length>0}),name+'.docx');break;
    }
    case 'print-pdf':await this.ports.print(await this.ports.generatePdfHtml(artifact,{title:name}));return result('completed','PDF导出已交由浏览器处理');
    case 'editable-html':case 'reading-html':{
     const options=format==='editable-html'?{editablePayload:await this.ports.encodeEditableSource(doc,artifact)}:{};
     this.ports.download(new Blob([await this.ports.generateHtml(artifact,options)],{type:'text/html;charset=utf-8'}),name+(format==='editable-html'?'.markflow.html':'.html'));break;
    }
    default:throw new Error('不支持的导出格式');
   }
   return result('completed','已生成并发起下载');
  }finally{this.active=false;this.label=undefined}
 }
}
