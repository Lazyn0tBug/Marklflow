# M0：桌面迁移基线与平台契约冻结（2026-10-29）

状态：GPT-6 Luna独立审查与验证通过，无未解决问题。此步骤只形成文档和不可变来源清单，不实现SDK、桌面功能、换行或分栏。迁移路线见[总方案](tauri-migration-plan-2026-10-29.md)，对象清单见[基线JSON](../contracts/tauri-migration-m0-baseline-2026-10-29.json)。

## 1. 冻结范围与工作区保护

| 项目 | 冻结值/判断 |
| --- | --- |
| 当前目标 | architecture-refactor，6c4c4d9ea462049f9e0928a15b9d25d1e661908c；用户仅在4fa50be后提交迁移方案 |
| 当前业务基线 | 4fa50bede4761151d8447331d422b94f00d79aa7；M0不改变生产树 |
| 桌面参考 | tauri，c7c34b942d67fe92d8df242c052b5457c5d14765 |
| 共同祖先 | 75261ae1e532630a5a5859c397110f31698964af |
| 内容校验 | JSON保存完整commit/tree和35个目标文件Git blob；按固定提交比较，不用未来HEAD替代历史基线 |
| 预存未提交内容 | 两份architecture索引补记已在本次开始前存在，SHA-256见JSON；保留，不暂存或纳入M0提交 |
| 当前运行约束 | 单次本地提交、不推送、不创建或移动tag；未启动M1/E0/EX-T；不安装依赖 |

来源按冻结tauri SHA取用，之后tauri分支变动须先重新比较，不跟随分支指针静默加入。17个参考提交完整SHA列入JSON。M0没有进行cherry-pick；后续选择性迁入形成新提交并注明来源。

## 2. 迁入与排除决定

- 桌面壳：以38e00db的src-tauri/依赖和后续图标、窗口能力为来源，只迁匹配当前严格门禁的壳、配置和最小桥接。当前没有src-tauri工程，不把计划视为可构建桌面成果。
- CI：以冻结tauri最终tauri-build.yml为跨OS/bundle来源，保留其macOS universal、Ubuntu依赖、Windows安装包/ZIP经验。普通ci.yml保留当前门禁与脚本；依赖仅增量更新bun.lock，不搬旧package-lock或覆盖当前锁文件。
- 共享编辑：3686eed用于软换行/行号测量，74d7a3c用于分栏交互；按E0→E1→E2适配当前sourceScroll/会话。原分支仍有固定24px的App定位逻辑，不能直接复制作为完整同步实现。
- 排除旧App/ExportModal整体替换、meta.filePath领域字段、宽泛文件权限、旧补丁中心、OMML/SVG图片白名单变更、旧PDF临时HTML占位命令。保留当前业务和HTML唯一正文输出源。
- MathJax3.2.2/Paged.js0.4.3不变；预览任务、同步哈希、缓存和单次HTML准备不另建第二套实现。

## 3. 当前端口与后续适配契约

本节冻结的是后续实现必须遵循的行为，不宣称新增端口已存在。M0不把下面的拟议接口写入生产类型。

