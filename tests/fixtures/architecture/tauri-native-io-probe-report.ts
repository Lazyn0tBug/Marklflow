import type {NativeSelection} from '../../../src/core/platform/tauri/files';

/**
 * The reporting rules of the M3 platform interface fixture, kept apart from the page so they can
 * be checked without a browser.
 */
export type StepStatus='ok'|'cancelled'|'unavailable'|'failed';
export interface StepOutcome {step:string;status:StepStatus;message:string;data?:unknown}

/** The native picker has no error channel: a closed dialog and a failed dialog look the same. */
export const CANCELLED_NOTE='未选择目标；官方 dialog 插件只返回 Option，无法区分主动取消与系统弹窗故障';

/** The adapter refuses to run outside the desktop shell; that is not a failure of the native side. */
export function classifyError(error:unknown):{status:StepStatus;message:string}{
 const message=error instanceof Error?error.message:String(error);
 if(message.includes('仅在桌面应用中可用'))return {status:'unavailable',message};
 return {status:'failed',message};
}

/** What the picker returned, without the session key that only means something inside this session. */
export function describeSelection(files:readonly NativeSelection[]):{count:number;files:{name:string;size:number}[]}{
 return {count:files.length,files:files.map(file=>({name:file.name,size:file.size}))};
}

/** Enough of the text to prove what was read, without dumping a whole file into the report. */
export function previewText(text:string):{length:number;head:string}{
 return {length:text.length,head:text.slice(0,120)};
}
