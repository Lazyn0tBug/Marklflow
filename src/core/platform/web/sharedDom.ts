import {SharedDom} from '../../../application/tasks/sharedDom';
/** One Web DOM entry shared by preview and export engines as their adapters migrate. */
export const sharedDom=new SharedDom({now:()=>performance.now(),schedule:(ms,callback)=>{const timer=setTimeout(callback,ms);return()=>clearTimeout(timer)}});
