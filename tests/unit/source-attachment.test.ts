import {it,expect} from 'vitest';
import {encodeEditableSource} from '../../src/core/export/sourceAttachment';
import {createNewDocument,extractPayloadFromHtml} from '../../src/core/storage/storage';
import {sha256Hex} from '../../src/core/platform/crypto';
import {exportHtmlSchema} from '../../src/core/model/exportHtml';
import {htmlArtifact} from './export-fixtures';
it('preserves the accepted editable source and rejects a mismatched source attachment',async()=>{
 const doc=createNewDocument('Source');doc.markdown='# editable source';const input=htmlArtifact('<h1>HTML body</h1>',doc),artifact=exportHtmlSchema.parse({...input,source:{...input.source,mdHash:await sha256Hex(new TextEncoder().encode(doc.markdown))}});
 const payload=await encodeEditableSource(doc,artifact),restored=extractPayloadFromHtml('<script id="markflow-source-payload" type="application/json">'+payload+'</script>');expect(restored?.markdown).toBe(doc.markdown);
 await expect(encodeEditableSource({...doc,markdown:'changed'},artifact)).rejects.toThrow('不一致');
});