| 领域 | 当前接口/事实 | 后续匹配决定与实施归属 |
| --- | --- | --- |
| 导出应用服务 | ExportService持有一次busy；ExportPorts组合统一生成函数和平台交付。Web singleton位于platform/web/exportService | 组合入口只选择Web/Tauri平台实现；不在组件分散环境判断。M1仅桥接，M9才接生产导出 |
| 字节目标 | selectSave(ExportFile)→ByteSaveTarget或undefined；save(Blob)→saved/download-started | 保留该共同契约。undefined只表示用户取消；异常抛出；Tauri先选目标后生成，确认后才写，提交成功才saved。M3独立I/O验证，M9导出组合 |
| 名称 | ExportFile负责六格式、完整后缀及255 UTF-8字节、完整grapheme | Tauri沿用name/mime/extension，不重复补后缀。原生路径保持平台内部，不混入建议名 |
| PDF交付 | 当前deliverPdf(html)→Promise<void>；服务文案固定浏览器处理；HTML已由generatePdfHtml生成 | M9最小调整为平台可观测回执：handed-off/saved/cancelled，并传ExportFile作为名称上下文。handed-off仅交接；Web不推断取消/保存，Tauri只在真实提交可证时saved。具体类型在M8能力验证后落实，不新增生成入口 |
| 导入 | SourceImport<F extends {name,size}>，ports.read返回文本；统一后续格式/NUL/schema/资产/会话校验 | 原生文件用不透明键关联平台路径，read内部限额读字节并严格UTF-8解码。打开/多文件拖放共用单批次；错误不吞成取消。M3/M4 |
| 会话 | DocumentSessions按ID管理唯一激活、undo/redo、dirty及位置；重复open聚焦原草稿 | 规范文件身份→已有文档ID由本地绑定查询，查到后聚焦而非覆盖。源附件不授予路径访问权限，不能由旧filePath自行绑定。M4 |
| 草稿保存 | App在700ms后调用saveSource→saveDocument→现有仓储；只对当前匹配修订markSaved | 保留现有草稿保存定义，不改为自动写原文件；原文件写回结果不得让较新修订变成已写回。M5另加绑定的已写回修订 |
| 资源 | DocumentAsset保存冻结data/bytes/SHA；五种MIME、APNG兼容比较、file-type与限额已存在 | 本地解析/读取归平台；校验/冻结归既有资产边界。上下文/冻结资源变化更新配置版本，MD本身不改写。M6 |
| 标题/关闭/拖放 | 当前UI会话与Web生命周期 | 原生事件只调用应用操作；原生窗口关闭须考虑草稿及原文件未写回状态。监听异步完成后若已卸载立即解除，避免重复订阅。M4/M5 |

所有SDK import只在现有门禁允许的src/core/platform/tauri或src/platform/tauri内。纯应用模块、任务消息、缓存键和输出附件不持有原生路径/句柄。无需通用平台注册器、第二套任务队列或通用权限服务。

## 4. 源文件操作与状态冻结

| 操作 | 接受时/完成时规则 |
| --- | --- |
| 打开/拖放 | 用户选出的文件标识建立本次授权；已绑定文件聚焦已有Tab，不能以磁盘内容覆盖草稿；失败保留原文、现有Tab与绑定 |
| 草稿自动保存 | 继续保存应用仓储，确认草稿修订；不影响磁盘已写回修订，不访问原文件 |
| 保存原文件 | 接受时冻结文档ID、revision、源格式与绑定目标；成功写出后记录该绑定的已写回修订。切Tab不重定向；较新修订仍提示未写回 |
| 另存为 | 接受时冻结快照，成功提交后更新对应文档绑定；失败/取消不改旧绑定、标题或写回状态。同一原生目标被其他打开文档绑定时不静默把两个Tab合并或覆盖其草稿，M5明确冲突反馈 |
| 保存源格式 | .md/.markdown/.txt沿用精确Markdown源字节策略；可编辑HTML沿用同HTML正文+源附件路径，不能将MD字节写回.html；源保存外层负责确认写回，格式生成不自行markSaved |
| 导出 | 独立目标，不更新原文件绑定或markSaved；single prepare、DOCX一次确认和平台写入清理保持 |
| 关闭Tab/窗口 | 同时考虑草稿dirty与本地绑定已写回修订，不能把草稿持久化当原文件保存完成。用户选择取消/保存失败则保留；写入完成只确认接受修订 |

本地绑定最小内容：平台内部文件标识/规范路径、文档ID、显示名、源格式和已写回修订；应用仅持有不透明绑定键和可显示状态。绑定默认本次会话有效，不恢复旧路径为可写权限；跨重启原位保存/最近文件需后续明确授权与验证，不在M0扩展。

## 5. 配置与存储兼容决策

