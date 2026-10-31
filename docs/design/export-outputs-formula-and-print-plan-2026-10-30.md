# 导出输出层：PDF 交付与 DOCX 原生公式实施方案

日期：2026-10-30；状态：设计已定，**全部步骤未实施**；基线 architecture-refactor / 37f7389。细化并推进 [OMML 方案](docx-omml-implementation-plan-2026-10-26.md) 的 O1—O5 与 [EX-W1 交付](web-native-delivery-implementation-plan-2026-10-27.md) 的打印宿主环节；不改已实施的架构重构路线，不改映射层结构，不引入新依赖。tauri 分支 6a448c7 仅作差异参考，其结论与本方案对照见第 6 节。

## 1. 模型与本次工作的定位

本应用的核心主张：**一个源（Markdown），一个映射（冻结 HTML），多个输出（从 HTML 到成品）**。

| 层 | 代码 | 本次是否改动 |
| --- | --- | --- |
| 源 | `DocumentRecord.markdown` | 不改 |
| 映射 | `renderDocument` → `prepareExportContent` → `ExportHtmlArtifact` | 只做「源层并入语义层」一处增量（B1），不改解释流程 |
| 输出 | `generateExportHtml` / `generatePdfHtml`→`deliverPdfHtml` / `exportDocumentToDocx` / `generateMarkdownBundle` | A 线改 PDF 输出的**交付**环节；B 线改 DOCX 输出的**内容映射**环节 |

冻结产物不是「一堆 HTML」，而是**多层载荷**，各输出按需取层：

| 层 | 载体 | 取用者 |
| --- | --- | --- |
| 视觉层 | SVG / 图片 / Paged.js 分页结果 | PDF、阅读 HTML |
| 语义层 | `.mf-math-semantics > math`（MathML 结构，只含呈现内容） | DOCX 原生公式 |
| 源层 | 公式宿主上的 `data-mf-tex`（LaTeX 原文） | 公式降级说明、可核对信息 |
| 降级层 | 视觉层的 SVG → 栅格 PNG | DOCX 中 OOML 表达不了的结构 |
| 定位层 | `data-line` / `data-mf-math-id="math-<源字符offset>"` / `data-source-end` | 诊断、溯源、跨层对齐 |
| 样式层 | `presentation.css` + `presentation.variables` | 各输出各自的排版 |

源层以宿主属性的形式并入产物后，产物自足：**输出层不再需要回到 Markdown 取公式**。

> 源层为何不挂 MathML `<annotation>`：DOMPurify 的 MathML profile **不允许** `semantics`/`annotation`（在 `mathMlDisallowed` 内，不在 `ALLOWED_TAGS`），命中后走 `_sanitizeDisallowedNode`——**元素被删但内容被上提**，源 LaTeX 变成 `<math>` 下的裸文本节点（实测 `math.textContent === "EE = mc^2"`），等于把源码混进公式正文。`data-*` 属性在净化后存活，故源层改挂宿主。

## 2. 与 tauri 分支 6a448c7 的对照

6a448c7 解决两个问题，方向正确、落点有误，本方案借鉴问题定位、不移植代码。

| 6a448c7 的做法 | 本方案 | 理由 |
| --- | --- | --- |
| `renderDocument(markdown,'mathml')` 重跑映射层，整体换成 MathML | 只取用产物里已有的语义层 | 输出层复制一套映射 = 冻结快照、修订绑定、诊断一致性全部失去支点；且 `scripts/check-module-boundaries.ts` 的 `htmlFormats` 规则明令输出适配器不得依赖 `documentRenderer`/`mathRender`/`exportContent` |
| 转换器「默认兜底」把未知 MathML 拍平成 `MathRun` | 未知/不等价结构一律 **fallback → PNG**，附理由 | 拍平会产生「看起来对、实则结构错」的公式；静默丢失不可接受 |
| `MathSum/MathIntegral` 的 `children` 传空 | ∑/∫/∏ 一律 fallback → PNG | docx 的 `m:nary` 中 `children` 是**被加项**（`m:e`），空值会丢掉被加项；MathJax MathML 里被加项是 `<munderover>` 的兄弟节点，配对不可靠 |
| `mtable` 拍平成线性 run | 矩阵 fallback → PNG | docx 9.14.0 的 `MathComponent` 联合类型不含矩阵，原生不可达 |
| 未处理 `semantics`/`annotation` | 发布的语义层**只含呈现结构**（映射层清除 `annotation`/`annotation-xml`），源式改挂宿主 `data-mf-tex`；转换器只从叶子元素取文本 | DOMPurify 会删掉 `annotation` 元素却把文本上提成游离节点，原始 LaTeX 会被当正文塞进 Word 公式 |
| 打印 iframe 移到激活视口 + `afterprint` 后延迟销毁 | 借鉴，落到 `src/core/platform/web/pdfDelivery.ts` | 见 A 线 |
| 打印 sandbox 加 `allow-scripts` | **不加** | 交付物是预分页静态页 + `default-src 'none'` CSP，不需要脚本；加脚本只削弱隔离 |
| 打印 iframe 改成 `100%×100%` | 只改位置，**保留 794×1123** | 改尺寸会变更 iframe 布局视口，引入分页重排风险 |

