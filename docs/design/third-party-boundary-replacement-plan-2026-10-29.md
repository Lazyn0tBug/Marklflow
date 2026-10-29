# 第三方边界替代方案与分步实施计划

日期：2026-10-29。状态：**F0/F1已实施验证；F2回归测试已完成，独立审查留待X**。

基线：D:/code/Marklflow，architecture-refactor，6603e77。原规划轮仅写方案；当前用户明确授权F0/F1，采纳255 UTF-8字节与完整grapheme、移除120码点上限。实施和对应审查/测试按下文记录分步进行，不推送。用户tag-release.patch保持原样。用户后续已授权F2；图片签名/P/C/X和其他实施仍须另获授权。

## 1. 目标与决策

减少自行维护的通用字符、文件名和格式判定规则，把成熟库或原生能力放在明确边界；应用只保留真实的格式、预算、授权、取消和资源所有权规则。不以减少if数量为目标，不建立统一校验平台、通用任务框架或长期双实现。

| 分类 | 决策 | 证据与限制 |
| --- | --- | --- |
| 文件名主线 | 优先采用filenamify@7.0.3的browser入口，外围保留单一产品适配 | 已有46例Bun/Chromium及Windows NTFS隔离试验；并非所有OS/文件系统保证，不可一行替换 |
| 图片签名支线 | file-type仅列独立PoC候选，通过go/no-go后才考虑生产接入 | 尚未进行本项目浏览器集成/样例验证；magic number不是完整解码或安全证明 |
| 已有库 | 继续使用Zod、DOMPurify、css-tree、parse5、JSZip、hash.js/Web Crypto，按实际重复点收拢 | 不引入第二套schema、sanitizer、CSS parser或哈希实现 |
| 原生编码 | 保留TextDecoder严格UTF-8导入、TextEncoder UTF-8测量 | 不自动探测/猜测编码，不顺带支持GB18030/UTF-16导入或非UTF-8导出 |
| API/生命周期 | 保留externalApi最小形状检查与平台契约 | 授权、取消、busy、接收者绑定、Promise/同步结果、清理和错误保留不是命名库职责 |
| 延期/不选 | sanitise-path非本次文件名首选；Content-Disposition按未来HTTP场景评估；@arraypress/safe-filename身份未确认 | 不把候选一次性全部加入。路径清理不等于真实目录权限或包含性验证 |

## 2. 既有证据和本轮未做的事

文件名试验：[中文报告](D:/codex/.codex/tmp/marklflow-filename-comparison-2026-10-29/文件名库对比报告.md)、[逐例JSON](D:/codex/.codex/tmp/marklflow-filename-comparison-2026-10-29/文件名库对比报告.json)。固定filenamify7.0.3、sanitise-path1.1.0；46例包含File/file大小写对照。已有Chromium156.0.8078.4与Bun结果一致；NTFS试验138项中82次创建读回、50次同名EEXIST、6个潜在设备名跳过。碰撞计数不能用于库可靠性排名，未打开设备名。试验core.mjs不是可直接复制的生产架构，紧凑物理行数和整体试验bundle也不是生产净增代码量/包体。

原规划轮仅复用已有证据及只读源码/官方资料，不重跑试验；当前F0/F1实施证据另见执行记录。file-type官方仓库main的元数据或版本不等同拟采用的已发布包；后续PoC必须核对并固定实际发布版本、tarball、类型、许可和exports。Node engines声明、ESM或没有browser条件，均不能单独证明浏览器兼容或不兼容。

## 3. 模块替代映射