| 既有内容 | M0决定 |
| --- | --- |
| DocumentRecord schemaVersion=1 | 保留，M1不加filePath、不升级或批量迁移文档schema；M5/M6的本地状态在平台侧 |
| IndexedDB | 现有markflow_db/v1，documents与metadata存储；保留原后端选择、事务提交与恢复行为，不因桌面启动清库/重建 |
| localStorage旧数据 | markflow_docs、markflow_recovery_v1、恢复前缀markflow-recovery:保留；不自动迁移/合并旧后端，不覆盖损坏原值 |
| Web与桌面origin | 各自存储独立；Tauri首次打开不承诺自动看到浏览器草稿。既有可编辑HTML/MD显式导入仍是可用迁入路径，不搬浏览器profile/login/cache |
| 旧Tauri源载荷含meta.filePath | 只按当前schema/恢复规则受理，不从被剥离或未信任的字段重建权限。若文档含当前不支持的SVG图片资产则明确失败并保留原件，不扩白名单来迁就旧数据 |
| 现有视图偏好 | 基线App状态为三视图开启、flow、syncScroll开启、共享contentMaxWidth=1024；这组布局值目前主要为React内存状态，不伪称已有统一偏好存储 |
| 旧Tauri split偏好 | 原来源使用markflow_split_ratio；E2可在本origin存在该值时只读校验合法比例并导入新偏好，不跨origin扫描。持久化不可用时使用内存默认，不破坏文档保存 |
| 新软换行/分栏设置 | E1默认soft wrap开启、E2默认1:1。配置放现有弹窗，比例与max-width分离；不添加到文档主题/输出HTML。E阶段确定有界偏好结构与存储键，不先造全局设置平台 |
| 编辑位置 | 选区为字符offset，基线scrollTop/scrollLeft为像素。E0在会话位置追加可选逻辑锚点，旧无锚点数据保留兼容回退；不把工作台位置持久化进DocumentRecord |
| 缓存 | 同步Map内存缓存、document/mode/MD hash/config版本契约保留；调整工作台布局只重算几何，不清空产物或重新分页；本地资源上下文改变按M6失效 |

## 6. 质量与阶段门槛

现有X证据为历史基线：198受管源/配置、58单元文件、421项单元及34项非PDF浏览器回归通过；见[X验收](../acceptance/third-party-boundary-x-2026-10-29.json)。M0重新执行的检查另记，不能把这些旧计数冒充本轮结果。

- 本次授权仅M0：冻结与审查验证，通过后本地提交；M1、E0及桌面CI均未启动。
- M1—M6、E0—E2为准备/共享交互；M7/EX-T0仍要求完整EX-W3通过。M8/M9/M10分别遵守原EX-T1/2a/2b；M0不取消或改写该前置。
- EX-W0系统PDF文件/默认名/取消、原生字节保存磁盘/覆盖/权限、Word/WPS显示仍待补；跨OS、干净安装和目标分支远端CI未验。完整EX-W3/发布仍未通过。
- 用户确认旧Tauri的OS/bundle CI已验证，作为来源事实保留；本轮未取远端run记录，也未在目标提交运行，不能标记目标矩阵通过。
- M2先本地工作流适配/检查；远端矩阵要在后续授权推送/运行后取得。M10声明支持的OS须有对应真实包与文件操作证据，未验OS保持未验。

## 7. M0验证与提交单位

GPT-6 Luna执行独立审查与验证：不可变SHA/tree/blob/17来源祖先校验、当前端口/存储语义对照、阶段依赖、Markdown本地链接/JSON结构/空白检查；建立本轮完整bun run check基线。M0不改生产代码，不需要重复浏览器PDF或系统保存验证，也不新建镜像实现测试。

主代理修复发现的文档/契约不一致，再由Luna复核；最后保存独立验收记录，更新总方案M0状态，仅暂存M0文档、清单、验收与总方案。两份预存索引修改原样留在工作区，不进入此提交。停止在M0，不自行推进M1。

## 8. 本轮完成证据

Luna完成13项基线/工作区/JSON/链接及检查事实核验，均通过；35/35目标blob、17/17来源祖先及2份预存索引SHA-256一致。完整bun run check退出0：198受管源/配置、58文件、421项单元，以及类型/lint/边界/生产构建通过。当前结果见[本轮验收记录](../acceptance/tauri-migration-m0-2026-10-29.json)，日志D:/codex/m0-migration-check.log；清单内X计数仅为捕获时历史基线。未运行新浏览器/原生保存/桌面构建或远端CI，未修改生产代码、依赖或预存索引。M0收口后停步，后续阶段仍待授权。
