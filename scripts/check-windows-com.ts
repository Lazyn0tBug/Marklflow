/**
 * 交叉编译检查 Windows 专属的 COM 代码。
 *
 * 静默 PDF 输出走 WebView2 的 COM 接口，只在 Windows 上编译。macOS 上没有那条路：
 * `cargo check` 会在资源编译那步卡住（缺 llvm-rc），整棵依赖树都过不去。
 *
 * 所以把 COM 部分单独放在 `src-tauri/src/print_com.rs`（不依赖 tauri），
 * 这里用一个临时小 crate 直接把它编译成 Windows 目标——**编译的是仓库里的真文件，
 * 不是副本**，故不会与实际代码漂移。
 *
 * **范围**：**应用 crate 的全部模块** ✓——清单由 `lib.rs` 的 `mod` 声明推出来 ✓，
 * 不是手抄的一份 ✓。COM 核心（print_com）✓、tauri 胶水（print_host）✓、
 * 编排（pdf_print）✓、输出宿主（output_host）✓、日志基座（logging）✓、
 * 来源守卫（source_guard）✓、产品形态的入口与探针装配（files、probe）✓，
 * 外加运行期配置（config）✓与字节摘要（hash）✓——**它在清单里不是靠人记得** ✓。
 * 编排那一层有 `#[cfg(target_os = "windows")]` 分支 ✓——本机（macOS）编不到它 ✓，
 * 出了错只有到 Windows 上才暴露 ✓（已经栽过一次 ✓：调用了不存在的
 * `print_com::print_to_pdf` ✓，本机 clippy 全绿 ✓，交付宿主编译才炸 ✓）。
 *
 * **清单曾经是人抄的** ✓ ⇒ ⇒ 抄漏一个（`hash` ✓）⇒ ⇒ 夹具编不过 ✓ ⇒ ⇒
 * 而**那个错本机看不见** ✓（macOS 上没装 Windows 目标 ⇒ ⇒ 整个检查跳过 ✓）⇒ ⇒
 * 直到 CI 上那条 Windows job 编它才红 ✓ ⇒ ⇒ ⇒ 所以清单改成**从 `lib.rs` 推** ✓。
 *
 * **lint 当错误处理**（`-D warnings` ✓）：只查类型会漏掉 lint ✓，
 * 而本机编不到 Windows 那段代码 ✓，交叉检查是唯一能提前发现它们的地方 ✓。
 * 漏掉的那条 `needless_return` 就是这么来的 ✓——它只在 Windows 分支里 ✓，
 * 本机 clippy 看不见 ✓，而交付宿主上它是噪音 ✓。
 *
 * 用法：bun scripts/check-windows-com.ts
 * 需要：rustup 的 Windows 目标（`rustup target add x86_64-pc-windows-msvc`）。
 * 目标不在时**跳过并说明**，不当作失败——这是环境缺件，不是代码问题。
 */
import {execFileSync} from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';

/** 交叉编译的目标。WebView2 是 Windows 专属，故取 MSVC 目标。 */
const TARGET = 'x86_64-pc-windows-msvc';
/** 用的工具链 ✓：默认 stable ✓，CI 用钉住的那个版本 ✓（环境变量覆盖 ✓）。 */
const TOOLCHAIN = process.env.RUST_TOOLCHAIN ?? 'stable';
/** 仓库根。 */
const repo = resolve(import.meta.dirname, '..');

/**
 * **被检查的模块 = 应用 crate 根声明的那批** ✓。
 *
 * **清单不再手写** ✓ ⇒ ⇒ 应用加一个模块 ⇒ ⇒ 夹具自动带上它 ✓ ⇒ ⇒
 * 不会再出现"应用加了模块、夹具没加" ⇒ ⇒ 而**那种洞本机看不见** ✓
 * （macOS 上没装 Windows 目标 ⇒ ⇒ 整个检查跳过 ✓）⇒ ⇒
 * 只有 CI 上那条 Windows job 才编它 ⇒ ⇒ ⇒ 代价太大 ✓。
 *
 * **为什么以 `lib.rs` 为准** ✓：那是应用自己的模块图 ✓ ⇒ ⇒
 * 夹具与应用的差别只剩**位置**（`#[path]` 指向仓库里的真文件 ✓）⇒ ⇒
 * **模块集合与 `crate::` 的含义都与应用一致** ✓ ⇒ ⇒ 漂不了 ✓。
 *
 * **参数化仓库根** ✓：这样单测能拿一份假 crate 来试 ✓ ⇒ ⇒
 * "新加一个模块会被自动带上"这句话**在 macOS 上就能验** ✓ ⇒ ⇒
 * 不再靠"等 CI 红了才知道" ✓。
 */
