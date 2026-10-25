import {ExportService} from '../../../application/exports/exportService';
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
export const webExportService=new ExportService({generateHtml:generateExportHtml,generateDocx:exportDocumentToDocx,download:downloadBlob,print:printFrozenHtml});
