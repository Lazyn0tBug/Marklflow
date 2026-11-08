import type {DocumentRecord} from '../../core/model/document';
import type {BoundSelection,ImportFile,OpenResult} from './sourceImport';
import type {DocumentFileContexts,FileIdentityBinding} from './documentFileContext';

/**
 * **打开一个本地文件** ✓：打开与绑定是同一件事 ✓（设计 §4.3 ✓）。
 *
 * **它住在应用层** ✓ ⇒ ⇒ 规则能被单测盯住 ✓ ⇒ ⇒ 不必起浏览器、不必开桌面外壳 ✓。
 * **宿主只给端口** ✓ ⇒ ⇒ 平台差异留在平台那一侧 ✓ ⇒ ⇒ 这里只有规则 ✓。
 */
export interface DocumentOpenPorts<F extends ImportFile>{
 /** 打开这份载荷 ✓ ⇒ ⇒ 聚焦时把工作区里那一份也给出来 ✓。 */
 open(doc:DocumentRecord,file:F):Promise<OpenResult>;
 /** 从选择结果里取出身份 ✓（文件身份、授权 key、文件名、载荷类型 ✓）。 */
 identity(file:F):FileIdentityBinding;
 /** 这个身份绑在哪个文档上 ✓ ⇒ ⇒ 没有就是 undefined ✓。 */
 boundDocument(fileIdentity:string):string|undefined;
 /**
  * 磁盘上那份还是不是应用手上那一版 ✓ ⇒ ⇒ **答不了就抛** ✓
  * ⇒ ⇒ 这里按"变了"处理 ✓ ⇒ ⇒ 交给用户决定 ✓（§5.2 ✓）。
  */
 sameVersion(key:string):Promise<boolean>;
 /** 放掉这一次的授权 ✓ ⇒ ⇒ 它没有成为绑定的凭据时才放 ✓（§5.1 三类 key ✓）。 */
 releaseHandle(key:string):Promise<void>;
}

export class DocumentOpener<F extends ImportFile>{
 constructor(private readonly contexts:DocumentFileContexts,private readonly ports:DocumentOpenPorts<F>){}

 /**
  * **打开** ✓ ⇒ ⇒ **绑定就位** ✓ ⇒ ⇒ 聚焦已有内容的那一次同样绑定 ✓（§4.3 open ✓）。
  *
  * **基线按内容定** ✓（§2.3 ✓）：草稿与文件当前内容相同 ⇒ `lastSyncedRevision = 草稿修订` ✓
  * ⇒ ⇒ 已同步 ✓；不同 ⇒ `null` ⇒ ⇒ 按未同步显示 ✓。
  *
  * **不读盘覆盖草稿** ✓ ⇒ ⇒ 草稿一个字不动 ✓（§5.5 ✓）。
  */
 async open(doc:DocumentRecord,file:F):Promise<OpenResult>{
  const result=await this.ports.open(doc,file);
  const identity=this.ports.identity(file);
  // **归属命中时那份内容已经在工作区里** ✓ ⇒ ⇒ 绑定指回它 ✓ ⇒ ⇒ 换用这次的句柄 ✓。
  const existing=result.existing;
  const same=existing!==undefined&&sameSource(existing.markdown,doc.markdown);
  // **基线** ✓：新的一份内容就是文件当前的内容 ⇒ 它的修订 ✓；命中已有内容 ⇒ 按内容是否相同定 ✓（§2.3 ✓）。
  const baseline=result.status==='opened'?doc.revision:(same&&existing?existing.revision:null);
  const outcome=this.contexts.open(doc.id,identity,baseline);
  if(outcome.kind==='already-bound'){
   // **这一次的授权没有成为绑定的凭据** ✓ ⇒ ⇒ 放掉 ✓ ⇒ ⇒ 原生侧不留无主的凭据 ✓（§5.1 ✓）。
   await this.ports.releaseHandle(identity.key).catch(()=>{});
  }
  return result;
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

/**
 * 两份内容是不是同一份 ✓。
 *
 * **换行风格先归一** ✓ ⇒ ⇒ 编辑器的值是 LF ✓ ⇒ ⇒ CRLF 的文件不会平白判成"不同" ✓。
 */
function sameSource(left:string,right:string):boolean{
 return normalize(left)===normalize(right);
}
function normalize(text:string):string{return text.replace(/\r\n/g,'\n')}
