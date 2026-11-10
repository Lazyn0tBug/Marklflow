import {existsSync} from 'node:fs';
import {join, resolve} from 'node:path';

/**
 * 原生侧的隔离前提。
 *
 * **ACL 不是本项目的隔离层，来源守卫才是**（见阶段记录 D0-3 ✓）。
 * Tauri v2 只在三种情况下才检查应用自定义命令 ✓：插件命令 ✓、
 * **应用自带 ACL manifest** ✓、远程来源 ✓。
 *
 * 应用自己的 ACL manifest 来自 `src-tauri/permissions/` 目录 ✓——
 * 目录一旦存在且含权限定义 ✓，ACL 就开始检查这些命令 ✓：
 * 输出宿主的拒绝证据会从来源守卫挪到 ACL ✓，
 * D1b/D7 的取证前提就变了 ✓，而**日志里看不出这个区别** ✓。
 *
 * 故断言那个目录不存在 ✓。真要引入它，先把 D1b/D7 的取证前提一起改掉 ✓。
 */

/** 仓库根。 */
const repo = resolve(import.meta.dirname, '..');

/** 应用自带 ACL manifest 的目录（Tauri 从这里收集应用自身的权限定义）。 */
export const APP_ACL_DIR = join(repo, 'src-tauri/permissions');

/**
 * 隔离前提被破坏时的理由；前提成立时返回 undefined。
 *
 * 纯函数：只看那个目录在不在 ✓，不读别的东西 ✓。
 */
export function isolationPremiseBroken(appAclDir: string = APP_ACL_DIR): string | undefined {
  if (!existsSync(appAclDir)) return undefined;
  return [
    '应用自带 ACL manifest 会改变隔离层：',
    `  ${appAclDir} 存在 → Tauri 开始检查应用自定义命令 → `,
    '  输出宿主的拒绝证据不再来自来源守卫（D0-3 的取证前提失效）。',
    '  要引入它，先把 D1b/D7 的取证前提一起改掉，并重跑那两轮取证。',
  ].join('\n');
}

export default function checkNativeIsolation(): void {
  const reason = isolationPremiseBroken();
  if (reason) {
    console.error(reason);
    process.exitCode = 1;
  }
}

if (process.argv[1]?.endsWith('check-native-isolation.ts')) checkNativeIsolation();