## 3. A 线：PDF 交付（Web 侧先完成）

现状 `src/core/platform/web/pdfDelivery.ts` 的两个病灶与 tauri 分支同源：打印宿主 `left:-20000px` 离屏；`afterprint` 后立即销毁。tauri 的归因（离屏视口裁剪导致后台打印 Spooler 挂起或需二次点击）是经验判断，本仓库无证据，故先复现。

| 步 | 内容 | 产出 |
| --- | --- | --- |
| A0 复现 | 用现成夹具 `tests/fixtures/architecture/web-native-pdf-probe.html`（调用真实 `ExportService`，非另造预览）连续导出 10 次，记录首击是否无响应/需二次点击、页数与 `expectedPages` 是否一致、`CJK_CHECK` 与首尾标记、取消行为 | 复现记录；回填 [EX-W0 清单](../acceptance/ex-w0-native-manual-checklist-2026-10-27.md) |
| A1 改动 | 几何：`left:-20000px`→`top:0;left:0`，保留 794×1123，加 `opacity:0;pointer-events:none`，不加负 z-index（避免被应用根背景遮挡而遭裁剪）。销毁：`afterprint` 后延迟 1500ms 再 remove，护栏「仍是当前活动 frame 才延迟，否则直接移除」；顶层 `window` 的 `afterprint` 兜底；`pagehide` 仍立即清理。不动 sandbox。保持既有不变量：AbortController 取消、`aria-hidden`、失败即清理 | 代码；样式串与释放策略抽为可测小函数 |
| A2 测试 | 新增 `tests/unit/pdf-delivery.test.ts`（当前该文件零覆盖）：样式不含负偏移且在视口内；`afterprint` 后不立即移除而延迟移除；`pagehide` 立即移除；布局等待先于 `print`；失败即清理 | 单测 |
| A3 验收 | 全量 unit + e2e；Web 侧人工验收回填清单 | 验收记录 |

Tauri 侧在 Web 侧全绿后验证，不建第二条 PDF 通道：`webExportService` 是唯一组合根，`src/core/platform/tauri/` 现只有 `files.ts`/`runtime.ts`；桌面 webview 与浏览器共享同一套离屏合成/Spooler 行为。验证走既有 [EX-T1/M8](tauri-migration-plan-2026-10-29.md)：同一冻结 HTML、同一 Paged.js，按目标 OS 验证正文、页数、CJK、链接、矢量。`window.print()` 在 WebView2/WKWebView 中的系统打印面板呈现属平台事实，按迁移计划 3.2 口径「无法确认的平台保留未验/不支持」，不靠应用层改道、不加截图后备。

## 4. B 线：DOCX 原生公式

### 4.1 三态判定

每个公式产出且只产出一种结论，`inspectDocx` 与 `docxExporter` **共用同一判定函数**，避免提示与产物分叉。

| 结论 | 含义 | 出口 |
| --- | --- | --- |
| native | 语义层结构与 OOML 语义等价 | 直出 `Math`，**跳过 SVG 渲染**（顺带省掉每公式一次 canvas 栅格化） |
| fallback | 语义层有、OOML 表达不了 | 经一次同意后走视觉层降级为 SVG+PNG，图片 `altText.description` 写源 LaTeX |
| unsupported | 无法安全产出 | 阻断导出，不得丢内容式成功 |

