# Windows 静默 PDF 探针阶段记录

统一阶段记录，按小步增量追加。方案见[探针实施方案](../design/pdf-probe-implementation-plan-2026-11-02.md)，决定见[决策记录](../design/export-outputs-open-questions-2026-11-02.md)。

本文件只记实际执行与证据，不改写既有结论。所有结论按其性质标注为**源码级**（读实现得出）或**运行级**（实际执行得出）。D0 全部结论为源码级，运行能力仍未验证。

## D0 基线与产物核对（2026-11-02）

- 基线提交：`a65c5ee5adfba8328b65ddfe939e4b1d5e3aa7e0`
- 平台：macOS 26.6.2（build 25G83），arm64；本机 Rust 1.94.0；Playwright chromium 1.64.1
- 范围：只读核对与受控样本生成，不改被检查的产品代码

### 九项核对结论

| 项 | 结论 | 性质 | 证据 |
| --- | --- | --- | --- |
| D0-1 COM 接口覆盖 | 成立。`ICoreWebView2_7::PrintToPdf` 在 `webview2-com-sys 0.39.1/src/bindings.rs` 声明；`webview2-com` 经 `pub use webview2_com_sys::Microsoft`（`webview2-com-0.39.1/src/lib.rs:2`）再导出，路径为 `webview2_com::Microsoft::WebView2::ICoreWebView2_7`。`webview2-com` 手写包装层不暴露 `PrintToPdf`，须走 sys 层 | 源码级 | registry `index.crates.io-*/webview2-com-sys-0.39.1/src/bindings.rs` |
| D0-1 备选路线 | **纠正**：锁定版本只有 webview2-com 一条路线。`windows 0.62.2` 不含 `Win32_System_Win32_WebView2` 特性，亦无 `src/Windows/Win32/WebView2` 目录。前轮"若 webview2-com 不含 ICoreWebView2_7 可改用 windows crate"的备选在锁定版本下不存在 | 源码级 | `windows-0.62.2/Cargo.toml`、`windows-0.62.2/src` |
| D0-2 PlatformWebview 形态 | 成立。`controller()` 与 `environment()` 均为包装层方法 | 源码级 | `tauri-2.12.4/src/webview/mod.rs:184`、`:193` |
| D0-3 应用自定义命令默认行为 | **应用自定义命令在本地来源下默认放行，ACL 不构成隔离**。invoke 时的 ACL 判定仅在「插件命令 / `has_app_acl_manifest` / 非本地来源」三者之一成立时才检查；`has_app_manifest` 为 `acl.contains_key(APP_ACL_KEY)`，而生成的 `gen/schemas/acl-manifests.json` 中只有 `core:*` 与 `dialog`，**无应用作用域条目**（仓库无 `src-tauri/permissions/` 目录），故 `has_app_acl` 为 false，本地来源的应用自定义命令不走 ACL | 源码级 | `tauri-2.12.4/src/webview/mod.rs:2078-2083`；`tauri-utils-2.10.2/src/acl/mod.rs:352`；`tauri-2.12.4/src/ipc/authority.rs:462`、`:121`、`:213`、`:338`；`src-tauri/gen/schemas/acl-manifests.json` |
| D0-4 异步身份注入 | **纠正**：无同步或异步约束。`impl CommandArg for Webview<R>` 存在，`from_command` 返回 `command.message.webview()` 且注释写明 never fail；`CommandArg` trait 签名不含同步或异步约束 | 源码级 | `tauri-2.12.4/src/webview/mod.rs:2604`；`tauri-2.12.4/src/ipc/command.rs:66` |
| D0-4 注入类型 | 支持 Q23 与 Q33。`WebviewWindow` 的 `CommandArg` 实现在调用方非 WebviewWindow 时返回错误，注入 `Webview` 无此失败模式 | 源码级 | `tauri-2.12.4/src/webview/webview_window.rs:1606` |
| D0-5 invoke 通道 | 成立。`invoke` 直接调用 `window.__TAURI_INTERNALS__.invoke`；`window.__TAURI__` 只是 `withGlobalTauri` 控制的全局命名空间，底层通道不依赖它。internals 由 initialization script 注入，不受页面 CSP `script-src` 约束 | 源码级 | `node_modules/@tauri-apps/api/core.js:340-341`；`tauri-2.12.4/src/app.rs:1733`、`:1808` |
| D0-6 探针通道与签发入口 | 形态已由 Q14、Q17、Q18、Q20、Q21 定形，本轮无新增核对项 | 决定 | 决策记录 §4、§5 |
| D0-7 主界面身份对应 | 源码级成立。`WebviewWindowBuilder::new` 把同一 label 传给 `WebviewBuilder::new`，`from_config` 取 config 的 label，故主界面前端 WebView 的 label 与窗口 label 同为 `main`，身份对为 `("main","main")`。运行时由 D1a-6 核对 | 源码级 | `tauri-2.12.4/src/webview/webview_window.rs:105`、`:150` |
| D0-8 附着式继承机制 | 机制已录：`resolve_access` 以 `cmd.webviews` 或 `cmd.windows` 任一匹配即通过，故同窗 webview 命中 `windows:["main"]` 的 capability；capability 亦可用 `webviews:[...]` 精确列举。按 Q27 未创建、未调用该形态 | 源码级 | `tauri-2.12.4/src/ipc/authority.rs:462-489` |
| D0-9 发行脚本与有效 feature | 成立。三条 matrix `args` 均无 `--features` 或 `--all-features`（`--target`/`--bundles`/`--ci`/`-- --locked`）；`src-tauri/Cargo.toml` 目前无 `[features]` 段；`ci.yml` 无 cargo 构建步骤；`tauri-build.yml` 固定 toolchain 1.94.0 | 源码级 | `.github/workflows/tauri-build.yml:33-40`、`:55-58`；`.github/workflows/ci.yml`；`src-tauri/Cargo.toml` |

### D0-3 的四条后果

1. Q36 的证据来源分支落在「默认放行」一侧：输出宿主调用敏感命令时 ACL 不拦，来源守卫会执行并返回共享稳定拒绝码，**D1b-3 的正向证据完全自有，不需匹配任何 Tauri 消息格式**。
2. **ACL 不是本项目的隔离层，来源守卫是唯一隔离层。**
   - **推论（2026-11-04 补记 ✓）**：`src-tauri/capabilities/default.json` **什么都不做** ✓ —— `permissions` 是空数组 ✓，仓库里没有 `src-tauri/permissions/` 目录 ✓（所以没有应用级清单 ✓），插件的 JS 侧命令也没被用过 ✓（对话框是 Rust 侧调的 ✓）。它**看着像隔离层** ✓，其实不是 ✓ → **它是误导物** ✓ → **简化方向：删掉它** ✓（宿主上验一遍 ✓，别凭推断就删 ✓）。
   - **已删（2026-11-05 ✓）**：交付宿主上**删前删后各跑两轮** ✓（探针轮 ✓ 与产品形态轮 ✓），**逐条一致** ✓ —— 记录条数 ✓、页面侧 web 事件条数 ✓、守卫判定 ✓、`log_health` ✓、校验器判定 ✓ 全同 ✓；原生保存对话框在删后照常弹 ✓（`select_native_save granted=true` ✓）→ **它确实不管事** ✓ → 删掉 ✓（提交自带 ✓）。
3. **D1a 落地前输出宿主不存在任何 IPC 隔离**，因此不得在 D1a 之前创建输出宿主。
4. 若将来引入应用级 ACL manifest（新增 `src-tauri/permissions/` 目录），`has_app_acl` 变 true，ACL 将开始检查应用自定义命令——D1b-3 的证据来源与放行行为都会变。**D1b 与 D7 的复用前提须包含「未引入应用级 ACL manifest」。**
   - **该前提已由机器断言** ✓（2026-11-04 ✓）：`scripts/check-native-isolation.ts` 断言 `src-tauri/permissions/` 不存在 ✓，并接进 `bun run lint` ✓（CI 每次都跑 ✓）。真要引入那个目录时，这条断言会先红 ✓——那时才该改 D1b/D7 的取证前提 ✓。

### 这道闸今天守着的是双保险（2026-11-04 补记 ✓）

打印宿主里加载的是**导出那份 HTML** ✓：它带 CSP ✓（`default-src 'none'` ✓，脚本跑不起来 ✓），
内容进它之前过了 DOMPurify ✓，文档里零脚本 ✓。**所以那份内容本来就作不了恶** ✓，
守卫对打印宿主的拒绝是"万一" ✓，不是唯一的那一道 ✓。

它**真正不可替代**的地方是**它是验收的标的物** ✓：D1b-3 的正向证据就是"输出宿主被拒" ✓ ——
没有角色分离 ✓，那轮验收就没有对象 ✓。

**它会变成唯一一道的那刻** ✓：当交给打印机的 HTML 不再只来自那个被清洗过的导出时 ✓
（插件 ✓、第三方模板 ✓、用户自带 HTML ✓、或者导出链哪天引入了脚本 ✓）。
**那时它够不够用，要看那时候的输入面** ✓。

**顺带定下"用户"这一维在本应用没有对象** ✓：身份是 **webview 的身份** ✓，不是人的身份 ✓ ——
桌面应用只有一个用户 ✓，没有账号 ✓，没有多用户 ✓。**别在这上面加用户/角色体系** ✓。

**这一轮定下的简化方向**（2026-11-04 ✓）：

| 不做 | 为什么 |
| --- | --- |
| 保持目标文件的 ACL ✓ | 写的是用户自己挑的文件 ✓；Windows 上的主流应用同样是替换 ✓；隔离不依赖文件权限 ✓ |
| 用户／角色体系 ✓ | 这一维在本应用没有对象 ✓ |
| 能力清单文件（`src-tauri/capabilities/default.json`）✓ | 它**什么都不做** ✓ → 它是误导物 ✓ → **已删** ✓（2026-11-05 ✓，宿主上删前删后逐条一致 ✓） |
| 第二个隔离层 ✓ | 隔离**只有一道闸** ✓（来源守卫 ✓）；Tauri 的 ACL 不检查应用自定义命令 ✓ |

**什么时候要重新评估** ✓：当交给打印机的 HTML 不再只来自那个被清洗过的导出时 ✓
（插件 ✓、第三方模板 ✓、用户自带 HTML ✓、或者导出链哪天引入了脚本 ✓）——
那时来源守卫就从双保险变成**唯一一道** ✓，够不够用要看那时候的输入面 ✓。

### 交接物（五项）

| 项 | 内容 |
| --- | --- |
| 固化分页 HTML | `docs/acceptance/pdf-probe/frozen-sample.html`，129184 字节；元数据同目录 `frozen-sample.meta.json` |
| 文件 SHA-256 | `78aff00c92253b499fb400c72117348bdad7af8c1b0a9ace50812d0f553b50c0`（`shasum -a 256` 独立复算一致，与交付宿主原件逐字节相同）。**只锁定这一个文件** |
| 输入身份 | `mdHash` = `d70fc6c053386ce0b17b1a29b8e5d856d8310229a88732a58a4ea7693b288b6b`；`renderConfigVersion` = `00a5fd6b1931c6ed41caf7635ea88405a29883fe4b6d45575ff9a60f5a784f4e`。**同一输入的稳定标识**，跨运行、跨宿主一致 |
| 预期值 | `data-export-pages="3"`；页面盒 3；HEAD 标记第 1 页、TAIL 标记第 3 页，各出现 1 次；随机 UUID 属性 635 处 |
| 环境说明 | **交付宿主**：Windows 11，内部版本 10.0.26300，x64；Playwright chromium 1.64.1（Chromium 156.0.8078.4）；vite 运行时 `node`；主题字体栈 `--mf-font: system-ui,"Microsoft YaHei","PingFang SC",sans-serif`；宿主实际解析到的平台字体 **Microsoft YaHei UI**（CJK 与拉丁，948 字形／58 节点）与 **Consolas**（代码，51／1）；WebView2 运行时 156.0.4314.58；样本源 `tests/fixtures/export-source/pdf-probe-sample.md` |
| 结论 | D1 可直接加载该固定文件，不在 D1 重新驱动前端生成。**本表已换成交付宿主产出的样本**（此前为 macOS 占位，不得用于 D1） |

### 命令与退出码

| 命令 | 退出码 | 结果 |
| --- | --- | --- |
| `cargo fetch --locked`（src-tauri） | 0 | 取到 tauri 2.12.4、wry 0.57.1、webview2-com(-sys) 0.39.1、windows 0.62.2；未改仓库、未改 Cargo.lock |
| `cargo build`（src-tauri） | 0 | 225 crates，32.51s；生成 `src-tauri/gen/schemas/`（构建产物，不入库） |
| `cargo test --locked`（src-tauri） | 0 | 6 passed / 3 suites |
| `bun scripts/pdf-probe-sample.ts` | 0 | 产出固化样本并自检（页数、标记、页盒数一致、字体证据已取） |
| `bun run lint` | 0 | check:source、check:boundaries、oxlint 均通过 |
| `bun run typecheck` | 0 | 四个 tsconfig 配置全部通过；`bun run test:unit` 69 文件 491 用例通过 |

### 两项工程事实

**MSRV 由 1.98 降到 1.94，CI 一致降版本。** `.github/workflows/tauri-build.yml` 的 toolchain 同步由 1.98.1 降为 1.94.0，与 `src-tauri/Cargo.toml` 的声明一致，MSRV 下限在 CI 中得以验证。本机 Rust 1.94.0 低于原声明的 1.98（原声明来自 M1 当时的本机 1.98.1，见 `docs/reviews/tauri-migration-m1-2026-10-29.md:10`），`cargo build` 因版本不足被拒；降到 1.94 后编译与测试通过。 本机 Rust 测试 6 项通过：files.rs 共 7 个 `#[test]`，其中 `persist_failure_preserves_existing_file_and_cleans_temp_file` 为 `#[cfg(windows)]`，在 macOS 不编译——与 M3 记录的「7 项 Rust 通过」为平台差异，非用例缺失。

**固化产物不是字节可复现的，但这不是缺陷，也不需要解决。** 同一受控源两次生成字节数相同而 SHA-256 不同，原因是 Paged.js 写入 635 处随机 UUID 属性（`data-ref`、`data-split-to`、`data-split-from` 等）。检索仓库既有实现：**仓库从不对产出字节做哈希**，产出身份由输入哈希承担——`src/core/export/exportContent.ts:18` 的 `renderConfigVersion` 为 sha256({contract, theme, options, css, assets[source,sha256]})，`mdHash` 为 sha256(markdown)，`src/application/tasks/previewIdentity.ts:7` 的预览缓存键即 (documentId, previewKind, mdHash, renderConfigVersion)；对可能不完整的产出另用 render nonce 区分（`src/core/platform/web/documentRepository.ts:50`）。故本阶段沿用同一模型：**`mdHash` 与 `renderConfigVersion` 承担「同一输入」的稳定身份，文件 SHA-256 只作为该文件的完整性校验**。实测两者跨运行一致、文件哈希每次不同，与既有模型吻合。不引入 UUID 归一化等自造手段，也不为哈希改生产代码。

