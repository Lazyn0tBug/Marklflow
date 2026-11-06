import {z} from 'zod';
import type {ByteSaveTarget} from '../../../application/exports/exportService';
const selectedSchema=z.object({
 key:z.string().uuid(),
 name:z.string().min(1),
 size:z.number().int().nonnegative().safe(),
 /** 文件身份（会话内）✓：同一文件被多次选中时相同 ✓，只用于去重与聚焦 ✓（§3.3）。 */
 identity:z.string().uuid(),
}).strict();
/** 原生失败的形态：稳定的机器码 ✓（与 Rust 侧 files.rs 一一对应 ✓）。 */
const nativeFailureSchema=z.object({code:z.string().min(1)}).strict();

/**
 * 机器码 → 用户可见的文案。
 *
 * 原生侧只给码 ✓：文案在这里统一 ✓（跨平台要一致 ✓，不露裸码、调用方身份或允许名单 ✓）。
 * 与 Rust 侧 files.rs 的码一一对应；两边必须同步改 ✓。
 */
const NATIVE_FAILURE_MESSAGES:Record<string,string>={
 'native-source-denied':'当前窗口无权使用原生文件能力',
 'native-target-missing':'文件已被移走或重命名',
 'native-permission-denied':'没有权限访问这个文件',
 'native-io-failed':'文件读写失败',
 'native-dialog-failed':'系统文件对话框打不开',
 'native-internal-failed':'文件能力暂时不可用',
 'file-too-large':'文件超过可处理的大小上限',
 'invalid-utf8':'文件不是合法的 UTF-8 文本',
 'not-a-file':'目标不是一个普通文件',
 'not-a-regular-target':'目标不是一个普通文件',
 'unknown-file-key':'这个文件的授权已经失效',
 'file-capability-mismatch':'这个文件不允许这样操作',
 'invalid-file-name':'文件名无法读取',
 'invalid-target':'目标路径无效',
 'print-failed':'打印失败',
 'print-not-committed':'打印出来了，但没有写进目标文件',
};

/** 码 → 文案。认不出的码给一句通用的话 ✓：不猜它意味着什么 ✓。 */
export function nativeFailureMessage(code:string):string{
 return NATIVE_FAILURE_MESSAGES[code]??'文件操作失败';
}

/** 原生失败：机器码留着分流 ✓，用户看到的是文案 ✓。 */
export class NativeFileError extends Error {
 readonly code:string;
 constructor(code:string){super(nativeFailureMessage(code));this.name='NativeFileError';this.code=code;}
}

export type NativeSelection=z.infer<typeof selectedSchema>;
async function invoke(command:string,args?:Record<string,unknown>):Promise<unknown>{
 const native=await import('@tauri-apps/api/core');
 if(!native.isTauri())throw new Error('原生文件能力仅在桌面应用中可用');
 try{return await native.invoke(command,args)}
 catch(error){
  // 原生侧给的是结构化的机器码 ✓：拒绝不再靠子串匹配 ✓（§9）。
  // 探针要机器码取证 ✓：错误对象上留着码 ✓。
  const failure=nativeFailureSchema.safeParse(error);
  if(failure.success)throw new NativeFileError(failure.data.code);
  throw error;
 }
}
/** Independent M3 adapter. No production composition or document bindings yet. */
export async function selectNativeOpen():Promise<NativeSelection[]|undefined>{
 const value=await invoke('select_native_open');
 return value===null?undefined:z.array(selectedSchema).parse(value);
}
export async function releaseNativeFile(key:string):Promise<void>{await invoke('release_native_file',{key})}
export async function readNativeText(file:NativeSelection):Promise<string>{return z.string().parse(await invoke('read_native_text',{key:file.key}))}
export interface NativeSaveTarget extends ByteSaveTarget {
 /** 授权的 key ✓ —— 路径只在原生侧可见 ✓，前端只拿得到它 ✓。 */
 key:string;
 release():Promise<void>;
}
export async function selectNativeSave(name:string):Promise<NativeSaveTarget|undefined>{
 const value=await invoke('select_native_save',{name});
 if(value===null)return undefined;
 const file=selectedSchema.parse(value);
 return {
  key:file.key,
  async save(blob){if(blob.size>100*1024*1024)throw new Error('导出文件超过100MiB原生写入限制');await invoke('write_native_bytes',{key:file.key,bytes:Array.from(new Uint8Array(await blob.arrayBuffer()))});return 'saved'},
  release:()=>releaseNativeFile(file.key),
 };
}

/**
 * 静默 PDF：原生路径的打印 ✓。
 *
 * 回执只有两种 ✓：**提交成功才是 saved** ✓；其余（没提交、报错）都算没成 ✓。
 * 目标由人在原生保存对话框里选 ✓；取消 ⇒ 没有 key ⇒ 什么都不写 ✓。
 */
export async function printNativePdf(key:string,html:string):Promise<'saved'|'not-committed'>{
 const value=await invoke('print_native_pdf',{key,html});
 return value==='saved'?'saved':'not-committed';
}

