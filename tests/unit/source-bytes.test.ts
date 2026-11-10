import {describe, expect, it, vi} from 'vitest';
import {SourceBytes, type SourceBytesPorts} from '../../src/application/workspace/sourceBytes';
import {createNewDocument} from '../../src/core/storage/storage';
import type {DocumentRecord} from '../../src/core/model/document';

/**
 * 待写字节从哪来 ✓（设计 §6.1 ✓、§15 的 Q3 ✓）。
 *
 * **写入内容随源格式而异** ✓ ⇒ ⇒ 这一处是唯一的选择点 ✓ ⇒ ⇒ 写回与另存为共用它 ✓。
 */

const document = (markdown: string): DocumentRecord => ({
  ...createNewDocument('报告'),
  markdown,
});

function setup(editable: string = '<html><script id="markflow-source-payload"></script></html>') {
  const editableHtml = vi.fn(async (_doc: DocumentRecord) => editable);
  const ports: SourceBytesPorts = {editableHtml};
  return {bytes: new SourceBytes(ports), editableHtml};
}

describe('待写字节', () => {
  it('Markdown 文档写的是它自己的字节，不是渲染结果', async () => {
    const {bytes, editableHtml} = setup();
    const doc = document('# 标题\n\n正文。');
    const written = await bytes.bytesFor(doc, 'markdown');
    // **源快照** ✓ ⇒ ⇒ 逐字节就是那份 Markdown ✓ ⇒ ⇒ 不是渲染出来的 HTML ✓（M5-1 ✓）。
    expect(written).toEqual(new TextEncoder().encode(doc.markdown));
    // **Markdown 那一路不碰渲染** ✓ ⇒ ⇒ 宿主那一份没被问 ✓。
    expect(editableHtml).not.toHaveBeenCalled();
  });

  it('可编辑 HTML 文档写的是宿主给的那一份源载荷', async () => {
    const {bytes, editableHtml} = setup();
    const doc = document('# 标题\n\n正文。');
    const written = await bytes.bytesFor(doc, 'editable-html');
    // **走导出侧那条源载荷路径** ✓ ⇒ ⇒ 宿主被问了 ✓ ⇒ ⇒ 问的是这一份文档 ✓（Q3 ✓）。
    expect(editableHtml).toHaveBeenCalledTimes(1);
    expect(editableHtml).toHaveBeenCalledWith(doc);
    // **写的是那一份** ✓ ⇒ ⇒ 不是拿 Markdown 覆盖 ✓（§6.1 ✓）。
    expect(written).toEqual(
      new TextEncoder().encode('<html><script id="markflow-source-payload"></script></html>'),
    );
    expect(written).not.toEqual(new TextEncoder().encode(doc.markdown));
  });

  it('写出去的字节是那一段的 UTF-8，没有 BOM', async () => {
    const {bytes} = setup();
    const doc = document('中文标题');
    const written = await bytes.bytesFor(doc, 'markdown');
    // **无 BOM** ✓ ⇒ ⇒ 三个 BOM 字节不在开头 ✓ ⇒ ⇒ 文件里没有多出来的东西 ✓（§6.1 ✓）。
    expect(written[0]).not.toBe(0xef);
    expect(written).toEqual(new TextEncoder().encode('中文标题'));
    expect(written.length).toBe(new TextEncoder().encode('中文标题').length);
  });

  it('同一份文档取两次，字节一样', async () => {
    const {bytes} = setup();
    const doc = document('# 标题');
    const first = await bytes.bytesFor(doc, 'markdown');
    const second = await bytes.bytesFor(doc, 'markdown');
    // **源快照** ✓ ⇒ ⇒ 两次取到的是同一份 ✓ ⇒ ⇒ 草稿与文件不会差一个按键 ✓（§6.1 ✓）。
    expect(second).toEqual(first);
  });
});
