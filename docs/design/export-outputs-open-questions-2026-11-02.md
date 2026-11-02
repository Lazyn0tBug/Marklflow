# 统一输出方案：开放问题与决策记录

更新：2026-11-02。项目内决策副本，来源为用户Downloads中的同名问题清单；原件保持不变。本文同步讨论结论，不授权实施、提交或推送。主方案见[完整输出方案](export-outputs-formula-and-print-plan-2026-10-30.md)，平台路线见[迁移方案](tauri-migration-plan-2026-10-29.md)，端口见[契约](tauri-migration-m0-contract-2026-10-29.md)。

代码核对基线：architecture-refactor / 95c7f1b（方案修订2062655，决策落档614107d，合并4ddee4b，本轮输入来自 bec0358、686ab7a 与 95c7f1b）；原清单所称当前HEAD 58bb1a2不作为本次基线。以下区分已核对事实、设计决定与尚未验证的原生能力。第二轮Q6—Q10已形成决定见§2；原提问留作讨论背景，不代表能力已经验证。第三轮Q11—Q13已决定见§3；保留原提问仅供历史追踪，能力仍待验证。第四轮Q14—Q16已决定见§4，原提问仅作历史背景，运行能力仍未验证。

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

## 3. 第三轮问题与决定（2026-11-02）

本轮决定已同步主方案§4.1/§4.2/§8、迁移§7/§12及契约§3.3，不改变Q1—Q10及编号；以下原提问按历史背景保留，当前状态以决定表为准。

| 编号 | 当前决定 | 边界 |
| --- | --- | --- |
| Q11 | D0首选Tauri独立label、visible(false) WebviewWindow；D1允许通过/当前形态不可行/未能确认三类结果 | 不并行建设三种宿主；非通过结束探索但暂停D7/D8、保留Web，记录清理及限制；未确认不等于证伪，清理失败仍阻塞，备选另决 |
| Q12 | D0核对capability及应用命令两层，D1负向验证敏感IPC不可调用；就绪用原生受控脚本执行 | 无capability匹配不等于无IPC，自定义命令不能漏；适当权限/来源限制，不给检测开放一般业务命令，不建通用权限平台 |
| Q13 | D1联合页数、pdffonts、关键正文/CJK提取及代表页渲染，D7补完整样本/阅读器 | 字体嵌入不是完整跨机保证，uni=no不直接等于不可提取，图形化正文不冒充可选；未嵌入正文列待处理，不新增用户端工具依赖 |

### Q11 D1缺少失败出口，隐藏宿主形态未定

事实依据：主方案§4.2写“D1复用Tauri创建的隐藏宿主及控制器”，未指明形态。Tauri v2的隐藏至少三种：visible(false)的WebviewWindow（真实HWND，从不显示）、附着已有窗口的WebviewBuilder、独立原生窗口。三者语义不同：从不显示的HWND其合成可能被抑制；借用可见窗口的webview与§4.1“不用现有预览iframe”的隔离意图相悖；独立原生窗口与“复用Tauri宿主”矛盾。

影响：D7依赖D1、D8依赖D7，D1一旦卡住整条Windows静默PDF路线悬空，而D1已是含COM互操作、隐藏宿主、就绪探测与输出校验的中等体量单位。形态选择同时决定Q8的就绪语义。

建议：主方案§4.2为D1补停止条件与备选路径，允许D1以“通过”或“证伪”两种合法形态收口——若隐藏宿主取不到可用PrintToPdf接口，D1以失败结论结束，Windows静默PDF标待验证，Web打印路径不受影响。隐藏宿主形态在D0定，不留到D1现场选择。

历史提问（已由上方决定表替代）：是否在主方案§4.2补D1停止条件与备选路径；隐藏宿主形态由D0还是D1确定。

### Q12 隐藏宿主的IPC隔离与capability匹配需显式核实

事实依据：主方案§4.1要求“专用宿主不授予一般业务IPC或任意本地文件访问”。Tauri v2权限按window/webview label匹配，隐藏webview使用独立label且不匹配任何capability即无IPC，但这是需要断言的结论；若仓库存在core:default一类宽匹配capability则可能被牵连。另：就绪检测走COM的ExecuteScriptAsync，属原生层调用，不经Tauri IPC，因此不需要为检测开放任何权限。

