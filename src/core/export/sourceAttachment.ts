/** Source preservation is separate from all content format converters. */
import type {DocumentRecord} from '../model/document';
import type {ExportHtmlArtifact} from '../model/exportHtml';
import {documentSchema} from '../model/documentSchema';
import {sha256Hex} from '../platform/crypto';
import {encodeSourcePayload} from '../storage/storage';
export async function encodeEditableSource(input:DocumentRecord,artifact:ExportHtmlArtifact):Promise<string>{
 const source=documentSchema.parse(input);
 if(source.id!==artifact.source.documentId||source.revision!==artifact.source.revision||await sha256Hex(new TextEncoder().encode(source.markdown))!==artifact.source.mdHash)throw new Error('编辑附件与HTML来源修订不一致');
 return encodeSourcePayload({...source,options:{...source.options,mathMode:artifact.mathMode},assets:artifact.assets.map(asset=>({...asset}))});
}
