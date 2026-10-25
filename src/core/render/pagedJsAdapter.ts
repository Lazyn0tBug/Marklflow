/** Validated boundary for bundled Paged.js 0.4.3; pending layout cannot be forcibly cancelled. */
import {apiObject,apiMethod,apiPromise} from '../platform/externalApi';
import {withDeadline} from '../export/documentPrint';
export interface PagedAdapter {
 beforeParsed(callback:()=>void):void;
 beforePageLayout(callback:()=>void):void;
 afterPageLayout(callback:()=>void):void;
 preview(content:string,styles:Record<string,string>[],target:HTMLElement):Promise<{total:number}>;
 destroy():void;
}
function cleanupComponent(component:Record<string,unknown>,name:'chunker'|'polisher'):void{
 // 0.4.3 destroy() assumes setup has created these nodes. Partial setup needs safe removal.
 const incomplete=name==='chunker'
  ?Array.isArray(component.pages)&&(!(component.pagesArea instanceof Element)||!(component.pageTemplate instanceof Element))
  :Array.isArray(component.inserted)&&!(component.styleEl instanceof Element);
 if(incomplete){
  const nodes=name==='chunker'?[component.pagesArea,component.pageTemplate]:[component.styleEl,...(Array.isArray(component.inserted)?component.inserted:[])];
  for(const node of nodes)if(node instanceof Element)node.remove();
  if(name==='polisher')component.sheets=[];
  return;
 }
 apiMethod(component,'destroy','Paged.js '+name)();
}
function cleanupAvailable(paged:Record<string,unknown>):void{
 const errors:unknown[]=[];
 for(const name of ['chunker','polisher'] as const){
  try{
   const component=paged[name];
   if(component!==undefined&&component!==null)cleanupComponent(apiObject(component,'Paged.js '+name),name);
  }catch(error){errors.push(error)}
 }
 if(errors.length===1)throw errors[0];
 if(errors.length>1)throw new AggregateError(errors,'Paged.js 清理失败：'+errors.map(String).join('; '));
}
export function createPagedAdapter(module:unknown):PagedAdapter{
 const Constructor=apiObject(module,'Paged.js').Previewer;
 if(typeof Constructor!=='function')throw new Error('Paged.js Previewer 构造器不可用');
 const instance:unknown=Reflect.construct(Constructor,[]),paged=apiObject(instance,'Paged.js Previewer');
 let phase:'idle'|'running'|'settled'|'destroyed'='idle';
 const destroy=()=>{
  if(phase==='destroyed')return;
  if(phase==='running')throw new Error('Paged.js 分页任务未结束，不能销毁宿主');
  phase='destroyed';cleanupAvailable(paged);
 };
 try{
  const chunker=apiObject(paged.chunker,'Paged.js chunker'),polisher=apiObject(paged.polisher,'Paged.js polisher');
  apiMethod(chunker,'destroy','Paged.js chunker');apiMethod(polisher,'destroy','Paged.js polisher');
  const preview=apiMethod(paged,'preview','Paged.js'),hooks=apiObject(chunker.hooks,'Paged.js hooks');
  const register=(name:string)=>apiMethod(apiObject(hooks[name],'Paged.js '+name),'register','Paged.js '+name);
  const beforeParsed=register('beforeParsed'),beforePage=register('beforePageLayout'),afterPage=register('afterPageLayout');
  const idle=()=>{
   if(phase==='destroyed')throw new Error('Paged.js 宿主已销毁');
   if(phase!=='idle')throw new Error('Paged.js 分页已开始，请使用新宿主');
  };
  return {
   beforeParsed(callback){idle();beforeParsed(callback)},
   beforePageLayout(callback){idle();beforePage(callback)},
   afterPageLayout(callback){idle();afterPage(callback)},
   async preview(content,styles,target){
    idle();phase='running';
    try{
     const flow=apiObject(await apiPromise(preview(content,styles,target),'Paged.js preview'),'Paged.js flow');
     const total=flow.total;
     if(typeof total!=='number'||!Number.isSafeInteger(total)||total<1)throw new Error('Paged.js 返回无效页数');
     return {total};
    }finally{phase='settled'}
   },
   destroy
  };
 }catch(error){
  try{destroy()}catch(cleanupError){throw new AggregateError([error,cleanupError],'Paged.js 初始化失败：'+String(error)+'; '+String(cleanupError))}
  throw error;
 }
}
export async function loadPagedAdapter(importModule:()=>Promise<unknown>=()=>import('pagedjs')):Promise<PagedAdapter>{
 // Only import is timed: a late module must never construct an unowned Previewer.
 const module=await withDeadline(apiPromise(importModule(),'Paged.js 模块加载'),'Paged.js 加载超时');
 return createPagedAdapter(module);
}