影响：§4.1的隔离要求与§4.2的“复用Tauri隐藏宿主”之间尚无衔接结论，隔离性目前只写在目标里，没有对应检查项。

建议：把“隐藏webview的label与capability匹配关系需核实并记录”“就绪检测只走COM，不引入Tauri IPC权限”列为D0/D1的显式检查项。

历史提问（已由上方决定表替代）：是否把该检查项写入主方案§4.1与§4.2。

### Q13 PDF成品字体嵌入应给出可判定检查

事实依据：Q9决定写“成品字体嵌入、显示及可选文字另验”，未指定验证方法。Chromium打印管线通常嵌入字体子集，故结论大概率是成品可跨机阅读。

影响：与Q7批评“完整多页”为人工判读属同类问题，缺方法会落回人工翻PDF。

建议：指定为可判定项——检查输出PDF内每个字体的嵌入状态（poppler的pdffonts，或直接解析PDF的FontFile2/FontFile3流），要求无未嵌入字体。成本极低，结论明确，直接支撑主方案§9支持声明中的跨机阅读栏。

历史提问（已由上方决定表替代）：是否把该检查项写入主方案§4.2或§8的D1/D7退出条件。

## 4. 第四轮问题与决定（2026-11-02）

本轮决定已同步主方案§4.2/§8、迁移§13及契约§3.4，不改变前轮编号与门槛。下方原提问保留为历史背景，以决定表为准；不把原注释或推断当已证实平台机制。

| 编号 | 当前决定 | 边界 |
| --- | --- | --- |
| Q14 | 独立探针，分开通道阳性与同命令权限对照；主窗口同敏感命令/合法测试参数允许，输出宿主明确门控拒绝 | 保持相关label/来源条件，不改生产CSP；ACL或来源/label拒绝均可，未知key/参数/API缺失/脚本未运行不算；get_platform_info只证明通道，阳性无效则阴性作废，不用用户文件 |
| Q15 | 直接检查PDF首末页渲染非空、样本首尾标记归预期页，结合既有页数/字体/文本/图表 | 帧信息仅可选诊断，无则未知；Web iframe注释不是原生PrintToPdf必须先合成的证明，不自动新增可见/离屏显示备选 |
| Q16 | D0保持只读，必要权限限制放D1首个最小小步，再做探针，不加主阶段或拖D8 | 权限/探针/环境/清理错误属未确认/阻塞，非宿主不可行；UUID key门控只纵深保护，原生机制不可行须明确复现证据 |

### Q14 负向验证可能空转，须断言失败原因并设阳性对照

事实依据：`src-tauri/capabilities/default.json`为identifier main-shell、windows仅main、permissions为空数组，且无`src-tauri/permissions/`目录；`src-tauri/src/lib.rs`的invoke_handler注册6个命令，除get_platform_info外为files的select_native_open、select_native_save、read_native_text、write_native_bytes、release_native_file；`src-tauri/tauri.conf.json`未设withGlobalTauri，app.security.csp的connect-src含ipc:与http://ipc.localhost；`src/core/export/pdfExporter.ts:9`的冻结交付HTML自带CSP default-src 'none'且无script-src，脚本不能执行；files.rs的读写命令在Rust侧由FileAccess管理态按UUID key换取已授权路径，key无效时同样失败。

影响：Q12决定要求D1“用有限负向调用验证输出宿主不能调用敏感文件选择/读取/写入命令”，存在四处空转可能。其一，探针若无脚本，在交付HTML上失败的是CSP而非权限。其二，未开withGlobalTauri时window.__TAURI__不存在，通道选错同样“通过”。其三，命令在Rust侧key门控，ACL放行而key无效时调用也会失败，断言“调用失败”不能证明隔离。其四，无阳性对照时上述任一情形都会让阴性结果失去意义。

