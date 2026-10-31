# 导出交付层检索任务：DOCX 保存与 PDF 打印的「正确做法」

日期：2026-10-31；作者：实现侧；检索执行：用户（手动检索）。
背景：Windows 11 + Edge（Web 形态）现场两个现象 —— ① DOCX 显示「已保存文件」但目标位置没有文件；② PDF 需要第二次打印才出内容。本文件列出**尚未被证据回答的问题**、检索线索与判定标准，供手动检索后回填。

> **2026-10-31 现场结论（用户复核）**：打印宿主归位后**第一次打印即产出内容**（⇒ 视口外未渲染是 PDF 首打空白的根因）；DOCX **目标位置出现文件**（⇒ 交付顺序归位 + 回读校验解决了「显示成功但无文件」）。Q5 已由现场回答；Q2/Q3/Q4 的机理问题不再阻塞交付，但结论仍留档。
> **平台语义统一（Web FSA / 桌面 Tauri 统一为文件系统访问语义）暂缓**：用户决定本轮不做，相关问题记录在 §3 的「暂缓」条目里。

> 约定：本文只列**尚无证据**的问题。已被本地代码/测试/实测确认的事实见 §0，不需要再查。

---

## 0. 已确认的事实（不必再查）

| # | 事实 | 出处 |
| --- | --- | --- |
| F1 | 我们的写入序列是：`showSaveFilePicker`（用户手势内）→ **[间隔数秒：prepare + DOCX 兼容性确认 + 生成 DOCX]** → `createWritable` → `write(blob)` → `close()` → 回执 `'saved'` | `src/core/platform/web/byteDelivery.ts`、`src/application/exports/exportService.ts` |
| F2 | `close()` resolve 之后我们**回读** `handle.getFile()` 比对大小；读不到或大小不符即判「写丢了」，改投浏览器下载（回执 `'recovered-download'`）。**这只是检测与兜底，不修复写入本身** | 同上（2026-10-31 改动） |
| F3 | 写出的**字节是对的**：e2e 探针把写入流的内容解包为 zip，`word/document.xml` 含源文本、公式为原生 `m:oMath` | `tests/e2e/web-unified-save.spec.ts`、`tests/e2e/docx-diagnostics.spec.ts` |
| F4 | PDF 打印用的是**已分页的静态 HTML**（分页在父窗口由 `paginatePreparedContent` 完成），iframe 只负责承载与打印；iframe 的 CSP 为 `default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:`，字体与图片均为 `data:` 内联 | `src/core/export/pdfExporter.ts`、`src/core/platform/web/pdfDelivery.ts` |
| F5 | 打印前在 **iframe 自己的 window** 内等待：图片 `decode()`、`document.fonts.ready`、**两帧 rAF**（`waitForLayout` 用 `doc.defaultView.requestAnimationFrame`） | `src/core/export/documentPrint.ts` |
| F6 | 打印宿主 iframe 的几何是 `position:fixed;left:-20000px;top:0;width:794px;height:1123px`，即**完全在视口之外**；`sandbox="allow-same-origin allow-modals"`（**无** `allow-scripts`） | `src/core/platform/web/pdfDelivery.ts` |
| F7 | `print()` 调用在 iframe 的 `contentWindow` 上（打印的是子框架文档），宿主在 `afterprint` 后延迟 1500 ms 才移除 | 同上 |
| F8 | 现场结论：第一次打印为空白/无内容，第二次打印正常；PDF 的「另存为」是浏览器打印对话框自身的能力 | 用户现场（Windows 11 + Edge） |

---

## 1. DOCX 保存路径（File System Access API）

### Q1 ✅ 已由本地实测回答（无需再检索）

- **我们现状**：`types:[{description:'.docx 文件',accept:{'application/vnd.openxmlformats-officedocument.wordprocessingml.document':['.docx']}}]` —— 扩展名**带前导点**。
- **实测（本仓库 Playwright chromium-1248，页面为安全上下文 127.0.0.1）**：
  - `accept:{'…document':['.docx']}` → 选择器被正常唤起（无头环境下被用户中止 ⇒ `AbortError`）；
  - `accept:{'…document':['docx']}` → **`TypeError: Extension 'docx' must start with '.'.`**
- **结论**：Chromium/Edge **要求扩展名带前导点**，当前写法**正确**，无需改动。此前按 W3C 规范文本（不带点）作出的「我们不合规」判断是错的，已作废。
- 遗留（可选查证）：W3C 规范文本与 Chromium 实现不一致，Edge/WebView2 是否同样要求带点（WebView2 同为 Chromium，预期一致）。

### Q2 `close()` resolve 但目标位置没有文件，是否有已知机制？

