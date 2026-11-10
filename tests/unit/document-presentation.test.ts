import {prepareExportContent} from '../../src/core/export/exportContent';
import {expect, it} from 'vitest';
import {documentStyle, DOCUMENT_CSS} from '../../src/core/render/documentPresentation';
import {generateExportHtml} from '../../src/core/export/htmlExporter';
import {createNewDocument} from '../../src/core/storage/storage';
import {parse, walk} from 'css-tree';
/**
 * CSS 里声明过的**容器名** ✓：**按语义问，不按字面问** ✓。
 *
 * **字面匹配会随排版碎掉** ✓ ⇒ ⇒ 那是断言问错了问题 ✓ ⇒ ⇒ 这里解析 CSS ✓ ⇒ ⇒ 取声明的值 ✓ ⇒ ⇒ 排版怎么变都不影响 ✓。
 */
function declaredContainerNames(css: string): string[] {
  const names: string[] = [];
  walk(parse(css), (node) => {
    if (node.type !== 'Declaration' || node.property !== 'container-name') return;
    if (node.value.type !== 'Value') return;
    const first = node.value.children.first;
    if (first?.type !== 'Identifier') return;
    names.push(first.name);
  });
  return names;
}
it('shares document CSS and validates theme independently from app settings', async () => {
  const doc = createNewDocument('共享');
  doc.markdown = '# 文档\n\n| a | b |\n| :-- | --: |\n| 1 | 2 |';
  const html = await generateExportHtml(await prepareExportContent(doc));
  expect(html).toContain(DOCUMENT_CSS);
  expect(html).not.toContain('dark:');
  expect(html).not.toContain('oklch(');
  expect(html).toContain('mf-doc');
  expect(documentStyle(doc.theme)['--mf-size']).toBe(doc.theme.fontSize + 'px');
  await expect(
    prepareExportContent({...doc, theme: {...doc.theme, primaryColor: 'red;display:none'}}),
  ).rejects.toThrow();
});

it('exports approved layout semantics without workspace width settings', async () => {
  const doc = createNewDocument('布局');
  doc.markdown =
    '<div class="mf-columns"><section><p>左</p></section><section><p>右</p></section></div>';
  const html = await generateExportHtml(await prepareExportContent(doc));
  expect(html).toContain('mf-columns');
  // **文档自己声明容器名** ✓ ⇒ ⇒ 问声明的值 ✓ ⇒ ⇒ 不问字面 ✓。
  expect(declaredContainerNames(DOCUMENT_CSS)).toContain('mf-document');
  expect(html).not.toContain('contentMaxWidth');
  expect(html).not.toContain('1024px');
});
