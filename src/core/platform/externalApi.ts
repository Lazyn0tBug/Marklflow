/** Narrow dynamically loaded JavaScript APIs before exposing application contracts. */
export function apiObject(value:unknown,label:string):Record<string,unknown>{
 if(typeof value!=='object'||value===null)throw new Error(label+' 接口不可用');
 return value as Record<string,unknown>;
}
export function apiMethod(owner:Record<string,unknown>,name:string,label:string):(...args:unknown[])=>unknown{
 const method=owner[name];
 if(typeof method!=='function')throw new Error(label+' '+name+' 接口不可用');
 return (...args:unknown[]):unknown=>Reflect.apply(method,owner,args);
}
function isPromiseLike(value:unknown):value is PromiseLike<unknown>{
 return (typeof value==='object'&&value!==null||typeof value==='function')&&'then' in value&&typeof value.then==='function';
}
export function apiPromise(value:unknown,label:string):Promise<unknown>{
 if(!isPromiseLike(value))throw new Error(label+' 未返回 Promise');
 return Promise.resolve(value);
}
