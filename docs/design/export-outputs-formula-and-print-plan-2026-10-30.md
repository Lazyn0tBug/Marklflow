# 统一输出与桌面交付完整实施方案

更新：2026-11-02。三平台原生静默PDF为目标，Windows先验证，macOS/Linux列Future最后实施；尚未修改代码。代码核对基线：`architecture-refactor / 00a8ce2fb778c192a780928f259063c71895c667`。本文替代原 A/B/C 草案及互相冲突的执行叙述，作为当前输出工作的完整方案；历史实测仍以原始记录为准。本次仅更新文档，未执行代码测试或系统验收。

## 1. 目标、范围与约束

Markdown 经唯一映射形成冻结 `ExportHtmlArtifact`，阅读 HTML、可编辑 HTML、DOCX、PDF 从该产物生成。原始 Markdown 和 Markdown 资源包沿用既定源保存例外，不为这些例外再渲染正文。可编辑 HTML 的源附件服务恢复，不成为第二套正文生成入口。

Web/Tauri 使用同一个 `ExportService` 类与格式生成器，各自组合交付端口。用户统一选择格式、名称、确认适配、执行导出；PDF 不增加专属打印预览，A4 工作台视图不是必经步骤。平台实现可以不同，但反馈必须对应实际可观察结果。

保留 MathJax 3.2.2、Paged.js 0.4.3 及当前依赖锁；不封装 Chromium、不采用 Puppeteer、不采用截图 PDF、不重跑源解析生成另一份公式。现有 DOCX 图片降级不等于截图 PDF，继续受一次确认约束。后续格式仍从冻结 HTML 提取所需结构，不另建绕过 HTML 的内容模型；EPUB/PPT 等不在本轮实施范围。

关联：[迁移路线](tauri-migration-plan-2026-10-29.md)、[接口契约](tauri-migration-m0-contract-2026-10-29.md)、[HTML 输出约束](html-export-source-plan-2026-10-26.md)、[OMML 历史规划](docx-omml-implementation-plan-2026-10-26.md)。迁移阶段依赖由迁移路线管理；本文细分输出工作，不建立第二套 EX-T 阶段。

## 2. 当前代码事实与证据边界

| 边界 | 当前代码 | 现状及剩余工作 |
| --- | --- | --- |
| 应用服务 | `src/application/exports/exportService.ts` | 单实例 busy、接受修订快照、正文单次 prepare、DOCX 检查/确认、格式生成均已有；PDF 仍 `Promise<void>`，结果固定“浏览器处理” |
| Web 组合 | `src/core/platform/web/exportService.ts` | 单例 `webExportService` 已存在；ExportModal 直接引用，尚无启动时统一选择的生产入口 |
| Web 字节保存 | `src/core/platform/web/byteDelivery.ts` | 生成后选择目标、写入/close/回读大小；有四种 SaveReceipt。大小一致不等于字节一致，回读失败 unknown 当前仍返回 saved，需收紧证据口径 |
| Web PDF | `src/core/platform/web/pdfDelivery.ts` | 冻结 HTML iframe，794×1123、视口内不可见、sandbox；等待布局后 print；afterprint 延迟 1500ms 清理，pagehide/失败清理；不能观测系统保存与取消 |
| 原生文件 | `src/core/platform/tauri/files.ts`、`src-tauri/src/files.rs` | 独立 M3 适配，UUID key 对应 Rust 进程内路径/读写授权；无生产文件绑定恢复。selectNativeSave 返回 release，但公共 ByteSaveTarget 尚无释放契约 |
| DOCX 公式 | `src/core/export/mathmlToOoml.ts`、`docxExporter.ts`、`outputCapabilities.ts` | 已有共用 native/fallback/unsupported 判定、OMML 输出、降级详情及 SVG/PNG 图片路径；不是待从零实现 |
| 冻结语义 | `src/core/export/exportContent.ts`、`src/core/render/mathJaxAdapter.ts` | export-html-v3；MathML 语义与视觉层共存，源式挂宿主 data-mf-tex；不采用 annotation 存源码 |

历史记录：[导出现场问题](../reviews/docx-blank-formula-and-pdf-second-print-report-2026-10-31.md)、[交付调查](../reviews/export-delivery-research-questions-2026-10-31.md)、[语义树与位置问题](../reviews/mathml-position-crash-assessment-2026-10-31.md)。此前文档记载 473 项单元通过、e2e 136/138（两项失败）；这是历史结果，既有失败也不能算全量通过。本次不复用该计数宣称当前 HEAD 测试通过。宿主视口调整已在代码中，不再列为待实现；其跨系统因果与稳定性仍需真实保存验证。