| 位置 | 通用实现归属 | 应用保留/可删除范围 |
| --- | --- | --- |
| src/application/exports/exportFile.ts | filenamify/browser负责通用非法字符清理、NFC及其grapheme能力和受验证的保留名规则 | 保留六格式/MIME表、已知后缀规范化、空名回退、最终字节预算和单一ExportFile描述；删除被库实际覆盖的自制清洗正则、ASCII-only保留名检查和重复规范化。若库对承诺用例存在缺口，只做明确、有限的产品补丁或停止接入，不建立第二套通用清洗器 |
| src/core/platform/web/byteDelivery.ts、pdfDelivery.ts及应用ExportService | 不替换；继续消费统一文件描述及冻结HTML/字节 | 不改selectSave/deliverPdf语义。PDF仍用同一ExportFile.baseName作为HTML标题建议，但不走字节选择器；不保证系统采用默认名。下载、选择、取消、write/close/abort、busy及流所有权保留 |
| src/core/export/documentAssets.ts、documentSchema.ts | file-type PoC评估读取已取得的Uint8Array后进行二进制格式核对 | 现有允许MIME只有PNG/JPEG/GIF/WebP/AVIF。保留来源、大小、总量、数量、哈希、冻结字节、读流取消/超时等。当前没有二进制签名校验，不能声称已经实施；PoC失败保持现状并标明未增加该能力，不另造magic parser |
| 行内SVG、Mermaid/MathJax SVG及HTML/CSS策略 | DOMPurify、css-tree及既有SVG/HTML解析净化 | SVG不是当前图片资产MIME白名单成员，不借PoC新增data/HTTP SVG资产支持；现有行内SVG及图表仍按原净化/URL策略处理。不得将文本SVG交给二进制签名器当完整证明 |
| 文档/Worker/导入/恢复schemas | 既有Zod | Zod管结构和类型；来源授权、损坏数据原值保留、恢复/冲突语义继续自管。只删除确实被同一边界schema覆盖的重复字段检查，不强制将所有分支改成schema或Result |
| src/core/export/markdownBundle.ts | 既有parse5、JSZip | parse5按源位置处理包内HTML片段/图片属性；JSZip生成document.md、资源及manifest。保留精确源文本与既定引用改写，不引入新解析/ZIP库 |
| src/core/platform/crypto.ts、src/application/tasks/previewIdentity.ts | sha256Hex沿用Web Crypto优先/hash.js回退；previewIdentity继续直接同步hash.js | 不把hash.js概括为仅回退；不把同步缓存/身份计算改成异步crypto，不改Markdown精确UTF-8散列或资产身份 |
| TextEncoder/TextDecoder、externalApi.ts | 原生API与既有薄守卫 | 只有发现真正重复且可删除的代码才局部提取helper；没有重复就不改。不为“统一”增加全局文本转换层或通用外部API平台 |

## 4. 文件名目标契约与兼容性决策

### 4.1 建议的简化方向

以**最终单个文件名组件**为预算对象：含实际扩展名、必要前缀，总UTF-8长度不超过255字节；仅在完整grapheme边界截断。不将255字节宣传为所有OS、卷、完整路径或浏览器保存框的保证。Windows/Tauri实际路径仍由平台层验证。

120码点是当前保守常数，尚无证据表明它是用户需求。F0必须单列旧/新长ASCII、中文、emoji输出差异，提出去除该额外上限的兼容性决策。**推荐采用单一最终字节预算；未经明确批准，实施不得悄然删除或固化120码点规则。** 若未批准简化，则记录为暂时兼容约束，不为它扩展成通用框架。filenamify默认100 UTF-16单位上限也不能直接成为产品规则，须显式设置并验证。

### 4.2 单一生产适配的职责

1. 根据六种格式选择既有扩展名和MIME，清理大小写/重复已知输出后缀；不将普通“a.b”任意当格式后缀剥除。
2. 调用确切browser入口执行通用清洗；替换字符、NFC、设备名行为需固定并列明与旧输出的差异，不承诺清洗后名称唯一。
3. 为`.markflow.html`等完整复合后缀、必要前缀预留预算。库保留普通最后后缀不等于满足本项目复合后缀契约。
4. 在grapheme边界与最终UTF-8预算下得到主名，处理空结果及单个grapheme已超过预算的情况，附加完整后缀，返回一个ExportFile。预算不可通过先截断完整名再重新附加后缀而超限。
5. 由同一描述驱动界面建议名、字节保存/下载和PDF标题建议。文件名变化不改源Markdown、文档ID、Tab身份、内容哈希或预览缓存，不触发正文重渲染。

不得长期保留旧清洗器与新清洗器运行时切换，不复制试验共享适配层。若filenamify已有能力足够，不额外直接维护相同Intl.Segmenter算法；若字节预算仍需项目helper，只保留确有必要的最小实现。

## 5. 图片签名支线：条件与边界

P0为独立隔离PoC，不是先决于文件名主线的生产步骤。允许的五种二进制图片格式逐项核对，分清声明、签名和可解码三个层面。

