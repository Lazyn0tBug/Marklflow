# Windows 侧检查与说明（2026-11-03）

给在 Windows 机器上处理的人用：先看 §1 已知问题与状态，再照 §2 的清单操作，最后用 §3 判读、§4 排查。

适用范围：`src-tauri` 的 `pdf-probe` 特性（静默 PDF 输出，D1c）。D1b 的部分已于 2026-11-03 取证完毕（日志已归档，见[阶段记录](pdf-probe-stage-record-2026-11-02.md)）。

---

## 1. 已知问题与状态

### 1.1 已修：借用逃逸（E0521）

```
error[E0521]: borrowed data escapes outside of function
  --> src\print_host.rs:40:5
   |
40 |     window
41 |         .with_webview(move |platform| {
   |         ...
   |__________`target` escapes the function body here
   |            argument requires that `'1` must outlive `'static`
```

**根因**：`with_webview` 的闭包要求 `'static`，而它捕获了函数参数 `target: &Path`（借用）→ 借用不能活得比函数久。

**修法**：跨进闭包之前先把路径**拥有**一份（`to_path_buf()`），闭包拿走那份；函数末尾仍用借来的那份取字节数。

**状态**：已修（提交 `bf0306b`）。本地交叉编译检查通过 ✓（见 §5）。

### 1.2 已修：未使用的导入

```
warning: unused import: `crate::print_com::PrintOutcome`
  --> src\print_host.rs:16:9
```

**根因**：返回类型写的是全路径 `crate::print_com::PrintOutcome`，而模块又 `pub use` 了一次 → 再导出没人用。

**修法**：返回类型改用再导出的名字 `PrintOutcome` ✓。

**状态**：已修（同上）。

### 1.3 已修：交叉检查漏掉了宿主侧

**根因**：`scripts/check-windows-com.ts` 原本只编译 `print_com.rs`（COM 部分），而 1.1 的错误在 `print_host.rs` → **本地交叉检查覆盖不到出错的那个文件**，所以没在本地拦住。

**修法**：交叉检查现在编译**两个真实文件**（`print_com.rs` 与 `print_host.rs`），并改用 **clippy** 而非 `cargo check`（只查类型会漏掉 1.2 那种 lint）。tauri 只作普通依赖、不作构建依赖——构建依赖 tauri-build 会去编译 Windows 资源文件，那需要 llvm-rc。

**状态**：已修（同上）。

---

### 1.4 本轮修复：正常关窗缺少run_end

交付宿主默认版与探针版正常关闭均未写run_end。根因是`lib.rs`将`logging::shutdown`放在Tauri `run()`之后；锁定的Tauri 2.12.4明确该调用不返回、直接退出进程，故收尾不可达。改为`build(...).run(...)`，在最终`RunEvent::Exit`中执行日志收尾，不放在可取消的`ExitRequested`。Luna实际复跑确认两种构建正常关窗均写出run_end及健康摘要。强杀/崩溃仍不保证，不将此修复扩大为崩溃可靠性声明。

### 1.5 本轮修复：两次健康快照被误判重复

正常收尾生效后，同一log span包含`observed_by=probe`和`observed_by=shutdown`两条log_health。校验器此前只以span和事件名判重复，误报`duplicate-event`。现将observed_by纳入log_health自然键；不同位置快照可共存，同位置重复仍须报错。新增两项定向单测，结果见§6。

### 1.6 本轮修复：抽模块时丢了宿主侧胶水（E0425，2026-11-04）

**症状**：交付宿主编译报 `cannot find function print_to_pdf in module crate::print_com`（`src/pdf_print.rs:363`）。

**根因**：D7-1 把打印抽成 `pdf_print.rs` 时删掉了 `print_host.rs`（**tauri 胶水**：从窗口取控制器与环境），编排层却仍按旧名去调 `crate::print_com::print_to_pdf` —— **那个函数从来不存在**（COM 核心里只有 `start_print`／`print_dispatch`／`finish_print` 三件）。

**为什么本机没拦住**：那次调用在 `#[cfg(target_os = "windows")]` 分支里 → macOS 的 clippy **编不到那一段** → 本地全绿、Windows 上才炸。与 §1.1 同类：**出错的文件不在本地能编的范围里**。

