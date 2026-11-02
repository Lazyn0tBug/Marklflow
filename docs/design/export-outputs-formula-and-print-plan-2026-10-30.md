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
| deliverPdf(html, ExportFile) | Promise<PdfDeliveryReceipt>；平台内部承担目标选择与交付，字节selectSave不参与PDF路径；输入仅为同一次冻结分页HTML，ExportFile提供名称，不授予路径权限 |
| PdfDeliveryReceipt | 拟议联合类型为 `{status:'handed-off'}` / `{status:'saved'}` / `{status:'cancelled'}`；Web仅返回handed-off；桌面仅在原生输出及目标提交成功后saved，用户选择目标取消时cancelled。运行中的不可取消计算不伪报cancelled，失败抛错 |

PDF 不可用、准备失败、原生调用/完成回调失败或目标提交失败时抛出错误，不能返回handed-off或saved。Web原生输出不能判断系统面板内保存/取消，afterprint仅用于清理，文案为“已提交 PDF 输出请求，请在系统对话框中完成保存。”桌面静默路径只有目标文件成功提交才提示“已保存文件”；取消选择目标则提示取消。端口handed-off/saved映射ExportResult.completed并带成功回执；端口cancelled映射现有ExportResult.cancelled，不返回completed+cancelled，UI只处理应用层取消。端口必须显式回传取消信号，失败按错误处理。

### 4.1 三平台原生静默PDF目标

| 平台 | 候选原生接口 | 实施顺序与状态 |
| --- | --- | --- |
| Windows | 隐藏专用WebView2加载冻结分页HTML，PrintToPdf输出受控临时PDF | 前置D1先独立技术验证；D7/M8产品化验收后才D8/M9生产接入，当前均待验证 |
| macOS | 隐藏WKWebView；评估createPDF与printOperation/系统PDF输出的分页适配 | Future F-PDF-Mac，排在当前Windows/Web路线收口之后；待验证，不承诺createPDF天然产生正确多页A4 |
| Linux | 隐藏WebKitGTK；评估WebKitPrintOperation配置PDF文件输出 | Future F-PDF-Linux，与macOS同属路线最后；待验证，核对发行版/GTK打印后端/打包环境 |

目标都是统一导出入口、可选择保存位置、无应用专属PDF预览且不显示打印面板。静默不等于跳过用户授权或保存选择器；只有已明确授权的目标才可省略选择。三平台共用生成器与冻结HTML，原生交付按OS适配，不要求底层相同。未实现或未验证的平台标“待验证”，不得自动回退Web打印、截图或新浏览器。

Windows宿主必须把冻结分页HTML作为顶层文档；PrintToPdf不能直接指定现有预览iframe。复用现有完整分页HTML生成路径和冻结资源，不抓取可见DOM、不重新解析Markdown/LaTeX，不要求先显示A4，不重复prepare或分页。已核实pdfExporter调用paginatePreparedContent，后者在paged.preview完成后提取页面outerHTML和样式；交付HTML无Paged.js运行脚本。waitForLayout末尾双rAF对隐藏宿主不能直接照用，D1须验证专用就绪方式。新WebView只加载现成产物并等待字体/图片/布局；保持资源有效至完成。隐藏宿主的加载、就绪、输出可靠性都须实测，不依赖可能暂停的动画帧或固定睡眠充当就绪证据。

Rust持有路径/授权，专用宿主不授予一般业务IPC或任意本地文件访问。受控一次性内容装载与就绪通知应限任务范围；保持静态HTML/CSP及资源策略，不执行作者脚本，不为就绪检测开放广泛权限。用户建议名仍由ExportFile产生；先选择/授权目标，再由原生端在目标目录输出受控临时PDF，完成成功回调后检查输出并同卷受控提交替换目标，最后返回saved。原生回调仅证明临时输出完成，不等于目标已提交；失败保留原文件。选择目标在完整PDF交付HTML生成后进行，与字节格式“完整字节生成后选择”的路径分开描述，不改字节端口。

输出宿主一次只执行一个打印任务，沿用导出busy，不新增任务平台。纸张、缩放、页边距、背景、页眉页脚与既有分页HTML匹配，避免二次缩放/空白页。成功、失败、超时、关闭均释放宿主及临时资源；超时后须先使原生任务不能再提交/写入目标再清理临时文件，迟到回调不得报成功。原生调用返回或销毁宿主能否可靠终止写入也属于PoC验证项，不伪称系统提供可中断取消。授权release失败不掩盖输出主错误。


授权释放失败应单独保留诊断，不掩盖主要写入失败；若文件已提交，不因 release 失败引导用户重复保存或谎称写入失败。释放只针对本次导出目标，不能撤销仍供原文件绑定使用的授权。源绑定与导出目标是不同资源；关闭文档/重新关联/应用退出分别按归属释放，先等本次使用完成再释放，不建通用资源平台。


### D0/D1样本与能力边界（Q6—Q10，2026-11-02）