- 从现有读取/限额流程得到的同一份字节探测，不重复fetch、二次读取或转换资源。比较data URI声明/资产MIME或HTTP Content-Type与检测结果，保留现有参数/大小写规范化。
- 拟锁版本可能识别更细子型（如APNG/PNG家族）或不同别名。P0须列出兼容关系、合法动画/子型和截断输入差异；需要映射时仅允许明示、经验证的兼容关系，不静默改MIME、扩schema或把库识别的所有格式放行。
- 未识别或类型不符的生产行为必须明确：拒绝导出该资源并保留源文档，提供可理解定位；如误拒绝现有合法资源，先停止接入/解决契约，不静默回落到信任Content-Type的第二条路线。
- magic number相符不能证明完整/安全。合法签名但主体截断的用例必须区分“签名识别成功”与“解码失败”；已有浏览器图片解码/布局就绪继续生效。没有解码证据就只宣称声明/签名一致，不声称图像完整。
- 不改旧文档schema、不自动清空/迁移旧资产；旧数据发现不符时按受理快照反馈，保留源内容，允许用户重新导入。合法资源原字节、散列及HTML唯一内容源保持不变。

P0 go条件：已发布固定版本/许可明确，目标Vite生产及现有浏览器可执行且无需Node builtin/polyfill，五种允许格式覆盖和错误行为可解释，有限资源内完成，给出实际构建净增与维护收益。不能把完整试验bundle体积当单库净增。任一关键条件不满足为no-go：本轮不引入签名库，保留现状和明确能力缺口，不新增手写检测器，也不阻塞F线。

## 6. 依赖顺序与未来小步提交单位

每个获准单位由主代理实施，GPT-6 Luna执行测试；正式独立审查由用户决定集中到X，不要求逐步审查。测试通过后一次本地提交，不推送。当前F0/F1/F2、P0/P1已完成；C0/C1按当前授权依次推进；未授权的X与EX-T不自动启动。

| 单位 | 依赖 | 实施范围/提交单位 | 验收与退出 |
| --- | --- | --- | --- |
| F0 命名契约冻结 | 方案获实施授权 | 记录旧新名称差异、120码点决策、后缀/替换/空名/设备名约定；固化已有对照样例，不加生产依赖 | Luna确认变更边界。若长度或不兼容输出规则未确定，停在此步 |
| F1 文件名单点替代 | F0决策明确 | 精确固定filenamify7.0.3及锁文件最小差异；用单一薄适配替换exportFile内部清洗；删除被覆盖的旧实现；同步纯模块门禁 | 只批准实际使用的filenamify/browser精确入口，不放行整个包/目录；unit/type/lint/build通过，无Node shim、额外默认截断或双实现 |
| F2 工作台/导出回归 | F1 | 核对六格式、建议名、PDF标题、导入旧文件及字节保存流程；必要最小修复与支持记录 | 不改导出入口/prepare次数/授权/取消/busy；Bun与实际浏览器一致；独立保存结果目录，避免覆盖稳定历史证据 |
| P0 图片签名隔离PoC | 独立授权，可与F线并行 | 在独立临时目录固定file-type实际发布版，核对源码/exports/许可/构建/五格式与资源成本；不改生产依赖 | 写go/no-go结论；失败不阻塞F0/F1/F2，不新增替代parser |
| P1 图片资产单点接入 | P0为go且获接入授权 | 只在documentAssets取得字节的单一边界接探针；依赖/锁/必要严格门禁+对应测试 | 不重复读流、不变更白名单/schema/哈希；一致性/解码分别验证；错误不覆盖源、不写目标文件，资源清理不回归 |
| C0 既有检查去重清单 | 可独立实施 | Luna逐项列出真实重复与可删除证据；UTF-8/schema/API守卫分开判断 | 已提交2da2d00：仅选定roleQueue同一前台快照重复预算计算；其余差异化边界保留 |
| C1 单点去重 | C0确认有收益 | 仅在roleQueue前台快照claim路径去掉重复UTF-8测量；后台懒读取与Worker边界检查保留 | 当前实施中；Luna执行目标单测与full check，通过后本地提交 |
| X 自动回归与方案收口 | F2；P/C分支仅要求已实施者完成，未做者明确标注 | Luna最终代码/文档审查、完整check及相关浏览器回归；归档实际产物与支持状态 | 不用依赖评估代替系统保存；不因P0 no-go或C0无改动而制造额外任务；保留全部手动门槛 |

