import type {DocumentRecord, SourceFormat} from '../../core/model/document';

/**
 * **待写字节从哪来** ✓（设计 §6.1 ✓）。
 *
 * **写入内容随源格式而异** ✓ ⇒ ⇒ **Markdown 文档写原始 Markdown 字节** ✓ ⇒ ⇒ 不写渲染结果 ✓；
 * **可编辑 HTML 文档写它的源载荷** ✓ ⇒ ⇒ 不拿 Markdown 覆盖 ✓。
 *
 * **这一处是"选哪一份"的唯一地方** ✓ ⇒ ⇒ 写回与另存为共用它 ✓ ⇒ ⇒ 两条路写出的形状不会分叉 ✓。
 *
 * **宿主只给"渲染"那一半** ✓ ⇒ ⇒ 应用层不碰 DOM ✓ ⇒ ⇒ 纯模块守得住 ✓。
 */
export interface SourceBytesPorts {
  /**
   * **可编辑 HTML 的那一份** ✓：**宿主给** ✓ ⇒ ⇒ 那一侧要走渲染 ✓。
   *
   * **沿用导出侧的源载荷生成路径** ✓（设计 §15 的 Q3 ✓）⇒ ⇒ **产出的是一个装着源载荷的 HTML** ✓
   * ⇒ ⇒ 再打开它仍能解出载荷 ✓ ⇒ ⇒ 原位保存不毁掉那个文件 ✓。
   */
  editableHtml(doc: DocumentRecord): Promise<string>;
}

/**
 * **一份文档按它的源格式，待写字节是什么** ✓（设计 §6.1 ✓）。
 *
 * **字节就是那一段的 UTF-8** ✓ ⇒ ⇒ **无 BOM** ✓ ⇒ ⇒ 换行是编辑器那份（LF）✓（§6.1 的已知限制 ✓）。
 */
export class SourceBytes {
  constructor(private readonly ports: SourceBytesPorts) {}

  /**
   * **这一份的待写字节** ✓ ⇒ ⇒ 一次保存写的就是它 ✓ ⇒ ⇒ 草稿与文件差一个按键这件事不会发生 ✓（§6.1 ✓）。
   */
  async bytesFor(doc: DocumentRecord, format: SourceFormat): Promise<Uint8Array> {
    const text = format === 'editable-html' ? await this.ports.editableHtml(doc) : doc.markdown;
    return new TextEncoder().encode(text);
  }
}
