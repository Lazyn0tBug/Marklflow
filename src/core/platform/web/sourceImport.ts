import {createSourceImport} from '../sourceImport';
import {FileFailure} from '../fileFailure';
import {IMPORT_BYTE_LIMIT} from '../../model/limits';
import type {OpenResult} from '../../../application/workspace/sourceImport';
import type {DocumentRecord} from '../../model/document';
/** Browser picker files are transient; native paths and permissions belong to a future Tauri adapter. */
export async function readSourceFile(file:File):Promise<string>{
 // **Web 侧自己守上限** ✓ ⇒ ⇒ 与原生侧刻意一致 ✓（设计 §5.1 ✓）⇒ ⇒ 说得出是多少 ✓。
 if(file.size>IMPORT_BYTE_LIMIT)throw new FileFailure('file-too-large',{limitBytes:IMPORT_BYTE_LIMIT});
 return new Promise((resolve,reject)=>{
  const reader=new FileReader();
  // **发的是原生侧那批机器码** ✓ ⇒ ⇒ 同一件事同一个标识 ✓ ⇒ ⇒ 应用不问来源 ✓（§9 ✓）。
  reader.onerror=()=>reject(new FileFailure('native-io-failed'));
  reader.onabort=()=>reject(new FileFailure('native-io-failed'));
  reader.onload=()=>{try{if(!(reader.result instanceof ArrayBuffer))throw new FileFailure('invalid-payload');resolve(new TextDecoder('utf-8',{fatal:true}).decode(reader.result))}catch(error){reject(error instanceof FileFailure?error:new FileFailure('invalid-utf8'))}};
  reader.readAsArrayBuffer(file);
 });
}
export function createWebSourceImport(open:(doc:DocumentRecord,file:File)=>Promise<OpenResult>){
 return createSourceImport<File>({
  read:readSourceFile,
  // **浏览器这一侧没有文件引用** ✓ ⇒ ⇒ 命中不了既有绑定 ✓ ⇒ ⇒ 每次都是新文档 ✓。
  // **也没有原生句柄** ✓ ⇒ ⇒ 没有可放掉的东西 ✓ ⇒ ⇒ 这一步是空的 ✓。
  boundSelection:async()=>undefined,
  release:async()=>{},
  // **浏览器这一侧没有引用** ✓ ⇒ ⇒ 键就是"同名 + 内容摘要" ✓ ⇒ ⇒ 沿用既有规则 ✓。
  fileReference:()=>'',
 },open);
}
