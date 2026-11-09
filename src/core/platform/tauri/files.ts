import {z} from 'zod';
import type {ByteSaveTarget} from '../../../application/exports/exportService';
import {FileFailure} from '../fileFailure';
import type {WriteOutcome} from '../../../application/workspace/documentSyncer';
import {NATIVE_WRITE_BYTE_LIMIT, formatBytes} from '../../model/limits';
const selectedSchema = z
  .object({
    key: z.string().uuid(),
    name: z.string().min(1),
    size: z.number().int().nonnegative().safe(),
    /** 文件引用（会话内）✓：同一文件被多次选中时相同 ✓，只用于归属与聚焦 ✓（§3.3）。 */
    reference: z.string().uuid(),
  })
  .strict();
/** 原生失败的形态：稳定的机器码 ✓（与 Rust 侧 files.rs 一一对应 ✓）+ **可展示的上限** ✓。 */
const nativeFailureSchema = z
  .object({code: z.string().min(1), limitBytes: z.number().int().nonnegative().optional()})
  .strict();

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

export type NativeSelection = z.infer<typeof selectedSchema>;
async function invoke(command: string, args?: Record<string, unknown>): Promise<unknown> {
  const native = await import('@tauri-apps/api/core');
  if (!native.isTauri()) throw new Error('原生文件能力仅在桌面应用中可用');
  try {
    return await native.invoke(command, args);
  } catch (error) {
    // 原生侧给的是结构化的机器码 ✓：拒绝不再靠子串匹配 ✓（§9）。
    // 探针要机器码取证 ✓：错误对象上留着码 ✓。
    const failure = nativeFailureSchema.safeParse(error);
    // **与浏览器侧同一个失败类型** ✓ ⇒ ⇒ 同一批机器码 ✓ ⇒ ⇒ 应用不问来源 ✓。
    if (failure.success)
      throw new FileFailure(failure.data.code, {limitBytes: failure.data.limitBytes});
    throw error;
  }
}
/** Independent M3 adapter. No production composition or document bindings yet. */
export async function selectNativeOpen(): Promise<NativeSelection[] | undefined> {
  const value = await invoke('select_native_open');
  return value === null ? undefined : z.array(selectedSchema).parse(value);
}
export async function releaseNativeFile(key: string): Promise<void> {
  await invoke('release_native_file', {key});
}
export async function readNativeText(file: NativeSelection): Promise<string> {
  return z.string().parse(await invoke('read_native_text', {key: file.key}));
}
/**
 * 问一句：**这个文件还是应用手上那一版吗** ✓（§3.1 ✓）。
 *
 * **只回一句是或不是** ✓ ⇒ ⇒ 摘要值不出原生侧 ✓ ⇒ ⇒ 应用侧没有第二份事实会漂 ✓（§3.4 ✓）。
 * **答不了的时候给机器码** ✓ ⇒ ⇒ 应用侧据此记 null（"无法证明一致" ✓ §2.3 ✓）。
 */
export async function isNativeSynced(key: string): Promise<boolean> {
  return z.boolean().parse(await invoke('is_native_synced', {key}));
}
/**
 * **写回原文件** ✓：走受保护的同步入口 ✓ ⇒ ⇒ **复核在命令内部** ✓（§3.1 ✓、§6.1 ✓）。
 *
 * **前端只说"这次是覆盖"** ✓ ⇒ ⇒ **基准由原生侧选** ✓ ⇒ ⇒ 前端拿不到摘要值 ✓（§3.4 ✓）。
 * **前端不能选择不复核** ✓ ⇒ ⇒ 两条路都复核 ✓ ⇒ ⇒ 目标变了就是 `write-target-changed` ✓。
 *
 * **机器码从共享词表来** ✓ ⇒ ⇒ 这里只认这一个码 ✓ ⇒ ⇒ 其余的失败原样带出去 ✓（§9 ✓）。
 */
export async function writeNativeSync(
  key: string,
  bytes: Uint8Array,
  overwrite: boolean,
): Promise<WriteOutcome> {
  try {
    await invoke('write_native_sync', {key, bytes: Array.from(bytes), overwrite});
    return {kind: 'written'};
  } catch (error) {
    // **目标又变了** ✓ ⇒ ⇒ 那是**重新提示**的信号 ✓ ⇒ ⇒ **不是失败** ✓（§8.6 ✓）。
    if (error instanceof FileFailure && error.code === 'write-target-changed')
      return {kind: 'target-changed'};
    return {kind: 'failed', error};
  }
}
/** 按句柄读文本 ✓：**反向同步要它** ✓（§6.5 ✓）。 */
export async function readNativeTextByKey(key: string): Promise<string> {
  return z.string().parse(await invoke('read_native_text', {key}));
}
export interface NativeSaveTarget extends ByteSaveTarget {
  /** 授权的 key ✓ —— 路径只在原生侧可见 ✓，前端只拿得到它 ✓。 */
  key: string;
  release(): Promise<void>;
}
export async function selectNativeSave(name: string): Promise<NativeSaveTarget | undefined> {
  const value = await invoke('select_native_save', {name});
  if (value === null) return undefined;
  const file = selectedSchema.parse(value);
  return {
    key: file.key,
    async save(blob) {
      if (blob.size > NATIVE_WRITE_BYTE_LIMIT)
        throw new Error(`导出文件超过 ${formatBytes(NATIVE_WRITE_BYTE_LIMIT)} 原生写入限制`);
      await invoke('write_native_bytes', {
        key: file.key,
        bytes: Array.from(new Uint8Array(await blob.arrayBuffer())),
      });
      return 'saved';
    },
    release: () => releaseNativeFile(file.key),
  };
}

/**
 * 拖放进来的文件：与选择器**同一套授权与身份** ✓（§5.4）。
 *
 * 事件只带授权与身份，**不带路径** ✓。返回的函数用来取消监听 ✓。
 */
export async function listenNativeDrop(
  handler: (files: NativeSelection[]) => void,
): Promise<() => void> {
  const {listen} = await import('@tauri-apps/api/event');
  const unlisten = await listen<{files?: unknown}>('native-files-dropped', (event) => {
    const files = z.array(selectedSchema).safeParse(event.payload?.files);
    if (files.success) handler(files.data);
  });
  return unlisten;
}

/**
 * 静默 PDF：原生路径的打印 ✓。
 *
 * 回执只有两种 ✓：**提交成功才是 saved** ✓；其余（没提交、报错）都算没成 ✓。
 * 目标由人在原生保存对话框里选 ✓；取消 ⇒ 没有 key ⇒ 什么都不写 ✓。
 */
export async function printNativePdf(
  key: string,
  html: string,
): Promise<'saved' | 'not-committed'> {
  const value = await invoke('print_native_pdf', {key, html});
  return value === 'saved' ? 'saved' : 'not-committed';
}