F0/F1/F2是优先主线。P线和C线不成为主线阻塞项；X只汇总本轮获准且实际完成的分支。新增其他库、编码支持或运行环境需另行决策，不自动扩张。

## 7. 未来测试矩阵（本轮不执行）

| 层 | 用例 | 验收标准 |
| --- | --- | --- |
| Unicode与长度 | NFC/NFD、不可预组合音标、旗帜/家庭ZWJ/肤色；长ASCII/中文/emoji；临界预算和超长单grapheme；120旧新差异 | 字符语义变更明确，完整grapheme，最终UTF-8预算含全后缀/前缀，无隐含100单位截断；不以码点/UTF16长度冒充同一度量 |
| 名称与格式 | 六格式、`.markflow.html`、大小写/重复后缀、空名/全非法、C0/C1、斜杠/反斜杠、尾点/空格；CON/PRN/AUX/NUL、COM/LPT含上标、CONIN$/CONOUT$ | 输出与F0契约一致；替换/拒绝/回退可解释；受测规则不扩称所有OS保证 |
| 碰撞与文件I/O | 不同输入清洗同名、NFC/NFD等价、File/file大小写；安全临时目录普通文件创建读回 | 碰撞单列，不当可靠性排名；确认目标位于试验目录，设备名只分类不打开，不用设备路径前缀绕过后宣称普通保存支持 |
| 浏览器与构建 | 精确browser入口、Bun/Vite生产、已有Chromium实执行、模块门禁/TS；按条件补其他系统/浏览器 | 无Node shim/包级通配白名单；未经实测的Safari/Firefox/WKWebView/macOS/Linux保持未验，不自动安装浏览器 |
| 图片签名/解码 | PNG/JPEG/GIF/WebP/AVIF合法样例；声明不符、伪装文本、未知/短头、合法头+截断体、动画/子型/别名、缺body/分块流 | 按P0决定的精确关系处理；完整性与类型提示分列；不放宽格式、不产生第二次资源下载 |
| SVG/资源/旧数据 | 当前不允许的SVG资产继续拒绝；行内SVG/图表原净化链；10MB/25MB/128项原预算；慢流/取消/旧资产不匹配 | 原约束不变；错误保留文档源，读流/临时资源清理一致；不加SVG图片资产支持 |
| 完整导出语义 | HTML唯一内容源，MD原样/资源ZIP例外，旧导入文件、用户改名、PDF系统交接；选择取消、close失败、生成失败/手动重试 | 不变更文档ID/哈希/缓存；单次prepare，单busy、源快照与平台所有权不变；PDF标题仍只是建议 |
| 检查/归档 | 类型/lint/单元/build/相关浏览器与实际产物、源/锁差异、用户补丁 | Luna执行并审查；只归档实际发生的结果，保存于独立稳定目录；tag-release.patch不动不暂存 |

## 8. 工具、错误反馈与验收门槛

优先使用现有Bun/TypeScript/模块门禁/Playwright和适用PDF技能；实际产物的结构、视觉联系表和原生保存分开。新增候选仅在包含安装范围的实施/PoC授权后引入，固定版本，不执行无关升级。库异常转为现有可理解反馈，取消不变成错误；不吞原错误、不静默替换文件/内容或切换保存途径。

HTML继续是正文唯一内容映射和导出源，MD/资源ZIP是既定源保存例外。Web保留浏览器原生PDF交接，未来Tauri仍需独立验证系统WebView和原生保存，不以字符串库授予目录权限。MathJax3.2.2/Paged.js0.4.3不动，不引入随包Chromium/Puppeteer、截图PDF或替代PDF字节引擎。

EX-W0系统PDF文件/默认名/取消、原生字节保存的真实磁盘/覆盖/权限、Word/WPS人工显示、跨OS、干净安装及远端CI按原记录待补或未执行。本计划、文件名库或签名探针不解除[既定待验门槛](web-export-support-2026-10-29.md)，不自动启动EX-T，也不宣称完整验收通过。

## 9. 回退与停止条件