## 3. 单一业务服务与双平台组合根

目标调用链：`ExportModal → 统一应用服务入口 → ExportService → 共用生成器 + 平台交付端口`。

- 启动组合处按 `isTauri()` 选择 Web 或 Tauri 组合根；SDK 检测封装在平台边界内。UI 只依赖统一服务，不分散环境判断；一次运行只使用选中的单例，关闭/重开导出窗口不重建 busy。
- 保留 `platform/web/exportService.ts`；新增 `platform/tauri/exportService.ts`，镜像注入 `selectSave/deliverPdf`，不复制 ExportService.run、公式转换或冻结生成器。公共生成器装配如有重复只做小型工厂，不建平台注册器。
- Tauri 端口未完成或平台未验时明确不可用，不假借 Web 组合完成桌面验收，也不在原生失败后自动下载。
- 当前顺序继续为冻结快照→正文 prepare/检查→需要时一次确认→生成完整字节→selectSave→save→释放目标。被拒绝输出不选择位置；取消选择不写入。异步生成后不能保证 Web 用户激活仍有效，也不能宣称 picker/write 必然仍在原手势内。
- 格式生成失败或交付失败保持错误；busy 在操作 finally 结束。PDF 请求交接后不把 busy 当成系统保存锁，打印宿主另按生命周期清理。

## 4. 交付接口及回执

下列是拟议契约，不表示生产类型已改动。

| 端口 | 目标约定 |
| --- | --- |
| selectSave(ExportFile) | 返回 ByteSaveTarget 或 undefined；undefined 仅表示选择未产生目标，不能推断所有原生弹窗故障均可辨识；可辨识错误抛出 |
| ByteSaveTarget.save(Blob) | 保留字节保存专用 SaveReceipt，准确区分真实提交与浏览器接管，不加入打印状态 |
| ByteSaveTarget.release?(): Promise<void> | 可选、幂等；Web 无授权可省略，Tauri 必须实现。应用服务取得目标后在 finally 调用，包括成功/失败；选择途中已取得授权但构造失败，由适配器清理 |
| deliverPdf(html, ExportFile) | Promise<PdfDeliveryReceipt>；输入仅为同一次冻结产物生成的完整 HTML，ExportFile 提供建议名称，不授予路径权限 |
| PdfDeliveryReceipt | 拟议联合类型为 `{status:'handed-off'}` / `{status:'saved'}` / `{status:'cancelled'}`；Web仅返回handed-off；桌面仅在原生输出及目标提交成功后saved，用户选择目标取消时cancelled。运行中的不可取消计算不伪报cancelled，失败抛错 |

PDF 不可用、准备失败、原生调用/完成回调失败或目标提交失败时抛出错误，不能返回handed-off或saved。Web原生输出不能判断系统面板内保存/取消，afterprint仅用于清理，文案为“已提交 PDF 输出请求，请在系统对话框中完成保存。”桌面静默路径只有目标文件成功提交才提示“已保存文件”；取消选择目标则提示取消。ExportResult.completed表示应用步骤完成，必须携带交付回执区分交接与真实保存。

### 4.1 三平台原生静默PDF目标

| 平台 | 候选原生接口 | 实施顺序与状态 |
| --- | --- | --- |
| Windows | 隐藏专用WebView2加载冻结分页HTML，PrintToPdf输出受控临时PDF | D6/M8先做小范围能力验证，当前待验证；通过后才D7/M9生产接入 |
| macOS | 隐藏WKWebView；评估createPDF与printOperation/系统PDF输出的分页适配 | Future F-PDF-Mac，排在当前Windows/Web路线收口之后；待验证，不承诺createPDF天然产生正确多页A4 |
| Linux | 隐藏WebKitGTK；评估WebKitPrintOperation配置PDF文件输出 | Future F-PDF-Linux，与macOS同属路线最后；待验证，核对发行版/GTK打印后端/打包环境 |

目标都是统一导出入口、可选择保存位置、无应用专属PDF预览且不显示打印面板。静默不等于跳过用户授权或保存选择器；只有已明确授权的目标才可省略选择。三平台共用生成器与冻结HTML，原生交付按OS适配，不要求底层相同。未实现或未验证的平台标“待验证”，不得自动回退Web打印、截图或新浏览器。

