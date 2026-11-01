// @vitest-environment node
import {it,expect} from 'vitest';
import {deflateSync} from 'node:zlib';
import {reportPdfStructure,reportPdfText,reportPdf} from '../../scripts/check-pdf-file';

/**
 * The PDF check reports what can be read from the file and leaves the rest undecided: a page count
 * and a page size are facts, while text inside a subset font is not readable as characters.
 */
const minimal=(streams:string[])=>{
 const objects:string[]=[
  '<</Type /Catalog /Pages 2 0 R>>',
  '<</Type /Pages /Kids [3 0 R] /Count 1>>',
  '<</Type /Page /MediaBox [0 0 595.92 842.88] /Parent 2 0 R>>',
 ];
 streams.forEach((body,index)=>objects.push('<</Length '+body.length+' /Filter /FlateDecode>>stream\n'+body+'\nendstream'));
 return Buffer.from('%PDF-1.4\n'+objects.map((body,index)=>(index+1)+' 0 obj\n'+body+'\nendobj\n').join('')+'trailer<</Root 1 0 R>>\n%%EOF\n','latin1');
};

it('counts the pages and reads the page box',()=>{
 const report=reportPdfStructure(minimal([]));
 expect(report.pages).toBe(1);
 expect(report.mediaBoxes).toEqual(['0 0 595.92 842.88']);
});

it('does not count the page tree as a page',()=>{
 const report=reportPdfStructure(minimal([]));
 expect(report.pages).toBe(1);
 expect(report.mediaBoxes).toHaveLength(1);
});

it('reads the text of a readable content stream',()=>{
 const stream=deflateSync(Buffer.from('BT /F1 12 Tf 72 700 Td (CJK_CHECK 中文) Tj ET','latin1'));
 const report=reportPdfText(minimal([stream.toString('latin1')]));
 expect(report.state).toBe('readable');
 expect(report.text).toContain('CJK_CHECK');
});

it('leaves the text undecided when no stream can be read',()=>{
 const report=reportPdfText(minimal([]));
 expect(report.text).toBeNull();
 expect(report.state).toBe('unreadable');
});

it('reports the structure and the text together',()=>{
 const stream=deflateSync(Buffer.from('(EXW0_FINAL_MARKER) Tj','latin1'));
 const report=reportPdf(minimal([stream.toString('latin1')]));
 expect(report.pages).toBe(1);
 expect(report.text).toContain('EXW0_FINAL_MARKER');
});
