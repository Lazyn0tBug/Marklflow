import type {DocumentRecord} from '../../core/model/document';
import {documentSchema} from '../../core/model/documentSchema';
import type {DocumentSessions} from '../sessions/documentSessions';
/** Freeze the source before awaiting storage; active Tab changes cannot redirect the result. */
export async function saveSource(sessions:DocumentSessions,input:DocumentRecord,save:(doc:DocumentRecord)=>Promise<void>){
 const doc=documentSchema.parse(input);
 if(!Number.isSafeInteger(doc.revision))throw new Error('Invalid source revision');
 await save(doc);
 const markedSaved=sessions.documentIds.includes(doc.id)&&sessions.markSaved(doc.id,doc.revision);
 return {documentId:doc.id,revision:doc.revision,markedSaved};
}