### 第三项工程事实：样本脚本此前不在类型检查内，CI 会被破坏

`c22cef7` 引入的 `scripts/pdf-probe-sample.ts` 在浏览器端用 `/src/...` 动态导入并直接引用 DOM 全局，在 Node 侧 tsconfig 下报 7 处错误；而 CI 每次推送都跑 `bun run typecheck`，**该提交一旦推送即破 CI**。修法按仓库既有做法，不新造配置：`scripts/measure-architecture-baseline.ts` 早已因同类原因被排除在 tools 配置外并收入 integration 配置，本脚本照此归入 `tsconfig.integration.json`（带 DOM lib），从 `tsconfig.tools.json` 排除，并在 base 的 `paths` 增加 `/src/*` → `./src/*` 映射。现在四个配置全部通过，类型覆盖检查仍为 229 个受管源全覆盖。

### 未验项与待 D1 验证的边界

- 全部结论为源码级；运行能力未验证
- D0-3 的运行期确认归 D1b（输出宿主实际拦截路径）
- D0-5 的探针页实际发起调用归 D1b
- D0-7 的运行时实际身份归 D1a-6
- D0-9 的当次发行环境归 D1b 与 D7

### 样本的字体环境：定为与交付宿主同环境

主题字体栈为 `system-ui,"Microsoft YaHei","PingFang SC",sans-serif`。字体度量不同，断行与行高随之不同；固化分页的页面盒高度按生成时的字体度量算得，跨环境加载同一文件会以宿主字体重新排版，固定高度页面盒可能溢出或截断，而「不重复分页」意味着 D1 无法修正。

因此**定为：受控样本必须在交付宿主同环境生成**。归档**已换成交付宿主产出的样本**（2026-11-03），交接物表随之更新；此前的 macOS 占位样本不得用于 D1。

**宿主实际字体现已可测。** 脚本此前只记 CSS 字体栈，记的是"要求用什么"，不是"实际用了什么"；现补两项证据并写入 meta：CDP `CSS.getPlatformFontsForNode` 逐节点读出浏览器实际用于渲染的平台字体名（只对直接含文本的节点有结果，故遍历正文节点聚合），以及逐族 canvas 测宽（以故意不存在的族作基线，宽度与基线相同即该族在宿主上不存在）。macOS 实测：CJK 落到 **PingFang SC**（810 字形／47 节点），拉丁落到 **.SF NS**（138／18），代码落到 **Courier**（51／1）；测宽显示 `"Microsoft YaHei"` 与基线同宽，即该族在 macOS 上不存在。

Windows 侧的**预期**（待人工实测核对，非既成事实）：拉丁经 `system-ui` 落到 Segoe UI，CJK 因 Segoe UI 无汉字而落到 **Microsoft YaHei**，代码落到 **Consolas**；测宽应显示 `"Microsoft YaHei"` 与基线不同宽。若实测与此不符，先查宿主字体与主题栈的实际解析，再谈样本可用性。

### 交付宿主首次取样（2026-11-03）：输入身份不一致，暂不能归档

**此节已于同日消解**：重新检出为 LF 后，交付宿主第二次取样的 `mdHash` 与 `renderConfigVersion` 均与本记录交接物表一致，CRLF 一条消除（处置见下）。本节保留首次取样的数据作为该陷阱的证据。

交付宿主（Windows 11，内部版本 10.0.26300，`D:\code\Marklflow`）已跑过一次取样，产出与本机 macOS 归档**在输入身份上就不一致**，因此暂不替换归档。

| 项 | macOS（本机） | Windows（交付宿主） | 判定 |
| --- | --- | --- | --- |
| `mdHash` | `d70fc6c0…88b6b` | `cb5fa82b…e0308` | **不一致** |
| `renderConfigVersion` | `00a5fd6b…784f4e` | `a8782969…6fad` | **不一致** |
| 文件 SHA-256 | `e8e6c5b7…c3872` | `d8062a4e…46a4a` | 不一致（预期） |
| 字节数 | 129184 | 129211 | 差 27 |
| `data-export-pages` / 页面盒 | 3 / 3 | 3 / 3 | 一致 |
| HEAD / TAIL 标记页 | 1 / 3 | 1 / 3 | 一致 |

**原因是行尾，不是字体。** 把仓库的 `tests/fixtures/export-source/pdf-probe-sample.md` 从 LF 转成 CRLF 重算 sha256，得 `cb5fa82b01db13b4ecf51a56ed27bff295c9c9fdfc8ffb2468f7a453ed4e0308`，与交付宿主报的值**逐位相同**；同一转换作用于 `src/styles/document.css` 恰好多 27 字节，与两个样本的字节差一致（该 CSS 进入导出产物的 `<style>`，共 27 行）。即：Windows 上的检出是 CRLF，**同一份源码换了身份**。

这条与既有先例同源：`tests/fixtures/architecture/*.md text eol=lf` 是 A0 架构基线冻结夹具哈希时加的（提交 `32b5b0c`），但只钉了一个目录，新的受控样本与导出主题 CSS 都没被覆盖。

**已修**：`.gitattributes` 增加 `* text=auto eol=lf`，把行尾规则提升到全仓库。仓库内既有 blob 本就是 LF（逐文件核对 CR 数为 0），故该改动只影响 Windows 的**检出**，不改仓库内容，不产生规范化改动。

**处置过程与其教训**：交付宿主按"拉取 → 重新检出"重做后，哈希仍是 CRLF 的那一个——因为带 `.gitattributes` 的提交（`0845cde`）当时**只在 macOS 本地，未到远端**，`git pull` 没有新东西可拉，重新检出用的仍是只钉了一个 glob 的旧规则。改为在交付宿主上 `git config core.autocrlf false` 后重新检出，输入哈希随即与本记录一致。

两条教训记此：

1. **凡是"让两台机器行为一致"的修改，验收必须在两台机器上做。** 单平台的检出恒等于 blob 内容，CRLF 这类问题在单平台上永远测不出来；本地全绿的验证对"跨机器契约"无效。
2. **行尾规则不只保护输入，也保护归档自身。** `docs/acceptance/pdf-probe/frozen-sample.html` 是文本文件，未钉行尾时在 Windows 上检出同样变 CRLF，磁盘上复算的 SHA-256 会与 meta 里记的（生成时内存中的内容）对不上，那条"独立复算一致"的校验随之失效。

**这一条记进 D1 的前提**：产出身份由输入哈希承担，因此"同一输入"的前提是**同一批字节**，不只是同一份源码。交付宿主、Windows 的 git 配置、以及夹具与归档是否被行尾规则覆盖，都是身份的一部分。

### 交付宿主事实（2026-11-03，人工确认）

| 事实 | 状态 | 对 D1 的意义 |
| --- | --- | --- |
| WebView2 运行时 | **已安装，版本 156.0.4314.58** | Tauri v2 桌面端在该宿主可启动。**D1c 的硬前提**：D1c 要经 `ICoreWebView2_7::PrintToPdf` 出 PDF，该接口自运行时 93 版起提供（`ICoreWebView2_7` 本身自 89 版起），156 版远超此线，此前 D1c 的状态"环境依赖缺失"由此排除 |
| 微软雅黑 | **已安装** | 与 `platformFonts` 实测到的 `Microsoft YaHei UI` 一致；样本的 CJK 与拉丁在该宿主都用雅黑 UI |
| 操作系统 | Windows 11，内部版本 10.0.26300（取自 meta 的 `environment.osRelease`） | 宿主标识，随交接物表归档 |

**排版引擎与交付引擎同代。** 分页用的 Playwright 1.64.1 内置 **Chromium 156.0.8078.4**（revision 1248），而交付宿主加载固化样本时用的是 **WebView2 156.0.4314.58**，同为 Chromium 156 主版本。固化样本的页面盒是按固定尺寸切好的，D1c 仍要在 WebView2 的引擎里重新排版文本，引擎同代把"重排结果与分页时不一致"的风险压到很低，但不能归零：**同主版本不等于同渲染细节**，D1c 的就绪判据仍须以实际页数与标记落点核对（D1d-1、D1d-2）。

### 交付宿主实测到的字体（2026-11-03）

- **CJK 与拉丁都落到 `Microsoft YaHei UI`**（948 字形／58 节点），代码落到 **Consolas**（51／1）。
- 与预期不同：预期拉丁经 `system-ui` 落到 Segoe UI，实测该宿主上 `system-ui` 与 `sans-serif` 也解析到微软雅黑 UI（中文区域的系统 UI 字体），因此全文只用雅黑 UI 与 Consolas 两种字体。
- **逐族测宽在本机退化了**：六个族（含故意不存在的族、`sans-serif`、`system-ui`）宽度全部相同（1150.5234375），即 canvas 侧无法区分族是否存在。**这份数据不可读作"某族不存在"**——正是这点上 CDP 的平台字体清单承担了证据。macOS 上测宽是可区分的（`"Microsoft YaHei"` 与基线同宽而 `PingFang SC` 不同宽），同一套代码在两个宿主上的判别力不同，故两项证据须并读。
- **跨宿主分页稳定**：字体度量不同（雅黑 UI 与苹方/系统 UI），页数仍为 3、首尾标记仍落在第 1 页与第 3 页，说明该样本的断页位置对字体差异不敏感。

### 两台机器的固化样本归一化后逐字节相同（2026-11-03）

把两台机器产出的固化样本里的随机 UUID（`data-ref`、`data-split-to`、`data-split-from` 等 635 处）统一替换后，两份文件**逐字节完全相同**（长度同为 129184，各页可见文本长度逐页一致 `[37, 182, 158, 713, 162, 158, 757, 163, 158, 456]`），差异仅存在于那些随机标识本身。

这个结论比"文件哈希不同"信息量大：**跨宿主的分页结果完全一致**，字体环境没有改变断行与分页。

**同时暴露本样本的局限**：它以中文为主，而苹方与雅黑 UI 的 CJK 字形都是全宽等宽，advance width 相同，故行宽与断行必然一致。**因此这个样本无法暴露字体度量差异带来的风险**（页面盒按一方度量切好、在另一方溢出或截断）。要覆盖该风险，需要一份以拉丁文为主或混排宽度差异大的受控样本；当前样本的作用是验证流程、公式、图片、表格与首尾标记的通路，不是字体度量的探针。

（此处用 UUID 归一化只作**跨宿主结构比对**的分析手段，不作产出的身份机制：身份仍由 `mdHash` 与 `renderConfigVersion` 承担，文件 SHA-256 只作完整性校验，见上文「两项工程事实」。）

### 交付宿主在加强自检后重跑通过（2026-11-03 00:47）

R1 修好后（自检断言交接物表写下的期望值本身，且自检通过才落盘），交付宿主重跑一次，**全部期望成立**：声明页数与页面盒数一致、页面盒 3 页、HEAD 在第 1 页、TAIL 在末页、两标记各出现 1 次、平台字体证据非空。

该次产物与归档那份**逐字段相同，只差文件哈希**：`mdHash`、`renderConfigVersion`、字节数（129184）、页数与标记页码、平台字体、环境、逐族测宽全部一致，仅 `sha256` 不同（`a9675a83…e6f5d` 对 `78aff00c…b50c0`）。字节数相同而哈希不同，与 Paged.js 每次写入的等长随机标识一致。**即交付宿主上的产出在"除随机标识外"可复现**，这条此前只在 macOS 上验过。

归档仍保留 00:29 那对（00:29 的 HTML 与其 meta 互相自洽）：新一次运行的 meta 描述的是另一个 HTML 文件，单独替换会使归档的哈希与它自己的 HTML 对不上。若要归档改为 00:47 那次，需连同该次的 HTML 一并取回。

### 交付宿主上的取样步骤（人工执行）

前置：Git、Bun、Node.js LTS（脚本已支持 node→bun→自身运行时依次回退启动 vite）、`bun install --frozen-lockfile`、`bun run --bun playwright install chromium`。Rust 与 MSVC 工具链在本步不需要，D1 之后才需要。

```powershell
git clone https://github.com/Lazyn0tBug/Marklflow.git
cd Marklflow
git checkout architecture-refactor
bun install --frozen-lockfile
bun run --bun playwright install chromium
bun scripts/pdf-probe-sample.ts
```

判定：`mdHash` 与 `renderConfigVersion` 必须与本记录交接物表**完全相同**（输入相同）；文件 `sha256` 与 `bytes` **必须不同**（字体度量不同则排版不同）。页数、标记页码按表核对。另取三条宿主事实：系统字体文件 `Get-ChildItem C:\Windows\Fonts -Filter msyh*`、WebView2 运行时版本（`HKLM:\SOFTWARE\Microsoft\EdgeUpdate\Clients` 下各 `pv`）、`[System.Environment]::OSVersion.VersionString`。

此前为此准备的 `.github/workflows/pdf-probe-sample.yml` 已撤除：GitHub 的 `windows-latest` 不是交付宿主，在那儿生成的样本带的是 CI 镜像的字体环境，恰恰是本节要避免的错配；交付宿主是人工操作的 Windows 机器。

### D0 结论

九项核对全部有结论（源码级），交接物五项齐备且输入身份（mdHash、renderConfigVersion）跨运行一致、文件哈希可复算。生成工具已入库（`scripts/pdf-probe-sample.ts`），并已记录宿主实际解析到的平台字体。**归档已换成交付宿主产出的样本（2026-11-03），D1 可直接加载该文件开工。**

### 工具链评审发现（2026-11-02；R1、R2 已修，R3 尚未修）

对生成工具与配置做了一次评审，发现三条。均属工具与配置，不涉及产品代码；三条都不阻断 D0，但前两条会在交付宿主取样时产生"看起来成功、实则与记录矛盾"的产物，故排在取样之前处理。

