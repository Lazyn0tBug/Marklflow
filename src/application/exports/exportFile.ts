import filenamify from 'filenamify/browser';
export type ExportFormat='editable-html'|'reading-html'|'docx'|'print-pdf'|'markdown'|'markdown-bundle';
export interface ExportFile {name:string;baseName:string;extension:string;mime:string}
const formats:Record<ExportFormat,{extension:string;mime:string}>={
 'editable-html':{extension:'.markflow.html',mime:'text/html'},'reading-html':{extension:'.html',mime:'text/html'},
 docx:{extension:'.docx',mime:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'},
 'print-pdf':{extension:'.pdf',mime:'application/pdf'},markdown:{extension:'.md',mime:'text/markdown'},'markdown-bundle':{extension:'.zip',mime:'application/zip'},
};
const fallback='MarkFlow-Document';
const suffix=/\.(?:markflow\.html|html|pdf|docx|md|zip)$/i;
const cleaning={replacement:'_',maxLength:Number.POSITIVE_INFINITY};
const encoder=new TextEncoder();
let segmenter:Intl.Segmenter|undefined;
function stripOutputSuffixes(input:string):string{
 let base=input.trim().replace(/[. ]+$/g,'');
 while(suffix.test(base))base=base.replace(suffix,'').trim().replace(/[. ]+$/g,'');
 return base;
}
function cleanBase(input:string):string{
 const base=stripOutputSuffixes(input);
 return base?stripOutputSuffixes(filenamify(base,cleaning))||fallback:fallback;
}
/** The library cleans names; this product policy budgets UTF-8 bytes, not UTF-16 units. */
function fitUtf8(input:string,budget:number):string{
 segmenter??=new Intl.Segmenter(undefined,{granularity:'grapheme'});
 let result='',bytes=0;
 for(const {segment}of segmenter.segment(input)){
  const size=encoder.encode(segment).length;if(bytes+size>budget)break;
  result+=segment;bytes+=size;
 }
 return result;
}
/** One portable suggestion for downloads, save pickers and the native PDF job title. */
export function exportFile(input:string,format:ExportFormat):ExportFile{
 const {extension,mime}=formats[format],budget=255-encoder.encode(extension).length;
 // Re-clean a bounded prefix: truncation can expose a device stem or output suffix.
 const baseName=cleanBase(fitUtf8(cleanBase(input),budget));
 return {baseName,name:baseName+extension,extension,mime};
}
