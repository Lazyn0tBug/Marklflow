import {z} from 'zod';
import type {ByteSaveTarget} from '../../../application/exports/exportService';
import {FileFailure} from '../fileFailure';
import type {TargetStatus} from '../../../application/workspace/targetStatus';
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

/**
 * **目标的状态** ✓：**原生侧归类的那一份** ✓ ⇒ ⇒ **一个封闭的小集合** ✓（§6.1 ✓）。
 *
 * **归类在原生侧** ✓ ⇒ ⇒ **处理在应用侧按状态选** ✓ ⇒ ⇒ **两件事分开** ✓。
 *
 * **它与应用层那一份是同一个集合** ✓ ⇒ ⇒ **名字对不上就红** ✓（解析失败 ⇒ 抛 ✓）。
 */
const targetStatusSchema = z.enum(['ready', 'changed', 'missing', 'unwritable', 'invalid']);

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
 * 问一句：**这个目标现在是什么状态** ✓（§3.1 ✓、§6.1 ✓）。
 *
 * **它答的是那个集合里的一个** ✓ ⇒ ⇒ **不在了与写不进去也在里面** ✓ ⇒ ⇒
 * **应用侧按状态选处理** ✓ ⇒ ⇒ **那两条分支因此走得到** ✓。
 *
 * **摘要值不出原生侧** ✓ ⇒ ⇒ 应用侧没有第二份事实会漂 ✓（§3.4 ✓）。
 */
export async function detectNativeTarget(key: string): Promise<TargetStatus> {
  return targetStatusSchema.parse(await invoke('detect_native_target', {key}));
}

/**
 * **还是那一版吗** ✓：**检测那一句的旧问法** ✓ ⇒ ⇒ 应用层还在用布尔的那一处 ✓
 * ⇒ ⇒ **答"就绪"就是那一版** ✓ ⇒ ⇒ 其余都是"不是" ✓。
 *
 * **它只是上面那句的一个薄包装** ✓ ⇒ ⇒ **状态集合只定义一处** ✓ ⇒ ⇒
 * **那一句仍然是唯一的检测入口** ✓（§3.1 ✓）。
 */
export async function isNativeSynced(key: string): Promise<boolean> {
  return (await detectNativeTarget(key)) === 'ready';
}
/**
 * 问一句：**这两个文件在同一个目录里吗** ✓（§6.2 ✓）。
 *
 * **只回一句是或不是** ✓ ⇒ ⇒ 路径不出原生侧 ✓ ⇒ ⇒ 应用侧拿不到路径 ✓（§3.4 ✓）。
 * **为什么应用层要问** ✓：另存为到别的目录 ⇒ ⇒ 正文里的相对图片引用会按新位置解释 ✓
 * ⇒ ⇒ 应用层据此提示用户 ✓ ⇒ ⇒ 而"在不在同一个目录"只有拿着路径的那一侧答得了 ✓（§1.3 ✓）。
 */
export async function isNativeSameDirectory(first: string, second: string): Promise<boolean> {
  return z
    .boolean()
    .parse(await invoke('is_native_same_directory', {firstKey: first, secondKey: second}));
}
/**
 * 问一句：**那个目标还在吗** ✓（§3.1 ✓、§8.2 ✓）。
 *
 * **只回一句是或不是** ✓ ⇒ ⇒ 目标没了 ⇒ ⇒ 回"否" ✓ ⇒ ⇒ **不是报错** ✓
 * ⇒ ⇒ 那是**关联还有效吗**的答案 ✓ ⇒ ⇒ **不是写失败的结果** ✓。
 *
 * **它与检测那一句不是同一件事** ✓：那一句要读整个文件比摘要 ✓ ⇒ ⇒ 贵 ✓；
 * 这一句只看它在不在 ✓ ⇒ ⇒ 便宜 ✓ ⇒ ⇒ **写完那一次验证读走它** ✓（§6.1 ✓）。
 */