建议：负向验证使用独立的带脚本测试探针页，与交付样本分离；走实际存在的低层invoke通道，具体全局名在D0确认；断言失败原因属ACL拒绝而非Rust侧未知授权键；同一通道在主窗口成功调用get_platform_info作为阳性对照，阳性对照不成立则阴性结果作废。

历史提问（已由上方决定表替代）：是否把“独立探针页、断言失败原因、阳性对照”写入主方案§4.2与§8的D1退出条件。

### Q15 就绪判据覆盖排版而非渲染帧，首页为空的风险未被覆盖

事实依据：`src/core/platform/web/pdfDelivery.ts:6-9`的注释写明打印宿主须在视口内且不可见，移出视口则不属于渲染输出，打印浏览器从未渲染过的帧会得到空白首页；其PRINT_FRAME_STYLE用position:fixed;left:0;top:0;opacity:0，即视口内不可见而非视口外。`src/core/render/htmlPaginator.ts:20`的排版台用left:-20000px置于视口外，排版仍正常。差别在于：排版只需layout，打印需要真的渲染过一帧。

影响：Q8的候选就绪集（导航成功、fonts.ready、图片解码、页面盒数量与尺寸）全部是layout层面证据，没有一项能保证目标文档被渲染过；首选形态visible(false)的WebviewWindow属于从未渲染，比Web的渲染过但不可见更远一层。首页为空时页数仍可能等于data-export-pages，字体报告也可能正常，两项都察觉不到。

建议：主方案§4.2与§8的D1退出条件显式写明“首页非空且首行文本与固化HTML第一页首行对应”；D1失败证据记录“目标文档是否至少渲染过一帧”，使后续是否试离屏显示形态（窗口移出可视区但可见）有依据，该备选与Web侧已验证做法同构。

历史提问（已由上方决定表替代）：是否显式化首页非空与渲染帧记录。

### Q16 D0的只读定位可能不足，命令暴露收紧的改动落点未定

事实依据：Q12决定写“独立label或不匹配capability不等于无IPC，invoke_handler注册的应用命令默认行为必须单独约束”；结合capabilities/default.json的permissions为空与无permissions目录，该结论可能要求改代码而非仅核对。

影响：D0在主方案§8的定位是当前代码与产物基线的核对。若D0结论为需收紧命令暴露而只记录不改代码，D1的负向验证必然失败，D1会按§4.2的三类结论归因为“当前形态不可行”，属错误归因——问题在命令权限配置而非宿主形态。

建议：明确D0若得出需收紧命令暴露时的改动落点，三者择一：D1单次范围内的第一个小步、单列独立小步、归入D8生产接入；并把Rust侧key门控作为风险缓解事实写入§4.2，即即使IPC放行，无有效key仍取不到路径。

历史提问（已由上方决定表替代）：改动落点选哪一种。

## 5. 当前编号及映射

D0基线→D1技术探索→D2契约→D3 Web收口→D4绑定(M4/M5)→D5 DOCX→D6 Web证据→D7产品化(M8)→D8生产(M9)→D9收口(M10/M11)。D5依赖允许可并行；Mac/Linux Future最后，在D9之后，均待验证。

旧D0→D0；D1→D2、D2→D3、D3→D4、D4→D5、D5→D6；旧D6拆为前置D1与产品化D7；旧D7→D8、D8→D9。D6a/D6b仅为讨论时临时叫法，不作为现行编号。历史提交/验收不重编号。

## 6. 其余事实和未完成项

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

第三轮已核对事实补录：

- `src-tauri/Cargo.lock`含传递依赖：wry 0.57.1、webview2-com 0.39.1、webview2-com-sys 0.39.1、windows 0.62.2、windows-core 0.62.2、windows-sys 0.45.0/0.59.0/0.61.2。此前只查Cargo.toml直接依赖，得出“无比COM依赖”的结论不成立，见Q6。
- 本地cargo缓存的wry-0.55.1中，Windows的WebView2结构体为公有字段pub controller: ICoreWebView2Controller与pub env: ICoreWebView2Environment，并已有env.cast::<ICoreWebView2Environment10>()一类COM转换；锁文件为wry 0.57.1，其形态是否改为方法待D0核对。
- 纠正API层次：锁定Tauri 2.12.4的PlatformWebview提供controller()/environment()方法，包装内部运行时结构。旧wry字段与Tauri方法不是同层，不能据此否定现有文档。
- 依赖匹配：锁文件已有绑定库不等于应用可不声明直接依赖；D0选择匹配Tauri返回类型的版本/接口，不能把webview2-com与windows简单当成互斥路线，避免不兼容COM类型。