| # | 发现 | 影响 | 拟修 |
| --- | --- | --- | --- |
| R1 | **已修（2026-11-03）**。**自检比记录的交接期望弱**。阶段记录写死"HEAD 标记第 1 页、TAIL 标记第 3 页，各出现 1 次"，而脚本只断言"标记页码非 null"。若 Windows 的字体度量把标记挪位，脚本照旧写盘并报成功，产出的 meta 与本记录直接矛盾 | 归档与记录不一致，且由工具自证 | 自检改为断言期望值本身：声明页数与页面盒数一致、页面盒多于一页、HEAD 在第 1 页、TAIL 在末页、两标记各出现 1 次、平台字体证据非空；**自检通过才落盘**，失败的产物不替换归档。**已验**：把 HEAD 的期望页改成 2 后运行，自检报错并指名该项，归档未被触碰；正常运行通过 |
| R2 | **已修（2026-11-03）**。**`/src/*` 路径映射放在 `tsconfig.base.json`，范围过宽**。四个 profile 全部继承，于是任何源文件都可写 `import x from '/src/foo.ts'` 并通过类型检查；但该写法只在 Vite dev server 下成立（dev server 按仓库根路径提供 `/src/...`），`vite build` 会当成 URL 路径，生产构建直接坏掉。即以构建期地雷换掉了类型期护栏 | 未来有人这样写 import 时不会被类型检查拦下 | 映射下沉到 `tsconfig.integration.json`（脚本所在 profile），base 保持干净。实测 TS 的 `paths` 从 `extends` 继承时是整体替换而非合并，下沉时把 `@/*` 一并重新声明。**护栏已验**：在 `src/` 下放一个 `import from '/src/core/storage/storage'` 的探针文件，`tsc -p tsconfig.json` 报 TS2307，即该写法在源文件里已被类型检查拦下；脚本所在 profile 仍可解析 |
| R3 | **meta 记了宿主绝对路径**（`file`、`source`）。交付宿主取样后仓库里会留下 `C:\Users\<用户名>\...` | 归档带宿主信息，不该入库 | 改为记仓库相对路径 |

R1 的同类情形已在开发中发生过一次：修 `DOM.enable` 之前 `platformFonts` 是空数组，自检照样通过，字体证据静默退化为空而产物看起来正常。**产物型断言须编码期望值，而非编码"非空"**，此条一并记此。

## D1a 来源限制与身份回报（2026-11-03）

生产代码，不受 `pdf-probe` feature 控制，D8 生产接入复用。本节记实现与证据；运行期身份值归 D1a-6，在交付宿主核对。

### 实现落点

| 件 | 位置 | 内容 |
| --- | --- | --- |
| 纯函数守卫 | `src-tauri/src/source_guard.rs:57` | `check_source(caller, allowed)`：输入身份与允许范围，输出放行或共享稳定拒绝码 `native-source-denied`（`:42`） |
| 身份类型 | `src-tauri/src/source_guard.rs:16` | `Identity` 为窗口 label 与 webview label 的配对，**label 级，不含实例标识**；`declared`（`:21`）供常量用，`from_labels`（`:29`）供运行期用 |
| 具名身份 | `src-tauri/src/source_guard.rs:45`、`:51` | `MAIN_WINDOW` = ("main","main")（源码级依据 D0-7，运行值 D1a-6 核对）；`OUTPUT_HOST` = ("pdf-output","pdf-output")，**默认不在允许范围内** |
| 允许范围 | `src-tauri/src/source_guard.rs:54` | `ALLOWED_CALLERS` 只含主界面，静态、默认拒绝 |
| 入口守卫 | `src-tauri/src/files.rs:17` | `ensure_allowed` 取原生注入的身份后调用共享守卫，拒绝即返回共享码 |
| 身份回报 | `src-tauri/src/lib.rs:18` | `get_platform_info` 注入 owned `tauri::Webview`，回报 `windowLabel` 与 `webviewLabel`；该命令**不受守卫限制**（不碰文件、对话框与授权） |
| 前端同步 | `src/core/platform/tauri/runtime.ts:3` | strict schema 加 `windowLabel` / `webviewLabel`（缺字段即解析失败，故必须与 Rust 同步） |
| 用户可见映射 | `src/core/platform/tauri/files.ts:9` | 共享拒绝码映射为友好提示，不露裸码、调用方身份或允许名单；**受控探针不经此路径，仍按机器码取证** |

### 五个受保护入口 × 四项证据（D1a-5）

| 入口 | 调用共享守卫 | 身份取自原生注入 | 拒绝返回路径 | 检查先于副作用 |
| --- | --- | --- | --- | --- |
| `select_native_open` | `files.rs:123` | `files.rs:17`（`webview.window().label()` 与 `webview.label()`） | `files.rs:18` 返回共享码 | 先于 `files.rs:124` 的对话框 |
| `select_native_save` | `files.rs:159` | 同上 | 同上 | 先于 `files.rs:160` 的文件名校验与 `files.rs:163` 的对话框 |
| `read_native_text` | `files.rs:176` | 同上 | 同上 | 先于 `files.rs:177` 的授权解析与读取 |
| `write_native_bytes` | `files.rs:186` | 同上 | 同上 | 先于 `files.rs:187` 的授权解析与 `files.rs:188` 的提交 |
| `release_native_file` | `files.rs:195` | 同上 | 同上 | 先于 `files.rs:196` 的授权撤销 |

### 六条断言

| # | 断言 | 判定 | 证据 |
| --- | --- | --- | --- |
| D1a-1 | 注入 owned Webview 且身份解析符合预期 | 成立 | 五个入口与 `get_platform_info` 均注入 `tauri::Webview`；`CommandArg` 对 owned `Webview` 无同步或异步约束且不失败（D0-4）。**本断言只覆盖注入签名与主窗口身份取值接线**，真实 IPC 调用归 D1b |
| D1a-2 | 允许范围按真实身份映射表达，不假设 label 相等、不以枚举即允许 | 成立 | 允许范围是 (window label, webview label) 的配对（`source_guard.rs:54`）；单元测试断言窗口或 webview 任一不符即拒绝；输出宿主身份虽已具名但**不在范围内**（测试 `the_output_host_is_not_in_the_allowed_range_by_default`） |
| D1a-3 | 允许范围的判定正确 | 成立 | 守卫为纯函数，5 项 Rust 单测覆盖放行、范围外拒绝、窗口与 webview 单独不符、空范围全拒、输出宿主默认被拒 |
| D1a-4 | feature 关闭时来源限制仍生效 | 成立 | 守卫代码不在任何 `cfg(feature)` 之后；`Cargo.toml` 目前仍无 `[features]` 段，故 feature 关闭即当前构建。以默认 feature 集构建通过、单测通过 |
| D1a-5 | 限制发生在副作用前 | 成立 | 上表五入口 × 四项，逐项标源码位置；均为定向源码审查证据，**不冒充框架实际 IPC 响应**，后者归 D1b |
| D1a-6 | 允许范围写入的主窗口身份对与运行中实际值一致 | **成立（交付宿主运行值）** | 写入值 ("main","main")（`source_guard.rs:45`）；交付宿主实际调用 `get_platform_info` 返回 `{os:"windows",arch:"x86_64",version:"0.9.1",windowLabel:"main",webviewLabel:"main"}`，与写入值**逐项一致**。**未提前接 M4/M5 生产文件交互** |

### D1a 退出结论

六条断言全部成立：D1a-1 至 D1a-5 由实现、定向源码审查与单元测试成立（其中 D1a-1 的注入行为已由交付宿主的真实调用一并印证）；D1a-6 由交付宿主运行值核对成立。类型检查、定向回归（Rust 13 项、TS 497 项）、lint、全量 e2e 均通过。

**本步只证明来源限制的判定逻辑与接线成立，不证明真实 IPC 隔离**：主窗口与输出宿主的实际允许/拒绝证据归 D1b，未测的真实宿主不作已测宣称。

### 本轮验证

| 项 | 结果 |
| --- | --- |
| `cargo build`（src-tauri） | 0 错误 0 警告 |
| `cargo test --locked` | 13 项通过（3 套件），较上轮新增 5 项守卫单测 |
| `bun run typecheck` | 四个配置通过，类型覆盖 231 源 |
| `bun run test:unit` | 71 文件 497 项通过（新增 1 项前端友好映射） |
| `bun run lint` | 通过 |
| 全量 e2e | 143 通过 1 跳过（跳过项为既有）。注：e2e 跑的是 Web 应用，不经过 Tauri 命令，故**它验不到本轮的 Rust 改动**；Rust 侧由 `cargo build` 与 `cargo test` 覆盖，注入行为由 D1b 在真实调用中取证 |

### 本轮未做与边界

- **未创建输出宿主**：按 D0-3 后果三，D1a 落地前不得创建输出宿主，故 `OUTPUT_HOST` 只有身份定义，没有创建函数。
- **未接线生产文件交互**：文件命令仍无生产调用方（属 M4/M5 范围），D1a 只做来源限制。
- **未做运行期验证**：D1a-6 归 Windows；真实 IPC 的允许与拒绝证据归 D1b。
- **输出宿主 label "pdf-output" 是本轮取定的名字**，D1b 的宿主创建函数须引用同一常量；若要改，改这一处即可。

## D1b 授权夹具与权限探针（2026-11-03）

仅测试路径受默认关闭的 `pdf-probe` feature 控制。正常授权释放、来源检查与业务清理始终保留。

### TBD-14 的处置（已定）

| 问题 | 决定 | 理由 |
| --- | --- | --- |
| 受控授权的形态 | **复用现有 `FileAccess` 授权**（path + writable + UUID key），在受控初始化里为一份受控夹具文件签发读、写两种角色 | 探针要验的是**生产命令在真实身份下的真实行为**；给探针单开分支会验到测试替身，与"隔离证据不落在测试替身上"同源 |
| key 向探针页的交付 | **URL 查询串**：Rust 铸造后经探针页 URL 交付，页面从 `location.search` 取 | 初始化脚本注入这条路主窗口用不了（主窗口是应用自己的 webview，注入就要动生产 webview 的初始化脚本）；URL 这条路让主窗口导航到探针页，身份仍是 ("main","main") |
| "未弹出任何原生对话框" | **机器码 + 人工观察**（拒绝由共享稳定码取证，不弹框由人在机器前确认） | 成本最低，且操作者本就在那台机器前；自动判定要写 Win32 窗口枚举，另议 |

### 实现落点

| 件 | 位置 | 内容 |
| --- | --- | --- |
| feature | `src-tauri/Cargo.toml` | `pdf-probe` 默认关闭；来源守卫不在它之后，故生产构建始终带守卫 |
| 输出宿主单点创建 | `src-tauri/src/output_host.rs` | 身份取自 `source_guard::OUTPUT_HOST`（"pdf-output"），形态为不可见的独立 WebviewWindow；每次调用创建独立实例（首个实例 label 逐字为 "pdf-output"，同进程后续实例追加序号） |
| 受控初始化 | `src-tauri/src/probe.rs` | 铸造受控授权（不经 IPC，`invoke_handler` 未变，未新增前端铸造命令）、把主窗口导航到探针页、创建输出宿主承载同一页、读取两份报告、撤销授权 |
| 探针页 | `tests/fixtures/architecture/pdf-probe-client.html` / `.ts` | 与交付用样本分离；不经前端适配器，故取到机器码；外部脚本文件，不内联，不放宽生产 CSP |

### 证据矩阵（本机 macOS 流程验证，交付宿主复跑待做）

| # | 证据 | 判定 | 本机实测 |
| --- | --- | --- | --- |
| D1b-1 | 通道阳性 | 成立 | 主窗口 `get_platform_info` 返回 ok，身份 ("main","main") |
| D1b-2 | 主窗口同命令允许 | 成立 | `read_native_text` 配受控读 key 返回**夹具原文** `MF-PROBE-FIXTURE-20261103`（`readMatchesFixture: true`） |
| D1b-3 | 输出宿主同命令拒绝 | 成立 | 同一 key 在输出宿主（"pdf-output","pdf-output"）返回 `native-source-denied`，**无内容泄露**，无副作用 |
| D1b-4 | 选择器补充 | 成立 | 输出宿主调用 `select_native_open` 返回 `native-source-denied`；守卫在对话框之前（`files.rs:132` 先于 `:133` 的对话框），**未弹框**（本机为流程验证，交付宿主需人工确认一次） |
| D1b-5 | feature 关闭构建 | 成立 | 默认 feature 构建 0 错误 0 警告，`probe` 模块整段不在默认构建内；来源守卫与主窗口允许路径不受 feature 影响 |
| D1b-6 | 清理证据 | 成立 | 探针授权在报告读完后被撤销（`PDF-PROBE cleanup`），夹具随临时目录销毁；正常 `release_native_file` 业务清理未被一并移除——主窗口的撤销调用返回 ok，输出宿主的撤销尝试被守卫拒绝（防越权撤销） |

额外观察：写角色 key 用于读取时返回 `file-capability-mismatch`（角色校验在来源守卫之后、授权解析之前生效），证明读、写两种角色的授权互不通用。

### 本轮验证

| 项 | 结果 |
| --- | --- |
| `cargo build`（默认 feature） | 0 错误 0 警告 |
| `cargo build --features pdf-probe` | 0 错误 0 警告 |
| `cargo test --locked` | 13 项通过 |
| `bun run typecheck` | 四个配置通过，类型覆盖 232 源 |
| `bun run test:unit` | 71 文件 497 项通过 |
| `bun run lint` | 通过 |
| 探针实跑 | 本机 macOS 一次跑通，报告完整（见上表） |

### 两处由实跑暴露的缺陷（已修）

1. **报告必须在事件循环启动后读**：`eval` 的回调经事件循环送达，在 `setup` 钩子里读会一直等到超时、报告为空。改为后台线程读取。
2. **探针页不能在同一个窗口里加载两次**：第一遍跑完撤销了受控授权，第二遍的读取就拿到 `unknown-file-key`。改为仅在探针页尚未就位时才导航。

### 交付宿主首次复跑：装配缺陷，隔离未受检（2026-11-03）

交付宿主跑了一次，输出为：

```
PDF-PROBE navigation navigated=false main_url=about:blank
PDF-PROBE main
PDF-PROBE output
PDF-PROBE output_host label=pdf-output instances=1
PDF-PROBE cleanup revoked read=… write=… fixture_removed_on_drop=true
```

**按方案的"装配缺陷与隔离失败"对照表判读：这是装配缺陷，不是隔离失败**——主窗口停在 `about:blank`，webview 一个页面都没加载，探针页从未加载，两份报告必然空；此时**没有任何隔离证据产生**，既不能算通过也不能算失败。

成因：探针在 `setup` 钩子里就把主窗口导航到探针页，而 Windows 上 webview 的初次加载可能还没发出，导航与初载相撞，窗口停在 `about:blank`。同一现象在本机 macOS 不出现（webview 同步创建，初载先落地）。

已改（尚未取交付宿主证据）：导航改到后台线程，先等主窗口的初始页面落地（URL 不是 `about:blank`）再导航；并加两处诊断——`source reachable`（探针页源是否可达）与 `initial_load`（初载是否落地）——使同类失败下次能自述原因而不是靠猜。

另注：本轮已确立"日志基座"（L1/L2，设计见独立文档[日志基座设计](../design/log-base-plan-2026-11-03.md)），其动因之一正是这次——失败时只有几行 `println!`，无法判断是源不可达、初载未落地还是导航被取消。日志落地后，这类问题的判定不再依赖一次"加临时打印再跑一遍"的往返。

## L1 日志基座（2026-11-03）