export async function isNativeTargetPresent(key: string): Promise<boolean> {
  return z.boolean().parse(await invoke('is_native_target_present', {key}));
}
/**
 * **写回原文件** ✓：走受保护的同步入口 ✓ ⇒ ⇒ **复核在命令内部** ✓（§3.1 ✓、§6.1 ✓）。
 *
 * **原生侧答一个状态** ✓ ⇒ ⇒ 这里只做映射 ✓ ⇒ ⇒ **不判它意味着什么** ✓ ⇒ ⇒
 * **那句话由应用侧按状态选** ✓（§6.1 ✓）。
 *
 * **前端只说"这次是覆盖"** ✓ ⇒ ⇒ **基准由原生侧选** ✓ ⇒ ⇒ 前端拿不到摘要值 ✓（§3.4 ✓）。
 * **前端不能选择不复核** ✓ ⇒ ⇒ 两条路都复核 ✓ ✓。
 * **"这次允许目标不存在"** ✓ ⇒ ⇒ **用户说了继续** ✓ ⇒ ⇒ **其余复核照旧** ✓。
 */
export async function writeNativeSync(
  key: string,
  bytes: Uint8Array,
  intent: 'sync' | 'overwrite' | 'continue',
): Promise<TargetStatus> {
  // **它也答一个状态** ✓ ⇒ ⇒ **写不成就是抛** ✓ ⇒ ⇒ **机器码不出这一层** ✓（§9 ✓）。
  const status = targetStatusSchema.parse(
    await invoke('write_native_sync', {
      key,
      bytes: Array.from(bytes),
      overwrite: intent === 'overwrite',
      allowMissing: intent === 'continue',
    }),
  );
  return status;
}
/** 按句柄读文本 ✓：**反向同步要它** ✓（§6.5 ✓）。 */
export async function readNativeTextByKey(key: string): Promise<string> {
  return z.string().parse(await invoke('read_native_text', {key}));
}
export interface NativeSaveTarget extends ByteSaveTarget {
  /** 授权的 key ✓ —— 路径只在原生侧可见 ✓，前端只拿得到它 ✓。 */
  key: string;
  /**
   * 文件引用 ✓：**这个文件的会话内别名** ✓（§3.3 ✓）。
   *
   * **另存为要它** ✓ ⇒ ⇒ 新文档绑的是**那个文件** ✓ ⇒ ⇒ 再次打开它聚焦新文档 ✓（M5-5 ✓）。
   */
  reference: string;
  /** 选中的文件名 ✓：新文档的标题与展示用 ✓。 */
  name: string;
  release(): Promise<void>;
}
/**
 * **按句柄写字节** ✓：**通用字节写入** ✓（§6.2 ✓）。
 *
 * **另存为走它** ✓ ⇒ ⇒ **不走写回原文件那条路** ✓ ⇒ ⇒ 目标是**新选的** ✓ ⇒ ⇒ 那里没有基线 ✓
 * ⇒ ⇒ 无从复核 ✓ ⇒ ⇒ 而且**本来就要盖掉它** ✓ ⇒ ⇒ 用户在系统对话框里已经确认过 ✓。
 */
export async function writeNativeBytes(handle: string, bytes: Uint8Array): Promise<void> {
  if (bytes.byteLength > NATIVE_WRITE_BYTE_LIMIT)
    throw new Error(`写入超过 ${formatBytes(NATIVE_WRITE_BYTE_LIMIT)} 原生写入限制`);
  await invoke('write_native_bytes', {key: handle, bytes: Array.from(bytes)});
}
export async function selectNativeSave(name: string): Promise<NativeSaveTarget | undefined> {
  const value = await invoke('select_native_save', {name});
  if (value === null) return undefined;
  const file = selectedSchema.parse(value);
  return {
    key: file.key,
    reference: file.reference,
    name: file.name,
    async save(blob) {
      // **先看大小再取字节** ✓ ⇒ ⇒ 超限的 blob 不会被转成字节数组 ✓（不白分配 ✓）。
      if (blob.size > NATIVE_WRITE_BYTE_LIMIT)
        throw new Error(`导出文件超过 ${formatBytes(NATIVE_WRITE_BYTE_LIMIT)} 原生写入限制`);
      await writeNativeBytes(file.key, new Uint8Array(await blob.arrayBuffer()));
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
