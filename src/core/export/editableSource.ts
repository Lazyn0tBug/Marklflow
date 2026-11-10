import type {DocumentRecord} from '../model/document';
import {prepareExportContent} from './exportContent';
import {encodeEditableSource} from './sourceAttachment';
import {generateExportHtml} from './htmlExporter';

/**
 * **可编辑 HTML 的那一份** ✓（设计 §6.1 ✓、§15 的 Q3 ✓）。
 *
 * **沿用导出侧的源载荷生成路径** ✓ ⇒ ⇒ 与导出那份**同一套** ✓ ⇒ ⇒ 形状不会分叉 ✓。
 * **产出的是一个装着源载荷的 HTML** ✓ ⇒ ⇒ 再打开它仍能解出载荷 ✓
 * ⇒ ⇒ **原位保存不毁掉那个文件** ✓ ⇒ ⇒ 载荷里是冻结的那一份 ✓。
 *
 * **不是渲染结果本身** ✓ ⇒ ⇒ 载荷才是源快照 ✓ ⇒ ⇒ 草稿与文件不会差一个按键 ✓（§6.1 ✓）。
 */
export async function editableHtmlSource(doc: DocumentRecord): Promise<string> {
  const artifact = await prepareExportContent(doc);
  const payload = await encodeEditableSource(doc, artifact);
  return generateExportHtml(artifact, {editablePayload: payload});
}
