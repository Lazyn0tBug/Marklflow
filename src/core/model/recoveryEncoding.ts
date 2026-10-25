/** Inspection JSON is not a general structured-clone round-trip format. */
function encode(value:unknown,path:string,active:Map<object,string>,seen:Map<object,string>,identity:boolean,onOpaque:()=>void):unknown{
 if(value===null||typeof value==='string'||typeof value==='boolean')return identity?['value',value]:value;
 if(typeof value==='number')return identity?['number',Object.is(value,-0)?'-0':String(value)]:Number.isFinite(value)?value:{$type:'number',value:String(value)};
 if(typeof value!=='object')return identity?[typeof value,String(value)]:{$type:typeof value,value:String(value)};
 const prior=(identity?seen:active).get(value);if(prior!==undefined)return identity?['reference',prior]:{$reference:prior};
 active.set(value,path);seen.set(value,path);
 const child=(item:unknown,key:string)=>encode(item,path+'/'+key.replaceAll('~','~0').replaceAll('/','~1'),active,seen,identity,onOpaque);
 let result:unknown;
 if(value instanceof Date){const text=Number.isFinite(value.getTime())?value.toISOString():'Invalid Date';result=identity?['Date',text]:text}
 else if(value instanceof RegExp){result=identity?['RegExp',value.source,value.flags]:{$type:'RegExp',source:value.source,flags:value.flags}}
 else if(value instanceof Map){const entries=Array.from(value,([key,item],i)=>[child(key,'key'+i),child(item,'value'+i)]);result=identity?['Map',entries]:{$type:'Map',entries}}
 else if(value instanceof Set){const values=Array.from(value,(item,i)=>child(item,String(i)));result=identity?['Set',values]:{$type:'Set',values}}
 else if(value instanceof ArrayBuffer||ArrayBuffer.isView(value)){
  const bytes=Array.from(value instanceof ArrayBuffer?new Uint8Array(value):new Uint8Array(value.buffer,value.byteOffset,value.byteLength));
  const type=Object.prototype.toString.call(value);result=identity?[type,bytes]:{$type:type,bytes};
 }else if(Object.prototype.toString.call(value)!=='[object Object]'&&!Array.isArray(value)){
  onOpaque();const tag=Object.prototype.toString.call(value);result=identity?['Opaque',tag,path]:{$type:tag,$note:'此类型仅展示标记；原始结构化值仍保留在源存储/恢复记录中'};
 }else if(Array.isArray(value)){const items=Array.from(value,(item,i)=>child(item,String(i)));result=identity?['Array',items]:items}
 else{
  const entries=Object.entries(value);if(identity)entries.sort(([a],[b])=>a<b?-1:a>b?1:0);
  if(identity)result=['Object',entries.map(([key,item])=>[key,child(item,key)])];
  else{const output:Record<string,unknown>={};for(const [key,item]of entries)Object.defineProperty(output,key,{value:child(item,key),enumerable:true});result=output}
 }
 active.delete(value);return result;
}
export function recoveryJson(value:unknown):string{return JSON.stringify(encode(value,'#',new Map(),new Map(),false,()=>{}),null,2)}
/** Type-tagged identity distinguishes Map/bytes from author objects containing inspection markers. */
export function recoveryIdentity(value:unknown):{text:string;complete:boolean}{let complete=true;const text=JSON.stringify(encode(value,'#',new Map(),new Map(),true,()=>{complete=false}));return {text,complete}}
