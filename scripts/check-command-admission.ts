import {readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';

/**
 * 命令面的准入清单：**没有命令裸奔**。
 *
 * 六个受保护命令都走 `in_command_span` ✓ → 来源守卫判定 ✓ → 放行或拒 ✓。
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
const repo=resolve(import.meta.dirname,'..');

/** 刻意不受来源守卫管的命令，以及各自的准入方式。 */
export const UNGUARDED:Record<string,string>={
 get_platform_info:'只报平台信息与调用方自己的身份，不碰文件、不弹框',
 log_event:'只写日志；准入看 logging::log_writer_allowed（主窗口与已登记的探针实例）',
};

/** 枚举变体名 → serde 的 snake_case（枚举上写的是 `rename_all = "snake_case"` ✓）。 */
export function snake(name:string):string{
 return name.replace(/([a-z0-9])([A-Z])/g,'$1_$2').toLowerCase();
}

/** 取一段源码里的第一个方括号块。 */
function bracketBlock(source:string,anchor:string):string{
 const start=source.indexOf(anchor);
 if(start<0)throw new Error(`源码里找不到：${anchor}`);
 const open=source.indexOf('[',start);
 const close=source.indexOf(']',open);
 if(open<0||close<0)throw new Error(`源码里找不到对应的方括号：${anchor}`);
 return source.slice(open+1,close);
}

/** 注册表里的命令名：去掉模块前缀 ✓，去掉行尾注释与逗号 ✓。 */
function registeredCommands(source:string):string[]{
 return bracketBlock(source,'generate_handler!')
  .split('\n')
  .map(line=>line.replace(/\/\/.*$/,'').trim().replace(/,$/,'').trim())
  .filter(line=>line.length>0)
  .map(line=>line.replace(/::/g,' ').split(/\s+/).pop()??'')
  .filter(name=>name.length>0);
}

/** 走守卫的命令：从 `in_command_span(WebCommand::X` 里取 ✓。 */
function guardedCommands(source:string):string[]{
 const names:string[]=[];
 const pattern=/in_command_span\(\s*WebCommand::([A-Za-z0-9_]+)/g;
 for(const match of source.matchAll(pattern))names.push(snake(match[1]??''));
 return names;
}

/** 页面可回传的命令：枚举 `WebCommand` 的变体 ✓。 */
function reportableCommands(source:string):string[]{
 const start=source.indexOf('pub enum WebCommand');
 if(start<0)throw new Error('源码里找不到 WebCommand 枚举');
 const open=source.indexOf('{',start);
 const close=source.indexOf('\n}',open);
 if(close<0)throw new Error('WebCommand 枚举没有正常结束');
 return source
  .slice(open+1,close)
  .split('\n')
  .map(line=>line.replace(/\/\/.*$/,'').trim())
  .filter(line=>/^[A-Z][A-Za-z0-9]*,?$/.test(line))
  .map(line=>snake(line.replace(/,$/,'')));
}

/** 读三个源文件，得出三份命令名单。 */
export interface CommandSurface{
 registered:string[];
 guarded:string[];
 reportable:string[];
}

export function readCommandSurface(root:string=repo):CommandSurface{
 const lib=readFileSync(join(root,'src-tauri/src/lib.rs'),'utf8');
 const files=readFileSync(join(root,'src-tauri/src/files.rs'),'utf8');
 const logging=readFileSync(join(root,'src-tauri/src/logging.rs'),'utf8');
 return {
  registered:registeredCommands(lib),
  guarded:guardedCommands(files),
  reportable:reportableCommands(logging),
 };
}

/** 没有准入方式的命令：既没走守卫，也不在显式清单里 ✓。 */
export function nakedCommands(surface:CommandSurface):string[]{
 return surface.registered.filter(name=>!surface.guarded.includes(name)&&!(name in UNGUARDED));
}

/** 走守卫却不在页面可回传的枚举里：编译器也拦着 ✓，这里再报一次 ✓。 */
export function unreportableGuarded(surface:CommandSurface):string[]{
 return surface.guarded.filter(name=>!surface.reportable.includes(name));
}

export default function checkCommandAdmission():void{
 const surface=readCommandSurface();
 const naked=nakedCommands(surface);
 const unreportable=unreportableGuarded(surface);
 const problems:string[]=[];
 if(naked.length){
  problems.push(
   '这些命令既没走来源守卫，也不在显式的不受守卫清单里（裸奔）：',
   ...naked.map(name=>`  ${name}`),
   '要么把它接进 in_command_span，要么在 UNGUARDED 里写明它的准入方式。',
  );
 }
 if(unreportable.length){
  problems.push(
   '这些命令走了守卫，却不在页面可回传的 WebCommand 枚举里（页面的事件会被整条拒收）：',
   ...unreportable.map(name=>`  ${name}`),
  );
 }
 if(problems.length){
  console.error(problems.join('\n'));
  process.exitCode=1;
  return;
 }
 console.log(
  `命令面准入成立：注册 ${surface.registered.length} 个，受保护 ${surface.guarded.length} 个，`
  + `不受守卫 ${Object.keys(UNGUARDED).length} 个（各有准入方式），页面可回传 ${surface.reportable.length} 个`,
 );
}

if(process.argv[1]?.endsWith('check-command-admission.ts'))checkCommandAdmission();
