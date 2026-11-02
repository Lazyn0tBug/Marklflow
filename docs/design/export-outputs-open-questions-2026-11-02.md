# 统一输出方案：开放问题与决策记录

更新：2026-11-02。项目内决策副本，来源为用户Downloads中的同名问题清单；原件保持不变。本文同步讨论结论，不授权实施、提交或推送。主方案见[完整输出方案](export-outputs-formula-and-print-plan-2026-10-30.md)，平台路线见[迁移方案](tauri-migration-plan-2026-10-29.md)，端口见[契约](tauri-migration-m0-contract-2026-10-29.md)。

代码核对基线：architecture-refactor / 4ddee4b（方案修订2062655，决策落档614107d，4ddee4b为其合并提交）；原清单所称当前HEAD 58bb1a2不作为本次基线。以下区分已核对事实、设计决定与尚未验证的原生能力。第二轮Q6—Q10已形成决定见§2；原提问留作讨论背景，不代表能力已经验证。

## 1. Q1—Q5决定

| 问题 | 决定 | 依据与边界 | 同步位置 |
| --- | --- | --- | --- |
| Q1 技术验证被发布门槛阻塞 | 前置技术验证重新编号D1，只依赖D0产物核对及现有壳；无需D2、完整EX-W3/M4—M7。完整产品化为D7/M8、生产D8/M9，门槛保留 | 独立探索不等于产品或发布验收，不要求全量历史回归先闭合；只豁免此小夹具，不放行其他EX-T | 主方案§8、迁移§6—10、契约§3.1 |
| Q2 是否重复分页/如何就绪 | 当前固化分页HTML无Paged.js运行脚本，新宿主不再次分页；D1验证隐藏宿主就绪，不能直接照搬双rAF | pdfExporter→paginatePreparedContent→paged.preview后取pages.outerHTML/css；waitForLayout等待图片/字体/双rAF，不是iframe专用，但隐藏可靠性未验 | 主方案§4.1、契约§3.1 |
| Q3 同一PDF端口语义 | 保留deliverPdf一个签名，显式平台内部选择和交付；字节selectSave不参与PDF | Web交接、桌面选择/输出/提交由各适配器处理，调用方根据结果统一反馈 | 三文档端口契约 |
| Q4 两层取消 | 端口显式cancelled→ExportResult.cancelled；handed-off/saved→completed+成功回执，不采用completed+cancelled | 端口报告事实，应用归一化，UI只有一个取消入口；取消目标选择不等于可中断原生计算，端口取消信号不能删 | 三文档与D2 |
| Q5 跨卷提交 | 默认目标同目录临时PDF、同卷提交；D1可顺带核对输出，覆盖失败/权限/清理在D7；确需跨卷再单独设计 | M3已有new_in(parent)/sync/persist保护原则，但commit_bytes接bytes，非已实现PDF文件适配；不默认采用系统临时卷rename或扩展copy分支 | 主方案§4.1/§8，迁移§3.2，契约§3.1 |

## 2. 第二轮问题与决定（2026-11-02）

本轮决定已同步主方案§4.1/§8、迁移§7/§11及契约§3.2；不改变Q1—Q5、执行编号或发布门槛。以下Q6—Q10原提问保留为背景，以本节决定表为准，原文待决措辞不再表示当前状态。

| 编号 | 当前决定 | 依据及未验边界 |
| --- | --- | --- |
| Q6 | D0核对Tauri入口和依赖版本，D1明确原生接口/PrintToPdf异步回调/COM引用生命周期，复用Tauri隐藏宿主 | 已有with_webview/controller/environment，锁文件含传递COM依赖；不能从Cargo.toml推断不存在，不承诺一次调用或另建COM平台，运行能力未验 |
| Q7 | D1物理页数=data-export-pages，并核对首尾/可选文字/CJK/代表公式图表及无闪现/面板；D7承担Windows完整产品验收 | 页数相等必要但不充分；D6仍为Web证据，不替代D7 |
| Q8 | 导航/文档加载成功、fonts.ready、图片就绪及页面盒数量尺寸是候选组合；无固定睡眠/rAF必需条件 | 固化结构仍会重新布局；HTML img/SVG image按API分流，在目标文档环境检测，D1验证充分性，不开放作者脚本 |
| Q9 | 记录本机生成/交付环境；冻结HTML跨环境重新输出版式一致性未验，不宣称PDF成品仅限本机阅读 | 正文/图表可能系统字体依赖，MathJax SVG与MathML区别对待；成品字体嵌入/显示/可选文字另验，本轮不做字体打包 |
| Q10 | D0提供代表性固化HTML、SHA-256、预期页数/内容和生成提交/OS/WebView/字体说明，D1直接加载 | hash锁定输入而非证明正确或跨机一致；无需大样本库，不把前端重新生成塞入D1 |