D0交接一份由当前生成路径导出的固化分页HTML固定样本及SHA-256，记录data-export-pages预期值、关键首尾文字/代表性内容、生成提交、OS/WebView与样本指定及实际可用字体。样本含CJK、公式、图片和表格即可，不先建设大型样本库。D1直接加载该文件，不自行重新驱动前端生成；哈希只锁定输入，不证明内容正确或跨机器输出一致。

D0同时确认Tauri原生入口及依赖版本：当前2.12.4有with_webview，Windows PlatformWebview有controller()/environment()；Cargo.lock含传递的webview2-com/windows。应用直接使用时仍需核对直接依赖与版本一致性，不能因Cargo.toml未直接列出就推断无COM依赖。这里只读核对入口，不等于PrintToPdf已封装或运行通过。

D1复用Tauri创建的隐藏宿主及控制器，范围包含Windows原生接口访问/转换、PrintToPdf异步完成、回调和COM引用生命周期、加载与基本清理。“小夹具”仅指产品范围有限，不承诺只调用一次API，也不预建另一套原生窗口/COM环境管理层。

D1退出条件：PDF物理页数等于固定HTML的data-export-pages；核对关键首尾正文、可选文字、CJK、代表公式图表，无额外空白页/截断及宿主闪现/打印面板，保留文件/hash/环境。页数相等是必要而非充分条件；Windows完整产品化保真证据归D7，D6仍是Web系统证据，不互相替代。

候选就绪判据（由D1验证，尚不承诺可靠）：目标顶层导航成功且文档加载完成，document.fonts.ready及图片资源成功加载/解码，再读取页面盒数量与尺寸核对预期。HTML img与SVG image按实际API分流，不能都直接调用decode；检测在目标WebView文档环境内进行。不用固定睡眠或rAF作为必需就绪条件，不新增作者脚本权限；仍须证明受控检测与CSP兼容。静态分页结构在新宿主仍重新计算样式/布局，不能称为没有回流，也不执行第二次Paged.js分页。

字体边界：当前验证本机生成分页HTML并交付本机输出宿主，仍需确认实际字体环境一致；冻结分页HTML跨环境重新输出的版式一致性尚未验证。PDF成品跨机器阅读另验字体嵌入/显示/可选文字，不因此被声明为仅支持本机阅读。正文及带文本图表可能有系统字体依赖；MathJax SVG字形内部图形引用与MathML字体依赖不能一概而论。本轮不追加字体打包工程。

## 5. 格式输出路径

| 用户选择 | 内容源与生成路径 | Web 交付 | Tauri 交付 |
| --- | --- | --- | --- |
| Markdown | 接受快照中的原文 | 字节保存/下载 | 原生选择并写入 |
| Markdown 资源包 | 快照源文与既有冻结资产打包 | 同上 | 同上 |
| 阅读 HTML | ExportHtmlArtifact→generateExportHtml | 同上 | 同上 |
| 可编辑 HTML | 同一产物正文 + encodeEditableSource 附件 | 同上 | 同上 |
| DOCX | 同一产物→共用公式判定→exportDocumentToDocx | 同上 | 同上 |
| PDF | 同一产物→generatePdfHtml/Paged.js→完整分页 HTML | 浏览器原生输出请求 | 所声明 OS 已验证的静默原生 PDF 端口（Windows先行） |

两平台沿用 ExportFile 的 MIME、完整扩展名、255 UTF-8 字节及完整 grapheme 规则。Web PDF 的 HTML title/建议名只是提示，系统驱动可能忽略；桌面静默保存由ExportFile提供默认名并由用户选择目标，不依赖打印机驱动命名。桌面当前尚无已接生产的PDF端口，D1先验证技术能力，D7/M8再做产品化验收，不能把“系统 WebView 必然支持”写成事实。

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

编号按实际优先执行顺序排列；可并行项仍遵守其依赖。D0先确认代码/产物契约，不要求全量历史回归闭合后才做D1。

