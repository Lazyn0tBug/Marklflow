import {readFileSync} from 'node:fs';
import {join, resolve} from 'node:path';

/**
 * 命令面的准入清单：**没有命令裸奔**。
 *
 * 每个受保护命令都走 `in_command_span` ✓ → 来源守卫判定 ✓ → 放行或拒 ✓。
 * 另有两个命令**刻意不受守卫管** ✓，各自的准入方式写在别处 ✓：
 *
 * - `get_platform_info` ✓：只报平台信息与调用方自己的身份 ✓，不碰文件 ✓、不弹框 ✓。
 * - `log_event` ✓：只写日志 ✓，准入看的是 `logging::log_writer_allowed` ✓
 *   （主窗口与已登记的探针实例 ✓）。
 *
 * **清单必须显式** ✓：新增命令时若既没进守卫、也没进这份清单 ✓，
 * 这个检查就会红 ✓——那正是"裸奔"的定义 ✓。
 * 准入规则散在三个文件里 ✓（`lib.rs` 的注册表 ✓、`files.rs` 的守卫 ✓、
 * `logging.rs` 的写日志准入 ✓），所以这里要有一张把它们对起来的表 ✓。
 *
 * 另有一层编译器保证 ✓：受保护命令的入口收的是 `WebCommand` 枚举 ✓，
 * 新加一个受保护命令而忘了进枚举 ✓，**编译不过** ✓。
 */

/** 仓库根。 */
const repo = resolve(import.meta.dirname, '..');

/** 刻意不受来源守卫管的命令，以及各自的准入方式。 */
export const UNGUARDED: Record<string, string> = {
  get_platform_info: '只报平台信息与调用方自己的身份，不碰文件、不弹框',
  get_runtime_prefs:
    '只报应用自己的运行期配置（导出的根、平台有没有静默 PDF 能力），不碰文件、不铸授权',
  log_event: '只写日志；准入看 logging::log_writer_allowed（主窗口与已登记的探针实例）',
};

/** 枚举变体名 → serde 的 snake_case（枚举上写的是 `rename_all = "snake_case"` ✓）。 */
export function snake(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
}

/** 取一段源码里的第一个方括号块。 */
function bracketBlock(source: string, anchor: string): string {
  const start = source.indexOf(anchor);
  if (start < 0) throw new Error(`源码里找不到：${anchor}`);
  const open = source.indexOf('[', start);
  const close = source.indexOf(']', open);
  if (open < 0 || close < 0) throw new Error(`源码里找不到对应的方括号：${anchor}`);
  return source.slice(open + 1, close);
}

/**
 * 注册表里的命令名：去掉模块前缀 ✓，去掉行尾注释与逗号 ✓。
 *
 * **按逗号切，不按行切** ✓：一行写两个命令时 ✓，按行切只会取到最后一个 ✓，
 * 其余的**静默丢掉** ✓ —— 而丢掉的那些命令就不参与"裸奔"判定 ✓，
 * 检查会**照样通过** ✓。那正是这个检查要防的那件事 ✓。
 *
 * 解析不出像命令名的东西就**响着失败** ✓：宁可失败 ✓，不可静默放过 ✓。
 */
export function registeredCommands(source: string): string[] {
  const names = bracketBlock(source, 'generate_handler!')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join(',')
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => part.replace(/::/g, ' ').split(/\s+/).pop() ?? '')
    .filter((name) => name.length > 0);
  for (const name of names) {
    if (!/^[a-z_][a-z0-9_]*$/.test(name)) {
      throw new Error(
        `解析不到命令清单：注册表里出现了不像命令名的东西「${name}」——invoke_handler 的写法变了 ✓`,
      );
    }
  }
  if (names.length === 0) throw new Error('解析不到命令清单：注册表是空的 ✓');
  return names;
}