第三轮后续待验证：

- webview2-com 0.39.1的接口覆盖（是否含ICoreWebView2_7与PrintToPdf）需查该版本对应文档，本地registry缓存无此版本源码，本轮未能核对。
- 主方案边界标题已编号§4.2，迁移§11改用文件链接和章节说明，不保留失效旧锚点。
- 候选就绪详细判据统一在主方案§4.2，§4.1和平台契约引用该处，尚须D1验证，不由文档合并视作运行可靠。
- Q11—Q13已同步三方案；D0/D1未实施，首选宿主、IPC限制、字体/文本/渲染检查尚待实际验证。

第四轮已核对事实补录：

- `src-tauri/capabilities/default.json`：identifier为main-shell，windows仅含main，permissions为空数组；仓库内无`src-tauri/permissions/`目录，即未自建命令权限文件。见Q14与Q16。
- `src-tauri/src/lib.rs`的invoke_handler注册6个命令：get_platform_info，以及files的select_native_open、select_native_save、read_native_text、write_native_bytes、release_native_file。见Q14与Q16。
- `src-tauri/tauri.conf.json`未设withGlobalTauri；app.security.csp的connect-src含ipc:与http://ipc.localhost，说明CSP本身不隔离IPC通道，隔离取决于capability匹配与命令暴露。见Q12与Q14。
- `src/core/export/pdfExporter.ts:9`：冻结交付HTML自带CSP default-src 'none'且无script-src，脚本不可执行，故该HTML不适合作IPC负向探针载体。见Q14。
- `src/core/platform/web/pdfDelivery.ts:6-9`及其PRINT_FRAME_STYLE：打印宿主取视口内不可见而非视口外，注释明确“打印浏览器从未渲染过的帧会得到空白首页”；`src/core/render/htmlPaginator.ts:20`的排版台置于视口外仍可正常排版。这是Web侧实现/注释事实，不能单独证明WebView2原生PrintToPdf必须先屏幕合成；Q15按输出结果验证。
- files.rs的文件命令在Rust侧由FileAccess管理态按UUID key换取已授权路径，key无效时同样失败。见Q14与Q16。

第四轮后续待验证：

- 使用官方invoke或经确认的实际调用路径，不猜私有global；withGlobalTauri是全局API暴露开关，不代表IPC整体是否可用。D0确认探针通道和对照方法，D1实测。
- D0只读定位自定义命令与权限暴露，必要限制在D1首个小步落实；实际调用及拒绝原因/有效对照归D1，不把D0默认为运行探针阶段。
- Q14—Q16已同步方案，IPC探针、权限修改及实际PDF首末页均未实施/验收；不能因文档明确而算通过。

## 7. 原问题清单溯源

原始材料：C:/Users/清明/Downloads/export-outputs-open-questions-2026-11-02.md，未改写；本项目副本保留决定及问题编号，避免把原文待决提问或旧基线当当前约束。原件SHA-256：`2d28d04a9e769540b4a7804e2af3e4c5b5a849be10e03f07359e219af2d05b91`。

本轮仅更新四份项目文档；Downloads原件和两份预存架构索引保持不变，未安装依赖、未运行代码测试、未实施D0/D1。

第三轮当前事实纠正：无capability匹配不能推断无自定义IPC；本地注册有文件命令。字体嵌入/ToUnicode/实际文本与渲染分别检查。主方案§4.2为完整就绪判据来源，旧Q11—Q13原文不作为现行事实依据。

第四轮同步仅涉及四份文档；未修改代码、未运行测试、未提交或推送。主方案§4.2保留详细验证约定，旧问题背景不作为现行要求。
