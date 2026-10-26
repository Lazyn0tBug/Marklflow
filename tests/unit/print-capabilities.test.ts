import {diagnosticArtifact} from './export-fixtures';
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
 const report=inspectDocx(diagnosticArtifact(doc.markdown));expect(report.length).toBeGreaterThan(0);expect(report.some(i=>i.adaptation==='static')).toBe(true);
 await expect(exportDocumentToDocx(diagnosticArtifact(doc.markdown))).rejects.toThrow('图片');
});
it('reports readiness timeouts rather than successful output',async()=>{
 await expect(withDeadline(new Promise(()=>{}),'未就绪',5)).rejects.toThrow('未就绪');
});

it('blocks unsupported raw MathML even when static reflow is accepted',async()=>{
 const doc=createNewDocument('MathML');doc.markdown='<math><mfrac><mn>1</mn><mn>2</mn></mfrac></math>';
 expect(inspectDocx(diagnosticArtifact(doc.markdown)).some(i=>i.adaptation==='unsupported')).toBe(true);
 await expect(exportDocumentToDocx(diagnosticArtifact(doc.markdown),{allowSourceFallback:true})).rejects.toThrow('MathML');
});

it('inspects boolean reversed lists without confusing arbitrary data-value attributes',()=>{
 expect(inspectDocx(diagnosticArtifact('<ol reversed><li>倒序</li></ol>')).some(i=>i.adaptation==='unsupported')).toBe(true);
 expect(inspectDocx(diagnosticArtifact('<div data-value="x">文本</div>')).some(i=>i.adaptation==='unsupported')).toBe(false);
});