/** 走守卫的命令：从 `in_command_span(WebCommand::X` 里取 ✓。 */
function guardedCommands(source: string): string[] {
  const names: string[] = [];
  const pattern = /in_command_span\(\s*WebCommand::([A-Za-z0-9_]+)/g;
  for (const match of source.matchAll(pattern)) names.push(snake(match[1] ?? ''));
  return names;
}

/** 页面可回传的命令：枚举 `WebCommand` 的变体 ✓。 */
function reportableCommands(source: string): string[] {
  const start = source.indexOf('pub enum WebCommand');
  if (start < 0) throw new Error('源码里找不到 WebCommand 枚举');
  const open = source.indexOf('{', start);
  const close = source.indexOf('\n}', open);
  if (close < 0) throw new Error('WebCommand 枚举没有正常结束');
  return source
    .slice(open + 1, close)
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, '').trim())
    .filter((line) => /^[A-Z][A-Za-z0-9]*,?$/.test(line))
    .map((line) => snake(line.replace(/,$/, '')));
}

/** 读三个源文件，得出三份命令名单。 */
export interface CommandSurface {
  registered: string[];
  guarded: string[];
  reportable: string[];
}

export function readCommandSurface(root: string = repo): CommandSurface {
  const lib = readFileSync(join(root, 'src-tauri/src/lib.rs'), 'utf8');
  const files = readFileSync(join(root, 'src-tauri/src/files.rs'), 'utf8');
  const logging = readFileSync(join(root, 'src-tauri/src/logging.rs'), 'utf8');
  return {
    registered: registeredCommands(lib),
    guarded: guardedCommands(files),
    reportable: reportableCommands(logging),
  };
}

/** 没有准入方式的命令：既没走守卫，也不在显式清单里 ✓。 */
export function nakedCommands(surface: CommandSurface): string[] {
  return surface.registered.filter(
    (name) => !surface.guarded.includes(name) && !(name in UNGUARDED),
  );
}

/** 走守卫却不在页面可回传的枚举里：编译器也拦着 ✓，这里再报一次 ✓。 */
export function unreportableGuarded(surface: CommandSurface): string[] {
  return surface.guarded.filter((name) => !surface.reportable.includes(name));
}

/**
 * 例外清单里已经过期的条目 ✓：命令其实走守卫了 ✓，或已经不在注册表里了 ✓。
 *
 * 清单是**单向**的么 ✓：不报过期 ✓，清单就会烂掉 ✓，
 * 而烂掉的清单在"新增命令"那个方向上仍然有效 ✓ —— 于是缺口只剩一半 ✓。
 */
export function staleExceptions(surface: CommandSurface): string[] {
  return Object.keys(UNGUARDED).filter(
    (name) => surface.guarded.includes(name) || !surface.registered.includes(name),
  );
}

export default function checkCommandAdmission(): void {
  const surface = readCommandSurface();
  const naked = nakedCommands(surface);
  const unreportable = unreportableGuarded(surface);
  const stale = staleExceptions(surface);
  const problems: string[] = [];
  if (naked.length) {
    problems.push(
      '这些命令既没走来源守卫，也不在显式的不受守卫清单里（裸奔）：',
      ...naked.map((name) => `  ${name}`),
      '要么把它接进 in_command_span，要么在 UNGUARDED 里写明它的准入方式。',
    );
  }
  if (unreportable.length) {
    problems.push(
      '这些命令走了守卫，却不在页面可回传的 WebCommand 枚举里（页面的事件会被整条拒收）：',
      ...unreportable.map((name) => `  ${name}`),
    );
  }
  if (stale.length) {
    problems.push(
      '不受守卫清单里有过期条目（命令其实走守卫了，或已经不在注册表里）：',
      ...stale.map((name) => `  ${name}`),
      '把它从 UNGUARDED 里去掉，或更新它对应的准入方式。',
    );
  }
  if (problems.length) {
    console.error(problems.join('\n'));
    process.exitCode = 1;
    return;
  }
  console.log(
    `命令面准入成立：注册 ${surface.registered.length} 个，受保护 ${surface.guarded.length} 个，` +
      `不受守卫 ${Object.keys(UNGUARDED).length} 个（各有准入方式），页面可回传 ${surface.reportable.length} 个`,
  );
}

if (process.argv[1]?.endsWith('check-command-admission.ts')) checkCommandAdmission();