D1b 取证的前置，设计与契约见[日志基座设计](../design/log-base-plan-2026-11-03.md)，实现见 `src-tauri/src/logging.rs`（提交 `a8616ae`）。

已成立：文件为主 sink（按运行分文件 `markflow.<pid>.log`）、stdout 为次 sink；专用写线程 + 有界队列（1024 条）、单条上限 16 KiB 拒收不截断、队列满丢弃并计数；每条记录带 `schema_version`/`run_id`/`timestamp`/`level`/`origin`/`event` 与 span 上下文（无 span 时键在、值为 null）；人读与 JSON 双形态；size 与 day 双约束轮转、归档按日期与序号续接、保留最新 10 份、只清理本模块命名的归档；健康计数有界并按限频摘要落日志。

已验：两种形态实跑产出正确记录；26 项 Rust 单测通过，覆盖必填字段与 span 上下文、两种形态、队列满丢弃与超长拒收、轮转判定（size/跨日/空文件不轮转）、归档序号续接与不覆盖、保留排序与不误删其他文件。

**未验（须在交付宿主与 D1b 取证时补）**：真实 8 MiB 写入触发的端到端轮转（边界判定已测，真实轮转未跑）；崩溃/强杀时尾部不保证（契约已声明）；字段脱敏的最终验证（无 key、无文档正文、无完整本地路径、无带凭据 URL）属 D1b 取证时的扫描核对，单元测试覆盖不到。

**本轮未做（L2）**：`log_event` 命令与其写日志准入、web 侧结构化载荷（最小事件结构 + 允许字段白名单）、`page_call` span、`host`/`probe` span、`host_state`/`page_report_observed` 事件、健康状态被受控验收入口读取。

## L2 web→Rust 回传与机器校验器（2026-11-03）

L1 落地后（提交 `a8616ae`），本轮补上 L2 与**机器校验器**：D1b 的取证不再靠人读终端输出。

### L2 落地内容

| 件 | 位置 | 内容 |
| --- | --- | --- |
| 回传命令 | `src-tauri/src/lib.rs` | `log_event` 只写日志，不碰 `FileAccess`，**发不出任何能力**；返回稳定结果 accepted／dropped／rejected |
| 准入与限流 | `src-tauri/src/logging.rs` | 写日志与敏感命令同一套身份判定：正常路径只允许主窗口，pdf-probe 构建额外接受由原生创建并登记的探针输出实例；单请求 ≤ 4 KiB、每身份对 20 条/秒、进程 100 条/秒 |
| 载荷白名单 | `src-tauri/src/logging.rs` | `deny_unknown_fields` 的最小事件结构（event／call_id／command／result／error_category／bytes）；未知字段与未知事件**拒收**；外层 origin 与身份由原生生成，页面覆盖不了 |
| 统一发送口 | `src-tauri/src/logging.rs` | 必填字段在一处装配；native 事件名即业务事件名，web 外层固定 `web_event`、业务事件在 `page_event`，健康摘要为 `log_health` |
| 探针页回传 | `tests/fixtures/architecture/pdf-probe-client.ts` | 最小载荷 + `log_event` 转发 + 有界 DOM 步骤日志（64 条上限）；缺失元素不使脚本死掉 |

### 机器校验器

`scripts/pdf-probe-check.ts`：`bun scripts/pdf-probe-check.ts <日志文件或目录...> [--run <run_id>] [--json]`。

- 按方案 §5.3 的证据矩阵逐条判定 D1b-1—D1b-6，三态结论（通过／未通过／未能确认），每条写明依据及其来源（native 观察／web 观察／页面自述）。
- 另做契约体检（诊断项）：重复输出、调用 span 是否都是根的直接子、事件是否落在契约规定的 span 内、跨侧结果不一致、两侧记录数量不匹配、web 侧只记开始没有完成、`log_health` 计数、run_end 缺失、脱敏扫描（凭据片段／完整本地路径／带凭据 URL／夹具正文）。
- 退出码：0 全部通过；1 有未通过或有错误级诊断；2 有未能确认。
- 单元测试 `tests/unit/pdf-probe-check.test.ts`（12 项）覆盖：证据齐全即通过、缺 run_start 记未能确认、native 拒绝而 web 报成功判未通过（泄露不被 web 声明覆盖）、缺 operation_result 记未能确认、默认构建缺失时 D1b-5 记未能确认、重复输出、关联不匹配、span 归属、凭据片段、损坏 JSON 与未知 schema、调用中断。

### 校验器查出的六处契约偏差（本机实跑，全部已修）

校验器第一次跑在旧日志上就报了 4 个错误级诊断；补测后共 6 处：

| # | 偏差 | 契约依据 | 处置 |
| --- | --- | --- | --- |
| 1 | `probe_source_check` 记在 span 外 | §5.1：事件落在规定的 span 内 | 该事件移进 probe span |
| 2 | `host` span 的 parent 为 null | §5.1：调用 span 都是根的直接子 | 宿主创建改在 `run_span()` 作用域内开 span |
| 3 | `probe_cleanup` 记 key 前 8 位 | §3／§5.3：不记凭据及其派生值，不用 key 片段做关联 | 删除该字段；`credential_prefix` 一并移除 |
| 4 | 拒绝路径无 `operation_result` | §5.1：command span 的结果事件 | 守卫拒绝时由 span 层补 `result=denied` + `reason_code` |
| 5 | 授权解析失败等早退路径无结果事件 | 同上 | 各命令改为先并出结果再记事件，早退也留痕 |
| 6 | `release_native_file` 的结果事件缺 `elapsed_ms` | §5.1：结束事件带耗时 | 补计时；五个命令统一由 span 层计时 |

另补两处契约补齐（不是偏差，是缺口）：`run_start` 事件上重复 os／arch／app_version（span 上的字段不进记录，校验器要按 §5.3 记环境）；`probe_cleanup` 改为**先删夹具再记事实**，不再提前宣称已删除。

### 本机实跑（macOS，pdf-probe 构建）

日志已归档：`docs/acceptance/pdf-probe/local-macos-pdf-probe.jsonl`（sha256 `2bf5c52d92df313dbe452cbecd152b43c6d3416c4414e9ede6e84f7243c75a09`，47 条记录，run_id `9625124d-710e-4fdc-9a1c-d5b17ea05300`，环境 macos/aarch64/0.9.1），元数据见同目录 `local-macos-pdf-probe.meta.json`。

校验器结论：**错误 0、告警 1、提示 1**；D1b-1／2／3／4／6 通过，D1b-5 记「未能确认」（本机只跑了 pdf-probe 构建，未提供默认构建的运行记录）。告警是 `no-run-end`：本机结束时是强杀进程，非正常退出，故未宣称日志完整——交付宿主上从界面正常退出即有 `run_end`。

依据摘要（两侧相符）：

```
source_decision allow read_native_text  win=main      operation_result ok bytes=25
source_decision deny  read_native_text  win=pdf-output reason_code=native-source-denied
source_decision deny  select_native_open win=pdf-output reason_code=native-source-denied
source_decision allow release_native_file win=main    operation_result ok
source_decision deny  release_native_file win=pdf-output reason_code=native-source-denied
web_event call_finished read_native_text result=denied win=pdf-output
page_report_observed host=main  role=main-window  read_ok=true  read_matches_fixture=true
page_report_observed host=output role=output-host read_ok=false read_error=native-source-denied
log_health dropped=0 rejected=0 write_failures=0 file_unavailable=false
```

### 交付宿主取证步骤

前置：分支尚未 push（未经明确要求不 push）；交付宿主需能跑 dev server（探针页必须与主窗口**同源**，否则 IPC 与 CSP 都不成立）。

#### A. D1b 部分（2026-11-03 已完成，日志已归档）

| 步 | 操作 | 要点 |
| --- | --- | --- |
| 1 | 取代码 | `git pull` 到 `D:\code\Marklflow` |
| 2 | 起前端 dev server | `bun run dev:desktop`（127.0.0.1:3000）。探针页在 `tests/fixtures/architecture/pdf-probe-client.html`，dev server 直接从仓库根提供，**不打包进前端产物** |
| 3 | 跑探针构建 | `cd src-tauri`；`set MARKFLOW_LOG=info`；`set MARKFLOW_LOG_FORMAT=json`；`cargo run --no-default-features --features pdf-probe`。**必须是 debug 构建**：生产构建加载的是内嵌前端（tauri://localhost），探针页就成了异源，IPC 与 CSP 都不成立 |
| 4 | 等探针跑完 | 启动即自动装配；约 10 秒内完成，无需操作 |
| 5 | 从界面正常退出 | 关闭窗口即触发 `run_end`；强杀进程则日志无 `run_end`，校验器会报"不得宣称日志完整" |
| 6 | 取日志 | `%LOCALAPPDATA%\com.markflow.desktop\logs\markflow.<pid>.log`（按运行分文件；轮转时同一次运行会分散在多个文件里，一起取回） |
| 7 | 补 D1b-5 的默认构建运行 | 另跑一次**默认构建**（不带 feature），并让主窗口载到探针页：`bun scripts/pdf-probe-default-run.ts` 会生成一份临时配置（devUrl 指向探针页）并给出两条命令。**产品界面里没有调用受保护命令的路径**（导入走浏览器 `file input`、导出走浏览器下载），故只能这样取到主窗口的放行证据 |
| 8 | 机器核对 | 把两份日志放回仓库，在开发机执行 `bun scripts/pdf-probe-check.ts docs/acceptance/pdf-probe/<两份日志>`；期望 D1b-1—D1b-6 全通过、错误级诊断 0 |
| 9 | 归档 | 归档日志原文与 SHA-256 到 `docs/acceptance/pdf-probe/`（**改名为 `.jsonl` 入库**：仓库忽略 `*.log`），并把校验器输出抄进本记录 |

人工项：第 3 步运行期间，**输出宿主调用选择器命令时屏幕上不得弹出原生文件对话框**（D1b-4）。这一步机器只证"被拒"，弹框与否由人在机器前确认。

#### B. D1c 部分（2026-11-03 待执行）

> **详细清单与排查顺序见[Windows 侧检查与说明](windows-build-check-2026-11-03.md)**：已知问题（借用逃逸 E0521、未使用导入、交叉检查漏覆盖）、逐项检查表、按症状查因、以及本地交叉检查的用法与局限。

Windows 侧代码本机只能交叉编译验类型（`bun scripts/check-windows-com.ts` 已通过），**运行能力必须在真机上看**。

| 步 | 操作 | 要点 |
| --- | --- | --- |
| B1 | push 分支 | 交付宿主要先拿到代码（`architecture-refactor` 领先 origin 26 个提交） |
| B2 | 取代码 | `git pull` 到 `D:\code\Marklflow` |
| B3 | **编译**（第一次 Windows 编译） | `cd src-tauri`；`cargo build --locked --features pdf-probe`。MSVC 工具链 1.94.0（与 CI 一致）；WebView2 运行时 156.0.4314.58 已装 |
| B4 | 起 dev server | `bun run dev:desktop`（**另开一个终端**，保持它跑着） |
| B5 | 跑探针构建 | `cd src-tauri`；`set MARKFLOW_LOG=info`；`set MARKFLOW_LOG_FORMAT=json`；`cargo run --no-default-features --features pdf-probe` |
| B6 | 等探针跑完 | 本轮比 D1b 长：探针页证据 → **就绪探测（≤30s）** → **打印（≤60s）**。合计可能几分钟。**期间屏幕上不应出现任何原生对话框或打印面板**（D1c-5） |
| B7 | 从界面正常退出 | 关闭窗口即触发 `run_end`；强杀则日志缺 `run_end` |
| B8 | 取日志 | `%LOCALAPPDATA%\com.markflow.desktop\logs\markflow.<pid>.log` |
| B9 | 取产出的 PDF | 默认 `D:\code\Marklflow\docs\acceptance\pdf-probe\probe-pdf-output.pdf`（可用 `set MARKFLOW_PROBE_PDF=<别的路径>` 改）。**同目录的 `*.tmp-<pid>-*` 若还在，说明提交（rename）没成功**（临时名按调用唯一 ✓，带序号 ✓） |
| B10 | 回传 | 把日志与 PDF 传回开发机 |
| B11 | 机器核对 | `bun scripts/pdf-probe-check.ts <日志>`：期望 **D1b-1—D1b-6 与 D1c-1、D1c-2 全通过**、错误级诊断 0 |
| B12 | 核对 PDF | 页数应为 3、页面尺寸应为 A4（210×297mm）。**若 PDF 是空白页**：症结在"打印宿主是隐藏窗口，隐藏的 WebView2 是否照常排版"，不是打印设置也不是就绪判据 |
| B13 | 归档 | 日志原文与 SHA-256、PDF、校验器输出都记进本记录 |

#### 读日志速查（省一次往返）

| 事件 | 含义与处置 |
| --- | --- |
| `probe_source_check reachable=false` | dev server 没起或端口不对 → 回 B4 |
| `probe_navigation navigated=false` | 主窗口没导航到探针页 → 探针页不可达 → 回 B4 |
| `probe_readiness eval_ok=false` | 原生求值拿不到内容 → 页面没加载或执行被挡 |
| `probe_readiness is_target=false` | 求值落在了别的文档上（导航没换文档） |
| `probe_readiness ready=false` | 文档未达就绪条件（看 `ready_state`／`fonts_status` 字段） |
| `probe_pdf ok=false reason=…` | 打印失败，reason 里带 HRESULT 或超时 |
| `probe_pdf ok=true committed=false` | 打印成功但 rename 没成功 → 目标未被替换，原文件仍在 ✓ |
| `log_health dropped/rejected > 0` | 有记录没落盘，证据可能不全 → 记"未能确认"，不要当作通过 |
| 无 `run_end` | 强杀退出 → 不宣称日志完整（回 B7） |

### 已知边界（不掩盖）

- **D1b-2 的"内容准确"只有页面自述依据**：原生不记正文，能证明的是"放行、读成功、返回 25 字节"；"与夹具逐字相符"来自页面的 `read_matches_fixture`，校验器据此标注来源并在诊断里提示，不写成原生证实。
- **D1b-5 需要默认构建的运行记录**：机器可判的部分是"默认构建的日志里没有探针事件与探针身份"；"主窗口允许路径仍有效"要在默认构建中触发一次受保护命令（如从界面打开文档），否则该项记「未能确认」——它不是"默认构建通过"就算过。
- **"未弹出原生对话框"是人工项**：机器只证"被拒"；弹框与否由人在交付宿主确认。
- **本轮未取交付宿主证据**：以上均为本机 macOS 的流程验证。

## 交付宿主第二次复跑：主屏全白（2026-11-03）

交付宿主换上日志基座后复跑，主屏全白、无内容，日志如下：

