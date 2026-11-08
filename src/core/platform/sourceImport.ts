import {SourceImport,type BoundSelection,type ImportFile} from '../../application/workspace/sourceImport';
import type {DocumentRecord} from '../model/document';
import {createNewDocument,extractPayloadFromHtml} from '../storage/storage';
import {verifyAssets} from '../export/documentAssets';
import {sha256Hex} from './crypto';

/**
 * **批次里与平台无关的那一半** ✓：载荷解出 ✓、草稿构造 ✓、资产校验 ✓、内容键 ✓。
 *
 * **一处实现** ✓ ⇒ ⇒ Web 端与桌面端不会各写一遍 ✓ ⇒ ⇒ 行为不会分叉 ✓。
 * **平台只给三样** ✓ ⇒ ⇒ 读什么 ✓、是不是已绑 ✓、放不放授权 ✓（§5.1 ✓）。
 */
export interface SourceImportPlatform<F extends ImportFile>{
 /** 读一份文件 ✓。 */
 read(file:F):Promise<string>;
 /** 这个文件是不是已经绑在某个文档上 ✓ ⇒ ⇒ 命中就是聚焦 ✓（§5.2 ✓）。 */
 boundSelection(file:F):Promise<BoundSelection|undefined>;
 /** 释放这一项的授权 ✓ ⇒ ⇒ 没采用的授权不留着 ✓（M4-5 ✓）。 */
 release(file:F):Promise<void>;
}

/**
 * 造一个批次 ✓：**平台相关的只有三样** ✓ ⇒ ⇒ 其余的共用一份 ✓。
 *
 * **打开的那一份由调用方给** ✓ ⇒ ⇒ 打开与绑定是同一件事的两面 ✓ ⇒ ⇒ 不会漏 ✓。
 */
export function createSourceImport<F extends ImportFile>(
 platform:SourceImportPlatform<F>,
 open:(doc:DocumentRecord,file:F)=>Promise<'opened'|'focused'>,
):SourceImport<F>{
 return new SourceImport<F>({
  read:platform.read,
  boundSelection:platform.boundSelection,
  release:platform.release,
  decodeHtml:extractPayloadFromHtml,
  createMarkdown:(name,content)=>{
   const doc=createNewDocument(name.replace(/\.[^/.]+$/,''));
   return {...doc,markdown:content,meta:{...doc.meta,author:'Imported'}};
  },
  verify:doc=>verifyAssets(doc.assets),
  markdownKey:async(name,content)=>name+'\0'+await sha256Hex(new TextEncoder().encode(content)),
  open,
 });
}