- **要问的**：Chromium/Edge 的 `FileSystemWritableFileStream` 在什么情况下会「`close()` 成功 resolve、但目标路径没有文件（或文件仍是旧内容/0 字节）」？请具体列举：
  1. `createWritable()` 与 `close()` 之间**隔了较长时间**（数秒）且期间发生了**另一次用户交互**（点了别的按钮）——是否会使写流失效或写入被丢弃？是否会产生 `NotAllowedError`/`InvalidStateError`（那样我们就会看到错误而不是静默成功）？
  2. 目标是 **OneDrive / 网络驱动器 / 重定向目录 / 桌面重定向**（Windows 的「已知文件夹」重定向）时的已知差异？
  3. 目标文件**正被其他程序打开**（如 Word 打开着同名 docx）时的行为？
  4. Chromium 的 swap-file 机制：`createWritable()` 默认 `keepExistingData:false`，`close()` 才把临时文件换名覆盖目标；是否存在换名静默失败的已知缺陷？
- **检索词**：`FileSystemWritableFileStream close resolved but file not written` / `showSaveFilePicker createWritable file missing after close` / `Chromium file system access swap file rename fails` / `Edge showSaveFilePicker saved file not found` / `OneDrive redirected known folder showSaveFilePicker`
- **去哪里查**：issues.chromium.org（file_system_access 组件）、WICG/file-system-access issues、stackoverflow（file-system-access 标签）、Excalidraw issue #5100（save picker 反复失败的真实案例）、Microsoft Edge DevForum / WebView2Feedback。
- **判定**：需要至少一个**有代码或复现步骤**的条目，指向我们 F1 的「间隔」或「目标目录」这两个变量之一。

### Q3 手柄与写权限在时间跨度上的有效期

- **要问的**：`showSaveFilePicker` 返回的 `FileSystemFileHandle`，其**写权限**在多久之后仍然有效？规范/Chromium 是否规定权限在文档生命周期内有效，还是会在一段时间后失效（需要重新 `queryPermission`/`requestPermission`）？我们目前的实现**从不调用 `queryPermission`/`requestPermission`**（因为 picker 已经授予），这是否正确？
- **检索词**：`FileSystemHandle permission queryPermission requestPermission after showSaveFilePicker` / `File System Access permission persists session` / `file handle permission expired`
- **判定**：若存在失效窗口，Q2 的因果链就有了机制。

### Q4 「先备好字节、再让用户选位置」的标准做法

- **要问的**：当内容生成耗时可能超过 Chromium 的**瞬时用户激活窗口**时，「先异步生成 → 再在用户点击里打开保存对话框并立即写入」的标准模式是什么？Chromium 的瞬时激活窗口具体多长（5 秒？），`showSaveFilePicker` 对它的要求是"瞬时"还是"粘性"激活？业界是否通行「在用户选择格式时预生成并缓存字节，点击保存时才唤起选择器」？
- **检索词**：`transient user activation duration chromium 5 seconds` / `showSaveFilePicker requires transient activation` / `File System Access generate blob first then picker` / `printjs generate content before print`
- **去哪里查**：Chromium `UserActivationState` 文档、MDN `navigator.userActivation`、W3C「User Activation」规范。
- **判定**：这决定我们能否把「生成」彻底移到选择器之前（我们计划的修法），以及是否需要拆成两次点击。

---

## 2. PDF 打印路径（浏览器打印子框架）

### Q5（最高优先）第一次打印空白、第二次正常，Chromium 侧的已知成因

- **要问的**：在 Chromium/Edge 中，对**子框架**调用 `contentWindow.print()`，第一次打印预览为空/无内容、第二次正常，**已知有哪些成因**？请逐条给出机制与出处：
  1. 框架**完全在视口之外**（`left:-20000px`）是否导致 Chromium 不为它生成绘制（paint）或跳过其打印栅格化？print.js 明确把打印 iframe 放在**视口内**（`position:fixed;right:0;bottom:0;width:0;height:0`），是否正是为此？
  2. 框架尺寸为 0 / `display:none` / `visibility:hidden` 的已知影响。
  3. `print()` 发生在框架**首次绘制之前**（我们已在 iframe 内等了两帧 rAF，是否足够？）
  4. 打印子框架与打印顶层文档的差异（Chromium 是否真的只打印子框架？`PrintHelper` 对子帧的处理）。
  5. 打印预览生成与「打印任务真正开始」的时间差（预览快照 vs 实际输出）。
- **检索词**：`Chromium print iframe blank first time second print works` / `print.js iframe hidden empty print preview` / `window.print iframe off-screen not printed` / `Chromium print subframe PrintHelper empty` / `iframe print preview blank then second works`
- **去哪里查**：issues.chromium.org（printing 组件）、printjs issue tracker（#572「dialog opens nothing prints」、#27「iframe hidden」）、jQuery.print issue #40、WICG/file-system-access 无关但 StackOverflow `printing-an-iframe` 标签高票答案。
- **判定**：需要能解释「第一次空、第二次好」的机制；重点看是否有条目明确说「框架必须可见/在视口内」。

### Q6 `sandbox` 属性对打印的影响

