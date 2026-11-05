import {ExportService,type ExportPorts,type PdfDeliveryReceipt} from '../../../application/exports/exportService';
import type {ExportFile} from '../../../application/exports/exportFile';
import {inspectDocx} from '../../export/outputCapabilities';
import {prepareExportContent} from '../../export/exportContent';
import {encodeEditableSource} from '../../export/sourceAttachment';
import {generatePdfHtml} from '../../export/pdfExporter';
import {generateMarkdownBundle} from '../../export/markdownBundle';
import {generateExportHtml} from '../../export/htmlExporter';
import {exportDocumentToDocx} from '../../export/docxExporter';
import {selectNativeSave,printNativePdf} from './files';

/**
 * 原生根的 PDF 交付：目标由人在原生保存对话框里选 ✓，打印走静默路径 ✓。
 *
 * **取消 ⇒ 没有 key ⇒ 什么都不写** ✓；
 * **提交失败 ⇒ 回执不是 saved ⇒ 算失败 ✓**（原文件未动 ✓ ✓）。
 * 目标在 finally 里释放 ✓ —— 成败都撤 ✓ ✓。
 */
export async function deliverPdfNative(html:string,file:ExportFile):Promise<PdfDeliveryReceipt>{
 const target=await selectNativeSave(file.name);
 if(!target)return 'cancelled';
 try{
  const receipt=await printNativePdf(target.key,html);
  return receipt==='saved'?'saved':'failed';
 }catch{
  return 'failed';
 }finally{
  await target.release();
 }
}

const nativePorts:ExportPorts={
 prepare:prepareExportContent,
 inspectDocx,
 encodeEditableSource,
 generatePdfHtml,
 generateMarkdownBundle,
 generateHtml:generateExportHtml,
 generateDocx:exportDocumentToDocx,
 // 字节格式也走原生保存对话框 ✓：名字落在用户选的位置上 ✓ ✓。
 selectSave:(file)=>selectNativeSave(file.name),
 deliverPdf:deliverPdfNative,
};

/**
 * 原生根的导出服务 ✓。
 *
 * **生成那一份与 Web 根是同一份** ✓ —— 同样的 prepare ✓、同样的 generatePdfHtml ✓ ——
 * 差别只在**谁来写** ✓（浏览器下载 ✓ ／ 原生静默 ✓）。
 */
export const nativeExportService=new ExportService(nativePorts);
