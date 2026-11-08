import {createSourceImport} from '../sourceImport';
import type {BoundSelection,OpenResult} from '../../../application/workspace/sourceImport';
import type {FileIdentityBinding} from '../../../application/workspace/documentFileContext';
import type {DocumentRecord} from '../../model/document';
import {readNativeText,releaseNativeFile,type NativeSelection} from './files';

/**
 * 桌面端那一半 ✓。
 *
 * **读走授权** ✓ ⇒ ⇒ 路径不出原生侧 ✓ ⇒ ⇒ 前端只拿得到 key ✓。
 * **释放也走授权** ✓ ⇒ ⇒ 没采用的授权不留着 ✓（M4-5 ✓）。
 * **"是不是已经绑在某个文档上"由应用侧答** ✓ ⇒ ⇒ 这里只给端口 ✓ ⇒ ⇒ 绑定只有一处 ✓。
 */
export interface NativeSourceImportPlatform{
 /** 这个文件是不是已经绑在某个文档上 ✓ ⇒ ⇒ 变了没有也一并答 ✓。 */
 boundSelection(file:NativeSelection):Promise<BoundSelection|undefined>;
}

/**
 * 从选择结果里取出身份 ✓：文件身份 ✓、授权 key ✓、文件名 ✓、载荷类型 ✓。
 *
 * **载荷类型看扩展名** ✓ ⇒ ⇒ 可编辑的 HTML 走 HTML 载荷路径 ✓ ⇒ ⇒ 不按 Markdown 导入 ✓（M4-2 ✓）。
 */
export function nativeFileIdentity(file:NativeSelection):FileIdentityBinding{
 return {
  fileIdentity:file.identity,
  key:file.key,
  displayName:file.name,
  sourceFormat:/\.html?$/i.test(file.name)?'editable-html':'markdown',
 };
}

export function createNativeSourceImport(
 platform:NativeSourceImportPlatform,
 open:(doc:DocumentRecord,file:NativeSelection)=>Promise<OpenResult>,
){
 return createSourceImport<NativeSelection>({
  read:file=>readNativeText(file),
  boundSelection:platform.boundSelection,
  release:file=>releaseNativeFile(file.key),
  // **归属按文件引用** ✓ ⇒ ⇒ 同一个文件恒对应同一份内容 ✓ ⇒ ⇒ 同名同内容也不合并 ✓
  // ⇒ ⇒ 两个文件两个文档 ✓（§5.1、§5.3 ✓）。
  fileReference:file=>file.identity,
 },open);
}
