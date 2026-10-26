import {documentSchema} from '../model/documentSchema';
import type {DocumentRecord} from '../model/document';
import {renderDocument,assertArtifact,throwIfAborted} from './documentRenderer';
import {collectAssets} from '../export/documentAssets';
import {DOCUMENT_CSS,documentStyle} from './documentPresentation';
import {paginatePreparedContent,type PaginatedDocument} from './htmlPaginator';
import type {DomScheduling} from '../platform/web/sharedDom';
export type {PaginatedDocument} from './htmlPaginator';
/** Preview alone owns source parsing; export layout enters htmlPaginator directly. */
export async function paginateDocument(input:DocumentRecord,signal?:AbortSignal,scheduling:Omit<DomScheduling,'signal'>={}):Promise<PaginatedDocument>{
 const doc=documentSchema.parse(input),priority=scheduling.priority;
 throwIfAborted(signal);const rendered=await renderDocument(doc.markdown,doc.options.mathMode,signal,scheduling);assertArtifact(rendered);
 const {html}=await collectAssets(rendered.html,doc.assets,false);throwIfAborted(signal);
 return paginatePreparedContent({html,presentation:{css:DOCUMENT_CSS,variables:documentStyle(doc.theme),page:{size:'A4',margins:doc.theme.margins}}},signal,priority?{priority}:{});
}