native 公式**不产生** `OutputIssue`（正常公式不进告警）；只有 fallback/unsupported 进。理由与 LaTeX 进 `OutputIssue.detail`，分组 summary 用稳定文案（「本次 N 个公式转为图片，不可在Word中编辑」），否则 per-formula 理由会把 O0 刚消掉的告警洪水带回来。

### 4.2 支持表：只有语义等价的映射才做原生

| MathML | 处置 | 理由 | 实测 |
| --- | --- | --- | --- |
| `mi`/`mn`/`mo`/`mtext`/`ms` | native `MathRun` | 等价；`mathvariant` 决定 upright/italic，docx `MathRun.style` 可表达 | ✅ `x+1`、`\mathbb{R}`、`\text{当 }` |
| `mspace` | native `MathRun(' ')` | 等价 | ✅ `\int` 的 `\,` |
| `mrow`/`mstyle`/`mpadded`/`mphantom` | native（展开子节点） | 容器；`mstyle` 的颜色/字号不保留（已知损失） | ✅ `\mathbb{R}`、`\int` 的 `f(x)dx` |
| `mfrac` | native `MathFraction` | 等价 | ✅ 嵌套分式 |
| `msup`/`msub`/`msubsup` | native `MathSuperScript`/`MathSubScript`/`MathSubSuperScript` | 等价 | ✅ `x^{2}_{i}` |
| `msqrt`/`mroot` | native `MathRadical`（`mroot` 次数进 `degree`） | 等价 | ✅ `\sqrt[3]{x}` |
| `mo` 成对括号 | native（普通 run） | MathML 里成对括号就是两个 `mo`，与 Word 中手打括号同构 | ✅ `\left(\frac ab\right)` |
| `munderover`/`munder` | **fallback → PNG** | **movable-limits 算子**（`∑`、`lim`）的下限语义与上下标不等价 | ✅ `\sum`、`\lim` |
| `mover` | **fallback → PNG** | 重音不是上标 | ✅ `\vec{v}` |
| `mtable`/`mtr`/`mtd`（矩阵、分段、对齐） | **fallback → PNG** | docx 9.15.0 `MathComponent` 不含矩阵，原生不可达 | ✅ pmatrix、cases、aligned |
| `msubsup` 且基字符为 `∫` | native `MathSubSuperScript` | MathJax 只把 **movable-limits** 算子（`∑`、`lim`）表达成 `munderover`/`munder`；`∫` 的上下限就是**带脚本的 ∫ 字符** ⇒ 结构等价，但产出 `m:sSubSup` 而非 `m:nary`（被积式是兄弟节点、非 `m:e`）——保真边界须知 | ✅ `\int_0^1` |
| `semantics`/`annotation` | 不发布 | DOMPurify 不允许这两个标签（元素被删、文本被上提成游离节点）⇒ 语义层只发布呈现结构，源式改挂宿主 `data-mf-tex` | ✅ 语料零残留 |
| 未知元素 | **fallback → PNG**（绝不静默拍平） | 不支持特性不得静默丢失 | — |

> 「实测」列来自真实 MathJax 3.2.2 语义树语料 `tests/fixtures/mathml-corpus.json`（由 `tests/e2e/math-omml-probe.spec.ts` 在真实浏览器采集），转换判定由 `tests/unit/docx-math-ooml.test.ts` 逐例断言。

`mstyle` 的颜色/字号、`mpadded` 的间距仍会丢失（docx math API 本身不保留），记入能力矩阵，不做逐公式告警。

### 4.3 步骤

