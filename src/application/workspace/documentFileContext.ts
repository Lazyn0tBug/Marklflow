/**
 * 文档与磁盘的关系 ✓：**一份上下文** ✓（设计 §4.1 ✓）。
 *
 * **三个面** ✓：绑定（identity ✓）／ 一致性（sync ✓）／ 资源（resources ✓）
 * ⇒ ⇒ 上下文是一次转移带来的字段变化 ✓ ⇒ ⇒ 不是一袋字段 ✓。
 *
 * **它不进文档** ✓ ⇒ ⇒ 文档记录会作为载荷外传 ✓ ⇒ ⇒ 本机路径不跟着走 ✓（§4.2 ✓）。
 * **它不落盘** ✓ ⇒ ⇒ 重启后绑定不恢复 ✓ ⇒ ⇒ 身份也随之作废 ✓（§3.3 ✓）。
 *
 * **上下文里没有摘要** ✓ ⇒ ⇒ 磁盘上是什么由原生侧回答 ✓（§3.4 ✓）
 * ⇒ ⇒ 少一份会漂的副本 ✓ ⇒ ⇒ 少一次误判 ✓。
 */

/** 绑定 ✓（identity 面 ✓）：这个文档对应磁盘上的哪个文件 ✓。 */
export interface FileIdentityBinding{
 /** 会话内文件身份 ✓：原生侧给的随机 token ✓ ⇒ ⇒ 同一文件同一个 ✓ ⇒ ⇒ 路径不参与 ✓。 */
 fileIdentity:string;
 /** 原生授权 key ✓ ⇒ ⇒ 读与写都用它 ✓ ⇒ ⇒ 前端拿它反推不出路径 ✓。 */
 key:string;
 /** 文件名 ✓：原生侧给的 ✓ ⇒ ⇒ 只用于展示 ✓。 */
 displayName:string;
 /** 人类可读的定位串 ✓：**可选** ✓ ⇒ ⇒ 只是展示 ✓ ⇒ ⇒ 不作标识 ✓ ⇒ ⇒ 不用于寻址 ✓。 */
 displayPath?:string;
 /** 这个文件按哪种载荷读进来的 ✓ ⇒ ⇒ 界面据此决定标题区怎么写 ✓。 */
 sourceFormat:'markdown'|'editable-html';
}

/** 一致性 ✓（sync 面 ✓）：草稿与文件差多少 ✓。 */
export interface SyncState{
 /**
  * 上次同步到文件时的文档修订 ✓。
  *
  * **null = 无法证明一致** ✓ ⇒ ⇒ 按未同步显示 ✓（§2.3 ✓、§4.3 re-associate ✓）。
  */
 lastSyncedRevision:number|null;
 /** 冲突 ✓：文件在应用外被改过 ✓ ⇒ ⇒ 只有这一种 ✓ ⇒ ⇒ 解法在 M5 ✓。 */
 conflict:null|{kind:'diverged'};
}

/** 上下文 ✓：一个文档与磁盘的关系 ✓。 */
export interface DocumentFileContext{
 /** 这个上下文属于哪个文档 ✓。 */
 documentId:string;
 /** 绑定面 ✓。 */
 identity:FileIdentityBinding;
 /** 一致性面 ✓。 */
 sync:SyncState;
 /** 资源面 ✓：M6 才填内容 ✓ ⇒ ⇒ 这一版只有"没有"这一种 ✓。 */
 resources:{snapshot:null};
}

/**
 * 界面读的那一个状态 ✓（§2.2 ✓、§8.6 ✓）。
 *
 * **"同步失败"这一态还没有** ✓ ⇒ ⇒ 它来自 M5 的同步转移 ✓ ⇒ ⇒ 出了那次转移才有 ✓
 * ⇒ ⇒ 这一版只表达得出来三种 ✓。
 */
export type SyncStatus='none'|'synced'|'unsynced';

/** 打开的结果 ✓：要么新绑定 ✓，要么这个身份已经绑在别处 ✓。 */
export type OpenOutcome=
 |{kind:'bound';context:DocumentFileContext}
 |{kind:'already-bound';documentId:string};

/**
 * 上下文与它的转移 ✓（设计 §4.1、§4.3 ✓）。
 *
 * **它是会话内状态** ✓ ⇒ ⇒ 不进文档 ✓ ⇒ ⇒ 不落盘 ✓。
 * **一个事实一处存放** ✓ ⇒ ⇒ 身份到文档的索引也在这里 ✓ ⇒ ⇒ 别处不再存一份 ✓。
 */
export class DocumentFileContexts{
 private readonly byDocument=new Map<string,DocumentFileContext>();
 /** 身份 → 文档 ✓：聚焦靠它 ✓（§5.2 ✓、§5.3 文件身份优先 ✓）。 */
 private readonly byIdentity=new Map<string,string>();

 /** 这个上下文 ✓。 */
 read(documentId:string):DocumentFileContext|undefined{return this.byDocument.get(documentId)}

