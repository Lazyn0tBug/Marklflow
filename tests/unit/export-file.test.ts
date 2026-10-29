// @vitest-environment node
import {it,expect} from 'vitest';
import {exportFile,type ExportFormat} from '../../src/application/exports/exportFile';
it('normalizes portable Unicode names and output suffixes across formats',()=>{
 for(const [input,expected] of [['  中文 方案  ','中文 方案'],['a.docx.docx','a'],['a.markflow.html.HTML','a'],['a.pdf.md','a'],['','MarkFlow-Document'],[' ... ','MarkFlow-Document'],['.pdf','MarkFlow-Document'],['a/b\\c:*?"<>|','a_b_c_______'],['CON','_CON'],['nul.notes','_nul.notes'],['e\u0301','é']] as const){
  expect(exportFile(input,'docx')).toMatchObject({baseName:expected,name:expected+'.docx'});
 }
});
it('uses the target extension exactly once for every format',()=>{
 const extensions:Record<ExportFormat,string>={'editable-html':'.markflow.html','reading-html':'.html',docx:'.docx','print-pdf':'.pdf',markdown:'.md','markdown-bundle':'.zip'};
 for(const [format,extension]of Object.entries(extensions)){
  const file=exportFile('中文'+extension+extension,format as ExportFormat);expect(file.name).toBe('中文'+extension);expect(file.extension).toBe(extension);expect(file.mime).toContain('/');
 }
});
it('bounds suggestions without splitting Unicode code points or losing extensions',()=>{
 const file=exportFile('😀'.repeat(300),'editable-html');expect(file.baseName).toBe('😀'.repeat(120));expect(file.name.length).toBeLessThan(256);expect(file.name.endsWith('.markflow.html')).toBe(true);
});
