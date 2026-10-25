import type {DocumentRecord} from '../../core/model/document';
import {documentSchema} from '../../core/model/documentSchema';
export type ExportFormat='editable-html'|'reading-html'|'docx'|'print-pdf'|'markdown'|'markdown-bundle';
export interface ExportInput {document:DocumentRecord;format:ExportFormat;fileName:string;mathMode:'mathml'|'svg';allowSourceFallback:boolean;allowRemoteAssets:boolean}
export interface ExportPorts {
 generatePdfHtml(doc:DocumentRecord,options:{mathMode:'mathml'|'svg';allowRemoteAssets:boolean}):Promise<string>;
 generateMarkdownBundle(doc:DocumentRecord,options:{mathMode:'mathml'|'svg';allowRemoteAssets:boolean}):Promise<Blob>;
 generateHtml(doc:DocumentRecord,options:{includeEditablePayload:boolean;mathMode:'mathml'|'svg';allowRemoteAssets:boolean}):Promise<string>;
 generateDocx(doc:DocumentRecord,options:{allowSourceFallback:boolean;allowRemoteAssets:boolean}):Promise<Blob>;
 download(blob:Blob,name:string):void;
 print(html:string):Promise<void>;
}
export type ExportResult={status:'busy'}|{status:'completed';documentId:string;revision:number;message:string};
/** One user export at a time. No preview task IDs, queue, lifecycle or delivery state machine. */
export class ExportService{
 private active=false;private label:string|undefined;
 constructor(private readonly ports:ExportPorts){}
 get busy():boolean{return this.active}
 get sourceLabel():string|undefined{return this.label}
 async run(input:ExportInput):Promise<ExportResult>{
  if(this.active)return {status:'busy'};this.active=true;
  try{
   // Capture all caller-owned values before the first await, including the entire document/assets.
   const {format,mathMode,allowSourceFallback,allowRemoteAssets}=input;
   const doc=documentSchema.parse(input.document),name=input.fileName.trim()||'MarkFlow-Document';
   this.label=(doc.meta.title||doc.id)+'，Rev '+doc.revision;
   let printed=false;
   switch(format){
    case 'markdown':this.ports.download(new Blob([doc.markdown],{type:'text/markdown;charset=utf-8'}),name+'.md');break;
    case 'markdown-bundle':this.ports.download(await this.ports.generateMarkdownBundle(doc,{mathMode,allowRemoteAssets}),name+'.zip');break;
    case 'docx':this.ports.download(await this.ports.generateDocx(doc,{allowSourceFallback,allowRemoteAssets}),name+'.docx');break;
    case 'print-pdf':await this.ports.print(await this.ports.generatePdfHtml(doc,{mathMode,allowRemoteAssets}));printed=true;break;
    case 'editable-html':case 'reading-html':{
     const html=await this.ports.generateHtml(doc,{includeEditablePayload:format==='editable-html',mathMode,allowRemoteAssets});
     this.ports.download(new Blob([html],{type:'text/html;charset=utf-8'}),name+(format==='editable-html'?'.markflow.html':'.html'));
     break;
    }
    default:throw new Error('不支持的导出格式');
   }
   return {status:'completed',documentId:doc.id,revision:doc.revision,message:(printed?'PDF导出已交由浏览器处理':'已生成并发起下载')+'（来源：'+(doc.meta.title||doc.id)+'，Rev '+doc.revision+'）'};
  }finally{this.active=false;this.label=undefined}
 }
}