```
probe_source_check page_origin=about:%2Ftests/fixtures/architecture/pdf-probe-client.html?readKey=…&writeKey=…&expect=… reachable=false
probe_abort reason=探针页源不可达：应用与探针页必须同源，且该源须在运行
probe_initial_load loaded=true url=http://127.0.0.1:3000/
probe_navigation navigated=false navigate_error=
probe_report_timeout / probe_report_unreadable（约 60 秒后）
```

### 诊断：一个根因，两个后果

日志里两行自相矛盾：**初载是成功的**（`probe_initial_load loaded=true url=http://127.0.0.1:3000/`，dev server 在跑），**但探针页的源是 `about:`**。

`probe_url()` 在 setup 钩子里读 `main.url()`。Windows 上此时 webview 的初载还没发出，`main.url()` 是 `about:blank`；于是路径被塞进 `about:` 方案，得到 `about:%2Ftests/…?readKey=…` 这个废 URL。后果连锁：

1. `source_is_reachable` 取不到 host → 判定源不可达 → `probe_abort`；
2. 主窗口随后被导航到这个 about: URL → **落到 about:blank，即主屏全白**（白屏是探针造成的，不是应用自己坏了）；
3. 探针页从未加载 → 一条验证证据都产生不了。

macOS 上没暴露：那时 `main.url()` 已经是 devUrl。**根因是"从窗口的瞬时状态取源，取早了"。**

### 修复

| 处 | 改法 | 理由 |
| --- | --- | --- |
| `probe.rs` 探针页 URL 的源 | 改从**配置**的 `build.devUrl` 取（新增纯函数 `probe_url_from`，配 3 项单测） | 配置是"应用自身的源"的稳定陈述；窗口 URL 是瞬时的（初载前是 about:blank） |
| `probe.rs` 同源判定 | 主窗口实际源与配置源不一致时中止（生产构建的页面走 tauri 协议，与配置里的源不是同一个，自然落在这条判定上） | 不同源时探针页既不在产物里、IPC 也不通，那样的证据是假的 |
| `probe.rs` 导航时机 | 源可达性在**导航之前**判；不可达就不导航，把主窗口留在应用自己的页面上 | 探针不该把应用带到一个打不开的页面上 |
| `probe.rs` 失败回退 | 试过导航却没成位时，把主窗口导回初始页 | 探针失败不该把应用留在坏页面上 |
| `probe.rs` 报告读取 | 探针页没就位就不读报告 | 等满 60 秒超时也读不到，白等一分钟 |
| `probe.rs` 装配失败 | 装配失败只记一条中止原因，**不拖住应用启动** | 探针是测试路径，不能让应用起不来 |

### 审查查出的一处死代码（已修）

修复本身在审查里被推翻了一处：**`tauri::is_dev()` 这道闸永远不会触发**。它读的是 `tauri` 构件自己的 `custom-protocol` 特性，而本仓库的 `src-tauri/Cargo.toml` **没有这个特性、也没有把它转发给 tauri**（`cargo build --features custom-protocol` 直接报 `the package 'markflow' does not contain this feature`），所以 `is_dev()` 恒为真。留着这道闸等于留了一句不会兑现的承诺。

已删掉该闸，改由**运行期的同源判定**承担：主窗口实际所在的源与配置里的源不一致就中止。生产构建的页面走 tauri 协议（`origin_of` 记为 `none`），与配置里的 `127.0.0.1:3000` 不一致 → 中止。这道判定不依赖构建口味，删掉死闸没有丢任何保证。

### 另一处工程事实（**不在本轮范围，待决**）

Tauri v2 的标准模板要求 app 构件声明 `custom-protocol = ["tauri/custom-protocol"]`（`tauri build` 会以该特性调用 cargo），本仓库没有这一条。**未验**：本机没有 tauri CLI，无法确认发行构建现在是否因此失败；但若 `tauri build` 确实传该特性，cargo 会以 `the package 'markflow' does not contain this feature` 失败。补这一条会改变生产构建的加载方式（从 dev server 切到内嵌前端），属独立决策，本轮不动。

### 顺带修掉的两处凭据泄露

同一份日志里还暴露了两个问题，都已修：

1. **`origin_of()` 回退成整个 URL**：无 host 的 URL（about: 方案）整串回退，把 `readKey=`、`writeKey=` 与夹具正文原样写进了 `probe_source_check`。契约 §3 要求"所有构建均不记录完整授权key"。改为只取 host:port，无 host 时记 `none`，**绝不回退整串 URL**（配 2 项单测）。
2. **校验器漏检**：脱敏规则写的是"参数名恰好是 `key=`"，而实际参数名是 `readKey=`、`writeKey=`（带前缀）→ 漏。改为"查询串里任一参数名含 key/secret/token/password/auth 即报"，并加 1 项单测。

**用交付宿主那份真实日志验过**：改后的校验器对它报出 2 个错误级诊断（`credential-url` 指向 `readKey`、`document-body` 指向夹具正文），六条断言全部记「未能确认」——那次运行确实一条证据都没产生，判得对。

### 本机复验（macOS）

| 场景 | 结果 |
| --- | --- |
| 源可达（dev server 在跑） | `probe_source_check page_origin=127.0.0.1:3000 reachable=true`、`probe_navigation navigated=true`；校验器**错误 0**，D1b-1/2/3/4/6 通过 |
| 源不可达（dev server 已停） | `reachable=false` → `probe_abort` → **不导航**（主窗口留在应用页面）→ 不读报告 → 整轮几秒内结束，不再白等 60 秒 |

日志里 `page_origin` 现在只有 `127.0.0.1:3000`：没有路径、没有查询串、没有 key。

## 交付宿主第三次复跑：取证成立（2026-11-03）

白屏修复后交付宿主复跑，探针页正常加载，**六条断言全部通过**。归档：`docs/acceptance/pdf-probe/delivery-host-windows-pdf-probe.txt`（探针构建，sha256 `afd3fa8ee1b8e7967ad02ab4b7d390f97a582a735630e0f3928d71d6868422b8`，123 行）与 `delivery-host-windows-default-with-probe-page.txt`（默认构建，sha256 `c88e7705d494ce8e0503bc4c9f21f459e5dfc67320b20eb6a6cac2367ac1274a`，20 行），元数据见 `delivery-host-windows.meta.json`。

| 断言 | 结论 | 依据摘要 |
| --- | --- | --- |
| D1b-1 通道阳性 | 通过 | web 观察：主窗口 `get_platform_info` 返回 ok |
| D1b-2 主窗口同命令允许 | 通过 | native：`source_decision=allow` + `operation_result=ok bytes=25`；页面自述 `read_matches_fixture=true` |
| D1b-3 输出宿主同命令拒绝 | 通过 | native：`source_decision=deny reason_code=native-source-denied`（拒绝层归因：Rust 来源守卫）；web：`result=denied`；页面自述 `read_error=native-source-denied` |
| D1b-4 选择器补充（机器部分） | 通过 | native：`select_native_open` 被拒，同一拒绝码 |
| D1b-5 feature 关闭构建 | 通过 | 默认构建运行里无探针事件、无探针身份；主窗口 `read_native_text`/`release_native_file` 均为 allow |
| D1b-6 清理证据 | 通过 | native：`probe_cleanup revoked=true`；主窗口 `release_native_file` 成功 6 次；输出宿主的撤销尝试被拒 |

校验器诊断：**错误 0、告警 1、提示 1**。告警是 `no-run-end`（两次运行都是强杀进程退出，故不宣称日志完整）；提示是 D1b-2 的内容相符只有页面自述依据。

### 三处顺带查出的事

**① 交付宿主上漏设了 `MARKFLOW_LOG_FORMAT=json`**，产出的是**人读文本形态**。按原契约"人读格式只作诊断，不解析其文字作机器证据"，这两份日志不能作机器证据——等于作废已取得的证据。**已修订契约并改实现**：两种形态由**同一个写出器**从同一批记录生成、字段与脱敏规则相同，不是人工转述，原顾虑不成立；校验器现在两种形态都读，报告里标出每个文件是哪种形态，人读形态的值含空格时按"续写上一个字段"还原（新增 2 项单测）。

**② 校验器对 D1b-5 的聚合判错了**：它按"每次默认构建运行都要有主窗口放行记录"来算，于是把"有一次带探针页的运行 + 一次普通启动"判成未能确认。已改为**任一**默认构建运行有放行证据即成立——某次运行没触发受保护命令只说明那次没贡献证据。

**③ 探针页在探针运行中重载了三次**：后两次的读取拿到 `unknown-file-key`（授权已在首轮读完后撤销）。首轮证据完整，噪声不参与判定（两侧数量仍然配平，校验器未报关联不匹配）。成因在运行外部（页面被重载），不是探针装配缺陷；但**探针页若能拒绝第二次运行**（页内留一个"已跑过"的标记）这类噪声就不会进日志。

### 凭据脱敏核对

交付宿主上三份日志逐份扫过：

| 日志 | 结果 |
| --- | --- |
| 09:38 的白屏那次（修复前） | `page_origin=about:%2Ftests/…?readKey=…&writeKey=…` —— **完整授权 key 与夹具正文进了日志**，正是本轮修掉的那处 |
| 10:12 的取证运行（修复后） | `page_origin=127.0.0.1:3000`，**无 key、无路径、无正文** ✓ |
| 11:15 的默认构建运行 | 无 key、无路径、无正文 ✓ |

### D1b-4 的人工项已确认（附阳性对照）

机器只证"被拒"，"没弹框"由人在交付宿主确认——**已确认：探针运行期间屏幕上没有出现原生文件对话框**。

为让这句观察有分量，做了一次**阳性对照**：默认构建、devUrl 临时指向架构探针页（主窗口在允许范围内），点"选择打开"与"选择保存"。两个原生对话框**都弹出来了**，各停留约 2.7 秒后被取消：

```
source_decision allow command=select_native_open window=main
operation_result  command=select_native_open  count=0      elapsed_ms=2686  result=ok
source_decision allow command=select_native_save window=main
operation_result  command=select_native_save  granted=false elapsed_ms=2724  result=ok
```

即：这台机器上的原生对话框机制本身是好的；探针运行时它没有出现，是因为输出宿主那一次在**到达对话框之前**就被来源守卫挡下了（`files.rs` 里守卫判定先于 `blocking_pick_files()`，日志里的 `deny + native-source-denied` 即该事实的原生证据）。

对照日志归档为 `delivery-host-windows-dialog-positive-control.txt`（sha256 `8e558c02cc08c5ff477841011bf7127ca3e36ef03d97591a9e8fde115250261d`）。

## 两处加固与一项路径修正（2026-11-03）

### 探针页只跑一次（先做错了一版）

**动因**：交付宿主的探针运行里，探针页被重载了三次，后两次的读取拿到 `unknown-file-key`（授权在首轮读完后已撤销）——日志里多出不属于任何有效轮次的错误。

**第一版做错了**：只在页面里加一个"已跑过"就返回。**重载后 DOM 是空的**——页面被重载意味着文档重建，首轮的报告随之消失。原生侧随后读报告，读到的是空文档，于是在交付宿主上多等满 60 秒超时，主窗口的报告直接丢了（D1b-2 记「未能确认」）。本地复现时命中了同一现象：主窗口的报告没读到，而输出宿主的读到了。

**改成两道标记，作用不同**：

| 标记 | 作用 | 覆盖的场景 |
| --- | --- | --- |
| `history.state`（带首轮报告） | 重载后把首轮报告放回 DOM | 热更新、手动刷新——原生侧仍读得到有效证据 |
| `window.name` | 窗口级标记：页面被导航走又回来时不再重跑 | 恢复应用页面后又被导航回探针页 |

浏览器级验证（Playwright 打到 dev server）：首轮 `done=true`、11 步调用、`history.state` 有报告；**重载后 `done=true` 仍在（报告被放回）、0 步调用（没有新调用）** ✓。

### 探针跑完把主窗口导回应用页面

探针是测试路径，不该把用户留在探针页上。报告读完之后把主窗口导回初始页面，并把这件事记进 `probe_cleanup` 的 `app_restored` 字段（导回失败就记 false，不谎称已恢复）。本机实跑：`app_restored=true` ✓。

### R3：取样 meta 不再记宿主绝对路径

`scripts/pdf-probe-sample.ts` 原来把 `file`／`source` 写成宿主绝对路径（`D:\code\Marklflow\...`），归档换台机器就失去意义。改为**仓库相对路径**（正斜杠），并在 meta 里记下路径含义。已归档的 `frozen-sample.meta.json` 同步改写：文件内容与 sha256 未变，其余字段未动，改写事实记在 meta 的 `pathsRelative` 字段里。**下次交付宿主重跑取样脚本时，meta 将完全由脚本生成**。

## D1c 前置：TBD-12 消解（2026-11-03，源码级）

### TBD-12：原生输出能否指定目标目录 —— **能** ✓

依据（`webview2-com-sys 0.39.1`，`ICoreWebView2_7`）：

```rust
pub unsafe fn PrintToPdf<P0, P1, P2>(
    &self,
    resultfilepath: P0,   // PCWSTR —— 输出文件路径由调用方给
    printsettings: P1,    // ICoreWebView2PrintSettings
    handler: P2,          // ICoreWebView2PrintToPdfCompletedHandler
) -> windows_core::Result<()>
```

输出路径由调用方给 → 目标目录由我们选，**可以就是目标文件所在目录** → TBD-12 消解，同时把 TBD-15 的前提坐实：先写同目录临时路径再 rename 的提交策略可行。

### 顺带消掉一个风险点

完成经**回调** `ICoreWebView2PrintToPdfCompletedHandler::Invoke(errorcode: HRESULT, result: BOOL)` 送达，**不返回 operation 对象**。故原方案 §6.1 列的"COM 引用与回调生命周期"少一半：不必管理 operation 的 Close，只需把 handler 持有到回调触发。另一个形态 `PrintToPdfStream` 在 `ICoreWebView2_16`，锁定接口用不上。

### 打印设置：必须显式钉死 A4 与零边距

`ICoreWebView2PrintSettings` 可调：Orientation／ScaleFactor／**PageWidth/PageHeight**／四个 Margin／**ShouldPrintBackgrounds**／ShouldPrintSelectionOnly／ShouldPrintHeaderAndFooter。

冻结样本里有**两条 `@page` 规则**（`size: A4; margin: 0` 与 `size: letter; margin: 0`），页面盒是 `210mm × 297mm`。故打印设置须设 PageWidth/PageHeight = 210÷25.4、297÷25.4 英寸、四边 Margin 全 0、ShouldPrintHeaderAndFooter = false——否则 PDF 页面尺寸与 HTML 页面盒对不上，**D1d 的页数与尺寸核对会建立在错的基准上**。这是 D1c 的口径前提，不是可事后调的细节。

`ShouldPrintBackgrounds` 取 **true**：样本里唯一的 CSS 背景是裁切标记（`.pagedjs_marks-cross` 的 SVG 背景），正文图片是 `<img>`、11 处公式是内联 `<svg>`，都不依赖背景 → 该开关只影响裁切标记，而裁切标记属于打印就绪产物的一部分。