**修法**：
1. 胶水恢复成独立模块 `print_host.rs` ✓；`print_com.rs` 保持**无 tauri 依赖** ✓（交叉验证要的就是这一点 ✓）。
2. **交叉检查的覆盖面从"两个文件"扩到整条 Windows 链路** ✓：`print_com`／`print_host`／`pdf_print`／`output_host`／`logging`／`source_guard` ✓ —— 编排层的 Windows 分支从此在本机被真正类型检查 ✓（§5 ✓）。

---

## 2. 操作清单

### 2.1 前置

| 项 | 要求 |
| --- | --- |
| 代码 | 确认 `D:\code\Marklflow` 的 `architecture-refactor` 分支及待验提交；先记录工作区状态，不自动pull覆盖本地工作 |
| 工具链 | Rust 1.94.0（MSVC），与 CI 一致 |
| WebView2 | 运行时 156.0.4314.58（已装） |
| dev server | **必须在跑**（探针页要与应用同源）：另开终端 `bun run dev:desktop` |

### 2.2 编译

```bat
cd D:\code\Marklflow\src-tauri
cargo build --locked --features pdf-probe
```

**期望**：0 error、0 warning。首次编译所有依赖，会比较久。

### 2.3 跑探针

```bat
cd D:\code\Marklflow\src-tauri
set MARKFLOW_LOG=info
set MARKFLOW_LOG_FORMAT=json
cargo run --locked --no-default-features --features pdf-probe
```

**必须是 debug 构建**（`cargo run`，不是 release 产物）：debug 加载 `http://127.0.0.1:3000`（dev server），探针页与主窗口同源 ✓；release 加载内嵌前端（`tauri://localhost`），探针页成了异源，IPC 与 CSP 都不成立，**跑出来的是假证据**。

**期望**：启动即自动装配，无需点任何按钮。本轮比 D1b 长——探针页证据 → 就绪探测（≤30s）→ 打印（≤60s），合计可能几分钟。

**期间屏幕上不应出现任何原生对话框或打印面板**（D1c-5，人工项）。

**跑完从界面正常退出**（关窗口）→ 才会写 `run_end`；强杀进程日志缺这一行，校验器会报"不得宣称日志完整"。

### 2.4 取产物

| 产物 | 位置 |
| --- | --- |
| 日志 | `%LOCALAPPDATA%\com.markflow.desktop\logs\markflow.<pid>.log` |
| PDF | 默认 `D:\\code\\Marklflow\\docs\\acceptance\\pdf-probe\\probe-pdf-output.pdf`（可用 `set MARKFLOW_PROBE_PDF=<别的路径>` 改） |

**若 PDF 旁边还留着 `*.tmp-<pid>-*`**（临时名按调用唯一 ✓，带序号 ✓）：只能证明存在残留，不能直接推出打印成功或提交失败。结合本次运行的打印回调、字节数和提交日志判断；正常提交失败路径会尝试删除临时文件，残留也可能来自超时、迟到写入、清理失败或非正常退出。目标是否保留须检查，不能仅凭残留认定保护已验。

### 2.5 机器核对

把日志传回开发机：

```bash
bun scripts/pdf-probe-check.ts <日志>
```

**期望**：D1b-1—D1b-6 与 D1c-1、D1c-2 全通过、**错误级诊断 0**。

---

## 2.6 D7-1 产品形态的打印（2026-11-04 新增）

```bat
set MARKFLOW_LOG=info
set MARKFLOW_LOG_FORMAT=json
:: 让探针页做一次产品形态的打印：会弹出**原生保存对话框** ✓，请选一个你知道的目录 ✓
set MARKFLOW_PROBE_PRODUCT_PRINT=1
:: 探针层的两个界（可选 ✓，覆盖默认值 ✓）：
::   页面须在 60 秒内产出读数 ✓；读报告的总数上限 600 秒 ✓
:: set MARKFLOW_PROBE_PAGE_READY_TIMEOUT=60
:: set MARKFLOW_PROBE_REPORT_TIMEOUT=600
cargo run --locked --no-default-features --features pdf-probe
```

**慢慢选也没关系** ✓：读报告的总数上限默认 600 秒 ✓，覆盖得到 ✓；产品形态那一步本身**没有上限** ✓（原生保存对话框是阻塞调用 ✓，取消即止 ✓）—— 上限只存在于探针这一层 ✓。

