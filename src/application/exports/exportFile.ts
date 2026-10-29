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
 base=Array.from(base).slice(0,120).join('').replace(/[. ]+$/g,'')||'MarkFlow-Document';
 if(/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(base))base='_'+base;
 const {extension,mime}=formats[format];return {baseName:base,name:base+extension,extension,mime};
}
