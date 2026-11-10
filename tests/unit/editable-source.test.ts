import {expect, it} from 'vitest';
import {editableHtmlSource} from '../../src/core/export/editableSource';
import {extractPayloadFromHtml} from '../../src/core/storage/storage';
import {createNewDocument} from '../../src/core/storage/storage';
import type {DocumentRecord} from '../../src/core/model/document';

/**
 * 可编辑 HTML 的那一份 ✓（设计 §6.1 ✓、§15 的 Q3 ✓）。
 *
 * **沿用导出侧的源载荷生成路径** ✓ ⇒ ⇒ **再打开它仍能解出载荷** ✓
 * ⇒ ⇒ **原位保存不毁掉那个文件** ✓。
 */

const document = (markdown: string): DocumentRecord => ({
  ...createNewDocument('报告'),
  markdown,
});

it('产出的是一个装着源载荷的 HTML', async () => {
  const doc = document('# 标题\n\n正文。');
  const html = await editableHtmlSource(doc);
  // **源载荷在里面** ✓ ⇒ ⇒ 那不是渲染结果本身 ✓ ⇒ ⇒ 载荷才是源快照 ✓（§6.1 ✓）。
  expect(html).toContain('<script id="markflow-source-payload"');
});

it('再打开它，解出来的是这一份的正文', async () => {
  const doc = document('# 标题\n\n正文。');
  const html = await editableHtmlSource(doc);
  // **能解出来** ✓ ⇒ ⇒ **原位保存不毁掉那个文件** ✓ ⇒ ⇒ 归属还认得出来 ✓。
  const extracted = extractPayloadFromHtml(html);
  expect(extracted).not.toBeNull();
  expect(extracted!.markdown).toBe(doc.markdown);
});
