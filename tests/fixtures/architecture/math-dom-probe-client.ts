import {prepareMath} from '../../../src/core/render/mathRender';
import {renderDocument,assertArtifact} from '../../../src/core/render/documentRenderer';
import {sharedDom} from '../../../src/core/platform/web/sharedDom';
import {apiObject,apiMethod,apiPromise} from '../../../src/core/platform/externalApi';
const output=document.querySelector('[data-state]');
const text=(html:string)=>{const root=document.createElement('div');root.innerHTML=html;return root.textContent||[...root.querySelectorAll('use[data-c]')].map(node=>String.fromCodePoint(parseInt(node.getAttribute('data-c')||'0',16))).join('')};
const macroUse=String.raw`\docmacro`;
const equation=String.raw`\begin{equation}x=1\end{equation}`;
const define=(name:string)=>String.raw`\newcommand{\docmacro}{\text{${name}}}\docmacro`;
const source=String.raw`# LaTeX corpus

Inline $\frac{a_1}{\sqrt{1+x^2}} + \mathbb{R} + \operatorname{rank}(A)$.

$$
\begin{aligned} f(x)&=\sum_{k=0}^{n}\binom{n}{k}x^k\\ A&=\begin{pmatrix}1&2\\3&4\end{pmatrix}\end{aligned}
$$`;
void(async()=>{try{
 const engine=apiObject(window.MathJax,'MathJax'),startup=apiObject(engine.startup,'startup');await apiPromise(startup.promise,'startup');
 const baseline=startup.document,baselineInput=startup.input,makeMethods=apiMethod(startup,'makeMethods','startup');
 let active=0,maxActive=0,onConversion:((value:string)=>void)|undefined;const events:string[]=[];
 startup.makeMethods=()=>{
  makeMethods();for(const name of ['tex2mmlPromise','tex2svgPromise']){const convert=apiMethod(engine,name,'conversion');engine[name]=(...args:unknown[])=>{active++;maxActive=Math.max(active,maxActive);const value=String(args[0]);events.push(value);onConversion?.(value);return apiPromise(convert(...args),'conversion').finally(()=>{active--})}}
 };
 try{
 const modes=[];
 for(const mode of ['mathml','svg'] as const){
  let exported:ReturnType<typeof prepareMath>|undefined;
  onConversion=value=>{if(value===define('ALPHA')){onConversion=undefined;exported=prepareMath([{value:define('BETA'),display:false},{value:macroUse,display:false},{value:equation,display:true}],mode,{priority:'export'})}};
  const a=await prepareMath([{value:define('ALPHA'),display:false},{value:macroUse,display:false},{value:equation,display:true},{value:equation,display:true}],mode,{priority:'background'});
  if(!exported)throw new Error('Expected intervening export');const b=await exported;
  const aValues=[a(define('ALPHA'),false),a(macroUse,false),a(equation,true),a(equation,true)];
  const bValues=[b(define('BETA'),false),b(macroUse,false),b(equation,true)];
  modes.push({mode,a:aValues.map(text),b:bValues.map(text),svgCount:aValues.filter(html=>html.includes('<svg')).length});
 }
 const corpus=[];for(const mode of ['mathml','svg'] as const){const rendered=await renderDocument(source,mode);assertArtifact(rendered);const root=document.createElement('div');root.innerHTML=rendered.html;corpus.push({mode,math:root.querySelectorAll('math').length,svg:root.querySelectorAll('svg').length,mapped:root.querySelectorAll('[data-line]').length})}
 const footnoteArtifact=await renderDocument('Main $a$[^note].\n\n[^note]: Foot $b$.\n\nTail $c$.','mathml');const footnoteRoot=document.createElement('div');footnoteRoot.innerHTML=footnoteArtifact.html;const footnote=[...footnoteRoot.querySelectorAll('math mi')].map(node=>node.textContent?.trim());
 let unknown='';try{await prepareMath([{value:macroUse,display:false}],'mathml')}catch(error){unknown=String(error)}
 const abort=new AbortController();let cancelSeen=false;
 onConversion=value=>{if(value==='x'){onConversion=undefined;abort.abort();cancelSeen=true}};
 let cancelled='';try{await prepareMath([{value:'x',display:false},{value:'y',display:false}],'mathml',{signal:abort.signal})}catch(error){cancelled=String(error)}
 const after=await prepareMath([{value:equation,display:true}],'mathml');
 await Promise.resolve();
 if(!output)throw new Error('No report');output.textContent=JSON.stringify({modes,corpus,footnote,unknown,cancelled,cancelSeen,after:text(after(equation,true)),maxActive,baselineRestored:startup.document===baseline&&startup.input===baselineInput,dom:sharedDom.snapshot(),secure:isSecureContext,version:engine.version,events});output.setAttribute('data-state','ready');
 }finally{startup.makeMethods=makeMethods;makeMethods()}
 }catch(error){if(output){output.textContent=String(error);output.setAttribute('data-state','error')}}})();
