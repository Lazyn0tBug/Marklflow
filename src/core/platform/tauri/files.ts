import {z} from 'zod';
import type {ByteSaveTarget} from '../../../application/exports/exportService';
import {messageText} from '../../../application/messages';
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
 * 原生侧只给码 ✓：文案**在应用层那一份词表里** ✓（跨平台要一致 ✓，
 * 不露裸码、调用方身份或允许名单 ✓）⇒ ⇒ **这里不再存一份** ✓
 * ⇒ ⇒ 那份表只收"用户可行动或可理解"的失败 ✓；其余的码——应用自己用错了授权、
 * 授权已失效、内部状态不可用、路径或名字不可用——**不是用户的错** ✓ ⇒ 用户看到
 * 通用的一句话即可 ✓；机器码仍留在错误对象上 ✓，给日志与诊断用 ✓。
 * 机器码的完整清单与分类见[日志基座设计](../../../docs/design/log-base-plan-2026-11-03.md) §5.2 ✓
 * 与[本地文档支持设计](../../../docs/design/local-document-support-2026-11-05.md) §9 ✓。
 */

/** 码 → 文案。认不出的码给一句通用的话 ✓：不猜它意味着什么 ✓。 */
export function nativeFailureMessage(code:string):string{
 return messageText(code);
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
/**
 * 问一句：**这个文件还是应用手上那一版吗** ✓（§3.1 ✓）。
 *
 * **只回一句是或不是** ✓ ⇒ ⇒ 摘要值不出原生侧 ✓ ⇒ ⇒ 应用侧没有第二份事实会漂 ✓（§3.4 ✓）。
 * **答不了的时候给机器码** ✓ ⇒ ⇒ 应用侧据此记 null（"无法证明一致" ✓ §2.3 ✓）。
 */
export async function isNativeSynced(key:string):Promise<boolean>{return z.boolean().parse(await invoke('is_native_synced',{key}))}
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
 * 拖放进来的文件：与选择器**同一套授权与身份** ✓（§5.4）。
 *
 * 事件只带授权与身份，**不带路径** ✓。返回的函数用来取消监听 ✓。
 */
export async function listenNativeDrop(handler:(files:NativeSelection[])=>void):Promise<()=>void>{
 const {listen}=await import('@tauri-apps/api/event');
 const unlisten=await listen<{files?:unknown}>('native-files-dropped',event=>{
  const files=z.array(selectedSchema).safeParse(event.payload?.files);
  if(files.success)handler(files.data);
 });
 return unlisten;
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

