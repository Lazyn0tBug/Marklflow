/** MathJax 3.2.2 adapter. Rendering is serialized by documentRenderer. */
import {withDeadline} from '../export/documentPrint';
import {escapeHtml} from './htmlPolicy';
interface MathStartup {
 promise?:Promise<void>;
 input?:unknown[];
 document?:unknown;
 getInputJax?:()=>unknown[];
 getDocument?:()=>unknown;
 makeMethods?:()=>void;
}
declare global {
 interface Window {
  MathJax?:{startup?:MathStartup;
   tex2mmlPromise?:(latex:string,options?:{display?:boolean})=>Promise<string>;
   tex2svgPromise?:(latex:string,options?:{display?:boolean})=>Promise<HTMLElement>;
  };
 }
}
const mmlCache=new Map<string,string>(),svgCache=new Map<string,string>();
let failed=false;
export function clearMathCaches():void{mmlCache.clear();svgCache.clear()}
export async function ensureMathJaxReady():Promise<boolean>{
 if(typeof window==='undefined')return false;
 try{await withDeadline(window.MathJax?.startup?.promise||Promise.resolve(),'MathJax 启动超时')}catch{return false}
 return !!(window.MathJax?.tex2mmlPromise&&window.MathJax?.tex2svgPromise);
}
function key(value:string,display:boolean){return (display?'block:':'inline:')+value.trim()}
function cached(value:string,display:boolean,mode:'mathml'|'svg'):string{
 return (mode==='svg'?svgCache:mmlCache).get(key(value,display))||'<span class="mf-diagnostic" data-mjx-error="not-prepared">公式未就绪：'+escapeHtml(value)+'</span>';
}
export function latexToMathML(value:string,display=false):string{return cached(value,display,'mathml')}
export function latexToSVG(value:string,display=false):string{return cached(value,display,'svg')}
export async function prepareMath(expressions:{value:string;display:boolean}[],mode:'mathml'|'svg'):Promise<void>{
 clearMathCaches();if(!expressions.length)return;
 if(failed)throw new Error('MathJax 上次转换未正常结束，请重新加载应用后重试');
 if(!await ensureMathJaxReady())throw new Error('MathJax 尚未就绪，不能以源码回退作为完成结果');
 const engine=window.MathJax!,startup=engine.startup;
 // New TeX input jax clears newcommand, labels and equation counters for this frozen document.
 // These factories are verified against the bundled 3.2.2 startup implementation.
 if(!startup?.getInputJax||!startup.getDocument||!startup.makeMethods)throw new Error('MathJax 文档隔离接口不可用');
 startup.input=startup.getInputJax();startup.document=startup.getDocument();startup.makeMethods();
 for(const expression of expressions){
  let settled=false;
  const conversion=(mode==='svg'?engine.tex2svgPromise!(expression.value,{display:expression.display}):engine.tex2mmlPromise!(expression.value,{display:expression.display})).finally(()=>{settled=true});
  let output:string|HTMLElement;
  try{output=await withDeadline<string|HTMLElement>(conversion,'MathJax 公式转换超时')}catch(error){if(!settled)failed=true;throw error}
  const html=typeof output==='string'?output:output.outerHTML;
  if(!html||/data-mjx-error|<merror|mjx-merror/.test(html))throw new Error('公式解析失败：'+expression.value);
  (mode==='svg'?svgCache:mmlCache).set(key(expression.value,expression.display),expression.display?html:'<span class="markflow-inline-math">'+html+'</span>');
 }
}
