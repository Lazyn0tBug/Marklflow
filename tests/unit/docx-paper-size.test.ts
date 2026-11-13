import {it, expect} from 'vitest';
import JSZip from 'jszip';
import {exportDocumentToDocx} from '../../src/core/export/docxExporter';
import {htmlArtifact} from './export-fixtures';

it('writes the document paper size into the DOCX page setup', async () => {
  /** A3 = 297×420mm ⇒ 1mm = 1440/25.4 twips ⇒ 16838 × 23811 ✓。 */
  const base = htmlArtifact('<p>页面尺寸</p>');
  const a3 = {
    ...base,
    presentation: {...base.presentation, page: {...base.presentation.page, size: 'A3' as const}},
  };
  const blob = await exportDocumentToDocx(a3);
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const xml = await zip.file('word/document.xml')!.async('string');
  expect(xml).toContain('w:w="16838"');
  expect(xml).toContain('w:h="23811"');
});