| 单位 | 依赖/映射 | 单次范围 | 退出条件 |
| --- | --- | --- | --- |
| D0 当前代码与产物基线 | 当前HEAD | 核对代码与原生入口/依赖；交接含CJK/公式/图片/表格的固化HTML、SHA-256、预期页数及内容/生成环境说明 | D1可直接加载固定文件；哈希不证明保真，不把旧失败算通过，不以全量回归阻塞探索 |
| D1 Windows静默PDF技术验证 | D0产物核对、现有桌面壳；不依赖D2、M4—M7或完整EX-W3 | 独立夹具：复用Tauri隐藏宿主/控制器，原生接口与PrintToPdf异步回调/COM引用生命周期，直接加载D0固定文件；可顺带核对同目录临时输出，不接生产UI | 物理页数=data-export-pages，首尾及代表性内容/可选文字/CJK/公式图表完整，无闪现/面板，验证候选就绪与基本清理；记录文件/hash/环境，不宣称产品/发布通过 |
| D2 交付契约 | D0；参考D1结论 | PdfDeliveryReceipt、名称、release与应用结果映射；Web沿用生成路径 | handed-off/saved→completed+成功回执；cancelled→ExportResult.cancelled；单次准备/确认/busy及释放主错保护 |
| D3 Web交付收口 | D2 | 宿主监听器/定时器及回读unknown反馈 | 取消/失败/激活过期/重复导出准确，不以延迟证明保存 |
| D4 源绑定UI | D2；在M4/M5实施 | 绑定、恢复未关联、重新关联/另存及修订写回 | 不恢复旧授权、不覆盖草稿、不重复建设M4/M5，较新修订不误标写回 |
| D5 DOCX正确性收口 | D0；可与平台准备并行 | 第7节缺口定向核对/必要修复/能力表 | 不丢结构、不误称视觉等价；OOXML/PNG与Word/WPS证据分列 |
| D6 Web系统证据 | D3/D5；EX-W0/EX-W3 | 实际PDF/默认名/文字字体链接矢量分页、字节保存及Word/WPS，复核相关历史失败 | 文件/hash/环境，缺项待补，不据自动结果宣布完整EX-W3 |
| D7 Windows产品化验收 | D1、D2及M6→完整EX-W3→M7；映射M8 | 复用技术PoC，验收命名/取消选择、同目录临时提交、覆盖失败保护、资源/超时/迟到清理 | 目标提交成功才saved，失败保留旧文件；完整PDF/纸张/缩放/边距核对及清理证据，不重复建设PoC |
| D8 Windows双组合根生产接入 | D7/M8通过；映射M9 | 统一入口及Tauri组合，原生字节与PDF交付 | 六格式同操作/快照/命名/一次确认；原生失败不改投Web，不污染源绑定 |
| D9 当前Web/Windows收口 | D8；映射M10/M11 | 按累计影响审查回归、系统/包证据及支持表 | 缺项不标通过，不自动推送/发布 |
| Future F-PDF-Mac | D9/M11当前范围收口后 | WKWebView独立多页PDF PoC，再决定接入 | 隐藏/分页/字体资源/提交/清理各自验证，当前待验证 |
| Future F-PDF-Linux | D9/M11当前范围收口后，与Mac独立 | WebKitGTK明确PDF文件输出PoC，再按已验环境接入 | 不误发实体打印机，核对发行版/后端/包及失败保护，当前待验证 |

D1是明确允许前置的独立技术探索，不是M7/EX-T0或M8产品验收，不再受完整EX-W3和M6前置限制；该例外不放行其他生产EX-T工作。D7/M8、D8/M9和D9发布收口保留原完整EX-W3/M7等门槛。Mac/Linux位于最后，不阻塞限定Web/Windows收口，也不能据此宣称已支持。

历史编号对照：旧D0→D0、D1→D2、D2→D3、D3→D4、D4→D5、D5→D6；旧D6拆为前置D1与产品化D7；旧D7→D8、D8→D9。不再以D6a/D6b作为当前实施编号，不改写历史提交或验收。

同目录临时提交：参考M3 commit_bytes的new_in(parent)/sync/persist保护原则，但该函数接收bytes，不等于原生PDF文件输出已适配。默认不走系统临时卷rename；只有确有必要才另规划复制至目标目录临时文件再安全替换。D1可顺带验证临时输出，覆盖失败/权限/清理在D7验收，不默认把跨卷分支塞入技术PoC。

## 9. 验收记录与支持声明

审查、测试由 GPT-6 Luna 执行，主代理实现修复。记录具体 SHA、实际命令、退出码、日志、产物 SHA-256、OS/浏览器/WebView 版本；本次文档审查只验证文本一致性、代码事实与本地链接，不声称运行回归或系统保存。

自动测试通过、浏览器输出请求交接、实际 PDF 保存、Word/WPS 编辑、跨 OS 安装运行五类证据分别列出。系统默认文件名/文件路径未取得时仍待补；afterprint、端口 resolve、PNG 非空与同大小回读都不能替代完整保存/内容正确性验收。支持表仅宣称有对应证据的环境，不将一个平台结果推广到其他系统。

## 10. 原生能力依据（非本项目实测）

- [WebView2 PrintToPdf](https://learn.microsoft.com/en-us/microsoft-edge/webview2/reference/win32/icorewebview2_7)：顶层文档、异步完成与文件写入；必须检查调用及完成结果，不以发起即成功。
- [Apple WKWebView printOperation](https://developer.apple.com/documentation/webkit/wkwebview/printoperation(with:))与[createPDF](https://developer.apple.com/documentation/webkit/wkwebview/createpdf(configuration:completionhandler:))：存在原生接口不等于隐藏宿主、多页及打印CSS已验。
- [WebKitGTK PrintOperation](https://webkitgtk.org/reference/webkit2gtk/2.37.1/class.PrintOperation.html)：可无面板启动打印，但需显式文件输出配置，不可误发默认打印机。具体系统版本和PDF后端仍待Future验证。

本次更新只改设计；三平台静默PDF均未在本项目验证，不新增代码或发布支持声明。

本轮Q1—Q5结论见[开放问题决策记录](export-outputs-open-questions-2026-11-02.md)。本次只改文档，前置D1尚未实施。
