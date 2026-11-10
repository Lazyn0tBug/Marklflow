/**
 * **页面自己的构建标识** ✓。
 *
 * **构建期注入** ✓（`vite.config.ts` 取 git 的短哈希 ✓）⇒ ⇒ 页面报得出它是哪一次构建 ✓ ⇒ ⇒
 * 原生侧那一份也在运行标记里（`build_commit` ✓）⇒ ⇒ **日志能对出两边是不是同一个构建** ✓ ⇒ ⇒
 * 不用问人"那个包是不是新的" ✓。
 *
 * **一处事实** ✓ ⇒ ⇒ 桌面端口与别处都从这里取 ✓ ⇒ ⇒ 两处不会不一样 ✓。
 *
 * **没注入时是 unknown** ✓ ⇒ ⇒ 单测与不经过 vite 的运行不炸 ✓ ⇒ ⇒ 那时日志会说
 * "页面那一份不知道" ✓ ⇒ ⇒ 而不是假装知道 ✓。
 */
export const pageBuildCommit: string =
  typeof __MARKFLOW_BUILD_COMMIT__ === 'string' ? __MARKFLOW_BUILD_COMMIT__ : 'unknown';