Windows宿主必须把冻结分页HTML作为顶层文档；PrintToPdf不能直接指定现有预览iframe。复用现有完整分页HTML生成路径和冻结资源，不抓取可见DOM、不重新解析Markdown/LaTeX，不要求先显示A4，不重复prepare或分页。新WebView只加载现成产物并等待字体/图片/布局；保持资源有效至完成。隐藏宿主的加载、就绪、输出可靠性都须实测，不依赖可能暂停的动画帧或固定睡眠充当就绪证据。

Rust持有路径/授权，专用宿主不授予一般业务IPC或任意本地文件访问。受控一次性内容装载与就绪通知应限任务范围；保持静态HTML/CSP及资源策略，不执行作者脚本，不为就绪检测开放广泛权限。用户建议名仍由ExportFile产生；先选择/授权目标，再由原生端输出临时PDF，完成成功回调后检查输出并通过受控提交替换目标，最后返回saved。原生回调仅证明临时输出完成，不等于目标已提交；失败保留原文件。选择目标在完整PDF交付HTML生成后进行，与字节格式“完整字节生成后选择”的路径分开描述，不改字节端口。

输出宿主一次只执行一个打印任务，沿用导出busy，不新增任务平台。纸张、缩放、页边距、背景、页眉页脚与既有分页HTML匹配，避免二次缩放/空白页。成功、失败、超时、关闭均释放宿主及临时资源；超时后须先使原生任务不能再提交/写入目标再清理临时文件，迟到回调不得报成功。原生调用返回或销毁宿主能否可靠终止写入也属于PoC验证项，不伪称系统提供可中断取消。授权release失败不掩盖输出主错误。


授权释放失败应单独保留诊断，不掩盖主要写入失败；若文件已提交，不因 release 失败引导用户重复保存或谎称写入失败。释放只针对本次导出目标，不能撤销仍供原文件绑定使用的授权。源绑定与导出目标是不同资源；关闭文档/重新关联/应用退出分别按归属释放，先等本次使用完成再释放，不建通用资源平台。

## 5. 格式输出路径

| 用户选择 | 内容源与生成路径 | Web 交付 | Tauri 交付 |
| --- | --- | --- | --- |
| Markdown | 接受快照中的原文 | 字节保存/下载 | 原生选择并写入 |
| Markdown 资源包 | 快照源文与既有冻结资产打包 | 同上 | 同上 |
| 阅读 HTML | ExportHtmlArtifact→generateExportHtml | 同上 | 同上 |
| 可编辑 HTML | 同一产物正文 + encodeEditableSource 附件 | 同上 | 同上 |
| DOCX | 同一产物→共用公式判定→exportDocumentToDocx | 同上 | 同上 |
| PDF | 同一产物→generatePdfHtml/Paged.js→完整分页 HTML | 浏览器原生输出请求 | 所声明 OS 已验证的静默原生 PDF 端口（Windows先行） |

两平台沿用 ExportFile 的 MIME、完整扩展名、255 UTF-8 字节及完整 grapheme 规则。Web PDF 的 HTML title/建议名只是提示，系统驱动可能忽略；桌面静默保存由ExportFile提供默认名并由用户选择目标，不依赖打印机驱动命名。桌面当前尚无已接生产的 PDF 端口，M8 先验证能力，不能把“系统 WebView 必然支持”写成事实。

Web 现有降级分支 download-started/recovered-download/activation-expired 必须在 UI 如实区分，硬写入失败不静默改投。生成耗时导致激活过期时，优先沿用明确下载反馈；若实际需求要求始终选择位置，后续再设计一次用户确认动作，不重新生成或重复确认 DOCX。保存选择器取消与异常分开测试。

## 6. 会话绑定失效与工作台状态

此节落实 M4/M5 所需语义，不把源文件保存混入导出服务。

| 状态 | UI 与允许操作 |
| --- | --- |
| 新建/未关联草稿 | “未关联本地文件”；草稿仓储状态独立显示；显式保存引导另存为 |
| 当前会话有效绑定 | 显示授权的文件显示名；分别显示草稿持久化与“本次会话内已写回修订/尚未写回”；较新修订仍未写回 |
| 重启恢复或授权失效 | “草稿已恢复，未关联本地文件”或“本地文件关联已失效”；原位保存不可直接执行，提供重新关联/另存为，不显示仍有效的已写回标记 |
| 重新关联取消/失败 | 保留草稿、选区、undo、修订及原状态；不得读取磁盘正文覆盖草稿或把较新修订标为已写回 |