| 步 | 内容 | 产出 |
| --- | --- | --- |
| B0 (O1) 事实与支持表 | ① 打表：真实 MathJax 3.2.2 的 `toMML` 输出结构（是否自带 `semantics`/`annotation`）——决定复用还是补写，是 B1 的前置事实；② 新增 `src/core/export/mathmlToOoml.ts`：`planDocxFormula(host) → native/fallback/unsupported + 理由`；③ 按 4.2 定稿支持表；④ 语料覆盖分式、嵌套分式、上下标组合、根式、括号、矩阵、大运算符、cases、中文混排、空公式、损坏输入，每例记录预期三态与理由 | 转换器、支持表、语料 |
| B1 源层并入产物 | ① 在 `src/core/render/mathJaxAdapter.ts` 构造语义层处，按 B0-① 结论补写或复用 `<annotation encoding="application/x-tex">`，内容为该公式 LaTeX（`convert()` 的 `value` 参数即 LaTeX）；② `src/core/export/exportContent.ts` 渲染契约串 `'export-html-v2'`→`'export-html-v3'`；③ 测试：annotation 经 `sanitizeDocumentHtml` 后仍在、文本未被丢弃、`encoding` 属性保留、转换器跳过 annotation | 产物自足化 |
| B2 (O2) 接线与汇报 | ① `inspectDocx` 与 `docxExporter` 共用判定函数，按 4.1 接线；② 降级图片 `altText.description` = 源 LaTeX（`picture()` 增可选参数，普通图片不受影响）；③ `OutputIssue` 增可选 `detail`；④ 同步 `ExportModal` 的能力说明与同意项文案，区分「原生公式」与「转图片公式」 | 生产接线与汇报 |
| B3 (O5) 证据 | ① OOXML 结构核对：解包 `word/document.xml` 检查 `m:oMath`/`m:f`/`m:rad`/括号节点父子关系；② 外部实测：Windows Word / macOS Word / WPS 各自「进入公式编辑 → 改结构 → 保存重开 → 无文件修复提示」，三者分列不互推；③ 能力矩阵同步 `docs/contracts/html-capabilities.md` 与 OMML 方案状态行 | 证据 |

## 5. 已核实的依赖硬约束

| 约束 | 出处 | 影响 |
| --- | --- | --- |
| `MathComponent` 联合类型仅含 `MathRun/MathFraction/MathSum/MathIntegral/MathSuperScript/MathSubScript/MathSubSuperScript/MathRadical/MathFunction/MathRoundBrackets/MathCurlyBrackets/MathAngledBrackets/MathSquareBrackets`（实际安装 **docx 9.15.0**，`bun.lock` 早已锁定该版本，9.15.0 的联合类型与 9.14.0 一致） | `node_modules/docx/dist/index.d.ts:9275`；`bun.lock:14,664` | 矩阵/重音/方程数组原生不可达；`MathMatrix` 等只在 `docx/math` 子路径导出且不在该联合类型内，不得用 `any` 或双重断言绕过 |
| `MathSum/MathIntegral` 的 `children` 是被加项（`m:e`），运算符字符由 `m:naryPr/m:chr` 自带 | `node_modules/docx/dist/index.mjs:14199-14212` | 空 `children` 会丢被加项，本方案据此不做 n-ary 原生 |
| `ImageRun` 支持 `altText?: DocPropertiesOptions` | `node_modules/docx/dist/index.d.ts:1563` | 降级图片可承载源 LaTeX，不改版面 |
| DOMPurify MathML profile 允许 `annotation`/`annotation-xml` 与 `encoding` 属性；`FORBID_CONTENTS` 只含 `annotation-xml`，`annotation` 文本保留 | `node_modules/dompurify/dist/purify.cjs.js:568,903,1226` | 标准 MathML 写法承载源 LaTeX 可行 |
| `startup.toMML` 与 `tex2mmlPromise` 共用同一序列化器（`SerializedMmlVisitor`）；当前实现取自同一次编译 | `node_modules/mathjax/es5/startup.js`；`src/core/render/mathJaxAdapter.ts:62-72` | SVG 模式与 MathML 模式的差别是呈现载体，不是信息量；重新解析 Markdown 换不来更高质量的 MathML，只会丢宏上下文与计数状态 |
| 输出适配器不得依赖源解析 | `scripts/check-module-boundaries.ts:4` | DOCX 只读冻结产物，转换输入不回源 |

## 6. 明确不做

不重跑映射层；不在输出层解析源 LaTeX；不引入 `latexToMath`；不引入 `docx/math` 子路径；不用 `any`/双重断言绕过 `Math`/`ParagraphChild`；不升级 `docx`/`mathjax`/`pagedjs`；不为 Tauri 新建 PDF 通道；不新增用户开关（沿用「原生优先，需同意时用图片」）；不把 `afterprint` 当作保存成功信号；不预建多格式通用引擎（见第 8 节的重构触发条件）。

## 7. 待验证与未决

