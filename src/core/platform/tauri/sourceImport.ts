import {createSourceImport} from '../sourceImport';
import type {BoundSelection} from '../../../application/workspace/sourceImport';
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

export function createNativeSourceImport(
 platform:NativeSourceImportPlatform,
 open:(doc:DocumentRecord,file:NativeSelection)=>Promise<'opened'|'focused'>,
){
 return createSourceImport<NativeSelection>({
  read:file=>readNativeText(file),
  boundSelection:platform.boundSelection,
  release:file=>releaseNativeFile(file.key),
 },open);
}
