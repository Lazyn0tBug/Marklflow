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
 * 用法：bun scripts/check-windows-com.ts
 * 需要：rustup 的 Windows 目标（`rustup target add x86_64-pc-windows-msvc`）。
 * 目标不在时**跳过并说明**，不当作失败——这是环境缺件，不是代码问题。
 */
import {execFileSync} from 'node:child_process';
import {mkdirSync,mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';

/** 交叉编译的目标。WebView2 是 Windows 专属，故取 MSVC 目标。 */
const TARGET='x86_64-pc-windows-msvc';
/** 仓库根。 */
const repo=resolve(import.meta.dirname,'..');
/** 被检查的 COM 模块（真实文件）。 */
const source=join(repo,'src-tauri/src/print_com.rs');

/** 跑一条命令；失败时返回其输出，不抛。 */
function run(command:string,args:string[],options:{cwd?:string;env?:Record<string,string>}={}):{code:number;output:string}{
 try{
  const output=execFileSync(command,args,{
   cwd:options.cwd,
   env:{...process.env,...options.env},
   encoding:'utf8',
   stdio:['ignore','pipe','pipe'],
  });
  return {code:0,output};
 }catch(error){
  const failure=error as {status?:number;stdout?:string;stderr?:string};
  return {
   code:failure.status??1,
   output:`${failure.stdout??''}${failure.stderr??''}`,
  };
 }
}

/** 从仓库的 Cargo.toml 取依赖版本：夹具用同一套版本，不会出现两套 windows-core。 */
function dependencyVersion(name:string):string{
 const manifest=readFileSync(join(repo,'src-tauri/Cargo.toml'),'utf8');
 const pattern=new RegExp(`^${name.replace(/[-]/g,'\\-')}\\s*=\\s*"([^"]+)"`,'m');
 const matched=pattern.exec(manifest);
 if(!matched)throw new Error(`Cargo.toml 里找不到依赖：${name}`);
 return matched[1]??'';
}

function main():void{
 // 目标是否可用。Homebrew 的 rustc 不带 Windows 标准库，须用 rustup 工具链的。
 const rustc=run('rustup',['which','--toolchain','stable','rustc']);
 if(rustc.code!==0){
  console.log('跳过：本机没有 rustup 工具链，Windows 侧代码无法交叉编译验证');
  process.exitCode=0;
  return;
 }
 const rustcPath=rustc.output.trim();
 const installed=run(rustcPath,['--print','target-libdir','--target',TARGET]);
 if(installed.code!==0){
  console.log(`跳过：rustup 工具链没装 ${TARGET}（rustup target add ${TARGET}）`);
  process.exitCode=0;
  return;
 }

 const work=mkdtempSync(join(tmpdir(),'mf-windows-com-'));
 mkdirSync(join(work,'src'),{recursive:true});
 writeFileSync(join(work,'Cargo.toml'),[
  '[package]',
  'name = "mf-windows-com-check"',
  'version = "0.0.0"',
  'edition = "2021"',
  '',
  '[dependencies]',
  // 版本串本身带精确锁定（如 "=0.39.1"），照抄即可。
  `webview2-com = "${dependencyVersion('webview2-com')}"`,
  `windows = "${dependencyVersion('windows')}"`,
  '',
 ].join('\n'));
 writeFileSync(join(work,'src/main.rs'),[
  '// 直接编译仓库里的真实模块，不是副本。',
  `#[path = ${JSON.stringify(source)}]`,
  'mod print_com;',
  '',
  'fn main() {',
  '    let _ = print_com::PrintOutcome { ok: true, bytes: 0, elapsed_ms: 0 };',
  '}',
  '',
 ].join('\n'));

 const checked=run('cargo',['check','--offline','--target',TARGET],{
  cwd:work,
  env:{RUSTC:rustcPath},
 });
 if(checked.code!==0){
  console.error('Windows 侧 COM 代码交叉编译失败：\n'+checked.output);
  process.exitCode=1;
  return;
 }
 console.log(`Windows 侧 COM 代码交叉编译通过（${TARGET}，编译的是 ${source}）`);
}

main();