只有确有来源状态证据时才称“原关联失效”；当前恢复模型无法区分来源时统一显示“未关联”，不凭空恢复来源。关联选择仅重新建立目标授权，覆盖需明确确认；成功关联本身不是写回成功。初版不持久化可用 grant，不自动用旧 key 申请写入；恢复的原文件写回状态为未知，而非“本次会话已写回”。只含当前草稿持久化与绑定所需最小 UI 状态，不强加新文档 schema。

后续可由 Rust 持久化 locator 与不透明 ID，经明确授权后重建会话 grant；路径仍不进 DocumentRecord、前端业务、Worker、缓存或导出附件。该能力独立规划，不在 M4/M5 首版实现，也不要求为此破坏当前接口。

## 7. DOCX 原生公式与产物边界

现有转换器已读取冻结 HTML 中 MathML，不再读取 Markdown 或解析源 LaTeX。data-mf-tex 仅用于降级详情和图片 altText；不改用 MathML annotation 承载源式，避免净化后源文本混入正文。native 不产告警，fallback 汇总数量并保留逐项理由，一次确认后导出图片，unsupported 阻断且不产假成功文件。

| 当前处理 | 能力及后续核对 |
| --- | --- |
| 叶子、分式、上下标、根式、部分 mfenced | 已有 OMML；需结构与复杂嵌套语料回归，不能仅凭简单公式断言全支持 |
| munder/mover/munderover、矩阵/表格、未知元素 | 当前降级图片；不拍平未知结构或伪造空 n-ary 被积式 |
| mstyle/mpadded/mphantom、mspace | 当前有展开/空格处理；这不证明视觉等价，尤其 phantom 可见性、间距、颜色、字号须核对，无法保真则规划降级，不以“容器”概括为无损 |
| SVG/PNG 降级 | 已有 use 展开、颜色固化、PNG 非空检查；保持净化、源映射和一次确认，不扩大导入 SVG 白名单 |

当前转换器的子组递归、元素参数个数、定界符伸缩与分隔符语义应列入专项回归；如发现结构或视觉语义丢失，单独小步修复。Word/WPS 对公式可编辑、保存重开、版面和字体的支持分别验收；结构断言不替代应用实际打开。

## 8. 剩余小步实现与验收路线

本表全部为待实施/待完成验收单位，不把现有代码再做一遍。每单位经授权实施、Luna 审查测试后一次本地提交；文档更新本身不授权实施、推送或发布。

| 单位 | 依赖/映射 | 单次范围 | 退出条件 |
| --- | --- | --- | --- |
| D0 代码基线与回归缺口 | 当前 HEAD；可独立 | 再现历史两项 e2e 失败，确认当前是否存在；核对已实现 A/B/C 与原始证据 | 自动结果与失败归因归档，不把“既有”当通过 |
| D1 交付契约 | D0；为 M8/M9 准备 | 最小 PdfDeliveryReceipt、名称上下文、ByteSaveTarget.release 及 ExportResult 回执；更新 Web 适配不改变生成路径 | 类型边界、单次 prepare/确认/busy；成功/失败释放，主要错误不被覆盖；PDF 交接不误报保存 |
| D2 Web 交付收口 | D1 | 清理宿主监听器/定时器，支持重复 afterprint、pagehide、后续导出；核对保存回读 unknown 的回执，不把未知说成已确认 | 有界且可观察清理；失败/取消/激活过期/回读失败准确；不依赖任意延迟证明系统已写完 |
| D3 源绑定 UI | M4→M5；D1 释放语义 | 迁移路线的 M4/M5 内实现会话绑定、恢复未关联状态、重新关联/另存及按修订写回 | 重启恢复草稿不恢复授权；关联不覆盖草稿；重复打开聚焦；取消/失败与较新修订保护。此行是验收补充，不另做 M4/M5 |
| D4 DOCX 正确性收口 | D0；与平台准备可并行 | 对第7节语义缺口做定向审查/语料/必要修复，同步能力表 | 不丢嵌套结构、不误称视觉等价；OOXML/PNG 检查；Word/WPS 实测仍分列 |
| D5 Web 系统证据 | D2/D4；沿用 EX-W0/EX-W3 | 原生 PDF 实际保存、默认名、文字/CJK/字体/链接/矢量/分页、Web 字节文件及 Word/WPS 清单 | 留存实际文件/hash/OS/版本，无法补齐者保持待补；不据自动结果宣称完整 EX-W3 |
| D6 Windows静默PDF小范围PoC | M6、完整EX-W3→M7→M8；D1/D5 | 独立夹具：隐藏WebView2载入完整冻结分页HTML，PrintToPdf到临时文件并提交目标；不接生产UI | 无窗口闪现/打印面板；完整多页、可选文本/CJK/字体/链接/矢量及分页；命名、取消选择、覆盖失败保护、资源/超时/迟到回调清理；保存文件/hash与版本证据。失败先修本路径，不转截图 |
| D7 Windows双组合根生产接入 | M9；Windows M8通过，D1/D2 | 统一服务选择入口 + tauri/exportService，连接 M3 原生保存端口、名称、释放及已验证 PDF 交付 | 六格式同业务流程；不散布环境判断；原生失败不回退 Web，不泄露路径；导出不修改源绑定 |
| D8 当前Web/Windows范围收口 | M10/M11对应阶段；D7 | Luna 全面审查、自动回归、真实系统/包证据、支持表 | 历史记录不被覆盖，缺项不标通过，未授权不推送/发布 |

