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

## 2. 操作清单

### 2.1 前置

| 项 | 要求 |
| --- | --- |
| 代码 | `git pull` 到 `D:\\code\\Marklflow`（分支 `architecture-refactor`） |
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
cargo run --no-default-features --features pdf-probe
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

**若 PDF 旁边还留着 `*.tmp-<pid>`**：说明打印成功但 rename 提交没成功 → 目标文件未被替换（原文件仍在 ✓，这是保护生效）。

### 2.5 机器核对

把日志传回开发机：

```bash
bun scripts/pdf-probe-check.ts <日志>
```

**期望**：D1b-1—D1b-6 与 D1c-1、D1c-2 全通过、**错误级诊断 0**。

---

## 3. 逐项检查表

| # | 检查项 | 怎么看 | 期望 |
| --- | --- | --- | --- |
| 1 | 编译 | `cargo build --locked --features pdf-probe` | 0 error 0 warning |
| 2 | 探针跑完 | 日志里有 `probe_cleanup` | 有 |
| 3 | 就绪成立 | `probe_readiness` | `eval_ok=true`、`is_target=true`、`ready=true`、`page_boxes=3`、`page_box_size=794x1123`、`images_loaded=images_total` |
| 4 | 打印成功 | `probe_pdf` | `ok=true`、`bytes>0`、`committed=true` |
| 5 | PDF 产出 | 目标文件存在 | 页数 3、页面尺寸 A4（210×297mm） |
| 6 | 无残留临时文件 | 目标同目录 | 无 `*.tmp-<pid>` |
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
| `probe_pdf ok=true committed=false` | 目标同目录 | 打印成功但 rename 没成功 → 目标未被替换 |
| PDF 是空白页 | 见 §4.1 | 打印宿主是隐藏窗口 |
| `log_health dropped/rejected > 0` | 队列与限流计数 | 有记录没落盘，证据可能不全 → 记"未能确认"，**不要当作通过** |
| 没有 `run_end` | 是否强杀退出 | 不宣称日志完整 |

### 4.1 PDF 是空白页

**先怀疑"打印宿主是 `visible(false)` 的隐藏窗口"**：隐藏窗口的 WebView2 是否照常排版并被打印，本机验不了（macOS 没有 WebView2）。

不是打印设置的问题（已钉死 A4 与零边距 ✓），也不是就绪判据的问题（`probe_readiness` 已确认文档就绪 ✓）。

要试的话：把打印宿主改成可见再跑一次（**只作诊断用，不要留在代码里**），看 PDF 是否正常。若可见就正常 → 隐藏窗口是症结，接下来要么找 WebView2 对隐藏窗口的排版要求，要么改用"渲染到离屏位图再合成"的路线（那是新工作，不在 D1c 范围内）。

---

## 5. 本地的交叉检查（下次改 Windows 侧代码前先跑）

```bash
bun scripts/check-windows-com.ts
```

**它做什么**：建一个临时小 crate，把仓库里的 `src-tauri/src/print_com.rs` 与 `src-tauri/src/print_host.rs` **真文件**编译成 `x86_64-pc-windows-msvc` 目标，并跑 clippy。依赖版本从仓库的 `Cargo.toml` 读 ✓（不会出现两套 windows-core）。

**为什么需要**：macOS 上没有 llvm-rc，`cargo check --target x86_64-pc-windows-msvc` 会停在资源编译那步 → **整棵依赖树都过不去，Windows 侧代码一处也验不了**。这个办法绕开资源编译，只验代码本身。

**前提**：rustup 工具链 + `rustup target add x86_64-pc-windows-msvc`。缺了会**跳过并说明**（不是失败——那是环境缺件）。

**它验不到什么**：
- 只验**类型与 lint**，不验运行行为（COM 调用是否成功、隐藏窗口是否排版，都得上真机）。
- 只覆盖这两个文件；`probe.rs` 里的探针接线仍要靠真机。

**注意**：PATH 上若是 Homebrew 的工具链，它没有 Windows 标准库，而 clippy 用自己的 driver、按 PATH 上的 rustc 找 sysroot → 脚本已把工具链 bin 放在 PATH 前面 ✓。
