/** Runtime contract for bundled MathJax 3.2.2. documentRenderer serializes engine access. */
import {apiObject,apiMethod,apiPromise,apiSyncResult} from '../platform/externalApi';
import {withDeadline} from '../export/documentPrint';

declare global {interface Window {MathJax?:unknown}}
export interface MathJaxAdapter {
 resetDocument():void;
 convert(value:string,display:boolean,mode:'mathml'|'svg'):Promise<string>;
}
function extraText(root:ParentNode):boolean{
 return Array.from(root.childNodes).some(node=>node.nodeType===Node.TEXT_NODE&&!!node.textContent?.trim());
}
function assertNoMathError(root:Element,value:string):void{
 const selector='[data-mjx-error],merror,.mjx-merror';
 if(root.matches(selector)||root.querySelector(selector))throw new Error('公式解析失败：'+value);
}
export async function loadMathJaxAdapter(raw:unknown):Promise<MathJaxAdapter>{
 const engine=apiObject(raw,'MathJax'),startup=apiObject(engine.startup,'MathJax startup');
 await withDeadline(apiPromise(startup.promise,'MathJax startup'),'MathJax 启动超时');
 const getInput=apiMethod(startup,'getInputJax','MathJax 文档隔离');
 const getDocument=apiMethod(startup,'getDocument','MathJax 文档隔离');
 const makeMethods=apiMethod(startup,'makeMethods','MathJax 文档隔离');
 apiMethod(engine,'tex2mmlPromise','MathJax');apiMethod(engine,'tex2svgPromise','MathJax');
 let ready=false,busy=false;
 return {
  resetDocument(){
   if(busy)throw new Error('MathJax 公式转换期间不能重建文档');
   ready=false;
   const input=apiSyncResult(getInput(),'MathJax 输入引擎');
   if(!Array.isArray(input)||!input.length)throw new Error('MathJax 输入引擎无效');
   for(const entry of input){
    const jax=apiObject(entry,'MathJax 输入引擎');
    if(typeof jax.name!=='string'||!jax.name)throw new Error('MathJax 输入引擎名称无效');
    apiMethod(jax,'compile','MathJax 输入引擎');
   }
   startup.input=input;
   const doc=apiObject(apiSyncResult(getDocument(),'MathJax 文档'),'MathJax 文档');
   apiMethod(doc,'convert','MathJax 文档');startup.document=doc;
   if(apiSyncResult(makeMethods(),'MathJax makeMethods')!==undefined)throw new Error('MathJax makeMethods 返回值无效');
   apiMethod(engine,'tex2mmlPromise','MathJax');apiMethod(engine,'tex2svgPromise','MathJax');
   ready=true;
  },
  async convert(value,display,mode){
   if(!ready)throw new Error('MathJax 文档尚未成功初始化');
   if(busy)throw new Error('MathJax 同一会话不能并发转换');
   busy=true;
   try{
    const method=apiMethod(engine,mode==='svg'?'tex2svgPromise':'tex2mmlPromise','MathJax');
    const result=await apiPromise(method(value,{display}),'MathJax 公式转换');
    if(mode==='mathml'){
     if(typeof result!=='string')throw new Error('MathJax MathML 输出类型无效');
     const template=document.createElement('template');template.innerHTML=result;
     const root=template.content.firstElementChild;
     if(template.content.children.length!==1||root?.localName!=='math'||root.namespaceURI!=='http://www.w3.org/1998/Math/MathML'||extraText(template.content))throw new Error('MathJax MathML 输出结构无效');
     assertNoMathError(root,value);return result;
    }
    if(!(result instanceof Element)||result.localName!=='mjx-container'||result.children.length!==1||extraText(result))throw new Error('MathJax SVG 输出结构无效');
    const svg=result.firstElementChild;
    if(svg?.localName!=='svg'||svg.namespaceURI!=='http://www.w3.org/2000/svg')throw new Error('MathJax SVG 输出结构无效');
    assertNoMathError(result,value);return result.outerHTML;
   }finally{busy=false}
  }
 };
}
