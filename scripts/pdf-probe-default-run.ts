/**
 * 生成"默认构建 + 探针页"的运行配置，供 D1b-5 取运行期证据。
 *
 * D1b-5 要证的是：默认构建（不带 `pdf-probe` 特性）里，生产来源限制与主窗口允许路径仍有效。
 * **产品界面里没有调用受保护命令的路径**——导入走浏览器的 `file input`，导出走浏览器下载，
 * 原生适配器尚未接入生产组合。故取证据的办法是：把 devUrl 临时指向探针页，
 * 让**主窗口**（身份仍是 ("main","main")，在允许范围内）调用一次受保护命令。
 *
 * 这样取到的证据是真实的默认构建运行：默认构建里没有探针装配、没有输出宿主、
 * 没有探针身份，守卫与命令 span 都是生产代码原样在跑。
 *
 * 用法：bun scripts/pdf-probe-default-run.ts
 * 输出：一个临时配置文件的位置与两条命令（cmd 与 PowerShell 各一）。
 */
import {existsSync,mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';

/** 探针页在仓库里的路径（相对仓库根）。 */
const PROBE_PAGE='/tests/fixtures/architecture/pdf-probe-client.html';
/** dev server 的地址：必须与探针页同源。 */
const DEV_ORIGIN='http://127.0.0.1:3000';
/** 仓库根。 */
const repo=resolve(import.meta.dirname,'..');

/** 探针页在 dev server 上是否可取。不可取就别让人白跑一次。 */
async function probePageReachable():Promise<boolean>{
 try{
  const response=await fetch(`${DEV_ORIGIN}${PROBE_PAGE}`,{signal:AbortSignal.timeout(3000)});
  return response.ok;
 }catch{
  return false;
 }
}

async function main():Promise<void>{
 const reachable=await probePageReachable();
 if(!reachable){
  console.error(`探针页取不到：${DEV_ORIGIN}${PROBE_PAGE}`);
  console.error('先在另一个终端起 dev server：bun run dev:desktop');
  process.exitCode=1;
  return;
 }
 // 配置写到系统临时目录，不落进仓库（免得被误提交）。
 const work=mkdtempSync(join(tmpdir(),'mf-probe-default-'));
 const configPath=join(work,'probe-default.json');
 writeFileSync(configPath,JSON.stringify({
  build:{devUrl:`${DEV_ORIGIN}${PROBE_PAGE}`},
 },null,2));

 console.log('默认构建 + 探针页的运行配置已生成：');
 console.log(configPath);
 console.log('');
 // --config 是 tauri CLI 的参数（cargo 没有）→ 用 tauri dev；
 // 它会自己起 dev server，所以**不要**另起一个（端口 3000 是 strictPort，会撞）。
 console.log('cmd.exe：');
 console.log(`  cd /d ${repo}`);
 console.log(`  bun run tauri dev --config "${configPath}"`);
 console.log('');
 console.log('PowerShell：');
 console.log(`  cd ${repo}`);
 console.log(`  bun run tauri dev --config "${configPath}"`);
 console.log('');
 console.log('要点：');
 console.log('  · --config 是 tauri CLI 的参数；cargo run 不认它');
 console.log('  · tauri dev 自己会起 dev server → **不要**另起一个（端口 3000 是 strictPort，会撞）');
 console.log('  · **不设任何环境变量**（2026-11-05 起输入面只有配置文件）：级别与形态在 conf\\markflow.toml 里');
 console.log('  · **当前目录必须是仓库根**：配置在 <当前目录>\\conf\\，日志在 <当前目录>\\log\\');
 console.log('  · 默认构建（不带 pdf-probe 特性）：没有探针装配、没有输出宿主、没有探针身份');
 console.log('  · 主窗口身份仍是 ("main","main")，在允许范围内 → 会记下 source_decision=allow');
 console.log('  · 探针页会调用受保护命令并读回结果；授权在首轮后即撤销，第二轮起是 unknown-file-key');
 console.log('  · 跑完从界面正常退出（关窗口）→ 才有 run_end');
 console.log(`  · 取日志：${repo}\\log\\markflow.<pid>.log`);
 console.log('  · 与探针构建那份日志一起交给校验器：D1b-5 需要默认构建里有主窗口放行记录');
 console.log('');
 console.log(`配置内容（供手工核对）：${existsSync(configPath)?'已在上面给出的路径':''}`);
}

await main();
