import { describe, expect, it } from 'vitest';
import capabilities from '../../docs/contracts/html-capabilities.json';
import { createNewDocument, encodeSourcePayload, extractPayloadFromHtml } from '../../src/core/storage/storage';
describe('HTML contract baseline', () => {
  it('declares separate target formats and does not claim verified support', () => {
    const ids = capabilities.features.map(f => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const feature of capabilities.features) {
      expect(feature.authorEntry.length).toBeGreaterThan(0);
      expect(Object.keys(feature.outputs)).toEqual(['html', 'print', 'docx']);
      for (const output of Object.values(feature.outputs)) expect(output.status).toBe('unverified');
    }
  });
  it('round-trips source characters including CRLF and emoji without executing payload', () => {
    const doc = createNewDocument('测试');
    doc.markdown = '# 中文🧪\r\n\r\n<script>bad()</script>';
    const restored = extractPayloadFromHtml(`<script id="markflow-source-payload" type="application/json">${encodeSourcePayload(doc)}</script>`);
    expect(restored?.markdown).toBe(doc.markdown);
    expect(restored?.theme).toEqual(doc.theme);
    expect(restored?.id).toBe(doc.id);
  });
});

it('reads payload attributes in any order and rejects ambiguous duplicate payloads',()=>{
 const doc=createNewDocument('属性');const payload='<script type="application/json" id="markflow-source-payload">'+encodeSourcePayload(doc)+'</script>';
 expect(extractPayloadFromHtml(payload)?.markdown).toBe(doc.markdown);expect(extractPayloadFromHtml(payload+payload)).toBeNull();
});