| Future F-PDF-Mac | D8完成后，已有门槛不豁免 | 先独立小范围WKWebView多页PDF PoC，比较createPDF与原生打印PDF，再决定接生产端口 | 隐藏宿主、A4多页、正文/字体/链接/矢量与静默、写入/清理证据；未通过保持待验证或据事实记录限制 |
| Future F-PDF-Linux | D8完成后，与Mac独立评估，位于当前路线最后 | WebKitGTK文件输出PoC，明确输出PDF而非默认实体打印机，再按已验环境接端口 | 目标发行版/后端/安装包内静默与输出证据，失败/清理及原文件保护；不由Windows/Mac结果推断 |

D1/D2 是现有 Web 输出边界收口，可在 M7 前进行；D6/D7仍严格遵循既有EX-T前置；本次先安排Windows小范围PoC，不因新路线解除完整EX-W3门槛。Mac/Linux的Future位于D8之后，不阻塞当前Web/Windows限定范围收口，但禁止宣称其PDF已支持；各自通过后再补M9—M11对应平台验收。每个较大单位可再拆提交，但不拆出第二个服务或重复生成流程。Rust locator 持久恢复、更多原生公式能力、额外格式均延期。

## 9. 验收记录与支持声明

审查、测试由 GPT-6 Luna 执行，主代理实现修复。记录具体 SHA、实际命令、退出码、日志、产物 SHA-256、OS/浏览器/WebView 版本；本次文档审查只验证文本一致性、代码事实与本地链接，不声称运行回归或系统保存。

自动测试通过、浏览器输出请求交接、实际 PDF 保存、Word/WPS 编辑、跨 OS 安装运行五类证据分别列出。系统默认文件名/文件路径未取得时仍待补；afterprint、端口 resolve、PNG 非空与同大小回读都不能替代完整保存/内容正确性验收。支持表仅宣称有对应证据的环境，不将一个平台结果推广到其他系统。

## 10. 原生能力依据（非本项目实测）

- [WebView2 PrintToPdf](https://learn.microsoft.com/en-us/microsoft-edge/webview2/reference/win32/icorewebview2_7)：顶层文档、异步完成与文件写入；必须检查调用及完成结果，不以发起即成功。
- [Apple WKWebView printOperation](https://developer.apple.com/documentation/webkit/wkwebview/printoperation(with:))与[createPDF](https://developer.apple.com/documentation/webkit/wkwebview/createpdf(configuration:completionhandler:))：存在原生接口不等于隐藏宿主、多页及打印CSS已验。
- [WebKitGTK PrintOperation](https://webkitgtk.org/reference/webkit2gtk/2.37.1/class.PrintOperation.html)：可无面板启动打印，但需显式文件输出配置，不可误发默认打印机。具体系统版本和PDF后端仍待Future验证。

本次更新只改设计；三平台静默PDF均未在本项目验证，不新增代码或发布支持声明。
