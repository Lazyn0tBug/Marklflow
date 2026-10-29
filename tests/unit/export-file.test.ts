// @vitest-environment node
import {it,expect} from 'vitest';
import targets from '../fixtures/export-filename/f0-targets.json' with {type:'json'};
import {exportFile,type ExportFormat} from '../../src/application/exports/exportFile';
it('normalizes portable Unicode names and output suffixes across formats',()=>{
 for(const [input,expected] of [['  中文 方案  ','中文 方案'],['a.docx.docx','a'],['a.markflow.html.HTML','a'],['a.pdf.md','a'],['','MarkFlow-Document'],[' ... ','MarkFlow-Document'],['.pdf','MarkFlow-Document'],['a/b\\c:*?"<>|','a_b_c_'],['CON','CON_'],['nul.notes','nul_.notes'],['e\u0301','é']] as const){
  expect(exportFile(input,'docx')).toMatchObject({baseName:expected,name:expected+'.docx'});
 }
});
it('uses the target extension exactly once for every format',()=>{
 const extensions:Record<ExportFormat,string>={'editable-html':'.markflow.html','reading-html':'.html',docx:'.docx','print-pdf':'.pdf',markdown:'.md','markdown-bundle':'.zip'};
 for(const [format,extension]of Object.entries(extensions)){
  const file=exportFile('中文'+extension+extension,format as ExportFormat);expect(file.name).toBe('中文'+extension);expect(file.extension).toBe(extension);expect(file.mime).toContain('/');
 }
});
it('bounds suggestions without splitting complete graphemes or losing extensions',()=>{
 const file=exportFile('😀'.repeat(300),'editable-html');expect(file.baseName).toBe('😀'.repeat(60));expect(file.name.length).toBeLessThan(256);expect(file.name.endsWith('.markflow.html')).toBe(true);
});

it('keeps every Unicode filename within both UTF-8 and UTF-16 component budgets',()=>{
 const formats:ExportFormat[]=['editable-html','reading-html','docx','print-pdf','markdown','markdown-bundle'];
 for(const format of formats)for(const text of ['中文'.repeat(120),'😀'.repeat(120),'a'.repeat(300),'CON.'+'中文😀'.repeat(100)]){
  const file=exportFile(text,format);expect(new TextEncoder().encode(file.name).length).toBeLessThanOrEqual(255);expect(file.name.length).toBeLessThanOrEqual(255);expect(file.name.endsWith(file.extension)).toBe(true);expect(file.baseName).not.toContain('�');
 }
});

const targetFormats:readonly ExportFormat[]=['editable-html','reading-html','docx','print-pdf','markdown','markdown-bundle'];
for(const target of targets.cases)it('implements frozen target: '+target.id,()=>{
 const format=targetFormats.find(format=>format===target.format);if(!format)throw new Error('Unknown fixture format');
 expect(exportFile(target.input,format).name).toBe(target.expectedName);
});
it('keeps full repeated graphemes at each format byte boundary',()=>{
 for(const format of targetFormats)for(const cluster of ['🇨🇳','👨‍👩‍👧‍👦','👍🏽','x\u0308','q\u0308']){
  const normalized=cluster.normalize('NFC'),file=exportFile('a'+cluster.repeat(100),format),size=new TextEncoder().encode(normalized).length;
  const count=Math.floor((255-new TextEncoder().encode(file.extension).length-1)/size);
  expect(file.baseName).toBe('a'+normalized.repeat(count));expect(new TextEncoder().encode(file.name).length).toBeLessThanOrEqual(255);
 }
});
it('repairs names and known suffixes exposed by grapheme truncation',()=>{
 const huge='x'+'\u0308'.repeat(200);
 expect(exportFile('CON'+huge,'markdown').name).toBe('CON_.md');
 expect(exportFile('a'.repeat(249)+'.md'+huge,'markdown').name).toBe('a'.repeat(249)+'.md');
});
