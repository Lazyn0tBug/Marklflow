import {sharedDom} from '../../../src/core/platform/web/sharedDom';
import {webExportService} from '../../../src/core/platform/web/exportService';
import {createNewDocument} from '../../../src/core/storage/storage';
import {sha256Hex} from '../../../src/core/platform/crypto';
import {pdfName,pdfSource,rowMarkers,paragraphMarkers} from './web-native-pdf-source';
const output=document.querySelector<HTMLPreElement>('[data-state]')!;
const buttons=[...document.querySelectorAll<HTMLButtonElement>('button')];
let report:Record<string,unknown>={};
const show=(job=report)=>{if(job===report)output.textContent=JSON.stringify(job,null,2)};
const observeCleanup=(job:Record<string,unknown>,event:'afterprint'|'pagehide')=>queueMicrotask(()=>{
 job[event+'Observed']=true;job.remainingFrames=document.querySelectorAll('iframe[title="PDF导出文档"]').length;job.busy=webExportService.busy;show(job);
 // The print host is released after the spooler grace delay; observe the settled state separately.
 let attempts=0;
 const settle=()=>{const count=document.querySelectorAll('iframe[title="PDF导出文档"]').length;job.settledFrames=count;job.busy=webExportService.busy;show(job);
  if(count>0&&attempts<40){attempts++;setTimeout(settle,100)}};
 setTimeout(settle,100);
});
window.addEventListener('pagehide',()=>{observeCleanup(report,'pagehide')});
document.addEventListener('load',event=>{
 if(!(event.target instanceof HTMLIFrameElement)||event.target.title!=='PDF导出文档')return;
 const frame=event.target,doc=frame.contentDocument;if(!doc)return;
 const job=report,text=doc.body.textContent||'',html=doc.documentElement.outerHTML;
 // Experiment A: delay the real print request to tell readiness timing apart from host and rendering problems.
 const settle=Number(new URLSearchParams(location.search).get('settle')??0);
 if(settle>0&&frame.contentWindow){const native=frame.contentWindow.print.bind(frame.contentWindow);frame.contentWindow.print=()=>{job.settleMs=settle;show(job);setTimeout(()=>native(),settle)}}
 job.settleMs=settle;
 Object.assign(job,{jobTitle:doc.title,expectedPages:Number(doc.body.dataset.exportPages),actualPages:doc.querySelectorAll('.pagedjs_page').length,missingRows:rowMarkers.filter(marker=>!text.includes(marker)),missingParagraphs:paragraphMarkers.filter(marker=>!text.includes(marker)),finalMarker:text.includes('EXW0_FINAL_MARKER'),laterSourcePresent:text.includes('EXW0_LATER_SOURCE'),svgCount:doc.querySelectorAll('svg').length,imageCount:doc.querySelectorAll('img').length,links:[...doc.querySelectorAll('a[href]')].map(link=>link.getAttribute('href'))});show(job);
 void sha256Hex(new TextEncoder().encode(html)).then(hash=>{job.htmlSha256=hash;show(job)}).catch(error=>{job.observationError=String(error);show(job)});
 frame.contentWindow?.addEventListener('beforeprint',()=>{job.beforeprintObserved=true;job.exportBusyAtNativeCall=webExportService.busy;job.domAtNativeCall=sharedDom.snapshot();job.domStagesAtNativeCall=document.querySelectorAll('div.mf-pagination').length;
  // The state of the print host at the moment the print request leaves the browser.
  const rect=frame.getBoundingClientRect(),host=frame.contentDocument,page=host?.querySelector('.pagedjs_page');
  job.printHostState={rect:{x:Math.round(rect.x),y:Math.round(rect.y),width:Math.round(rect.width),height:Math.round(rect.height)},readyState:host?.readyState??'',innerWidth:frame.contentWindow?.innerWidth??0,innerHeight:frame.contentWindow?.innerHeight??0,pages:host?.querySelectorAll('.pagedjs_page').length??0,firstPage:page?{width:Math.round(page.getBoundingClientRect().width),height:Math.round(page.getBoundingClientRect().height)}:null,opacity:getComputedStyle(frame).opacity,visibility:getComputedStyle(frame).visibility,viewport:{width:window.innerWidth,height:window.innerHeight},visibilityState:document.visibilityState};
  // Experiment B: what inside the host may still be pending when the print request is made.
  job.printReadiness={incompleteImages:[...(host?.images??[])].filter(image=>!image.complete).length,imageCount:host?.images.length??0,fontsStatus:host?.fonts?.status??'',lazyImages:host?.querySelectorAll('[loading=lazy]').length??0,contentVisibility:host?.querySelectorAll('[style*="content-visibility"]').length??0,pagesWithSize:[...(host?.querySelectorAll('.pagedjs_page')??[])].filter(node=>node.getBoundingClientRect().height>0).length};
  show(job)},{once:true});
 frame.contentWindow?.addEventListener('afterprint',()=>{observeCleanup(job,'afterprint')},{once:true});
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
