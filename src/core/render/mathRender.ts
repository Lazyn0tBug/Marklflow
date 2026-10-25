/** MathJax 3.2.2 adapter. Rendering is serialized by documentRenderer. */
import {withDeadline} from '../export/documentPrint';
import {escapeHtml} from './htmlPolicy';
import {loadMathJaxAdapter} from './mathJaxAdapter';
const mmlCache=new Map<string,string>(),svgCache=new Map<string,string>();
let failed=false;
export function clearMathCaches():void{mmlCache.clear();svgCache.clear()}
export async function ensureMathJaxReady():Promise<boolean>{
 if(typeof window==='undefined')return false;
 try{await loadMathJaxAdapter(window.MathJax);return true}catch{return false}
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
 if(typeof window==='undefined')throw new Error('MathJax 浏览器宿主不可用');
 const engine=await loadMathJaxAdapter(window.MathJax);engine.resetDocument();
 for(const expression of expressions){
  let settled=false;
  const conversion=engine.convert(expression.value,expression.display,mode).finally(()=>{settled=true});
  let output:string;
  try{output=await withDeadline<string>(conversion,'MathJax 公式转换超时')}catch(error){if(!settled)failed=true;throw error}
  const html=output;
  (mode==='svg'?svgCache:mmlCache).set(key(expression.value,expression.display),expression.display?html:'<span class="markflow-inline-math">'+html+'</span>');
 }
}