| 项 | 影响 | 处置 |
| --- | --- | --- |
| 真实 `toMML` 输出是否自带 `semantics`/`annotation` | 决定 B1 是复用还是补写 | B0-① 首要动作，不靠推测 |
| 离屏视口是否确为 Spooler 挂起主因 | 决定 A1 是否是对症下药 | A0 复现后再改 |
| docx 无 `m:oMathPara`，独立公式只能产出 `w:p > m:oMath` | 与 Word 原生 display equation 不等价 | 记入能力矩阵，B3 实测确认 |
| WPS 对 `m:oMath` 的显示与编辑 | 影响支持声明范围 | B3 单列，不与 Word 互推 |

## 8. 后续多格式的扩展边界（暂不实施）

面向更多 Office 格式时的现状判断与重构触发条件，属预留记录，不在本轮实施范围：

- **流式文档格式**（ODT、RTF、EPUB、DOC/DOCX 变体）：当前产物模型可直接承载，新增一个输出适配器即可，无需重构。语义层对这类格式友好——ODT 可原生嵌入 MathML，EPUB3 支持 MathML，公式可近乎零成本复用；DOCX 需要 MathML→OOML，RTF 需要另写控制字映射。
- **非流式格式**（XLSX、PPTX）：产物的页面模型（A4、页边距）不适用，需要独立的网格/幻灯片内容模型，不应强行塞进 HTML 产物。
- **重构触发条件**（满足任一才启动结构改造，避免预建不可用能力）：① 出现 ≥2 个非流式输出；② 输出数量增长到解析成本可测量，或出现各适配器重复解析导致的净化/解析分歧缺陷；③ 两个输出需要实质不同的设计令牌（现有 `presentation.variables` 不足）。
- **外部工具路线（pandoc 等）**：不采用。pandoc 以 Markdown 为输入，会形成第二套映射（与本方案第 1 节的模型冲突），且需要随包分发可执行文件或要求用户安装本地工具，违背「发布后用户无须安装额外本地工具」的目标。其价值在结构参考（单一 AST + 各格式 writer），而当前「冻结产物 + 各输出适配器」已是同一思路的浏览器内实现。

## 9. 图谱核对（2026-10-30）

用 code-review-graph 全量重建本仓库结构图（216 文件 / 1749 节点 / 20429 边），对本方案涉及的 6 个文件做影响半径测算：

| 指标 | 结果 | 读法 |
| --- | --- | --- |
| 直接改动节点 | 39 | A/B 两线的实际编辑面 |
| 1 跳影响 | 81 节点 / 26 文件，risk=high | 现实回归面；关键直接依赖为 `application/exports/exportService.ts`、`components/export/ExportModal.tsx`、`core/export/documentAssets.ts` |
| 2 跳影响 | 497 节点 / 119 文件 | 反映导出层是应用枢纽（几乎全部路径经 `ExportService`），不代表改动本身大 |
| `pdfDelivery.ts` 单测覆盖 | 无行为级覆盖 | 检索确认：`pdfDelivery` 仅出现在 `tests/unit/export-service.test.ts`（mock 端口）、`tests/unit/export-module-boundaries.test.ts`（边界断言）、`tests/types/strict-contracts.ts`（类型契约） |

图谱的 `TESTED_BY` 边只连接 e2e 的 route→case，不表达源码到单测的覆盖归属，`tests_for` 查询对本仓库返回空结果，**覆盖判断以直接检索为准**。上述「打印宿主零行为级覆盖」是 A2 步骤必须存在的原因，而非可选优化。

## 10. 执行记录（2026-10-31 已实现并通过门禁）

**门禁结果**：`bun run typecheck` ✅（218 个受管源文件全覆盖）、`bun run lint` ✅、`bun run test:unit` ✅ **473/473**、`bun run test:e2e` ✅ **136/138**（两项失败 `workbench-tabs`「changed math configuration」与 `source-import`「shows import busy while reading」在干净 HEAD 上同样失败，属既有问题，见 `docs/reviews/` 与本节末「既有失败」）。

### 10.1 计划中事项