 /** 这个身份绑在哪个文档上 ✓ ⇒ ⇒ 没有就是 undefined ✓。 */
 documentFor(fileIdentity:string):string|undefined{return this.byIdentity.get(fileIdentity)}

 /** 现在绑着的上下文 ✓。 */
 list():readonly DocumentFileContext[]{return [...this.byDocument.values()]}

 /**
  * **打开** ✓（§4.3 open ✓）。
  *
  * **读**：选择结果 ✓、文档当前修订 ✓。
  * **写**：绑定就位 ✓、`lastSyncedRevision = revision` ✓、`resources.snapshot = null` ✓。
  * **不变量**：**打开不同步** ✓ ⇒ ⇒ 不读盘覆盖草稿 ✓。
  *
  * **基线由调用方给** ✓ ⇒ ⇒ 新建时给修订 ✓ ⇒ ⇒ 命中已有内容时按内容是否相同给修订或 null ✓（§2.3 ✓）。
  *
  * **同一身份已绑在这个文档上 ⇒ ⇒ 重新绑定** ✓ ⇒ ⇒ 换用这次的句柄 ✓。
  * **绑在别的文档上 ⇒ ⇒ 不抢** ✓ ⇒ ⇒ 交回去让调用方聚焦那个标签页 ✓。
  */
 open(documentId:string,identity:FileIdentityBinding,revision:number|null):OpenOutcome{
  const existing=this.byIdentity.get(identity.fileIdentity);
  if(existing!==undefined&&existing!==documentId)return {kind:'already-bound',documentId:existing};
  const context:DocumentFileContext={documentId,identity,sync:{lastSyncedRevision:revision,conflict:null},resources:{snapshot:null}};
  this.byDocument.set(documentId,context);
  this.byIdentity.set(identity.fileIdentity,documentId);
  return {kind:'bound',context};
 }

 /**
  * **重新关联** ✓（§4.3 re-associate ✓、§5.5 ✓）。
  *
  * **读**：选择结果 ✓。
  * **写**：identity 更新 ✓、`lastSyncedRevision = null` ✓（无法证明与某个修订一致 ✓）。
  * **不变量**：**不读盘覆盖草稿** ✓ ⇒ ⇒ 关联不算同步 ✓ ⇒ ⇒ 按未同步显示 ✓。
  */
 reAssociate(documentId:string,identity:FileIdentityBinding):DocumentFileContext{
  const previous=this.byDocument.get(documentId);
  if(previous!==undefined)this.byIdentity.delete(previous.identity.fileIdentity);
  const context:DocumentFileContext={documentId,identity,sync:{lastSyncedRevision:null,conflict:null},resources:{snapshot:null}};
  this.byDocument.set(documentId,context);
  this.byIdentity.set(identity.fileIdentity,documentId);
  return context;
 }

 /**
  * **关掉** ✓：上下文连同它的身份索引一起收走 ✓。
  *
  * **返回绑定** ✓ ⇒ ⇒ 调用方拿它去释放授权 ✓ ⇒ ⇒ 释放这一步在应用层编排 ✓（§14 ✓）。
  */
 release(documentId:string):FileIdentityBinding|undefined{
  const context=this.byDocument.get(documentId);
  if(context===undefined)return undefined;
  this.byDocument.delete(documentId);
  this.byIdentity.delete(context.identity.fileIdentity);
  return context.identity;
 }
}

/**
 * **关掉文档 ⇒ ⇒ 授权也释放** ✓（M4-8 ✓）。
 *
 * **为什么在这里** ✓：关闭标签页是应用层的事 ✓ ⇒ ⇒ 原生授权由应用层释放 ✓
 * ⇒ ⇒ 这条规则有一处 ✓ ⇒ ⇒ 能被单测盯住 ✓（不必起浏览器 ✓）。
 */
export async function releaseDocumentFileContext(
 contexts:DocumentFileContexts,
 documentId:string,
 releaseGrant:(key:string)=>Promise<void>,
):Promise<void>{
 const binding=contexts.release(documentId);
 if(binding===undefined)return;
 await releaseGrant(binding.key);
}

/**
 * 界面读的那一个状态 ✓（§2.2 ✓、§8.6 ✓）。
 *
 * **界面不自己判断** ✓ ⇒ ⇒ 只读这里派生出来的 ✓ ⇒ ⇒ 各处不各判一遍 ✓。
 *
 * **未同步的判定** ✓：当前修订 ≠ `lastSyncedRevision` ✓（§2.3 ✓）
 * ⇒ ⇒ 与会话里那份 `dirty` 同形 ✓ ⇒ ⇒ 不另造第二套"脏"语义 ✓。
 */
export function syncStatus(context:DocumentFileContext|undefined,revision:number):SyncStatus{
 if(context===undefined)return 'none';
 if(context.sync.lastSyncedRevision===null)return 'unsynced';
 return context.sync.lastSyncedRevision===revision?'synced':'unsynced';
}
