import {expect,it} from 'vitest';
import {documentStyle,DOCUMENT_CSS} from '../../src/core/render/documentPresentation';
import {generateExportHtml} from '../../src/core/export/htmlExporter';
import {createNewDocument} from '../../src/core/storage/storage';
it('shares document CSS and validates theme independently from app settings',()=>{
 const doc=createNewDocument('共享');doc.markdown='# 文档\n\n| a | b |\n| :-- | --: |\n| 1 | 2 |';
 const html=generateExportHtml(doc);expect(html).toContain(DOCUMENT_CSS);expect(html).not.toContain('dark:');expect(html).not.toContain('oklch(');expect(html).toContain('mf-doc');
 expect(documentStyle(doc.theme)['--mf-size']).toBe(doc.theme.fontSize+'px');
 expect(()=>generateExportHtml({...doc,theme:{...doc.theme,primaryColor:'red;display:none'}})).toThrow();
});

it('exports approved layout semantics without workspace width settings',()=>{
 const doc=createNewDocument('布局');doc.markdown='<div class="mf-columns"><section><p>左</p></section><section><p>右</p></section></div>';
 const html=generateExportHtml(doc);
 expect(html).toContain('mf-columns');expect(html).toContain('container-name:mf-document');
 expect(html).not.toContain('contentMaxWidth');expect(html).not.toContain('1024px');
});