- **要问的**：`sandbox="allow-same-origin allow-modals"`（**不含** `allow-scripts`）的 iframe，其 `contentWindow.print()` 在 Chromium/Edge 中是否正常工作？打印预览是否可能为空？`allow-modals` 是否是打印对话框所必需（我们加了它，是否有依据）？缺少 `allow-scripts` 是否会阻止打印（例如某些浏览器要求打印由脚本触发）？
- **检索词**：`sandbox iframe window.print not working` / `sandbox allow-modals print dialog` / `iframe sandbox print empty chromium`
- **判定**：若无已知问题，则排除该变量（我们保留现状）。

### Q7 打印宿主的销毁时机（我们已改，仍需确认）

- **要问的**：`afterprint` 事件在 Chromium/Edge 中于**打印预览打开时**还是**打印任务完成后**派发？`afterprint` 之后立即移除 iframe 是否会截断输出（print.js #572 的说法）？我们已改为延迟 1500 ms，这个量级是否有依据，还是应当等到 `afterprint` + 更长时间 / 或干脆不销毁？
- **检索词**：`afterprint event fired when print preview opens or completes chromium` / `remove iframe after print truncates output` / `printjs iframe remove afterprint`
- **判定**：确认我们的延迟释放是否已经足够，以及是否还需要「打印任务真正结束」的信号。

### Q8 打印内容的 CSS/打印样式

- **要问的**：打印子框架时，Chromium 是否会**重新分页**？我们用 `@page{size:A4;margin:0}` + `.pagedjs_pages{display:block!important}` + `.pagedjs_page{break-after:page}` 强制按既有分页输出。在子框架打印场景下这些规则是否被正确应用？`break-after:page` 在框架打印中是否会产生空白页或丢页（页数与 `data-export-pages` 不符）？
- **检索词**：`iframe print pagedjs page breaks blank pages` / `print iframe @page size A4 repagination` / `chromium print subframe page break`
- **判定**：用于排除「内容其实生成了但被分页规则吃掉」这一分支。

---

## 3. 我这边的处置计划与当前进度

按「**先做正确，再加 guard**」执行；括号内为 2026-10-31 的状态。

### DOCX

1. **顺序归位（做正确）** ✅ 已实施：`ExportService.run()` 由「先选位置 → 生成 → 写」改为「**先生成字节 → 再选位置 → 紧接写入**」。picker 与 write 落在同一手势内；被拒绝/不支持的输出不再要求用户先选位置；生成失败时根本不弹保存框。代价：`showSaveFilePicker` 发生在异步生成之后 ⇒ 依赖瞬时激活窗口（激活过期时 `selectWebSave` 自动改走浏览器下载分支）。
2. **预生成 + 缓存 + 二次点击（消除激活窗口依赖）** ⏳ 未实施：需要你确认交互改动（导出变成「自动准备 → 点击『保存到…』」）。
3. **回读校验作为最后一道 guard** ✅ 已实施（F2）：只在写丢时兜底并如实说明，不再承担「修复」职责。
4. **`accept` 扩展名写法** ✅ 已验证无需改动（Q1）。

### PDF

1. **打印宿主归位（做正确）** ✅ 已实施并**现场确认**：宿主改为视口内不可见（`PRINT_FRAME_STYLE`），保留 iframe 内的 rAF 等待；1500 ms 延迟释放与顶层 `afterprint` 兜底作为 guard 保留。**第一次打印即产出内容** ⇒ Q5 的「视口外未渲染」成因成立。
2. 若首打仍为空 ⏳：按 Q5 的其他条目继续收敛（首次绘制、预览时序、销毁时机、分页 CSS），不再改几何。

### 暂缓（本轮不做，留档）

- **平台语义统一**：把 PDF 与字节类输出统一到「文件系统访问语义」（Web 用 FSA、桌面用 Tauri 原生对话框 + 原子写）。分析结论：字节类输出今天就能在桌面统一，且桌面更强（`select_native_save`/`write_native_bytes` 已实现原子替换、能力键与读写角色分离，但**未接线**）；**PDF 无法统一**，因为它的生产者是平台打印管线，应用拿不到字节与路径，也观察不到取消——除非引入 PDF 引擎。相关问题：Q2/Q3/Q4。
- **C6 预生成 + 缓存 + 二次点击**：消除「生成耗时超过浏览器瞬时激活窗口」的依赖。当前退化路径是诚实且无害的（回执 `'activation-expired'`：「未能唤起保存位置选择框，已改为浏览器下载」）。代价是重构导出对话框与服务契约，会改动多条已验证的交互路径（生成失败时机、无效 LaTeX 报错时机），故本轮不做。

### 不做的事

不引入新的第三方依赖；不改冻结产物契约（`'export-html-v3'`）；不为了 PDF 新建第二条通道；不把「打印对话框打开」当成打印成功。

---

## 4. 回填格式

每条结论请给出：**结论一句话 + 出处链接 + 原文关键句**。若某条查不到可靠出处，直接写「无可靠出处」，我会把它记为「无证据、按现状保留」，不会靠推测改代码。
