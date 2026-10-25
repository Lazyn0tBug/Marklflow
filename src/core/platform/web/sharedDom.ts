import {SharedDom,type DomPriority} from '../../../application/tasks/sharedDom';
export interface DomScheduling {priority?:DomPriority;signal?:AbortSignal}
/** One Web DOM entry shared by preview and export engines as their adapters migrate. */
export const sharedDom=new SharedDom({now:()=>performance.now(),schedule:(ms,callback)=>{const timer=setTimeout(callback,ms);return()=>clearTimeout(timer)}});