| 要验的 | 怎么看 |
| --- | --- |
| **命名** | 保存对话框里的默认名是 `probe-product-shape.pdf` ✓；保存后目标文件名就是它 ✓ |
| **取消** | 在对话框里按**取消** ✓ → 日志里 `page_report_observed` 的 `product_print=cancelled` ✓，且**没有新文件** ✓ |
| **打印成功** | 保存后日志里 `product_print=saved` ✓，目标目录里出现那个 PDF ✓ |
| **失败保留旧文件** | 先在目标放一个同名旧文件 ✓ → 制造失败（把目标目录改成不可写 ✓）→ 旧文件内容不变 ✓ |

**不设这个变量时**探针页不做产品形态的打印 ✓（那轮只做 D1b／D1c 的证据 ✓）✓，已归档的证据不受影响 ✓。

## 2.7 D7-1 返工的四项验证（2026-11-04 新增）

原生侧评审查出四处，本节是**在交付宿主上怎么验它们** ✓。四条都是本机可跑的 ✓，只有第 3 条的"删不掉"那一半要 Windows 才跑得出来 ✓。

### 2.7.1 机器检查（三条命令，全在仓库根跑）

```bat
:: ① Rust 单测：临时名唯一、清理留证、命令名一致
cd src-tauri
cargo test --locked --features pdf-probe
cd ..

:: ② 命令面准入：没有命令裸奔
bun scripts/check-command-admission.ts

:: ③ 隔离前提：没有应用级 ACL manifest
bun scripts/check-native-isolation.ts
```

| 命令 | 期望输出 |
| --- | --- |
| ① | `test result: ok. 45 passed`（含下面点名的四条用例 ✓） |
| ② | `命令面准入成立：注册 8 个，受保护 6 个，不受守卫 2 个（各有准入方式），页面可回传 7 个` |
| ③ | 无输出即通过 ✓（有输出就是前提被破坏 ✓） |

### 2.7.2 四条用例各自要证明什么

| # | 改动 | 用例（机器） | 用例（跑一次看日志） |
| --- | --- | --- | --- |
| 1 | **命令名只有一处拼写** ✓：受保护命令的入口收 `WebCommand` 枚举 ✓，名字由 `command_name()` 给出 ✓ | `cargo test` 的 `the_log_name_of_a_command_is_the_name_the_page_sends` ✓——**日志里的命令名与页面发的名字必须是同一个字符串** ✓，否则跨侧配对配不上 ✓ | 跑 §2.6 那轮 ✓ → 日志里 `operation_result` 的 `command=print_native_pdf` ✓；页面侧的 `call_started`／`call_finished` 也是 `print_native_pdf` ✓；`bun scripts/pdf-probe-check.ts` 的跨侧配对**不报**"关联不匹配" ✓ |
| 2 | **临时名按调用唯一** ✓：暂存文件与目标的临时文件都带序号 ✓ | `cargo test` 的 `every_staged_document_gets_its_own_file` ✓ 与 `every_call_gets_its_own_temporary_file_next_to_the_target` ✓——**两次调用拿到两个名字，两份内容互不覆盖** ✓ | 目标同目录的临时文件名叫 `*.tmp-<pid>-<序号>` ✓（不再是 `*.tmp-<pid>` ✓）；跑完后目录里**没有残留** ✓ |
| 3 | **清理结果进证据** ✓：`temp_removed` 说删掉了没有 ✓ | `cargo test` 的 `a_locked_temp_file_cannot_be_cleaned_and_that_is_reported` ✓——**只有 Windows 上才跑** ✓（Windows 上被打开的文件删不掉 ✓，macOS 上锁不住 ✓） | 跑一轮失败（把目标目录改成不可写 ✓）→ 日志里 `probe_pdf` 带 `temp_removed` ✓；正常跑完的那轮是 `temp_removed=true` ✓。**产品形态那条路径也有** ✓：`operation_result`（`command=print_native_pdf` ✓）带 `temp_removed` ✓——那是原生侧的观测 ✓，不是页面自述 ✓ |
| 4 | **命令面有准入清单** ✓：六个受保护 ✓，两个刻意不受守卫但各有准入方式 ✓ | `bun scripts/check-command-admission.ts` ✓ + `cargo test` 之外的 `tests/unit/check-command-admission.test.ts` ✓ | 同上 ✓ |

### 2.7.3 第 3 条的"删不掉"怎么看

`temp_removed=false` 只在**文件被占着**时出现 ✓（Windows 上被打开的文件不能删 ✓）。正常跑完一定是 `true` ✓。

