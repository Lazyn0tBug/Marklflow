import {createSourceImport} from '../sourceImport';
import type {OpenResult} from '../../../application/workspace/sourceImport';
import type {DocumentRecord} from '../../model/document';
/** Browser picker files are transient; native paths and permissions belong to a future Tauri adapter. */
export function readSourceFile(file:File):Promise<string>{
 return new Promise((resolve,reject)=>{
  const reader=new FileReader();
  reader.onerror=()=>reject(new Error('文件读取失败：'+file.name));
  reader.onabort=()=>reject(new Error('文件读取已取消：'+file.name));
  reader.onload=()=>{try{if(!(reader.result instanceof ArrayBuffer))throw new Error('文件读取结果无效');resolve(new TextDecoder('utf-8',{fatal:true}).decode(reader.result))}catch{reject(new Error('文件不是有效的 UTF-8 文本：'+file.name))}};
  reader.readAsArrayBuffer(file);
 });
}
export function createWebSourceImport(open:(doc:DocumentRecord,file:File)=>Promise<OpenResult>){
 return createSourceImport<File>({
  read:readSourceFile,
  // **浏览器这一侧没有文件身份** ✓ ⇒ ⇒ 命中不了既有绑定 ✓ ⇒ ⇒ 每次都是新文档 ✓。
  // **也没有原生授权** ✓ ⇒ ⇒ 没有可释放的东西 ✓ ⇒ ⇒ 这一步是空的 ✓。
  boundSelection:async()=>undefined,
  release:async()=>{},
  // **浏览器这一侧没有引用** ✓ ⇒ ⇒ 键就是"同名 + 内容摘要" ✓ ⇒ ⇒ 沿用既有规则 ✓。
  fileReference:()=>'',
 },open);
}
