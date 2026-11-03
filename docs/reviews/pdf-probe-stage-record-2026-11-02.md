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
3. **D1a 落地前输出宿主不存在任何 IPC 隔离**，因此不得在 D1a 之前创建输出宿主。
4. 若将来引入应用级 ACL manifest（新增 `src-tauri/permissions/` 目录），`has_app_acl` 变 true，ACL 将开始检查应用自定义命令——D1b-3 的证据来源与放行行为都会变。**D1b 与 D7 的复用前提须包含「未引入应用级 ACL manifest」。**

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

## 待补

- **D1a 已完成**（2026-11-03）：六条断言齐了，D1a-6 的运行期身份由交付宿主核对通过（("main","main") 与允许范围写入值一致）。
- **D1b 实现完成、取证未完成**：探针在本机跑通并产出完整证据集；交付宿主首次复跑为装配缺陷（主窗口停在 `about:blank`，探针页未加载），成因已定位并已改（导航延到后台线程、先等初载落地、另加两处自述诊断），**待重跑取证**。
- **日志基座 L1/L2 未实现**：设计已定（独立文档[日志基座设计](../design/log-base-plan-2026-11-03.md)），是 D1b 取证的前置——未落地前证据只能靠人读终端输出，不能机器校验。
- ~~样本的交付宿主重生成~~ **已完成（2026-11-03）**：交付宿主产出已替换归档，交接物表与宿主事实已更新。
- **R3 尚未修**：meta 记宿主绝对路径。修了需在交付宿主重跑脚本换 meta（HTML 产物不变），故排在下次取样时一并做。
- 全仓库评审的其余待修项（17 条确认项与 8 条可能项，含预览热路径与导出路径）记于[全仓库代码评审记录](codebase-review-2026-11-02.md)，本文件只记探针相关者。
