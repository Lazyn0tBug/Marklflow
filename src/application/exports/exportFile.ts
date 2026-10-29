export type ExportFormat='editable-html'|'reading-html'|'docx'|'print-pdf'|'markdown'|'markdown-bundle';
export interface ExportFile {name:string;baseName:string;extension:string;mime:string}
const formats:Record<ExportFormat,{extension:string;mime:string}>={
 'editable-html':{extension:'.markflow.html',mime:'text/html'},'reading-html':{extension:'.html',mime:'text/html'},
 docx:{extension:'.docx',mime:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'},
 'print-pdf':{extension:'.pdf',mime:'application/pdf'},markdown:{extension:'.md',mime:'text/markdown'},'markdown-bundle':{extension:'.zip',mime:'application/zip'},
};
/** One portable suggestion for downloads, save pickers and the native PDF job title. */
export function exportFile(input:string,format:ExportFormat):ExportFile{
 let base=input.normalize('NFC').replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g,'_').trim().replace(/[. ]+$/g,'');
 // Remove recognized output suffixes repeatedly, including after changing formats.
 const suffix=/\.(?:markflow\.html|html|pdf|docx|md|zip)$/i;
 while(suffix.test(base))base=base.replace(suffix,'').trim().replace(/[. ]+$/g,'');
 const {extension,mime}=formats[format],encoder=new TextEncoder();
 // Keep a conservative UTF-8 component budget as well as the existing code-point cap.
 // Reserve one byte for a possible Windows device-name prefix.
 const budget=255-encoder.encode(extension).length-1;let bounded='',bytes=0,points=0;
 for(const point of base){const size=encoder.encode(point).length;if(points===120||bytes+size>budget)break;bounded+=point;bytes+=size;points++}
 base=bounded.replace(/[. ]+$/g,'')||'MarkFlow-Document';
 if(/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(base))base='_'+base;
 return {baseName:base,name:base+extension,extension,mime};
}