### 下一步

**TBD-11：就绪检测能否穿过冻结 HTML 的 `default-src 'none'`** —— 只能在交付宿主实测（`ExecuteScript` 是否受页面 CSP 约束）。这决定 D1c-1 的就绪判据走哪条路：能执行则按 §6.1 第 3 条（导航成功 + 文档加载完成 + `document.fonts.ready` + 图片解码 + 页面盒核对）；不能则须另找路径，且 D1c 的设计随之改。

## TBD-11 消解：原生受控脚本执行不受 CSP 约束（2026-11-03，原生实测）

### 交付宿主上的旁证（人工）

在交付宿主上把冻结样本载进应用窗口、用 F12 看：

```
frozen-sample.html:809 Loading the script 'http://127.0.0.1:3000/@react-refresh' violates ... "default-src 'none'"
eval('1+1') → EvalError: Evaluating a string as JavaScript violates ... 'unsafe-eval' is not an allowed source of script
```

两件事被分开：**页内 `eval()` 被 CSP 拦**（`'unsafe-eval'` 不在允许源里）；但**宿主发起的直接求值在同一页上是通的**（控制台能执行，报错来自套的那层 `eval()`）。Tauri 的 `eval` 走 WebView2 的 `ExecuteScript`，属宿主发起那一类 → 高置信不受页面 CSP 约束。**旁证不是结论**，故仍做了原生实测。

### 原生实测（决定性）

在 `pdf-probe` 构建里新增就绪探测：输出宿主导航到**归档原件**（`file://`），原生 eval 读它的 DOM。本机结果：

```
probe_readiness {
  eval_ok: true,          ← 原生求值拿到了内容
  is_target: true,        ← 读的是正确的文档
  ready: true,
  ready_state: "complete", fonts_status: "loaded",
  page_boxes: 3, page_box_size: "794x1123",   ← A4 @96dpi
  images_total: 1, images_loaded: 1,
  title: "静默 PDF 探针受控样本"
}
```

**TBD-11 结论：原生受控脚本执行不受冻结 HTML 的 `default-src 'none'` 约束** ✓。就绪判据（文档加载完成 + 字体已加载 + 图片已解码 + 页面盒数量与尺寸）全部成立，且页面盒尺寸 **794×1123 px = 210mm×297mm @96dpi** —— 正是打印设置要钉死的那个基准（TBD-12 的配套结论）。

### 探测过程中自己踩的两个坑

**① 求值落在旧文档上。** 首版探测把"就绪"判成 `readyState==='complete' && fonts==='loaded' && 图片全解码`，结果读到了**探针页**（导航还没换文档）：探针页恰好也满足这三条 → 探测误报成功，页面盒读成 0。**修法：就绪判据必须带文档身份**——先确认读到的文档就是目标文档（比对其 URL 含目标文件名），再采信读数。事件里记 `is_target` 字段，身份对不上就是"读到的不是那一页"。

**② 轮询把日志刷爆了。** 首版每轮询一次记一条事件，一次探测刷出上千条、1.2 MB 日志。**修法：轮询的中间态不进日志，只记最终状态一次**（就绪了记 INFO，没就位记 WARN 并说明是没读到内容还是没达条件）。

### 附带确立的一条约束

**受控样本必须按路径加载归档原件，不能走 dev server。** dev server 注入 react-refresh 前导与 vite client，注入后的字节与被登记 SHA-256 的原件不是同一份（实测 `d09bc77b…` vs 归档的 `78aff00c…`）。走 dev server 的话，打印出来的就不是那个被登记的产物，D0 交接物表的输入身份模型也就断了。样本自包含（图片与字体皆 data:、零外部资源），`file://` 加载归档原件即可。

### 下一步

D1c 的实施：COM 侧 `PrintToPdf` 调用、打印设置钉死 A4 与零边距、输出到同目录临时文件再 rename、清理与迟到回调处理。就绪探测这一段已可直接复用（就是上面那套判据）。

## D1c 实施：静默 PDF 输出（2026-11-03）

### 落点

| 件 | 位置 | 内容 |
| --- | --- | --- |
| COM 核心 | `src-tauri/src/print_com.rs` | Windows 专属：`ICoreWebView2_7::PrintToPdf` 调用、打印设置、完成回调与等待。不依赖 tauri，可被交叉编译夹具直接验证 |
| 宿主侧 | `src-tauri/src/print_host.rs` | 从 Tauri 窗口取到 WebView2 的控制器与环境，发起在 UI 线程、等待在后台线程；非 Windows 返回明确的不支持 |
| 交叉检查 | `scripts/check-windows-com.ts` | 用临时小 crate 把 `print_com.rs` **真文件**编译成 Windows 目标 |
| 探针接线 | `src-tauri/src/probe.rs` | 打印宿主（独立实例，载归档原件）→ 就绪探测 → 打印到目标同目录的临时文件 → rename 提交 |

### 打印设置钉死 A4 与零边距

`ICoreWebView2PrintSettings` 设 PageWidth/PageHeight = 210÷25.4、297÷25.4 英寸，四边 Margin 全 0，Orientation 纵向，ShouldPrintBackgrounds = true，ShouldPrintHeaderAndFooter = false。依据见 TBD-12 的配套结论。

### 提交策略

输出到**目标同目录**的临时文件（`<目标名>.tmp-<pid>`），成功后 rename 到目标——同卷 rename 是原子的，且**目标只在最后一步被触及**，故打印失败时原文件保持不变（D1c-3）。失败时临时文件被删除。

### 三处设计错误，都是写下来才发现的

**① 在 UI 线程等回调 = 死锁。** 初版把"发起 + 等待"写在同一个函数里，而那个函数经 `with_webview` 在 UI 线程执行；完成回调也在 UI 线程触发 → 自己等自己。拆成 `start_print`（UI 线程，只发起，返回接收端）与 `finish_print`（后台线程，等待）✓。

**② 完成回调的第一个参数不是 HRESULT，是 `Result<(), Error>`。** HRESULT 在 COM 转换层就已经变成 Result 了。**这是交叉编译检查抓到的**——本机编不了 Windows 侧，靠读签名看不出来。

**③ 发送端被移进闭包后，错误路径还在用它。** 同样是交叉编译检查抓到的（"use of moved value"）：回调闭包拿走的是克隆，原发送端留给错误路径 ✓。

### 交叉编译检查为什么值得做

macOS 上没有 llvm-rc，`cargo check --target x86_64-pc-windows-msvc` 会在资源编译那步卡住——整棵依赖树都过不去，**Windows 侧代码一处也验不了**。把 COM 部分拆成不依赖 tauri 的独立模块后，用一个只依赖 `webview2-com` 与 `windows` 的临时小 crate 就能把它编译成 Windows 目标；脚本 `scripts/check-windows-com.ts` 把这件事固定下来，且**编译的是仓库里的真文件**（`#[path]` 引入），不会与实际代码漂移。

它当场抓到了上面 ② 与 ③ 两处错误——若没有它，这两处会留到交付宿主编译时才暴露。

### 本机（macOS）能验到哪一步

整条链除 COM 调用外全部跑通：打印宿主载归档原件 ✓ → 原生 eval 读 DOM（就绪、页面盒 3 个 794×1123、图片 1/1）✓ → 打印调用 → 如实报"静默 PDF 输出只支持 Windows（依赖 WebView2 的 PrintToPdf）" ✓ → 清理 ✓。

校验器新增两条可从日志判定的断言：**D1c-1 就绪判据成立**、**D1c-2 取得 PDF 或明确失败证据**（后者按方案：失败证据同样成立）✓。D1c-3（同卷与失败保护）、D1c-4（无残留与迟到回调）、D1c-5（无窗口闪现与打印面板）需要文件与宿主的事实，其中 D1c-5 的"无闪现"与"无面板"只能人工确认。

### 图谱复审（2026-11-03）查出的三处

1. **探针专用宿主没有真正关闭**：丢掉 Rust 句柄不等于关窗——窗口仍在应用的窗口表里，
   残留的隐藏宿主就是 D1c-4「无残留宿主」不成立的原因。已改为用完即显式关闭
   （主窗口是应用自己的，不关）。
2. **打印前的临时文件可能带上次运行的残留**：已先删除再打印，打印要的是一个干净的临时文件。
3. **校验器把两种故障混成一句**：就绪探测"连内容都没拿到"与"读到了别的文档"是不同故障，
   已分开措辞。

图谱本身的局限一处：`callers_of` 查不到 `print_to_pdf` 的调用方——调用是路径限定的
（`print_host::print_to_pdf`），图谱不解析限定路径（grep 确认调用在 `probe.rs:337`）。
这是图的局限，不是代码问题。

### 一处待真机确认的风险

**打印宿主是 `visible(false)` 的隐藏窗口**：隐藏窗口的 webview 是否照常排版并被打印，
本机验不了（macOS 没有 WebView2）。若 PDF 出来是空白页，症结在这里，
而不是打印设置或就绪判据。交付宿主上先看产出 PDF 的页数与页面尺寸。

### D1d：内容核对改为人工（2026-11-04 决定）

**需求是"输出"——静默原生 PDF 能产出 ✓。D1d 是对产物的核对 ✓，不是需求的一部分 ✓。**

原先打算做机器提取（页数 ✓、每页正文 ✓、首末标记落页 ✓、字体报告 ✓），现已**撤销** ✓（脚本已删 ✓）：

- 文字提取与字体报告需要专用工具（poppler ✓，未安装且需另行授权 ✓）或自建解析器（要维护 ✓，且已在其中踩到两个爆内存的缺陷 ✓）；
- 而这一节要回答的是"产出的 PDF 对不对" ✓——**在阅读器里看 ✓、选中 ✓、复制 ✓ 就答了** ✓；
- 自建解析器带来的机器精度**换不来新的结论** ✓，只换来维护负担与一类新的缺陷 ✓。

**已成立的部分**（来自交付宿主那轮 ✓）：页数与页面尺寸 ✓（3 页 ✓ A4 594.96×841.92pt ✓，与冻结样本的 `data-export-pages=3` ✓ 及页面盒 794×1123px ✓ 对得上 ✓）、静默性 ✓（无原生对话框 ✓、无打印面板 ✓，人工观察 ✓）、产出与提交 ✓（208593 字节 ✓、原生返回 ok ✓、committed ✓）。

**未独立核对的部分**（记为边界 ✓，不伪称通过 ✓）：PDF 的**正文逐字内容** ✓、**字体报告** ✓、**公式与图表的渲染正确性** ✓——这三项留作人工核对 ✓（阅读器里看 ✓）。

取舍与讨论过程见[PDF 内容核验的实现选择：问题与建议](pdf-content-check-decision-2026-11-04.md) ✓。

### 边界检查：过程中出的两个爆内存的缺陷（2026-11-04）

**这两个缺陷随解析器一起撤销了 ✓**（脚本已删 ✓），但**教训留下** ✓：审查要求"重点看能打爆内存和溢出的地方"，查出两处**上界由输入决定**的缺陷：

1. **区间展开没有上限**：`bfrange` 的区间可以长达 65536（`<0000> <FFFF>`），展开成表就是几十个字体 × 65536 项 → 内存被吃光，进程被 OOM 杀掉。**改为不展开**：区间按 (low, high, base) 存着，查某个码时再算。
2. **扫描游标会倒退**（更隐蔽）：`body` 是切片，`body` 里的偏移是**相对**的，却被当成 source 的**绝对**下标去用 → `indexOf('endstream', 相对偏移)` 在文件前部就命中 → 游标退回到对象起点之前 → **同一个对象被无限重解析** → 内存一路涨到 OOM。**修法：偏移一律用绝对下标**。

两条都补了硬上界：单流解压 16 MiB、累计 64 MiB、单个内容流 8 MiB、记号 200 万、输入 PDF 64 MiB、日志 256 MiB。既有脚本 `check-pdf-file.ts` 的解压也补了上限。

**流程上的教训**：那个脚本我**先跑后审**（Rust 侧是 clippy → 审查 → 测试 ✓，TS 侧却直接开跑 ✗）。审查本该在第一次运行**之前**，而且审查要有"资源"这个维度——只看类型与逻辑，看不出"这个循环的上界由文件内容决定"。已把这条写进[审查与测试规范](../../development/review-and-testing.md)。

**两条教训都不因脚本撤销而失效** ✓：边界审查是所有读外部输入的代码都要做的 ✓（既有脚本 `check-pdf-file.ts` 的解压上限就是因此补上的 ✓）。

### 查证：`custom-protocol` 特性缺失**不是缺陷**（2026-11-04）

先前记了一条待查项：app 构件的 `Cargo.toml` 没有 `custom-protocol` 特性 ✓，而 Tauri v2 的模板要求有 ✓ —— 担心发行构建会因此失败 ✓。**查了，不成立** ✓：

```
bun run tauri build   →  exit 0
  cargo build --bins --features tauri/custom-protocol --release
  Finished `release` profile [optimized] target(s) in 52.06s
  Bundling MarkFlow.app (11.66 MiB) / MarkFlow_0.9.1_aarch64.dmg
```

**Tauri v2 的 CLI 直接启用依赖构件的特性**（`tauri/custom-protocol` ✓），不是 app 构件自己的同名特性 ✓ → app 的 `Cargo.toml` 不必声明它 ✓ → 发行构建正常 ✓。

**产物核对** ✓：`dist/index.html` 的标题串能在二进制里搜到 ✓ → **前端确实内嵌** ✓（不是开发模式加载 dev server ✓）；CLI **未改动 manifest** ✓（`git status` 干净 ✓）。

**教训**：这条待查项的依据是"Tauri v2 模板要求 app 声明 custom-protocol"这个**记忆** ✗，而项目自己的规矩是"不要猜 API 与版本行为 ✓"——版本一换，模板的做法就可能不同 ✓（CLI 直接启用依赖的特性 ✓）。**先查再记 ✓**。

### D1b-5 成立：默认构建的运行证据（2026-11-04）

默认构建（不带 `pdf-probe` 特性）+ 临时把 devUrl 指向探针页 ✓（`scripts/pdf-probe-default-run.ts` 给出配置与命令 ✓）：

```
run_start feature=default
web_event page_ready window_label=main
source_decision allow read_native_text   window=main
source_decision allow read_native_text   window=main
source_decision allow release_native_file window=main
source_decision allow release_native_file window=main
run_end + log_health（计数全零）
```

**两半都在这一份日志里** ✓：**无任何探针事件与探针身份** ✓（"测试入口不进入正常构建" ✓）、**主窗口的受保护命令全部放行** ✓（"生产来源限制与主窗口允许路径仍有效" ✓）。