### Q6 D1主体工作是WebView2 COM互操作，工作量预期偏低

事实依据：`src-tauri/Cargo.toml`依赖仅tauri 2.12.4、serde、tauri-plugin-dialog、tempfile、uuid，无windows crate与webview2-com；`src-tauri/src/`仅files.rs、lib.rs、main.rs。静默PDF的正规路径ICoreWebView2_7::PrintToPdf未见于Tauri 2.12的Rust API面，Webview::print走系统面板而非静默落盘。

未验证：Tauri 2.12 crate是否在某处暴露PrintToPdf或可复用的WebView2控制器，本轮未读crate源码，仅由依赖清单推断。

影响：主方案§8与迁移§7把D1描述为“独立小夹具”，与实际主体工作量（COM环境、隐藏控制器、NavigateToString、异步完成回调、COM引用生命周期）存在预期落差，执行者可能按“调一次API”准备。

建议：把“隐藏WebView2控制器与PrintToPdf的COM互操作”显式写入D1单次范围；把“Tauri 2.12是否暴露PrintToPdf”列入D0待复核项，作为D1开工前的前置确认。

历史提问（已由上方决定表替代）：是否改写D1单次范围措辞；是否在D0增加该探针项。

### Q7 D1退出条件应聚焦宿主机制，并采用可判定的页数断言

事实依据：`src/core/export/pdfExporter.ts:9`生成的固化HTML携带data-export-pages="<总页数>"。WebView2与浏览器同为Chromium引擎，跨宿主真正分叉的是打印参数来源（浏览器来自打印预览面板，WebView2来自PrintToPdfOptions与CSS @page），而非排版引擎本身。

影响：主方案§8的D1退出条件“完整多页”为人工判读，易放过多出空白页与缩放致一页裂成两页这两类典型失败；且若让D1独自承担全部保真度验证，会与D6重复建设。

建议：D1退出条件改为可判定形式，例如“输出PDF物理页数等于固化HTML的data-export-pages，正文可选、CJK不缺字、公式图表完整”；分页保真度主证据仍归D6，D1只回答“隐藏控制器加PrintToPdf可用且输出一致”。

历史提问（已由上方决定表替代）：是否采用该断言形式；是否据此收窄D1范围。

### Q8 隐藏宿主的就绪判据可用非rAF方案

事实依据：`src/core/render/htmlPaginator.ts:39-44`产物是Paged.js preview完成后的静态页面盒快照，页面盒尺寸固定，不存在需要等待的布局回流；`src/core/`全目录无任何@font-face，主题仅用系统字体。`src/core/export/documentPrint.ts:15-29`的双rAF用于探测动态内容的布局稳定，隐藏宿主中该手段不可靠。

影响：主方案§4.1与契约§3.1均已指出“双rAF不能直接照用”，但只给出“须验证专用就绪方式”，未给替代方向，D1可能被引导去写轮询或固定睡眠。

建议：就绪判据取readyState为complete、document.fonts.ready与全部img及svg image的decode完成三项，不使用rAF，也不使用固定睡眠；与§4.1“不依赖可能暂停的动画帧”方向一致。

历史提问（已由上方决定表替代）：是否把该判据写入契约§3.1与主方案§4.1。

### Q9 固化分页HTML存在系统字体依赖，跨机器复现不保证

事实依据：无@font-face意味着冻结分页是在生成时的系统字体下计算的。固定高度页面盒在字体度量不同的环境下会溢出或截断，而“不重复分页”意味着已无再分页时机。

影响：当前为同会话同机器生成并打印，风险低；但支持表若默认声明“PDF已支持”，会把跨机器复现算作已达成的性质。