想亲眼看一次 `false` ✓：**跑 §2.6 那轮时故意在打印进行中占住目标目录里的临时文件** ✓（例如用记事本打开它 ✓），或者**让打印超时** ✓（COM 那边还在写 ✓，文件就被占着 ✓）。超时那次的日志会写 `probe_report_timeout` ✓（阶段完成但没标记完成 ✓），而 `probe_pdf` 的 `temp_removed` 会是 `false` ✓——**这就是"超时 → 删除"这一条第一次有了证据** ✓。

### 2.7.4 跑完交回什么

| 要交回的 | 在哪 |
| --- | --- |
| `cargo test` 的完整输出 ✓（含 45 passed ✓） | 终端 |
| `bun scripts/check-command-admission.ts` 的输出 ✓ | 终端 |
| §2.6 那轮的日志 ✓ | `%LOCALAPPDATA%\com.markflow.desktop\logs\markflow.<pid>.log` ✓ |
| 目标目录的清空截图或 `dir` 输出 ✓（证明没有 `*.tmp-<pid>-*` 残留 ✓） | 手工 |

## 3. 逐项检查表

| # | 检查项 | 怎么看 | 期望 |
| --- | --- | --- | --- |
| 1 | 编译 | `cargo build --locked --features pdf-probe` | 0 error 0 warning |
| 2 | 探针跑完 | 日志里有 `probe_cleanup` | 有 |
| 3 | 就绪成立 | `probe_readiness` | `eval_ok=true`、`is_target=true`、`ready=true`、`page_boxes=3`、`page_box_size=794x1123`、`images_loaded=images_total` |
| 4 | 打印成功 | `probe_pdf` | `ok=true`、`bytes>0`、`committed=true`、`sha256` 非空 ✓ |
| 5 | PDF 产出 | 目标文件存在 | 页数 3、页面尺寸 A4（210×297mm） |
| 6 | 无残留临时文件 | 目标同目录 | 无 `*.tmp-<pid>-*` |
| 7 | 无弹框 | 跑探针期间盯着屏幕 | 无原生对话框、无打印面板（D1c-5，人工） |
| 8 | 日志完整 | 日志末尾 | 有 `run_end` |
| 9 | 健康计数 | `log_health` | `dropped=0`、`rejected=0`、`write_failures=0`、`file_unavailable=false` |
| 10 | 机器核对 | 校验器 | 六条 D1b + 两条 D1c 全通过、错误级诊断 0 |

---

## 4. 出问题时按这个顺序查

| 症状 | 先看哪里 | 通常是什么 |
| --- | --- | --- |
| 编译报 E0521 之类 | 报错文件与行号 | 本文档 §1 有同类问题的说明；新的错误贴出来再判 |
| `probe_source_check reachable=false` | dev server 是否在跑、端口是否 3000 | dev server 没起或端口不对 |
| `probe_navigation navigated=false` | 探针页是否可取 | dev server 没提供探针页 |
| `probe_readiness eval_ok=false` | 页面是否加载 | 原生求值拿不到内容：页面没加载或执行被挡 |
| `probe_readiness is_target=false` | 导航是否换了文档 | 求值落在了别的文档上 |
| `probe_readiness ready=false` | `ready_state` 与 `fonts_status` 字段 | 文档未达就绪条件 |
| `probe_pdf ok=false` | `reason` 字段 | 带 HRESULT（原生错误码）或超时 |
| `probe_pdf ok=true committed=false` | 目标同目录 | 提交未成功；结合错误及目标前后状态检查，不以日志字段代替文件核验 |
| PDF 是空白页 | 见 §4.1 | 输入、就绪判据、打印参数或隐藏宿主行为均需排查 |
| `log_health dropped/rejected > 0` | 队列与限流计数 | 有记录没落盘，证据可能不全 → 记"未能确认"，**不要当作通过** |
| 没有 `run_end` | 是否强杀退出 | 不宣称日志完整 |

### 4.1 PDF 是空白页

先核本次输入身份、实际页面盒和字体/图片状态、打印参数、PDF页数与首末页内容，再检查隐藏宿主相关行为。`probe_readiness`通过只证明当前候选判据满足，不能排除判据不足、后续文档变化或打印设置/CSS冲突。

确需定位时，可另做受控可见宿主对照，仅作诊断并标明形态变化，不纳入隐藏静默输出通过证据，不将临时可见配置留在产品代码。可见与隐藏的输出差异是进一步排查线索，不单独证明唯一根因。

