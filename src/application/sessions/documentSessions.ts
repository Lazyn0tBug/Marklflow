import type {DocumentRecord} from '../../core/model/document';
import {documentSchema} from '../../core/model/documentSchema';
import type {SourceAnchor} from '../../core/model/sourceLayout';
import type {PreviewReference} from '../previewCache/contracts';
type PreviewKind=PreviewReference['key']['previewKind'];
type PreviewReferences=Partial<Record<PreviewKind,PreviewReference>>;
export interface EditorPosition {selectionStart:number;selectionEnd:number;scrollTop:number;scrollLeft:number;previewScrollTop:number;sourceAnchor?:SourceAnchor;editorLayoutKey?:string}
export interface DocumentSession {document:DocumentRecord;position:EditorPosition;dirty:boolean;canUndo:boolean;canRedo:boolean;previewReferences:PreviewReferences}
interface Entry {document:DocumentRecord;position:EditorPosition;savedRevision:number;undo:DocumentRecord[];redo:DocumentRecord[];previewReferences:PreviewReferences}
const origin=():EditorPosition=>({selectionStart:0,selectionEnd:0,scrollTop:0,scrollLeft:0,previewScrollTop:0});
/** In-memory editing only. No storage, rendering, task cancellation or UI ownership. */
export class DocumentSessions {
 private entries=new Map<string,Entry>();private active:string|undefined;
 get activeDocumentId():string|undefined{return this.active}
 get documentIds():string[]{return [...this.entries.keys()]}
 private entry(id:string):Entry {const entry=this.entries.get(id);if(!entry)throw new Error('Unknown document session');return entry}
 private view(entry:Entry):DocumentSession{return structuredClone({document:entry.document,position:entry.position,dirty:entry.document.revision!==entry.savedRevision,canUndo:entry.undo.length>0,canRedo:entry.redo.length>0,previewReferences:entry.previewReferences})}
 read(id:string):DocumentSession{return this.view(this.entry(id))}
 open(input:DocumentRecord,unsaved=false):DocumentSession {
  // Opening the same document focuses the existing draft, never replaces it with disk data.
  if(this.entries.has(input.id)){this.activate(input.id);return this.read(input.id)}
  const doc=documentSchema.parse(input);
  if(!Number.isSafeInteger(doc.revision))throw new Error('Invalid document revision');
  if(this.entries.size>=32)throw new Error('Too many open documents');
  this.entries.set(doc.id,{document:doc,position:origin(),savedRevision:unsaved?-1:doc.revision,undo:[],redo:[],previewReferences:{}});this.active=doc.id;return this.read(doc.id);
 }
 setPreviewReference(id:string,kind:PreviewKind,reference:PreviewReference|undefined):void{
  const entry=this.entry(id);if(reference&&(reference.key.documentId!==id||reference.key.previewKind!==kind))throw new Error('Preview reference does not belong to this session');
  if(reference)entry.previewReferences[kind]=structuredClone(reference);else delete entry.previewReferences[kind];
 }
 activate(id:string):void{this.entry(id);this.active=id}
 setPosition(id:string,position:EditorPosition):void {
  const entry=this.entry(id);
  if([position.selectionStart,position.selectionEnd,position.scrollTop,position.scrollLeft,position.previewScrollTop].some(value=>!Number.isFinite(value)||value<0)||!Number.isInteger(position.selectionStart)||!Number.isInteger(position.selectionEnd)||position.selectionStart>position.selectionEnd)throw new Error('Invalid editor position');
  if(position.sourceAnchor&&(!Number.isInteger(position.sourceAnchor.line)||position.sourceAnchor.line<1||!Number.isFinite(position.sourceAnchor.offset)))throw new Error('Invalid source anchor');
  if(position.editorLayoutKey!==undefined&&typeof position.editorLayoutKey!=='string')throw new Error('Invalid layout key');
  entry.position={...structuredClone(position),selectionStart:Math.min(position.selectionStart,entry.document.markdown.length),selectionEnd:Math.min(position.selectionEnd,entry.document.markdown.length)};
 }
 /** Caller supplies a complete next revision, using the existing DocumentRecord contract. */
 update(input:DocumentRecord):void {
  const entry=this.entry(input.id),doc=documentSchema.parse(input);
  if(doc.revision!==entry.document.revision+1||!Number.isSafeInteger(doc.revision))throw new Error('Expected next document revision');
  entry.undo.push(entry.document);if(entry.undo.length>100)entry.undo.shift();entry.redo=[];entry.document=doc;this.setPosition(doc.id,entry.position);
 }
 private move(id:string,direction:'undo'|'redo'):boolean {
  const entry=this.entry(id),source=entry[direction],previous=source.at(-1);if(!previous)return false;
  const revision=entry.document.revision+1;if(!Number.isSafeInteger(revision))throw new Error('Document revision exhausted');
  source.pop();entry[direction==='undo'?'redo':'undo'].push(entry.document);
  entry.document={...previous,revision,meta:{...previous.meta,updatedAt:entry.document.meta.updatedAt}};this.setPosition(id,entry.position);return true;
 }
 undo(id:string):boolean{return this.move(id,'undo')}
 redo(id:string):boolean{return this.move(id,'redo')}
 /** Accept only the current revision; a late save must not clear a newer draft. */
 markSaved(id:string,revision:number):boolean {
  const entry=this.entry(id);if(revision!==entry.document.revision)return false;entry.savedRevision=revision;return true;
 }
 close(id:string,discardUnsaved=false):'closed'|'unsaved' {
  const entry=this.entry(id);if(entry.document.revision!==entry.savedRevision&&!discardUnsaved)return 'unsaved';
  const ids=this.documentIds,index=ids.indexOf(id);this.entries.delete(id);
  if(this.active===id)this.active=ids[index+1]??ids[index-1];return 'closed';
 }
}
