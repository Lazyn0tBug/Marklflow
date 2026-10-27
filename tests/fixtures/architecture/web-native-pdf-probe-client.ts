import {webExportService} from '../../../src/core/platform/web/exportService';
import {createNewDocument} from '../../../src/core/storage/storage';
import {sha256Hex} from '../../../src/core/platform/crypto';
import {pdfName,pdfSource,rowMarkers,paragraphMarkers} from './web-native-pdf-source';
const output=document.querySelector<HTMLPreElement>('[data-state]')!;
const buttons=[...document.querySelectorAll<HTMLButtonElement>('button')];
let report:Record<string,unknown>={};
const show=()=>{output.textContent=JSON.stringify(report,null,2)};
document.addEventListener('load',event=>{
 if(!(event.target instanceof HTMLIFrameElement)||event.target.title!=='PDF导出文档')return;
 const frame=event.target,doc=frame.contentDocument;if(!doc)return;
 const text=doc.body.textContent||'',html=doc.documentElement.outerHTML;
 report={...report,jobTitle:doc.title,expectedPages:Number(doc.body.dataset.exportPages),actualPages:doc.querySelectorAll('.pagedjs_page').length,missingRows:rowMarkers.filter(marker=>!text.includes(marker)),missingParagraphs:paragraphMarkers.filter(marker=>!text.includes(marker)),finalMarker:text.includes('EXW0_FINAL_MARKER'),laterSourcePresent:text.includes('EXW0_LATER_SOURCE'),svgCount:doc.querySelectorAll('svg').length,imageCount:doc.querySelectorAll('img').length,links:[...doc.querySelectorAll('a[href]')].map(link=>link.getAttribute('href'))};show();
 void sha256Hex(new TextEncoder().encode(html)).then(hash=>{report.htmlSha256=hash;show()});
 frame.contentWindow?.addEventListener('afterprint',()=>{report.afterprintObserved=true;show()},{once:true});
},true);
for(const mode of ['mathml','svg'] as const)document.querySelector<HTMLButtonElement>('#'+mode)!.onclick=()=>{void run(mode)};
async function run(mathMode:'mathml'|'svg'){
 buttons.forEach(button=>{button.disabled=true});output.dataset.state='running';
 report={mathMode,saveObservedByApplication:false};show();
 try{
  const doc=createNewDocument(pdfName);doc.markdown=pdfSource;
  report.mdSha256=await sha256Hex(new TextEncoder().encode(doc.markdown));
  const running=webExportService.run({document:doc,format:'print-pdf',fileName:pdfName+' '+mathMode,mathMode,allowRemoteAssets:false});
  doc.markdown='# EXW0_LATER_SOURCE';doc.revision++; // Change the caller after acceptance, not the accepted snapshot.
  const result=await running;report.result=result;output.dataset.state='completed';
 }catch(error){report.error=String(error);output.dataset.state='error'}
 finally{report.busy=webExportService.busy;report.remainingFrames=document.querySelectorAll('iframe[title="PDF导出文档"]').length;buttons.forEach(button=>{button.disabled=false});show()}
}
