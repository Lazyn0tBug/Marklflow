import {expect, it} from 'vitest';
import {deriveDocumentTitle} from '../../src/core/model/document';
import {documentSchema, DOCUMENT_TITLE_MAX} from '../../src/core/model/documentSchema';
import {createNewDocument} from '../../src/core/storage/storage';

it('derives a document title that fits the stored schema', () => {
  expect(deriveDocumentTitle('# 标题\n正文')).toBe('标题');
  expect(deriveDocumentTitle('正文')).toBe(null);
  const long = '# ' + 'x'.repeat(DOCUMENT_TITLE_MAX + 50);
  expect(deriveDocumentTitle(long)).toHaveLength(DOCUMENT_TITLE_MAX);
  const doc = createNewDocument('t');
  expect(() =>
    documentSchema.parse({...doc, meta: {...doc.meta, title: deriveDocumentTitle(long)!}}),
  ).not.toThrow();
});
it('keeps fields it does not model instead of stripping them', () => {
  const doc = createNewDocument('t');
  const parsed = documentSchema.parse({
    ...doc,
    meta: {...doc.meta, license: 'CC-BY-4.0'},
    wordCount: 42,
  });
  expect((parsed.meta as Record<string, unknown>).license).toBe('CC-BY-4.0');
  expect((parsed as Record<string, unknown>).wordCount).toBe(42);
  expect(JSON.stringify(parsed)).toContain('wordCount');
});
