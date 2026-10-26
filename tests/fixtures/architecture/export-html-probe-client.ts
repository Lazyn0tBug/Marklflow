import JSZip from 'jszip';
import {exportDocumentToDocx} from '../../../src/core/export/docxExporter';
import {generateExportHtml} from '../../../src/core/export/htmlExporter';
import {generatePdfHtml} from '../../../src/core/export/pdfExporter';
import {exportHtmlSchema} from '../../../src/core/model/exportHtml';
import {prepareExportContent} from '../../../src/core/export/exportContent';
import {createNewDocument} from '../../../src/core/storage/storage';
import {apiObject,apiPromise} from '../../../src/core/platform/externalApi';
import {sharedDom} from '../../../src/core/platform/web/sharedDom';
import corpus from '../export-source/corpus.json';
const output=document.querySelector('[data-state]');
void(async()=>{try{
 const engine=apiObject(window.MathJax,'MathJax'),startup=apiObject(engine.startup,'startup');await apiPromise(startup.promise,'startup');
 const baseline=startup.document,baselineInput=startup.input;
 const reports=[];
 for(const mathMode of ['mathml','svg'] as const){
  const doc=createNewDocument('HTML canonical');doc.markdown=corpus.render.markdown.replace(/\$\$(.*?)\$\$/g,(_match,value:string)=>'$$\n'+value+'\n$$');
  const first=await prepareExportContent(doc,{mathMode});const artifact=first,root=document.createElement('article');root.className='mf-doc';root.innerHTML=artifact.html;
  const math=[...root.querySelectorAll('[data-mf-math-id]')].map(node=>({id:node.getAttribute('data-mf-math-id'),line:node.getAttribute('data-line'),end:node.getAttribute('data-source-end'),text:node.querySelector('math')?.textContent||'',display:node.classList.contains('mf-math'),hasSvg:!!node.querySelector('svg'),hasHidden:!!node.querySelector('.mf-math-semantics[hidden]')}));
  const stage=document.createElement('section');stage.className='mf-document-shell';const style=document.createElement('style');style.textContent=artifact.presentation.css;stage.append(style,root);document.body.append(stage);
  const hiddenInvisible=[...root.querySelectorAll<HTMLElement>('.mf-math-semantics')].every(node=>getComputedStyle(node).display==='none'&&node.getBoundingClientRect().height===0);
  stage.remove();
  const other=createNewDocument('Other');other.markdown=String.raw`$$\begin{equation}y\end{equation}$$`;
  const otherPrepared=await prepareExportContent(other,{mathMode});const otherRoot=document.createElement('article');otherRoot.innerHTML=otherPrepared.html;
  const repeated=await prepareExportContent(doc,{mathMode});const again=document.createElement('article');again.innerHTML=repeated.html;
  let unknown='';const bad=createNewDocument('Bad');bad.markdown='$\\notDefinedHere$';try{await prepareExportContent(bad,{mathMode})}catch(error){unknown=String(error)}
  const recovery=await prepareExportContent(other,{mathMode});
  reports.push({mathMode,math,hiddenInvisible,html:artifact.html,other:otherRoot.querySelector('math')?.textContent||'',repeat:[...again.querySelectorAll('[data-mf-math-id] math')].map(node=>node.textContent),unknown,recovered:!!recovery.html,config:artifact.source.renderConfigVersion,serialized:JSON.parse(JSON.stringify(artifact)).schemaVersion,frozen:Object.isFrozen(artifact)&&Object.isFrozen(artifact.presentation.page.margins),sourceAttached:'markdown' in artifact||'document' in artifact});
 }
 // Duplicate source URLs are fetched once and remain frozen after caller mutations.
 const originalFetch=window.fetch;let reads=0;
 window.fetch=async()=>{reads++;await Promise.resolve();return new Response(Uint8Array.from(atob(corpus.asset.data.split(',')[1]!),char=>char.charCodeAt(0)),{headers:{'content-type':'image/png'}})};
 let assetReport;
 try{
  const doc=createNewDocument('Frozen');doc.markdown='![one](/baseline.png) ![two](/baseline.png)';const pending=prepareExportContent(doc);doc.markdown='MUTATED';doc.meta.title='MUTATED';doc.theme.fontSize=18;
  const artifact=await pending;
  assetReport={reads,assets:artifact.assets.length,title:artifact.meta.title,images:(artifact.html.match(/data:image\/png;base64,/g)||[]).length,hash:artifact.assets[0]?.sha256,immutable:Object.isFrozen(artifact.assets[0]),size:artifact.presentation.variables['--mf-size']};
 }finally{window.fetch=originalFetch}
 const seed=await prepareExportContent({...createNewDocument('Isolation'),markdown:'# seed'});
 const canonical=exportHtmlSchema.parse({...seed,html:corpus.isolation.html});
 const htmlRoot=document.createElement('html');htmlRoot.innerHTML=await generateExportHtml(canonical,{editablePayload:btoa(encodeURIComponent(corpus.isolation.markdown))});
 const pdfRoot=document.createElement('html');pdfRoot.innerHTML=await generatePdfHtml(canonical);
 const supportedWordHtml=corpus.isolation.html.replace(/<math[\s\S]*?<\/math>/g,'');
 const wordInput=exportHtmlSchema.parse({...canonical,html:supportedWordHtml});
 const word=await exportDocumentToDocx(wordInput);const zip=await JSZip.loadAsync(await word.arrayBuffer());const docxXml=await zip.file('word/document.xml')!.async('string');
 const isolation={docxXml,htmlText:htmlRoot.querySelector('article')?.textContent||'',pdfText:pdfRoot.querySelector('body')?.textContent||''};
 if(!output)throw new Error('No report');output.textContent=JSON.stringify({reports,assetReport,isolation,baselineRestored:startup.document===baseline&&startup.input===baselineInput,dom:sharedDom.snapshot(),secure:isSecureContext,version:engine.version});output.setAttribute('data-state','ready');
 }catch(error){if(output){output.textContent=String(error);output.setAttribute('data-state','error')}}})();
