/** Minimal validated boundary for bundled Paged.js 0.4.3, without a cancellation promise. */
import {apiObject,apiMethod,apiPromise} from '../platform/externalApi';
export interface PagedAdapter {
 beforeParsed(callback:()=>void):void;
 beforePageLayout(callback:()=>void):void;
 afterPageLayout(callback:()=>void):void;
 preview(content:string,styles:Record<string,string>[],target:HTMLElement):Promise<{total:number}>;
 destroy():void;
}
export function createPagedAdapter(module:unknown):PagedAdapter{
 const Constructor=apiObject(module,'Paged.js').Previewer;
 if(typeof Constructor!=='function')throw new Error('Paged.js Previewer 构造器不可用');
 const instance:unknown=Reflect.construct(Constructor,[]),paged=apiObject(instance,'Paged.js Previewer');
 const chunker=apiObject(paged.chunker,'Paged.js chunker'),polisher=apiObject(paged.polisher,'Paged.js polisher');
 const destroyChunker=apiMethod(chunker,'destroy','Paged.js'),destroyPolisher=apiMethod(polisher,'destroy','Paged.js');
 let destroyed=false;
 const destroy=()=>{
  if(destroyed)return;destroyed=true;
  try{destroyChunker()}finally{destroyPolisher()}
 };
 try{
  const preview=apiMethod(paged,'preview','Paged.js'),hooks=apiObject(chunker.hooks,'Paged.js hooks');
  const register=(name:string)=>apiMethod(apiObject(hooks[name],'Paged.js '+name),'register','Paged.js '+name);
  const beforeParsed=register('beforeParsed'),beforePage=register('beforePageLayout'),afterPage=register('afterPageLayout');
  const active=()=>{if(destroyed)throw new Error('Paged.js 宿主已销毁')};
  return {
   beforeParsed(callback){active();beforeParsed(callback)},
   beforePageLayout(callback){active();beforePage(callback)},
   afterPageLayout(callback){active();afterPage(callback)},
   async preview(content,styles,target){
    active();const flow=apiObject(await apiPromise(preview(content,styles,target),'Paged.js preview'),'Paged.js flow');
    const total=flow.total;
    if(typeof total!=='number'||!Number.isSafeInteger(total)||total<1)throw new Error('Paged.js 返回无效页数');
    return {total};
   },
   destroy
  };
 }catch(error){
  try{destroy()}catch(cleanupError){throw new AggregateError([error,cleanupError],'Paged.js 初始化与清理失败')}
  throw error;
 }
}
export async function loadPagedAdapter():Promise<PagedAdapter>{return createPagedAdapter(await import('pagedjs'))}