export function appModules(root: string = repo): Record<string, string> {
  const crateRoot = join(root, 'src-tauri/src');
  const lib = readFileSync(join(crateRoot, 'lib.rs'), 'utf8');
  const modules: Record<string, string> = {};
  // `mod x;` —— **属性行与声明行可以分开写** ✓（`#[cfg(...)]` 在上一行 ✓）⇒ ⇒
  // 属性与声明之间的空白**允许跨行** ✓ ⇒ ⇒ 两种写法都认得 ✓。
  const declaration = /^\s*(?:#\[[^\]]*\]\s*)*mod\s+([a-z_][a-z0-9_]*)\s*;/gm;
  for (const match of lib.matchAll(declaration)) {
    const name = match[1];
    if (!name) continue;
    modules[name] = join(crateRoot, `${name}.rs`);
  }
  if (Object.keys(modules).length === 0) {
    throw new Error('lib.rs 里一个模块也没读到 ⇒ 清单是空的 ⇒ 夹具什么也编不到');
  }
  for (const [name, path] of Object.entries(modules)) {
    if (!existsSync(path)) {
      throw new Error(`模块 ${name} 的文件不在：${path} ⇒ 清单与应用对不上`);
    }
  }
  return modules;
}

/** 模块名 → 源码文本 ✓。 */
export type ModuleSources = Record<string, string>;

/**
 * **夹具给得出应用里那些跨模块的引用** ✓ ⇒ ⇒ 不然就是清单与应用对不上 ✓。
 *
 * 应用里的模块互相引用走 `crate::x` ✓ ⇒ ⇒ 夹具把它们全放在 crate 根上 ✓
 * ⇒ ⇒ 那些引用自然解析得到 ✓。**只有一种情况解析不到** ✓：
 * 某个模块引用了 crate 根上的**条目**（不是模块 ✓）⇒ ⇒
 * 夹具的根上没有它 ⇒ ⇒ **当场说清** ✓ ⇒ ⇒ 不给一句编译器的天书 ✓。
 */
export function assertReferencesResolve(sources: ModuleSources): void {
  const known = new Set(Object.keys(sources));
  for (const [name, source] of Object.entries(sources)) {
    // **首字母大小写都认** ✓：crate 根上的条目（`PlatformInfo` ✓ 那类）常是大写开头 ✓
    // ⇒ ⇒ 只认小写就会让它溜过去 ✓ ⇒ ⇒ 守卫就白设了 ✓。
    for (const match of source.matchAll(/\bcrate::([A-Za-z_][A-Za-z0-9_]*)/g)) {
      const target = match[1];
      if (!target || known.has(target)) continue;
      throw new Error(
        `模块 ${name} 引用了 crate::${target} ⇒ 而它不是应用的一个模块 ⇒ ` +
          `夹具给不出它 ⇒ ⇒ 模块清单与应用对不上`,
      );
    }
  }
}

/** 跑一条命令；失败时返回其输出，不抛。 */
function run(
  command: string,
  args: string[],
  options: {cwd?: string; env?: Record<string, string>} = {},
): {code: number; output: string} {
  try {
    const output = execFileSync(command, args, {
      cwd: options.cwd,
      env: {...process.env, ...options.env},
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return {code: 0, output};
  } catch (error) {
    const failure = error as {status?: number; stdout?: string; stderr?: string};
    return {
      code: failure.status ?? 1,
      output: `${failure.stdout ?? ''}${failure.stderr ?? ''}`,
    };
  }
}

/** 从仓库的 Cargo.toml 取依赖版本：夹具用同一套版本，不会出现两套 windows-core。 */
function dependencyVersion(name: string): string {
  const manifest = readFileSync(join(repo, 'src-tauri/Cargo.toml'), 'utf8');
  const escaped = name.replace(/[-]/g, '\\-');
  // 两种写法都要认：`name = "x"` 与 `name = { version = "x", ... }`。
  const plain = new RegExp(`^${escaped}\\s*=\\s*"([^"]+)"`, 'm').exec(manifest);
  if (plain) return plain[1] ?? '';
  const table = new RegExp(`^${escaped}\\s*=\\s*\\{[^}]*?version\\s*=\\s*"([^"]+)"`, 'ms').exec(
    manifest,
  );
  if (table) return table[1] ?? '';
  throw new Error(`Cargo.toml 里找不到依赖：${name}`);
}

async function main(): Promise<void> {
  // 目标是否可用。Homebrew 的 rustc 不带 Windows 标准库，须用 rustup 工具链的。
  const rustc = run('rustup', ['which', '--toolchain', TOOLCHAIN, 'rustc']);
  if (rustc.code !== 0) {
    console.log('跳过：本机没有 rustup 工具链，Windows 侧代码无法交叉编译验证');
    process.exitCode = 0;
    return;
  }
  const rustcPath = rustc.output.trim();
  const installed = run(rustcPath, ['--print', 'target-libdir', '--target', TARGET]);
  if (installed.code !== 0) {
    console.log(`跳过：rustup 工具链没装 ${TARGET}（rustup target add ${TARGET}）`);
    process.exitCode = 0;
    return;
  }

  const work = mkdtempSync(join(tmpdir(), 'mf-windows-com-'));
  // 夹具的 target 树有 1GB 上下 ✓：**跑完必须删** ✓——
  // 留着就是每跑一次漏一次 ✓（实测漏到磁盘满 ✓）。
  try {
    await crossCheck(work, rustcPath);
  } finally {
    rmSync(work, {recursive: true, force: true});
  }
}

/** 在临时夹具里做一次交叉编译检查。 */
async function crossCheck(work: string, rustcPath: string): Promise<void> {
  // **清单从应用自己的 `lib.rs` 推** ✓ ⇒ ⇒ 加模块不用记得改这里 ✓。
  const modules = appModules();
  const sources: ModuleSources = Object.fromEntries(
    Object.entries(modules).map(([name, path]) => [name, readFileSync(path, 'utf8')]),
  );
  assertReferencesResolve(sources);
  mkdirSync(join(work, 'src'), {recursive: true});
  // **锁文件从应用那份抄过来** ✓：夹具的依赖与应用的是同一批 ✓，
  // 版本就此钉住 ✓ —— 否则每次解析都是"当下最新的" ✓，CI 会随上游漂移 ✓。
  copyFileSync(join(repo, 'src-tauri', 'Cargo.lock'), join(work, 'Cargo.lock'));
  writeFileSync(
    join(work, 'Cargo.toml'),
    [
      '[package]',
      'name = "mf-windows-com-check"',
      'version = "0.0.0"',
      'edition = "2021"',
      '',
      '[features]',
      // 与应用同名：日志基座里有几处按这个特性取舍的分支，要一起编。
      'pdf-probe = []',
      '',
      '[dependencies]',
      // 版本串本身带精确锁定（如 "=0.39.1"），照抄即可。
      `webview2-com = "${dependencyVersion('webview2-com')}"`,
      `windows = "${dependencyVersion('windows')}"`,
      // 宿主侧（print_host.rs）要用 tauri 的类型：只作依赖，不作构建依赖——
      // 构建依赖 tauri-build 会去编译 Windows 资源文件，那需要 llvm-rc。
      `tauri = "${dependencyVersion('tauri')}"`,
      // 编排层要 sha2（产物的 sha256）与 serde_json（就绪读数）。
      `sha2 = "${dependencyVersion('sha2')}"`,
      `serde_json = "${dependencyVersion('serde_json')}"`,
      // 日志基座要 serde（反序列化）与 tracing（埋点）。
      `serde = { version = "${dependencyVersion('serde')}", features = ["derive"] }`,
      `tracing = "${dependencyVersion('tracing')}"`,
      `tracing-subscriber = { version = "${dependencyVersion('tracing-subscriber')}", default-features = false, features = ["fmt", "ansi", "std", "json"] }`,
      // 日志基座的运行标识用 uuid。
      `uuid = { version = "${dependencyVersion('uuid')}", features = ["v4"] }`,
      // 产品形态入口要对话框插件（原生保存对话框 ✓），探针装配要 tempfile（受控夹具 ✓）。
      `tauri-plugin-dialog = "${dependencyVersion('tauri-plugin-dialog')}"`,
      `tempfile = "${dependencyVersion('tempfile')}"`,
      // 运行期配置要 TOML 解析 ✓。
      `toml = "${dependencyVersion('toml')}"`,
      '',
    ].join('\n'),
  );
  writeFileSync(
    join(work, 'src/main.rs'),
    [
      '// 直接编译仓库里的真实模块，不是副本。',
      '// 夹具只引用其中一个符号，其余"未使用"是夹具造成的，不是代码问题。',
      '#![allow(dead_code)]',
      ...Object.entries(modules).map(([name, path]) =>
        [`#[path = ${JSON.stringify(path)}]`, `mod ${name};`].join('\n'),
      ),
      '',
      'use std::path::PathBuf;',
      'use std::sync::mpsc;',
      '',
      'fn main() {',
      '    let _ = print_com::ComPrintOutcome { ok: true, bytes: 0, elapsed_ms: 0 };',
      '    // 编排也要编：它带着"路径得拥有一份"与通道形状，正是出过借用逃逸的地方。',
      '    // 这里的 dispatch 不碰 WebView2（起不了真打印），只验证编排的类型与形状。',
      '    let _ = print_com::print_dispatch(std::path::Path::new("out.pdf"), |_path: PathBuf, _sender: mpsc::Sender<Result<mpsc::Receiver<print_com::PrintResult>, String>>| Ok(()));',
      '    let _ = print_host::print_to_pdf;',
      '    // 编排层的 Windows 分支就是本夹具存在的理由：macOS 上它被 cfg 掉了。',
      '    let _ = pdf_print::print_document_to_pdf;',
      '    let _ = pdf_print::print_html_to_pdf;',
      '    // 产品形态的入口与探针装配也带着 Windows 分支：它们不进夹具就等于没查。',
      '    let _ = files::print_native_pdf;',
      '    let _ = probe::run;',
      '}',
      '',
    ].join('\n'),
  );

  // 用 clippy 而不是 check：只查类型会漏掉 lint（如未使用的导入），
  // 而本机编不到 Windows 那段代码，交叉检查是唯一能提前发现它们的地方。
  // `-D warnings`：lint 当错误——漏掉一条 needless_return 的代价是交付宿主上的一条噪音。
  // `--all-targets`：**连测试代码一起编** ✓——`#[cfg(windows)]` 的用例只在
  // Windows 目标下才存在 ✓，不编它们就等于没人检查过 ✓
  // （交付宿主上就是这么撞出一个编不过的路径的 ✓）。
  // cargo 与 clippy-driver 都得来自 rustup 的 stable：PATH 上的 Homebrew 工具链
  // 没有 Windows 标准库，而 clippy 用的是它自己的 driver。
  // PATH 上工具链优先：clippy 用的是它自己的 driver，driver 又按 PATH 上的 rustc
  // 找 sysroot——PATH 上若是 Homebrew 的工具链，它没有 Windows 标准库。
  const toolchainBin = dirname(rustcPath);
  // **先取依赖** ✓：夹具是临时目录 ✓，runner 上什么都没有 ✓，
  // 而下面那次 clippy 走 `--offline` ✓（构建要可复现 ✓）——
  // 没有先取过，`--offline` 就会以"没有这些 crate"失败 ✓。
  // **不加 `--locked`** ✓：夹具的包名与应用那份锁文件里的根包不同 ✓，
  // 加了它会因"锁文件需要更新"而失败 ✓；不加则只是补上根条目 ✓，
  // 依赖版本仍按抄来的那份锁走 ✓ ✓。
  const fetched = run('rustup', ['run', TOOLCHAIN, 'cargo', 'fetch'], {
    cwd: work,
    env: {RUSTC: rustcPath, PATH: `${toolchainBin}:${process.env.PATH ?? ''}`},
  });
  if (fetched.code !== 0) {
    console.error('夹具依赖取不到：\n' + fetched.output);
    process.exitCode = 1;
    return;
  }
  const checked = run(
    'rustup',
    [
      'run',
      TOOLCHAIN,
      'cargo',
      'clippy',
      '--offline',
      '--target',
      TARGET,
      '--features',
      'pdf-probe',
      '--all-targets',
      '--',
      '-D',
      'warnings',
    ],
    {
      cwd: work,
      env: {RUSTC: rustcPath, PATH: `${toolchainBin}:${process.env.PATH ?? ''}`},
    },
  );
  if (checked.code !== 0) {
    console.error('Windows 侧 COM 代码交叉检查失败：\n' + checked.output);
    process.exitCode = 1;
    return;
  }
  console.log(`Windows 侧代码交叉检查通过（${TARGET}）：${Object.keys(modules).join('、')}`);
}

/**
 * **被单测导入时不跑那件事** ✓ ⇒ ⇒ 导入不该把整棵依赖树编一遍 ✓ ⇒ ⇒
 * 工具与动作分开 ✓。
 *
 * **判据是"有没有人在跑测试"** ✓（vitest 自己设 `VITEST` ✓）⇒ ⇒
 * **不是入口探测** ✓ ⇒ ⇒ 入口探测在别的运行器上可能变成**静默什么都不做** ✓
 * ⇒ ⇒ 那比不做更糟 ✓（绿的假象 ✓）⇒ ⇒ 所以这里用环境里的实据 ✓。
 */
const underTest = process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';
if (!underTest) {
  await main();
}
