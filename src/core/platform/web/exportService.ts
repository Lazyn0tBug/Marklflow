import {inspectDocx} from '../../export/outputCapabilities';
import {prepareExportContent} from '../../export/exportContent';
import {encodeEditableSource} from '../../export/sourceAttachment';
import {ExportService} from '../../../application/exports/exportService';
import {generatePdfHtml} from '../../export/pdfExporter';
import {generateMarkdownBundle} from '../../export/markdownBundle';
import {generateExportHtml} from '../../export/htmlExporter';
import {exportDocumentToDocx} from '../../export/docxExporter';
import {deliverPdfHtml} from './pdfDelivery';
import {selectWebSave} from './byteDelivery';
/** Shared across modal close/reopen; the user operation is independent of preview/Tab state. */
export const webExportService=new ExportService({prepare:prepareExportContent,inspectDocx,encodeEditableSource,generatePdfHtml,generateMarkdownBundle,generateHtml:generateExportHtml,generateDocx:exportDocumentToDocx,selectSave:selectWebSave,deliverPdf:deliverPdfHtml});
