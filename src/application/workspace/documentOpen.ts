import type {DocumentRecord} from '../../core/model/document';
import type {BoundSelection,ImportFile} from './sourceImport';
import type {DocumentFileContexts,FileIdentityBinding} from './documentFileContext';

/**
 * **打开一个本地文件** ✓：打开与绑定是同一件事 ✓（设计 §4.3 ✓）。
 *
 * **它住在应用层** ✓ ⇒ ⇒ 规则能被单测盯住 ✓ ⇒ ⇒ 不必起浏览器、不必开桌面外壳 ✓。
 * **宿主只给端口** ✓ ⇒ ⇒ 平台差异留在平台那一侧 ✓ ⇒ ⇒ 这里只有规则 ✓。
 */
export interface DocumentOpenPorts<F extends ImportFile>{
 /** 打开这份载荷 ✓。 */
 open(doc:DocumentRecord,file:F):Promise<'opened'|'focused'>;
 /** 从选择结果里取出身份 ✓（文件身份、授权 key、文件名、载荷类型 ✓）。 */
 identity(file:F):FileIdentityBinding;
 /** 这个身份绑在哪个文档上 ✓ ⇒ ⇒ 没有就是 undefined ✓。 */
 boundDocument(fileIdentity:string):string|undefined;
 /**
  * 磁盘上那份还是不是应用手上那一版 ✓ ⇒ ⇒ **答不了就抛** ✓
  * ⇒ ⇒ 这里按"变了"处理 ✓ ⇒ ⇒ 交给用户决定 ✓（§5.2 ✓）。
  */
 sameVersion(key:string):Promise<boolean>;
}

export class DocumentOpener<F extends ImportFile>{
 constructor(private readonly contexts:DocumentFileContexts,private readonly ports:DocumentOpenPorts<F>){}

 /**
  * **打开** ✓ ⇒ ⇒ 绑定就位 ✓ ⇒ ⇒ `lastSyncedRevision = document.revision` ✓
  * ⇒ ⇒ 刚打开不显示未同步 ✓（§2.3 ✓）。
  *
  * **聚焦的那一条不建绑定** ✓ ⇒ ⇒ 那个绑定已经在那里 ✓ ⇒ ⇒ 不重复建 ✓。
  */
 async open(doc:DocumentRecord,file:F):Promise<'opened'|'focused'>{
  const status=await this.ports.open(doc,file);
  if(status==='opened')this.contexts.open(doc.id,this.ports.identity(file),doc.revision);
  return status;
 }

 /**
  * **这个文件是不是已经绑在某个文档上** ✓ ⇒ ⇒ 变了没有也一并答 ✓（§5.2 ✓）。
  *
  * **文件身份优先** ✓ ⇒ ⇒ 命中的既有标签页聚焦 ✓ ⇒ ⇒ 不新建、不覆盖 ✓（§5.3 ✓）。
  */
 async bound(file:F):Promise<BoundSelection|undefined>{
  const documentId=this.ports.boundDocument(this.ports.identity(file).fileIdentity);
  if(documentId===undefined)return undefined;
  const context=this.contexts.read(documentId);
  if(context===undefined)return undefined;
  try{return {documentId,changed:!(await this.ports.sameVersion(context.identity.key))}}
  catch{
   // **答不了 ⇒ ⇒ 交给用户决定** ✓ ⇒ ⇒ 不当成"没变" ✓ ⇒ ⇒ 不静默覆盖 ✓（§5.2 ✓）。
   return {documentId,changed:true};
  }
 }
}