| 事项 | 状态 |
| --- | --- |
| A1 打印宿主 | ✅ 已**收敛为有依据的最小集**：`afterprint` 后延迟 1500 ms 释放、顶层 `afterprint` 兜底、`pagehide` 立即清理；**撤回**了「移入激活视口 / `opacity:0` / 父窗口双 rAF」（打印的是宿主自身文档，父窗口合成不是前提；且 rAF 在页面不可见时不触发会挂死）。根因待现场判别，诊断探针见 `docs/reviews/docx-blank-formula-and-pdf-second-print-report-2026-10-31.md` §2 |
| A2 打印宿主单测 | ✅ `tests/unit/pdf-delivery.test.ts`（此前该文件零覆盖） |
| B0-① 真实 MathJax 语义树打表 | ✅ 探针 `tests/e2e/math-omml-probe.spec.ts`（development/built 双环境），语料入库 `tests/fixtures/mathml-corpus.json`（15 例） |
| B0-② 转换器（三态、全有或全无、不拍平） | ✅ `src/core/export/mathmlToOoml.ts` |
| B1 源层并入产物 | ✅ 但**载体改为宿主 `data-mf-tex`**：原设计的 MathML `<annotation>` 被 DOMPurify 删元素并把文本上提成游离节点（实测 `math.textContent === "EE = mc^2"`），会污染公式正文；详见第 5 节与 `docs/reviews/mathml-position-crash-assessment-2026-10-31.md` |
| B2 接线与汇报 | ✅ native 不产生告警；fallback 记 `static` + `detail`（理由与源式）；降级图片带源式 altText；导出对话框详情显示 detail |
| B2b DOCX 图片可移植性 | ✅ 矢量副本**自包含**（`<use>` 全部展开为内联路径、`currentColor`→`#000000`、去根节点 `style`/`role`）；位图兜底**必然非空**（绘制后校验 alpha、重试时重建 `Image`、仍为空即中止导出）⇒ 不再依赖「Word 是否支持 `<use>`」这一未证实的判断 |
| B3 证据 | ⏳ OOXML 结构已由单测与 e2e 断言（`m:oMath`/`m:f`/`m:num`/`m:den`/`m:sSup`/`m:rad`；SVG 无 `<use>`；每个 PNG > 1 KB）；**Word/WPS 人工实测与外部保存证据仍待补** |
| A0 复现 | ⏳ 待用户执行：Web 与 Tauri webview 各 10 次连续导出，回填 EX-W0 清单 |
| C1 保存回执可验证 | ✅ Web 选择器路径在 `close()` 之后**回读目标文件**（`handle.getFile()`）：不存在或大小不符 ⇒ 判定写丢 ⇒ 改投浏览器下载并把回执改为 `'recovered-download'`（文案「所选位置未生成文件，已改为浏览器下载」）；硬失败仍原样上报，不静默改投。回执不再由 API resolve 推定（见 `docs/reviews/…-2026-10-31.md` §3） |
| C2 结果通知唯一面 | ✅ 导出结果从对话框内部移到**应用层常驻通知**（`role="status"`、层级高于对话框、`no-print`、10 秒自动消失）；对话框内原状态行删除，避免同一句话出现两次（见同报告 §4） |
| C3 打印宿主归位（把打印做正确） | ✅ 打印宿主从视口外（`left:-20000px`）改为**视口内不可见**（`left:0;top:0;opacity:0;pointer-events:none`，`PRINT_FRAME_STYLE`）：被浏览器渲染的框架才会被打印，视口外的框架可能从未参与栅格化 ⇒「第一次空、第二次好」。iframe 内 rAF 等待、1500 ms 释放延迟、顶层 `afterprint` 兜底均保留（guard）。**现场已确认**：归位后第一次打印即产出内容 |
| C4 交付顺序归位（把保存做正确） | ✅ `ExportService.run()` 顺序由「先选位置 → 再生成 → 最后写」改为「**先生成字节 → 再选位置 → 紧接写入**」：picker 与 write 落在同一手势内，且被拒绝/不支持的输出**不再要求用户先选位置**。**现场已确认**：DOCX 目标位置出现文件。代价：`showSaveFilePicker` 发生在异步生成之后 ⇒ 依赖瞬时激活窗口；激活过期时 `selectWebSave` 改走浏览器下载并以独立回执 `'activation-expired'` 如实说明「未能唤起保存位置选择框」（C6-lite） |
| C5 `accept` 扩展名写法 | ✅ 本地实测（Playwright chromium-1248，安全上下文）：Chromium **要求**扩展名带前导点（`['docx']` ⇒ `TypeError: Extension 'docx' must start with '.'`），当前写法 `['.docx']` **正确**，无需改动（此前按规范文本作出的「不合规」判断已作废，见 `docs/reviews/export-delivery-research-questions-2026-10-31.md` Q1） |

