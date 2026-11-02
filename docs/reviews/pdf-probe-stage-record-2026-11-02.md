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

### 工具链评审发现（2026-11-02，尚未修）

对生成工具与配置做了一次评审，发现三条。均属工具与配置，不涉及产品代码；三条都不阻断 D0，但前两条会在交付宿主取样时产生"看起来成功、实则与记录矛盾"的产物，故排在取样之前处理。

| # | 发现 | 影响 | 拟修 |
| --- | --- | --- | --- |
| R1 | **已修（2026-11-03）**。**自检比记录的交接期望弱**。阶段记录写死"HEAD 标记第 1 页、TAIL 标记第 3 页，各出现 1 次"，而脚本只断言"标记页码非 null"。若 Windows 的字体度量把标记挪位，脚本照旧写盘并报成功，产出的 meta 与本记录直接矛盾 | 归档与记录不一致，且由工具自证 | 自检改为断言期望值本身：声明页数与页面盒数一致、页面盒多于一页、HEAD 在第 1 页、TAIL 在末页、两标记各出现 1 次、平台字体证据非空；**自检通过才落盘**，失败的产物不替换归档。**已验**：把 HEAD 的期望页改成 2 后运行，自检报错并指名该项，归档未被触碰；正常运行通过 |
| R2 | **已修（2026-11-03）**。**`/src/*` 路径映射放在 `tsconfig.base.json`，范围过宽**。四个 profile 全部继承，于是任何源文件都可写 `import x from '/src/foo.ts'` 并通过类型检查；但该写法只在 Vite dev server 下成立（dev server 按仓库根路径提供 `/src/...`），`vite build` 会当成 URL 路径，生产构建直接坏掉。即以构建期地雷换掉了类型期护栏 | 未来有人这样写 import 时不会被类型检查拦下 | 映射下沉到 `tsconfig.integration.json`（脚本所在 profile），base 保持干净。实测 TS 的 `paths` 从 `extends` 继承时是整体替换而非合并，下沉时把 `@/*` 一并重新声明。**护栏已验**：在 `src/` 下放一个 `import from '/src/core/storage/storage'` 的探针文件，`tsc -p tsconfig.json` 报 TS2307，即该写法在源文件里已被类型检查拦下；脚本所在 profile 仍可解析 |
| R3 | **meta 记了宿主绝对路径**（`file`、`source`）。交付宿主取样后仓库里会留下 `C:\Users\<用户名>\...` | 归档带宿主信息，不该入库 | 改为记仓库相对路径 |

R1 的同类情形已在开发中发生过一次：修 `DOM.enable` 之前 `platformFonts` 是空数组，自检照样通过，字体证据静默退化为空而产物看起来正常。**产物型断言须编码期望值，而非编码"非空"**，此条一并记此。

## 待补

- D1a—D1d 尚未实施；本文件当前只有 D0 一节
- ~~样本的交付宿主重生成~~ **已完成（2026-11-03）**：交付宿主产出已替换归档，交接物表与宿主事实已更新
- 上表 R1—R3 三条评审发现待修；R1 应在交付宿主取样之前修，否则取样产物可能带着与记录矛盾的 meta 归档
- 全仓库评审的其余待修项（17 条确认项与 8 条可能项，含预览热路径与导出路径）记于[全仓库代码评审记录](codebase-review-2026-11-02.md)，本文件只记探针相关者