后续只调查系统WebView原生HTML输出能力；明确排除截图、离屏位图合成PDF、封装Chromium和Puppeteer。若隐藏形态存在可复现限制，按探针方案记录当前形态不可行或未能确认，不转移到截图路线。

---

## 5. 本地的交叉检查（下次改 Windows 侧代码前先跑）

```bash
bun scripts/check-windows-com.ts
```

**它做什么**：建一个临时小 crate，把仓库里的 `src-tauri/src/` 下**整条 Windows 打印链路的真文件**——`print_com.rs`、`print_host.rs`、`pdf_print.rs`、`output_host.rs`、`logging.rs`、`source_guard.rs`——编译成 `x86_64-pc-windows-msvc` 目标，并跑 clippy。依赖版本从仓库的 `Cargo.toml` 读 ✓（不会出现两套 windows-core）。

**为什么需要**：macOS 上没有 llvm-rc，`cargo check --target x86_64-pc-windows-msvc` 会停在资源编译那步 → **整棵依赖树都过不去，Windows 侧代码一处也验不了**。这个办法绕开资源编译，只验代码本身。

**前提**：rustup 工具链 + `rustup target add x86_64-pc-windows-msvc`。缺了会**跳过并说明**（不是失败——那是环境缺件）。

**它验不到什么**：
- 只验**类型与 lint**，不验运行行为（COM 调用是否成功、隐藏窗口是否排版，都得上真机）。
- `pdf_print.rs` 里的 `#[cfg(target_os = "windows")]` 分支**现在在里面** ✓（§1.6 ✓）；但 `probe.rs` 的探针接线与 `files.rs` 的 Windows 专属测试仍要靠真机 ✓。

**注意**：PATH 上若是 Homebrew 的工具链，它没有 Windows 标准库，而 clippy 用自己的 driver、按 PATH 上的 rustc 找 sysroot → 脚本已把工具链 bin 放在 PATH 前面 ✓。

## 6. 本轮Windows实际验证（2026-11-03）

基线`7f0dbe58906e6f286a24acb116ea3248431b7e76`加本轮未提交修复；由GPT-6 Luna执行定向检查。首次失败与修复后证据分别保留在`D:\codex\.codex\tmp\windows-build-check-20261103`，摘要为`summary.md`，不以复跑覆盖首次结果。

| 范围 | 实际结果 |
| --- | --- |
| 环境 | Windows x86_64；本机Rust/Cargo 1.98.1，未验证文档要求的1.94.0，不将本机结果视作CI工具链结果 |
| feature构建 | `cargo build --locked --features pdf-probe`成功；无Rust代码错误，但MSVC创建import library/.exp的stdout被Cargo `linker_messages`记为1条警告，未屏蔽，不称零警告 |
| 正常退出修复 | 默认run_id `8b1a1543-6f58-4489-8a87-d67ef941adbb`及修复后探针运行均经精确PID请求正常关窗，run_end和shutdown健康摘要存在，计数全零；首次缺run_end的记录仍保留 |
| 探针运行 | 主窗口读取允许、输出宿主拒绝、选择器机器部分及授权清理成立；错误角色读取是刻意负例，不与成功读取混为同请求 |
| 就绪与PDF | 目标文档complete、fonts loaded、3个794×1123页面盒、图片1/1；原生输出ok、committed；`probe-output-r2.pdf`为208593字节、3页A4（594.96×841.92pt） |
| 修复后机器校验 | 合并默认和feature日志：D1b-1至4、D1b-6、D1c-1/2通过；错误0、告警0、内容匹配来源提示1。退出码2，原因是D1b-5仍未能确认，不能称全项通过 |
| 定向回归 | `pdf-probe-check.test.ts` 21项通过；tools和integration两个tsconfig类型检查通过；修改的TS脚本/测试定向oxlint通过 |

首次默认权限构建因`.cargo-build-lock`访问被拒（OS error 5）失败；授权权限后继续构建，该环境失败保留，不归为代码失败。完整命令、日志及哈希见外部摘要。

**待补门槛**：默认构建未实际触发受保护主窗口命令，D1b-5允许路径仍缺运行证据；全程无选择器/打印面板需人工观察；PDF正文、CJK、公式图表及首末页内容未独立验证；Rust 1.94.0及其他OS未验。PDF文件存在、页数正确与原生返回成功均不能替代这些项目。本轮未运行无关全量前端回归，不宣称D1c/D1d完整验收通过。
