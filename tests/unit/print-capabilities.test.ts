import {expect,it} from 'vitest';
import {printCss,withDeadline} from '../../src/core/export/documentPrint';
import {inspectDocx} from '../../src/core/export/outputCapabilities';
import {exportDocumentToDocx} from '../../src/core/export/docxExporter';
import {createNewDocument} from '../../src/core/storage/storage';
it('uses validated paper margins without clipping content',()=>{
 const doc=createNewDocument('纸张');doc.theme.margins={top:12,bottom:18,left:20,right:16};
 const css=printCss(doc);expect(css).toContain('12mm 16mm 18mm 20mm');expect(css).not.toContain('overflow:hidden');
});
it('does not silently claim editable or visual DOCX formulas',async()=>{
 const doc=createNewDocument('复杂输出');doc.markdown='公式 $x^2$\n\n<img src="x">';
 const report=inspectDocx(doc.markdown);expect(report.length).toBeGreaterThan(0);expect(report.every(i=>i.adaptation==='unsupported')).toBe(true);
 await expect(exportDocumentToDocx(doc)).rejects.toThrow('LaTeX');
});
it('reports readiness timeouts rather than successful output',async()=>{
 await expect(withDeadline(new Promise(()=>{}),'未就绪',5)).rejects.toThrow('未就绪');
});