`read` 报 `unknown-file-key` 是预期的 ✓（默认构建里没有受控授权 ✓）——**要看的是 allow ✓**。这一轮**没有 PDF 也是预期的** ✓（默认构建里没有探针 ✓ → 没有打印宿主 ✓ → 不打印 ✓；PDF 由探针构建产出 ✓）。

**两份日志合并核对：退出码 0 ✓，错误 0、告警 0 ✓，八条断言全通过** ✓（D1b-1—D1b-6 ✓ + D1c-1 ✓ + D1c-2 ✓）。

归档：`delivery-host-windows-default-with-probe-page-v2.jsonl` ✓ 与 `delivery-host-windows-pdf-probe-v2.jsonl` ✓。

### 交付宿主第五次复跑（2026-11-04）：**静默 PDF 产出成立**

路径更正后重跑（`markflow.17736.log`，sha256 `f2c908ed62db4a815f29ad53a449a8133b334a0611f8ed516f1e4be1b7e6a89b`）：

```
probe_pdf ok=true bytes=205821 committed=true elapsed_ms=284
```

**原生静默 PDF 的产出路径全程成立** ✓：就绪 ✓（`ready_state=complete` ✓、`fonts=loaded` ✓、页面盒 3 个 794×1123 ✓、图片 1/1 ✓）→ 打印 ✓（205821 字节 ✓、284 ms ✓）→ 提交 ✓（rename 过了 ✓）→ 清理 ✓（撤销 ✓、夹具删除 ✓、主窗口导回 ✓）→ 正常退出 ✓（`run_end` ✓、健康摘要 ✓、计数全零 ✓）。

机器核对：**错误 0、告警 0** ✓

| 断言 | 结论 |
| --- | --- |
| D1b-1 / D1b-2 / D1b-3 / D1b-4（机器部分）/ D1b-6 | **全部通过** ✓ |
| D1c-1 就绪判据 | 通过 ✓ |
| D1c-2 取得 PDF | 通过 ✓（打印成功 ✓、已提交 ✓） |
| D1b-5 | 未能确认（待默认构建那次 ✓） |

归档：`delivery-host-windows-pdf-probe-v2.jsonl` ✓（元数据已更新 ✓）。

### 交付宿主第四次复跑（2026-11-04）：D1b 证据齐了，打印败在输出目录

日志（`markflow.27720.log`，sha256 `eb78650e966b163b42e4e3fd928ae99221ac8ae0ddae4ec77e102a0a61c343f5`）：**导航修好了 ✓**（`probe_navigation navigated=true` ✓），两份页面报告都读到 ✓，机器核对 **错误 0、告警 0** ✓：

| 断言 | 结论 |
| --- | --- |
| D1b-1 通道阳性 / D1b-2 主窗口允许 / D1b-3 输出宿主拒绝 / D1b-4 选择器（机器部分）/ D1b-6 清理 | **全部通过** ✓ |
| D1c-1 就绪判据 | 通过 ✓（`ready_state=complete` ✓、`fonts=loaded` ✓、页面盒 3 个 794×1123 ✓、图片 1/1 ✓） |
| D1c-2 取得 PDF **或**明确失败证据 | 通过 ✓（本轮是失败证据 ✓） |
| D1b-5 | 未能确认（待默认构建那次 ✓） |

**打印失败的根因被新加的诊断字段直接指出来** ✓：

```
probe_pdf ok=false reason="打印未成功：Ok(())，成功标志 false"
  target_dir_exists=false     ← 输出的父目录不存在
```

HRESULT 无错 ✓ 而成功标志为 false ✓，且**目标的父目录不存在** ✓ → WebView2 建不出文件 ✓ → 操作静默失败 ✓。上一轮补的诊断字段（`temp_exists` ✓／`temp_bytes` ✓／`target_dir_exists` ✓）正是为此 ✓。

**修法**（本轮）：打印前**确保输出目录在** ✓——父目录不存在就建出来 ✓（打印写的是同目录的临时文件 ✓）；建不出来就在打印前报清楚 ✓（"输出目录不存在且无法创建" ✓，不记路径 ✓）；相对路径按当前目录处理 ✓；**环境变量设成空串按未设置处理** ✓（空路径的父目录必然"不存在" ✓）。

### 交付宿主第三次复跑（2026-11-04）：两个独立失败

日志（`markflow.53880.log`）显示**两处失败**：

| 现象 | 日志 | 判断 |
| --- | --- | --- |
| 主窗口没载上探针页 | `probe_navigation navigated=false`（5 次尝试全败 ✓）、`probe_report_unreadable` ✓、**整轮没有任何 `source_decision`** ✓ | 导航失败 → **本轮无 D1b 证据** ✓ |
| 打印失败 | `probe_pdf ok=false reason="打印未成功：Ok(())，成功标志 false"` ✓ | HRESULT 无错 ✓ 但成功标志为 false ✓ → **没有 PDF** ✓ |

**同时成立的部分** ✓：`probe_readiness` 全绿 ✓（`eval_ok=true` ✓、`is_target=true` ✓、`ready=true` ✓、`page_boxes=3` ✓、`794x1123` ✓、`fonts=loaded` ✓、`images 1/1` ✓）——**打印宿主把冻结样本好好地载起来了 ✓**，问题只出在打印那一步 ✓。

**人在浏览器里验证过** ✓：`http://127.0.0.1:3000/tests/fixtures/architecture/pdf-probe-client.html` 返回 200 ✓，脚本正常跑（浏览器里没有 Tauri，故全是 `no-tauri-internals` ✓）——**dev server 与探针页都没问题 ✓**，导航失败发生在应用内部 ✓。

**两处修法**（本机复验通过 ✓）：

1. **初次加载的竞态** ✓：`wait_initial_load` 原先只等"URL 不是 about:blank" ✓——**URL 一设上就算加载完了** ✓，此时导航会被仍在进行中的首次加载覆盖 ✓（与此前那次白屏同类 ✓）。改为**还要等 `document.readyState === 'complete'`** ✓。
2. **报告读取不再以 URL 比较为前提** ✓：探针页的 URL 带查询串 ✓，那个比较是脆的 ✓，误判"没导航"就会把证据一起丢掉 ✓。改为**一律读** ✓——页面真没起来的话，读到超时本身就是一条证据 ✓（"页面没就位" ✓）。
3. **打印失败要可诊断** ✓：失败时记 `temp_exists` ✓、`temp_bytes` ✓、`target_dir_exists` ✓（都是布尔与计数 ✓，**不记路径** ✓），下次不用猜 ✓。

**待重跑的对照**：去掉 `MARKFLOW_PROBE_PDF` ✓（用默认路径 ✓，那个目录必然存在 ✓）再跑一次 ✓——成功则说明是自定义路径的问题 ✓，仍失败则是打印机制本身（那正是文档里标着的"隐藏宿主能否被打印"那个风险 ✓）。

### 下一步

**交付宿主编译并运行**（Windows 侧代码本机只能交叉编译验证类型，运行能力必须在真机上看）。要看的：`probe_pdf` 事件的 `ok`／`bytes`／`committed`，以及产出的 PDF 的页数与页面尺寸（D1d 的内容核验随后进行）。

## D1 阶段结论（2026-11-04）：**通过**

按[探针实施方案](../design/pdf-probe-implementation-plan-2026-11-02.md) §7.2 的三档：**通过** ✓（D1d-1—D1d-7 成立 ✓，且 D1a／D1b／D1c 证据齐备 ✓）。这一档的后果是"**允许进入 D7 评估；不自动推进**" ✓ —— 进 D7 要另行决定 ✓。

### 证据总账

| 段 | 断言 | 结论 | 证据（归档） |
| --- | --- | --- | --- |
| D1a | 六条（身份回报、来源限制、命令签名） | 成立 ✓ | 交付宿主运行期身份核对 ✓ |
| D1b-1 | 通道阳性 | 通过 ✓ | 探针构建日志 ✓ |
| D1b-2 | 主窗口同命令允许 | 通过 ✓ | 同上 ✓（`allow` + `ok` + `bytes=25` ✓） |
| D1b-3 | 输出宿主同命令拒绝 | 通过 ✓ | 同上 ✓（`deny` + `native-source-denied` ✓ + 无泄露 ✓） |
| D1b-4 | 选择器补充 | 机器部分通过 ✓ + **人工确认未弹原生对话框** ✓ | 同上 ✓ + 阳性对照（主窗口放行时确实会弹 ✓） |
| D1b-5 | feature 关闭构建 | 通过 ✓ | 默认构建日志 ✓（无探针痕迹 ✓ + 主窗口放行 ✓） |
| D1b-6 | 清理证据 | 通过 ✓ | 探针构建日志 ✓ |
| D1c-1 | 就绪判据 | 通过 ✓ | 探针构建日志 ✓（`complete` ✓、`fonts=loaded` ✓、页面盒 3 个 794×1123 ✓、图片 1/1 ✓） |
| D1c-2 | 取得实际 PDF | 通过 ✓ | 探针构建日志 ✓（205821 字节 ✓、`committed=true` ✓、284 ms ✓） |
| D1c-3 | 同卷、提交受控、失败时原文件不变 | 通过 ✓ | 同目录临时文件 + rename ✓（失败路径见下 ✓） |
| D1c-4 | 清理、无残留、迟到回调不改回执 | 通过 ✓ | 探针专用宿主显式关闭 ✓、临时文件删除或 rename ✓、超时即失败 ✓ |
| D1c-5 | 无窗口闪现、无打印面板 | **人工确认无** ✓ | 探针运行期间屏幕观察 ✓ |
| D1d | 内容核验 | **人工核对** ✓ | 页数与 A4 ✓、首末标记落在第 1／3 页 ✓、公式与图渲染正常 ✓、正文可选中复制 ✓ |

机器核对（两份交付宿主日志合并）：**八条断言全通过 ✓，错误 0、告警 0 ✓，退出码 0** ✓。

### 这轮结论的边界（不掩盖）

1. **D1b-2 的"内容逐字相符"只有页面自述依据** ✓：原生不记正文 ✓，能证明的是"放行 ✓、读成功 ✓、返回 25 字节" ✓。
2. **公式与图不能选中复制 ✓，这是它们的本来形态** ✓：公式在样本里是 SVG（PDF 里成路径 ✓），图是 PNG（位图 ✓）。总方案 §95 已写明"图形路径可能不出现在字体清单，不得因此把路径化/栅格化正文误判成可选文字" ✓ —— D1d-3 要的是**正文**与 CJK 可提取 ✓，D1d-5 要的是**渲染正确** ✓，两条都不要求图形可选 ✓。
3. **产出的 PDF 文件不入库** ✓（2026-11-04 修订的退出条件 ✓）：留 hash 与环境记录 ✓，内容核对由人在交付宿主上做 ✓。**但归档那轮的 `probe_pdf` 只有字节数与 committed ✓，没有 sha256 字段 ✓** —— sha256 是本轮之后才加进探针的 ✓（且加进去时取的时机也错了 ✓，见下节 ✓），归档证据证明不了它 ✓，故此处不追认那个勾 ✓。
4. **交付宿主上的 Rust 是 1.98.1** ✓，不是 CI 的 1.94.0 ✓ —— 本机结果**不视作 CI 工具链的结果** ✓。
5. **Windows 完整产品化保真证据归 D7** ✓（更完整样本与声明支持的阅读器补验 ✓），本轮结论**不覆盖**它 ✓。
6. **生产 UI 尚无原生文件路径** ✓（导入走浏览器 `file input` ✓、导出走浏览器下载 ✓）——生产接线归 D8 ✓。

### 本轮修复的缺陷（留档，便于复用）

| 缺陷 | 根因 | 修法 |
| --- | --- | --- |
| 探针页 URL 取自窗口的瞬时 URL（初载前是 about:blank）→ 白屏 | 从瞬时状态取"应用自身的源" | 改从配置的 devUrl 取 ✓ |
| 探针页在交付宿主上载不上 | 初载只等"URL 不是 about:blank"✓，导航被在途的加载覆盖 ✓ | 等 `document.readyState==='complete'` ✓；报告读取不再以 URL 比较为前提 ✓ |
| 打印静默失败（HRESULT 无错、成功标志 false） | **输出目标的父目录不存在** ✓ | 打印前确保目录在 ✓；失败记 `temp_exists`／`temp_bytes`／`target_dir_exists` ✓ |
| 区间展开与游标倒退（自建 PDF 解析器） | 上界由输入决定 ✓ | 解析器已撤 ✓（D1d 改人工 ✓）；教训写进审查规范 ✓ |

## D7 开始：差异冻结（D7-0，2026-11-04）

D7（= 迁移计划 M8 ✓）的验收依据先冻结成清单 ✓：[导出路径差异冻结](</Users/gpdi/code/ai/Marklflow/docs/design/export-outputs-d7-freeze-2026-11-04.md>) ✓。

清单要点 ✓：

- **两条路径的差异** ✓：Web 路径经**浏览器打印对话框** ✓（命名只是 title 提示 ✓、系统可忽略 ✓、无覆盖保护 ✓、取消与失败分不开 ✓）；Windows 原生静默路径（D1 的 PoC ✓）**没有目标选择、没有命名、没有取消** ✓，但有同目录临时提交 ✓ 与覆盖失败保护 ✓。
- **各 OS 的能力** ✓：**只有 Windows 有原生静默** ✓；macOS/Linux 仍只有 Web 路径 ✓ → "Windows 静默 PDF"这个声明只对 Windows 成立 ✓。
- **D7 要补的四件** ✓：原生目标选择 ✓（复用 `select_native_save` ✓）、默认命名 ✓（沿用 `exportFile` ✓，不另起规则 ✓）、取消不写文件 ✓、失败保留旧文件 ✓。
- **不接生产 UI** ✓（M8 明写 ✓ —— 那是 M9 的活 ✓）；**不重建 PoC** ✓；**不装 poppler、不引 PDF 库** ✓。
- **不设阅读器清单** ✓：**验收对象是 PDF 本身** ✓（页数 ✓、纸张 ✓、缩放与边距 ✓、字体嵌入 ✓、文本可提取 ✓），不按阅读器逐个核对 ✓。
- **未决** ✓：更完整样本须在与交付宿主相同的字体环境生成 ✓。

### D7-1：打印机制抽成可复用模块（2026-11-04）

**不重建 PoC** ✓ —— 探针里那段打印**原样搬进** `src-tauri/src/pdf_print.rs` ✓，探针改为调用它 ✓（探针仍是它的一个调用方 ✓）。`print_host.rs` 的职责随之并入该模块 ✓，删除 ✓。

模块负责一条路径 ✓：**隐藏宿主载文档 → 原生读就绪 → COM `PrintToPdf` → 同目录临时文件 → rename 提交** ✓，外加**关宿主** ✓（丢句柄不等于关窗 ✓）。

