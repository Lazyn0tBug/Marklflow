/** Runtime contract for the bundled MathJax 3.2.2; no engine internals escape this adapter. */
import {apiObject,apiMethod,apiPromise} from '../platform/externalApi';
import {withDeadline} from '../export/documentPrint';

declare global {interface Window {MathJax?:unknown}}
export interface MathJaxAdapter {
 resetDocument():void;
 convert(value:string,display:boolean,mode:'mathml'|'svg'):Promise<string>;
}
export async function loadMathJaxAdapter(raw:unknown):Promise<MathJaxAdapter>{
 const engine=apiObject(raw,'MathJax'),startup=apiObject(engine.startup,'MathJax startup');
 await withDeadline(apiPromise(startup.promise,'MathJax startup'),'MathJax 启动超时');
 const getInput=apiMethod(startup,'getInputJax','MathJax 文档隔离');
 const getDocument=apiMethod(startup,'getDocument','MathJax 文档隔离');
 const makeMethods=apiMethod(startup,'makeMethods','MathJax 文档隔离');
 apiMethod(engine,'tex2mmlPromise','MathJax');apiMethod(engine,'tex2svgPromise','MathJax');
 return {
  resetDocument(){
   const input=getInput();
   if(!Array.isArray(input)||!input.length||input.some(jax=>typeof jax!=='object'||jax===null))throw new Error('MathJax 输入引擎无效');
   startup.input=input;startup.document=apiObject(getDocument(),'MathJax 文档');makeMethods();
  },
  async convert(value,display,mode){
   const method=apiMethod(engine,mode==='svg'?'tex2svgPromise':'tex2mmlPromise','MathJax');
   const result=await apiPromise(method(value,{display}),'MathJax 公式转换');
   let html:string;
   if(mode==='mathml'){
    if(typeof result!=='string')throw new Error('MathJax MathML 输出类型无效');
    const template=document.createElement('template');template.innerHTML=result;
    if(template.content.children.length!==1||template.content.firstElementChild?.localName!=='math')throw new Error('MathJax MathML 输出结构无效');
    html=result;
   }else{
    if(!(result instanceof Element)||!result.querySelector('svg'))throw new Error('MathJax SVG 输出结构无效');
    html=result.outerHTML;
   }
   if(!html||/data-mjx-error|<merror|mjx-merror/.test(html))throw new Error('公式解析失败：'+value);
   return html;
  }
 };
}