### 10.2 计划外但必须做的两件事

1. **映射层 position 崩溃**（本轮探针首次暴露，既有问题非本轮引入）：注入的 raw 节点无 `position` ⇒ hast-util-raw 的 `setPoint` 被跳过 ⇒ tokenizer 沿用陈旧 `lineStartPos` ⇒ 段内某元素列号为 0 ⇒ `from-parse5` 产出**半截 position**（`start` 缺失、`end` 有效）⇒ 读 `position.start.offset` 即崩。修复两处：raw 节点补 mdast `position`（根因）+ 消费端守卫（源偏移只在非生成节点且有有效起点时计算）。回归防线：`tests/e2e/math-render-stability.spec.ts`。
2. **既有失败（非本轮引入）**：`workbench-tabs`「changed math configuration」与 `source-import`「shows import busy while reading」在干净 HEAD 上同样失败（后者 3/3 失败、时序相关），本轮不处理，仅记录。

### 10.3 过程中纠正的设计前提

| 原假设 | 实测结论 |
| --- | --- |
| 源式用 MathML `<annotation>` 承载 | DOMPurify 会删元素、上提文本 ⇒ 改为宿主 `data-mf-tex` |
| `∑/∫/∏` 都由 `munderover` 表达 | 只有 **movable-limits** 算子（`∑`、`lim`）是；`∫` 是**带脚本的 ∫ 字符**（`msubsup`）⇒ 原生产出 `m:sSubSup`（非 `m:nary`，被积式为兄弟节点） |
| 未知结构可静默拍平 | 保持禁止；未知元素一律 fallback 并附理由 |
| PDF 宿主 afterprint 后应立即移除 | 契约已改为「短暂存活给 Spooler 刷写，再释放」，探针与规格同步 |
| `close()` resolve 即「已保存」 | 回执必须可验证：写完回读目标文件，读不到就改投浏览器下载并如实说明（与「不把 `afterprint` 当保存成功信号」同源） |
| 导出结果写在对话框里即可 | 系统打印/保存对话框是原生模态窗口，会盖住对话框内的结果 ⇒ 结果面必须独立于对话框 |
| 保存顺序：先选位置再生成 | 规范做法是**内容先备好、picker 与 write 在同一手势内连续完成**；先选位置会让「选路径」与「写文件」之间横跨数秒并跨一次交互，还会让被拒绝的输出先占用用户的位置 |
| 打印宿主可以放在视口外 | 打印的是**被渲染过的**框架；视口外的框架可能从未参与栅格化 ⇒ 宿主应在视口内（不可见），这正是「第一次空、第二次好」的候选成因 |

### 10.4 关键文件

新增 `src/core/export/mathmlToOoml.ts`、`tests/unit/docx-math-ooml.test.ts`、`tests/unit/pdf-delivery.test.ts`、`tests/e2e/math-omml-probe.spec.ts`、`tests/e2e/math-render-stability.spec.ts`、`tests/fixtures/mathml-corpus.json`、`tests/fixtures/docx-math/omml-cases.json`、`tests/fixtures/architecture/math-omml-probe.{html,ts}`；改动 `src/core/render/{markdownHtml,mathJaxAdapter}.ts`、`src/core/export/{docxExporter,outputCapabilities,exportContent}.ts`、`src/core/model/exportDiagnostics.ts`、`src/core/platform/web/{pdfDelivery,byteDelivery}.ts`、`src/application/exports/exportService.ts`、`src/core/policy/htmlRules.ts`、`src/App.tsx`、`src/components/export/ExportModal.tsx` 及相应测试与 `scripts/build-worker-probe.ts`、`tsconfig.integration.json`。

### 10.5 未提交

按仓库约定「每步独立 review、相关验证后一次本地提交」，**当前全部改动均未提交**，待确认后逐步提交（分支 `architecture-refactor`，非 main，不推送）。


