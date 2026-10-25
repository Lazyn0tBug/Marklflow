import type {DocumentRecord,DocumentAsset} from '../model/document';
import {documentSchema} from '../model/documentSchema';
import {renderDocument,assertArtifact} from '../render/documentRenderer';
import {collectAssets} from './documentAssets';
export interface PreparedExportContent {document:DocumentRecord & {assets:DocumentAsset[]};html:string}
/** One source snapshot and one resource collection per export; never reads preview DOM. */
export async function prepareExportContent(input:DocumentRecord,options:{mathMode?:'mathml'|'svg';allowRemoteAssets?:boolean}={}):Promise<PreparedExportContent>{
 const doc=documentSchema.parse(input),mode=options.mathMode??doc.options.mathMode,remote=options.allowRemoteAssets??false;
 const artifact=await renderDocument(doc.markdown,mode,undefined,{priority:'export'});assertArtifact(artifact);
 const collected=await collectAssets(artifact.html,doc.assets,remote);
 return {document:{...doc,options:{...doc.options,mathMode:mode},assets:collected.assets},html:collected.html};
}