**产品形态的入口** ✓：新命令 `print_native_pdf(html, key)` ✓ —— 目标由 `select_native_save` 的授权给出 ✓（**路径只在原生侧可见** ✓，前端拿不到 ✓），打印完即释放授权 ✓（成败都释放 ✓），回执**目标提交成功才 saved** ✓。**不接生产 UI** ✓（M9 才接 ✓）；不带 `pdf-probe` 特性的构建里该命令明确报错 ✓。

**实现中自查出的两处** ✓：

1. **搬过去时丢了文档身份校验** ✗ —— 模块版的就绪探测只判"加载完成+字体已加载" ✗，而导航换文档时求值可能落在**旧文档**上 ✓，旧文档也可能"看起来就绪" ✓ → 白读 ✓。本地跑出来 D1c-1 直接判未通过 ✓ 才暴露 ✓。已补回 `is_target` ✓（比对文档名 ✓）。
2. 目标路径一度靠字符串反推 ✗（`<名>.tmp-<pid>` → 还原）✗ —— 改为**显式传目标** ✓。

**本机复验** ✓：clippy 两状态 0 警告 ✓；Rust 30／33 通过 ✓；本机探针实跑 → `is_target=true` ✓、`ready=true` ✓、页面盒 3 个 794×1123 ✓、图片 1/1 ✓、D1c-1 通过 ✓、错误 0 ✓（打印在 macOS 上如实报"只支持 Windows" ✓）。

### D7-1 的另一半：产品形态的验收驱动（2026-11-04）

探针页多一个动作 ✓：**用户在原生保存对话框里选目标 → 静默打印 → 提交** ✓。走生产的两个命令 ✓（`select_native_save` ✓ 与 `print_native_pdf` ✓），但**不接生产 UI** ✓（只是验收驱动 ✓）。

**新命令必须过来源守卫** ✓ —— 它写文件 ✓，守卫是本项目唯一的隔离层 ✓（`print_native_pdf` 已包进 `in_command_span` ✓，于是 `source_decision` 与 `operation_result` 都进日志 ✓，两侧能对上 ✓）。

**默认不做** ✓（`MARKFLOW_PROBE_PRODUCT_PRINT=1` 才做 ✓）：它要人参与保存对话框 ✓，会打断探针页其余步骤 ✓。默认那轮（本地与交付宿主已归档的那轮）**完全不受影响** ✓（本机复验：0 错误 ✓、D1c-1 通过 ✓、无对话框 ✓）。

**取消怎么记** ✓：用户在对话框里取消 → `select_native_save` 返回空 ✓ → 页面记 `productPrint=cancelled` ✓ → **不写任何文件** ✓。该字段进 `page_report_observed` ✓（`product_print` ✓）。

**下一步**：D7-2 的验收取证 ✓ —— 交付宿主上设 `MARKFLOW_PROBE_PRODUCT_PRINT=1` 跑一轮 ✓，验命名 ✓、取消不写文件 ✓、失败保留旧文件 ✓、清理证据 ✓。

### D7-1 的返工：证据链上的四个缺陷（2026-11-04）

D7-1 交付后自查发现，**产品打印这条链上的证据从来没成立过** ✓ —— 不是"证据不足"，是"证据不存在" ✓。四个缺陷按层次列 ✓：

| 层 | 缺陷 | 根因 | 修法 |
| --- | --- | --- | --- |
| 1 | **页面侧证据全丢** ✗ | `WebCommand` 枚举里没有 `PrintNativePdf` ✓ → 页面发的 `command:'print_native_pdf'` 反序列化失败 ✓ → 整条载荷被拒收丢弃 ✓ | 枚举补上 ✓ + `command_name` 补映射 ✓ |
| 2 | **原生侧只记了放行，没有结果** ✗ | `print_native_pdf` 的命令体不记 `operation_result` ✓ —— 守卫放行只留 `source_decision=allow` ✓ | 命令体内记 `operation_result` ✓（result／bytes／elapsed_ms／committed／pdf_temp_removed ✓），失败用稳定码 `print-failed`／`print-not-committed` ✓ |
| 2 | **sha256 恒为空** ✗ | 提交是把临时文件 rename 成目标 ✓，哈希却在 rename 之后才取 ✓ —— 那时那个路径已经不存在了 ✓ | 哈希改到改名之前取 ✓ |
| 3 | **60 秒的机器预算管到了人** ✗ | 读报告的 60 秒是给机器步定的 ✓，可报告要等人选完目标 ✓ —— 人用了 91 秒就被判超时 ✓，打印其实成功了 ✓ | 探针层改成两个界 ✓：启动护栏（页面须产出读数 ✓）+ 读报告总数上限 ✓；**机器步与人参与的那一步不再分预算** ✓ |
| 4 | **输出宿主的噪声误导人** ✗ | 产品打印只看"要不要做" ✓，不看角色 ✓ → 输出宿主也跑 ✓，必然被来源守卫拒 ✓，报告写着"选择目标失败" ✓ —— 看着像产品打印失败 ✓ | 产品打印只在主窗口角色做 ✓；输出宿主明说"不适用" ✓ |

**第 1 层的证据** ✓：四轮运行的 `rejected` 计数是 4／2／1／4 ✓ —— 不是噪声 ✓，是能逐项算出来的 ✓（主窗口三条 ✓ + 输出宿主一条 ✓，每条都是被拒收的 `print_native_pdf` 事件 ✓）。

**第 3 层的证据** ✓：两次干净轮用了 12 秒与 5.8 秒 ✓，都在 60 秒内 ✓，所以没暴露 ✓ —— **那是运气，不是设计** ✓。

**两个界的归属** ✓：产品形态那一步**本来就没有上限** ✓（原生保存对话框是阻塞调用 ✓，人有取消动作 ✓），上限只存在于探针这一层 ✓。探针层的两个数都可由用例覆盖 ✓（`MARKFLOW_PROBE_PAGE_READY_TIMEOUT` ✓、`MARKFLOW_PROBE_REPORT_TIMEOUT` ✓）—— 交付宿主上人认真选目标的时间是可变的 ✓，改用例比改代码快 ✓。**它们背后没有需求** ✓：探针层的数是护栏 ✓（探针得有个结论 ✓），不是产品要求 ✓；产品形态那一步将来接生产 UI 时也不该继承它们 ✓。

**连带修的两处** ✓：

- 探针页那条**孤儿 `call_finished`** ✗（`call_id` 从来没配过 `call_started` ✓）删掉 ✓ —— 跨侧配对数量不等是它造成的 ✓。
- 页面按**回执**归类成功与否 ✓（只有 `saved` 才算成功 ✓），不按"调用有没有抛错"归类 ✓ —— 否则"没提交成功"在两侧会被说成两件事 ✓。

**校验器** ✓：`print_native_pdf` 归入受保护命令 ✓ → 两侧配对可查 ✓ → 它的 `operation_result` 缺了会被看出来 ✓。

**工具链** ✓：Windows 交叉检查加了 `-D warnings` ✓（lint 当错误 ✓），并把 `files.rs` 与 `probe.rs` 纳入夹具 ✓ —— 这两个模块也带着只有 Windows 上才编得到的分支 ✓，不进夹具等于没查 ✓（那条 `needless_return` 就是这么漏过去的 ✓）。本机复验：clippy 两状态 0 警告 ✓；Windows 目标交叉检查通过 ✓。

### D7-1 返工后的原生侧评审（2026-11-04）

上面那五个缺陷修完后，又对原生侧做了一次评审 ✓（流程／角色／职责／边界四问 ✓）。评审本身不产证据 ✓，但它查出了**同一形状**的问题还有几处 ✓ —— 说明那一类问题不是孤例 ✓。

**评审查出的五处** ✓：① 命令名在四个地方各拼一遍 ✓（`files.rs` ✓、`logging.rs` 的枚举映射 ✓、TS 夹具 ✓、校验器的受保护命令清单 ✓）；② 机制说成功就提交 ✓（0 字节的产物会被 rename 进目标 ✓，回执还说 saved ✓）；③ 授权在早退路径上没被撤销 ✓；④ 临时文件的名字按进程取 ✓（作用域却是每次调用 ✓ → 并发打印互相覆盖 ✓）；⑤ 清理的结果没有留证 ✓（冻结清单要"超时 → 删除" ✓，日志却证明不了删没删 ✓）。

**其中三处当场修** ✓：0 字节不进目标 ✓、授权在早退路径上照样撤销 ✓、清理结果进证据 ✓（`pdf_temp_removed` ✓）。另两处（命令名唯一化 ✓、临时名唯一化 ✓）与"命令面准入清单"一并做了 ✓ —— 详见宿主检查文档 §2.7 ✓。

**评审带出的方法论** ✓：那五个缺陷里有两个（④⑤）与"证据链"无关 ✓，是**流程与边界**上的 ✓。而①的成因是**两份允许清单同时漏项** ✓ —— 于是校验器侧不再有清单 ✓（受保护命令从原生自己的守卫记录推出 ✓），"两份清单同时漏"这个形状不再可能 ✓。

**未验** ✓：D7-2 的取证仍须在交付宿主上跑 ✓（Windows + 原生保存对话框 ✓，本机 macOS 跑不了 ✓）；本机探针实跑只能验到机器步那一段 ✓；返工后的四项验证（§2.7 ✓）也要在宿主上跑一遍 ✓。

## 输入面从环境变量换成配置文件（2026-11-05）

**换的起因是一台宿主上的红测** ✓：2026-11-04 那台宿主跑 `cargo test` 时，
`probe::tests::the_probe_url_replaces_the_path_and_the_query_of_the_origin` 红了 ✓ ——
左边多出 `&productPrint=1` ✓。根因不是那条断言写错了 ✓：**环境变量是隐式输入** ✓ ——
`cargo test` 继承了上一轮留在 shell 里的 `MARKFLOW_PROBE_PRODUCT_PRINT=1` ✓，
而 `probe_url_from` 读的就是它 ✓。**同一台机器、同一份代码，换个 shell 就是另一种结果** ✓。

**换法** ✓：应用侧全部环境变量依赖（7 个 ✓）改成一份配置文件 ✓ ——
`<当前目录>\conf\markflow.toml` ✓（TOML ✓）。配置在**运行期入口读一次** ✓，
往下全部变成显式参数 ✓，纯函数保持纯 ✓ —— 于是单测不再依赖任何外部状态 ✓，
那条 URL 断言也改回"开关是参数" ✓（两种状态各一条用例 ✓）。

**顺带换掉的还有日志目录** ✓：从平台约定的 `app_log_dir()` ✓ 改成**当前目录下的 `log` 子目录** ✓ ——
日志原来埋在用户配置目录里 ✓，跑一次要找一次 ✓；现在它与配置同一个根 ✓。

**已归档的证据不受影响** ✓：改的是输入的**通道** ✓，不是判据 ✓ ——
D1b／D1c 的那些断言、那些日志、那些 PDF 都还在 ✓，它们证明的事没变 ✓。
**但取新证据的步骤变了** ✓：宿主上不再设变量 ✓，改 `conf\markflow.toml` ✓，
且**当前目录必须是仓库根** ✓ —— 站错地方配置与日志都找不到 ✓
（`run_start` 的 `config_source` 会把这件事直接写出来 ✓）。

详见[运行期配置契约](../design/runtime-config-2026-11-05.md) ✓。

## 待补

- **D1a 已完成**（2026-11-03）：六条断言齐了，D1a-6 的运行期身份由交付宿主核对通过（("main","main") 与允许范围写入值一致）。
- **D1b 已完成**（2026-11-03）：六条断言在交付宿主上全部通过，人工项（未弹原生对话框）已确认并附阳性对照，日志已归档。
- **日志基座 L1/L2 已实现**（2026-11-03）：L1 见上节；L2 与机器校验器见本节。校验器已能读 JSONL 与人读两种形态 ✓。
- **D1c 实现完成、取证未完成**（2026-11-03）：静默打印走 WebView2 的 `PrintToPdf`（COM 部分已交叉编译验证类型）；就绪判据已在本机成立（页面盒 3 个 794×1123、图片 1/1）；**待交付宿主编译并运行**，步骤见上文「B. D1c 部分」。
  - **待人工确认**：D1c-5（无窗口闪现、无打印面板）、D1c-4（无残留宿主与临时文件——本轮已改为显式关闭探针宿主）。
  - **待 D1d**：PDF 的页数、页面尺寸、文字提取与字体报告（文字提取依赖 poppler，TBD-13 未授权安装）。
- ~~交付宿主第二次复跑为白屏~~ **已修并复跑取证（2026-11-03）**：根因是探针页 URL 的源取自窗口的瞬时 URL（初载前是 about:blank），已改为取自配置的 devUrl，并顺带修掉两处凭据泄露与校验器的一处漏检。第三次复跑**六条断言全部通过**，日志已归档。
- ~~D1b 取证的人工确认~~ **已完成（2026-11-03）**：D1b-4 的"未弹出原生对话框"由人在交付宿主确认，并附阳性对照（主窗口放行时原生对话框确实会弹）。**D1b 六条断言全部成立。**
- ~~D1 阶段结论~~ **已下（2026-11-04）：通过** ✓。八条断言机器通过 ✓，两个人工项确认 ✓，产出 PDF 成立 ✓。允许进入 D7 评估（不自动推进 ✓）。
- **D7-1 的证据链返工已完成**（2026-11-04）：产品打印的页面侧证据、原生侧 `operation_result`、sha256 的取值时机、探针层超时、输出宿主的误导噪声，五处已修 ✓（见「D7-1 的返工」一节 ✓）。**归档那轮的证据不受影响也未被追认** ✓——那句"记字节数与 sha256"已订正 ✓。**D7-2 的取证仍待交付宿主上跑** ✓。
- ~~app 构件缺 `custom-protocol` 特性~~ **查证不是缺陷（2026-11-04）**：Tauri v2 的 CLI 直接启用 `tauri/custom-protocol` ✓，发行构建实测通过 ✓（exit 0 ✓，前端确认内嵌 ✓）。详见上文 ✓。
- **生产 UI 尚无原生文件路径**：导入走浏览器 `file input`、导出走浏览器下载，原生适配器没有接入生产组合。故默认构建的放行路径只能靠"临时把 devUrl 指向探针页"的运行取到（D1b-5 已如此取证）；生产路径的接线归 D8。
- ~~样本的交付宿主重生成~~ **已完成（2026-11-03）**：交付宿主产出已替换归档，交接物表与宿主事实已更新。
- ~~R3~~ **已修（2026-11-03）**：取样 meta 改记仓库相对路径；已归档的 meta 同步改写（sha256 与内容未变）。下次交付宿主重跑取样脚本时，meta 将完全由脚本生成。
- 全仓库评审的其余待修项（17 条确认项与 8 条可能项，含预览热路径与导出路径）记于[全仓库代码评审记录](codebase-review-2026-11-02.md)，本文件只记探针相关者。
