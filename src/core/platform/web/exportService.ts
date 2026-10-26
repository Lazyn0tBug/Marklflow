import {prepareExportContent} from '../../export/exportContent';
import {encodeEditableSource} from '../../export/sourceAttachment';
import {ExportService} from '../../../application/exports/exportService';
import {generatePdfHtml} from '../../export/pdfExporter';
import {generateMarkdownBundle} from '../../export/markdownBundle';
import {generateExportHtml} from '../../export/htmlExporter';
import {exportDocumentToDocx} from '../../export/docxExporter';
import {printFrozenHtml} from '../../export/documentPrint';
/** Existing browser download path; cleanup also runs when link activation throws. */
export function downloadBlob(blob:Blob,name:string):void{
 const link=document.createElement('a'),url=URL.createObjectURL(blob);
 try{link.href=url;link.download=name;document.body.appendChild(link);link.click()}
 finally{link.remove();URL.revokeObjectURL(url)}
}
/** Shared across modal close/reopen; the user operation is independent of preview/Tab state. */
export const webExportService=new ExportService({generatePdfHtml:async(doc,options)=>generatePdfHtml((await prepareExportContent(doc,options)),{title:options.title}),generateMarkdownBundle,generateHtml:async(doc,options)=>{
 const prepared=await prepareExportContent(doc,options);
 return generateExportHtml(prepared,options.includeEditablePayload?{editablePayload:await encodeEditableSource(doc,prepared)}:{});
},generateDocx:async(doc,options)=>exportDocumentToDocx((await prepareExportContent(doc,{mathMode:'svg',allowRemoteAssets:options.allowRemoteAssets})),{allowSourceFallback:options.allowSourceFallback}),download:downloadBlob,print:printFrozenHtml});
