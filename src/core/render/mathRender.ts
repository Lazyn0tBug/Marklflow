/** One isolated MathJax document per preparation, scheduled only through SharedDom. */
import {sharedDom,type DomScheduling} from '../platform/web/sharedDom';
import {escapeHtml} from './htmlPolicy';
import {loadMathJaxAdapter,type MathJaxAdapter} from './mathJaxAdapter';
export interface MathExpression {value:string;display:boolean;sourceOffset?:number}
export type PreparedMath=(value:string,display:boolean,sourceOffset?:number)=>string;
export function unpreparedMath(value:string):string{return '<span class="mf-diagnostic" data-mjx-error="not-prepared">公式未就绪：'+escapeHtml(value)+'</span>'}
export async function prepareMath(input:readonly MathExpression[],mode:'mathml'|'svg',options:DomScheduling={},retainMathML=false):Promise<PreparedMath>{
 const expressions=input.map(expression=>({...expression})),signal=options.signal??new AbortController().signal,priority=options.priority??'foreground';
 const outputs:string[]=[];let engine:MathJaxAdapter|undefined;
 try{
  if(expressions.length)await sharedDom.step(priority,'engine',signal,async({signal:stepSignal})=>{
   if(typeof window==='undefined')throw new Error('MathJax 浏览器宿主不可用');
   engine=await loadMathJaxAdapter(window.MathJax);if(stepSignal.aborted)throw new Error('MathJax 初始化已取消');engine.resetDocument();
  });
  for(const expression of expressions){
   const output=await sharedDom.step(priority,'engine',signal,async()=>{
    if(!engine)throw new Error('MathJax 文档未初始化');
    return engine.convert(expression.value,expression.display,mode,retainMathML);
   });
   outputs.push(expression.display?output:'<span class="markflow-inline-math">'+output+'</span>');
  }
 }finally{
  // Release outside the cancelled signal, after all native work has actually settled.
  if(engine)await sharedDom.step(priority,'engine',new AbortController().signal,({resources})=>{resources.register('math-document','host',0,()=>{engine?.releaseDocument()})});
 }
 let index=0;const positions=new Map<number,number>(),used=new Set<number>();
 expressions.forEach((expression,i)=>{if(expression.sourceOffset!==undefined){if(!Number.isSafeInteger(expression.sourceOffset)||expression.sourceOffset<0||positions.has(expression.sourceOffset))throw new Error('公式源码位置无效');positions.set(expression.sourceOffset,i)}});
 return (value,display,sourceOffset)=>{
  const occurrence=positions.size?(sourceOffset===undefined?undefined:positions.get(sourceOffset)):index++;
  if(occurrence===undefined||used.has(occurrence))throw new Error('公式产物与源文顺序或位置不一致');
  const expression=expressions[occurrence],output=outputs[occurrence];
  if(!expression||expression.value!==value||expression.display!==display||output===undefined)throw new Error('公式产物与源文顺序不一致');
  used.add(occurrence);return output;
 };
}