- 新依赖/入口无法满足目标构建或严格门禁、需Node shim、格式/后缀/预算契约无法保持，或净增复杂度没有明确收益：停止该步，不为引库放宽边界。
- F1失败回到上一份单一生产实现；不保留运行时双清洗器。若要改为仅用原生能力修复旧缺口，另写明确方案，不暗中实施。
- P0/P1无收益或有误拒绝现有合法资源：不引入/回退该独立分支，清楚记录未实施签名能力，F线继续，不造手工解析兜底。
- 取消、busy、流清理、接收者绑定、错误保留、同步哈希、HTML或旧源兼容出现回归：回退本步依赖/锁和代码的对应改动，禁止重置或清理用户文件。
- 回退针对本步受控差异，未来按授权本地revert/修复提交；不使用破坏性工作区重置、不推送、不移动标签。不因未验平台而引入通用平台或自动扩实施范围。

## 10. 参考与状态

- [filenamify官方实现与browser入口](https://github.com/sindresorhus/filenamify)
- [file-type官方API与检测边界](https://github.com/sindresorhus/file-type)
- [file-type当前main元数据（不是拟锁发布版本）](https://github.com/sindresorhus/file-type/blob/main/package.json)
- [WHATWG Encoding](https://encoding.spec.whatwg.org/)
- [Microsoft文件命名规则](https://learn.microsoft.com/en-us/windows/win32/fileio/naming-a-file)
- [POSIX路径/组件限制查询](https://pubs.opengroup.org/onlinepubs/9799919799/functions/pathconf.html)

本方案记录规划与授权依据；F0已提交39d042f，F1已完成并通过Luna验证，证据见执行记录和验收JSON；其他实施分支未启动。本方案本身不替代实施与测试证据。

实施授权补充：用户明确采用最终文件名组件<=255 UTF-8字节、完整grapheme、移除120码点上限；该决策已满足第4.1节兼容性批准条件，无需重复确认。详见[命名契约](export-filename-contract-2026-10-29.md)。

F0/F1进度：F0已提交39d042f；F1已完成单点实现及Luna审查验证，见[执行记录](../reviews/filename-replacement-f0-f1-2026-10-29.md)。F2、P/C/X和EX-T未因此启动；EX-W0及原生保存手动门槛不变。


F2授权与进度补充：用户明确本步不做独立代码/文档审查，集中到X；Luna只执行测试及记录格式/日志核对。F2新增7项工作台用例，完整check405项单元及五个相关spec共38项浏览器测试通过，未发现需改生产流程的问题。见[执行记录](../reviews/filename-replacement-f2-2026-10-29.md)。本轮不推进P/C/X或Tauri，不推送；既定系统/手动验收门槛不变。

P0/P1授权补充：用户授权依次实施P0、P1，测试由Luna执行，独立审查集中到X。P0隔离实测结论GO-P1，固定file-type22.2.0及APNG比较契约，见[执行记录](../reviews/image-signature-p0-2026-10-29.md)。此记录不宣称P1已完成；历史F阶段的范围描述仍按当时基线理解。

P1实施补充：已在资产异步边界固定file-type22.2.0，保留原白名单/字节/哈希及APNG比较契约；浏览器测试发现并修复原解析隐式image请求，改用惰性template。Luna最终check418项单元与34项非PDF工作台回归通过，生产模块浏览器矩阵通过；[执行记录](../reviews/image-signature-p1-2026-10-29.md)。本轮P0/P1测试完成，独立审查集中到X；C/X/Tauri未自动启动，手动门槛不变，不推送。

C0去重清单补充：GPT-6 Luna只读核实后仅选择roleQueue同一前台快照重复UTF-8限额测量为C1；sourceImport适配输出、Worker未知消息、Zod结构/语义、资产真实内容、URL授权、同步哈希等均因边界不同保留。潜在existing asset重复验延期，不跳过总量预算。证据见[清单](../reviews/check-dedup-c0-2026-10-29.md)。


C1实施补充：roleQueue只对私有前台队列快照去掉领取时重复UTF-8测量，入队前预算检查、后台懒读取检查和Worker入口检查保留。Luna目标spec13项及完整421项单测、类型/lint/边界/build均通过，见[记录](../reviews/check-dedup-c1-2026-10-29.md)。独立审查留X，本步不推送。
