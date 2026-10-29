import type {DocumentRecord} from '../../core/model/document';
import type {ExportHtmlArtifact} from '../../core/model/exportHtml';
import type {OutputIssue} from '../../core/model/exportDiagnostics';
import {documentSchema} from '../../core/model/documentSchema';
import {exportFile,type ExportFile,type ExportFormat} from './exportFile';
export type {ExportFormat} from './exportFile';
export interface ExportInput {document:DocumentRecord;format:ExportFormat;fileName:string;mathMode:'mathml'|'svg';allowRemoteAssets:boolean}
export interface ByteSaveTarget {save(blob:Blob):Promise<'saved'|'download-started'>}
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
   // Start selection before the first await so Web can retain the click activation.
   const target=format==='print-pdf'?undefined:await this.ports.selectSave(file);
   if(format!=='print-pdf'&&!target)return result('cancelled','已取消保存');
   const save=async(blob:Blob):Promise<ExportResult>=>{
    if(!target)throw new Error('文件保存目标不可用');
    const receipt=await target.save(blob);return result('completed',receipt==='saved'?'已保存文件':'已生成并发起下载');
   };
   // Source saving is deliberately separate and never renders formulas or diagrams.
   if(format==='markdown'){return await save(new Blob([doc.markdown],{type:'text/markdown;charset=utf-8'}))}
   if(format==='markdown-bundle'){return await save(await this.ports.generateMarkdownBundle(doc,{allowRemoteAssets}))}
   const artifact=await this.ports.prepare(doc,{mathMode:format==='docx'?'svg':mathMode,allowRemoteAssets});
   switch(format){
    case 'docx':{
     const issues=this.ports.inspectDocx(artifact);
     if(issues.some(issue=>issue.adaptation==='unsupported'))return result('blocked','存在不支持的内容，请修改后再导出',issues);
     if(issues.length&&!(await confirmDocx?.(issues,label)))return result('cancelled','未确认转换，已取消导出',issues);
     return await save(await this.ports.generateDocx(artifact,{allowSourceFallback:issues.length>0}));
    }
    case 'print-pdf':await this.ports.deliverPdf(await this.ports.generatePdfHtml(artifact,{title:file.baseName}));return result('completed','PDF导出已交由浏览器处理');
    case 'editable-html':case 'reading-html':{
     const options=format==='editable-html'?{editablePayload:await this.ports.encodeEditableSource(doc,artifact)}:{};
     return await save(new Blob([await this.ports.generateHtml(artifact,options)],{type:'text/html;charset=utf-8'}));
    }
    default:throw new Error('不支持的导出格式');
   }
  }finally{this.active=false;this.label=undefined}
 }
}