建议：D0记录固化产物的生成环境（OS、可用字体）；D1与D7及支持声明注明PDF与生成同机器，不保证跨机器复现。

历史提问（已由上方决定表替代）：是否作为支持声明的限定条件写入。

### Q10 D0宜产出带SHA-256的固化分页HTML样本作为D1固定输入

事实依据：D1夹具需要固化分页HTML作为输入；D0退出条件为“确认D1真实产物与版本”，D1依赖写作“D0产物核对”，两者之间尚无具体交接物。

影响：若D1需自行驱动前端生成产物，D1就无法真正脱离D2与前端构建链，与§1中Q1决定的前置豁免相抵。

建议：D0落一份代表性样本（建议含公式、CJK、图片、表格）并记SHA-256，D1夹具直接加载该文件。

历史提问（已由上方决定表替代）：是否把该产物写入D0退出条件。

## 3. 当前编号及映射

D0基线→D1技术探索→D2契约→D3 Web收口→D4绑定(M4/M5)→D5 DOCX→D6 Web证据→D7产品化(M8)→D8生产(M9)→D9收口(M10/M11)。D5依赖允许可并行；Mac/Linux Future最后，在D9之后，均待验证。

旧D0→D0；D1→D2、D2→D3、D3→D4、D4→D5、D5→D6；旧D6拆为前置D1与产品化D7；旧D7→D8、D8→D9。D6a/D6b仅为讨论时临时叫法，不作为现行编号。历史提交/验收不重编号。

## 4. 其余事实和未完成项

- Vite配置未将@tauri-apps/api external，不能据此推断无法同步检测isTauri；组合方式仍按初始化需要决定。
- ByteSaveTarget.release缺口、回读unknown及监听器/定时器仍归D2/D3核对修复，不能因记录问题就称已修复；D5公式语义缺口仍需定向审查。
- Rust commit_bytes同目录策略仅为复用原则；隐藏WebView就绪、PrintToPdf文件、终止/迟到清理、实际目标保护均未在本项目验证。
- Web/Windows当前范围收口不要求Future平台已验，也不得将包构建成功当其静默PDF支持。系统PDF/WordWPS与发布缺项仍需补齐。
- 本次与本轮均只读核对和文档同步，不运行代码测试、不修改代码、不提交、不推送。D1尚未实施。

第二轮已核对事实补录：

- `src/core/render/htmlPaginator.ts:39-44`：固化分页HTML由paged.preview后取`.pagedjs_pages`的outerHTML与新增style构成，无Paged.js运行脚本；总页数同时写入data-export-pages。证实§1中Q2的事实依据。
- `src/core/export/documentPrint.ts:15`：waitForLayout形参为ParentNode与Document，非iframe专用；其末尾双rAF属动态布局稳定探测，见Q8。
- 项目导出CSS未发现自带@font-face；不能据此将全部公式/图形归为系统字体依赖，见Q9当前决定；固化DOM仍在新宿主重新布局。
- `src-tauri/Cargo.toml`依赖清单与`src-tauri/src/`文件构成如Q6所述。
- `vite.config.ts`无rollupOptions.external，与本节首条一致。
- 历史落档关系：方案修订2062655，决策614107d，合并4ddee4b；本轮更新输入来自后续bec0358，不用历史HEAD代替当前提交。

第二轮后续待验证：

- 原生运行、隐藏就绪及PrintToPdf输出仍待D1；已有with_webview/controller/environment入口的事实已核对，直接依赖版本匹配在D0确认。
- 旧编号通过现有映射和历史提交反查，暂不另维护锚点体系。
- Q6—Q10文档已同步，D0样本尚未生成，D1尚未实施；不把设计结论当实际代码/系统验收。

## 5. 原问题清单溯源

原始材料：C:/Users/清明/Downloads/export-outputs-open-questions-2026-11-02.md，未改写；本项目副本保留决定及问题编号，避免把原文待决提问或旧基线当当前约束。原件SHA-256：`2d28d04a9e769540b4a7804e2af3e4c5b5a849be10e03f07359e219af2d05b91`。

本轮仅更新四份项目文档；Downloads原件和两份预存架构索引保持不变，未安装依赖、未运行代码测试、未实施D0/D1。
