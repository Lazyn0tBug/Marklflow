import {z} from 'zod';

const platformInfoSchema = z
  .object({
    os: z.enum(['windows', 'macos', 'linux']),
    arch: z.string().min(1).max(64),
    version: z.string().min(1).max(64),
    windowLabel: z.string().min(1).max(256),
    webviewLabel: z.string().min(1).max(64),
  })
  .strict();
export type TauriPlatformInfo = z.infer<typeof platformInfoSchema>;

const runtimePrefsSchema = z
  .object({
    exportRoot: z.enum(['web', 'native']),
    nativePdfAvailable: z.boolean(),
    logCallTimeoutMs: z.number().int().min(10).max(2000).default(200),
  })
  .strict();
export type RuntimePrefs = z.infer<typeof runtimePrefsSchema>;

/**
 * 运行期配置里前端要知道的那些 ✓（当前只有导出的根 ✓）。
 *
 * 非桌面应用（纯网页 ✓）没有这个能力 ✓ ⇒ 返回 undefined ✓ ✓。
 */
export async function readRuntimePrefs(): Promise<RuntimePrefs | undefined> {
  if (typeof window === 'undefined') return undefined;
  const {isTauri, invoke} = await import('@tauri-apps/api/core');
  if (!isTauri()) return undefined;
  const value: unknown = await invoke('get_runtime_prefs');
  return runtimePrefsSchema.parse(value);
}

/**
 * 是不是桌面外壳 ✓（浏览器里没有原生能力 ✓ ⇒ 返回 false ✓）。
 * 平台层的组合点靠它选实现 ✓ ⇒ ⇒ 原生 SDK 只留在这一层 ✓。
 */
export async function isDesktopRuntime(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const {isTauri} = await import('@tauri-apps/api/core');
  return isTauri();
}

/** Optional shell capability only; no application state, filesystem, or export ownership.
    The label pair is the caller's identity as the native side reports it (D1a-6). */
export async function readTauriPlatformInfo(): Promise<TauriPlatformInfo | undefined> {
  if (typeof window === 'undefined') return undefined;
  const {isTauri, invoke} = await import('@tauri-apps/api/core');
  if (!isTauri()) return undefined;
  const value: unknown = await invoke('get_platform_info');
  return platformInfoSchema.parse(value);
}
