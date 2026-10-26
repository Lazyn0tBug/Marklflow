# V1 综合代码与需求审查

日期：2026-10-26；范围：草案6 R0—P5当前生产实现、S01—S16、AR01—AR12及E01—E12。历史阶段记录保留原时点语义；当前结论不将架构重构等同于1.0全部产品门槛达成。

## 本轮修复

| 问题 | 修复及验证 |
| --- | --- |
| 导出弹窗缺少dialog语义、焦点约束与Escape返回 | 增加可访问名称、输入标签、初始焦点、Tab首尾循环、Escape关闭和触发器焦点恢复；桌面与390px真实浏览器验证 |
| “取消”易被理解为终止生成，“下载原始MD”实际仅选择格式 | 统一为“关闭”“原始 Markdown”，格式按钮增加aria-pressed；关闭只结束弹窗，不取消已接受的冻结操作 |
| 资源包描述可能被误读为任意HTML/CSS资源皆可打包 | 明确为已收集图片及受支持图片引用；不承诺CSS背景图/srcset等任意资源重写 |
| 当前文档的关闭来源Tab规则仍要求等待/取消，与冻结操作独立语义冲突 | AR-01及收缩方案同步为关闭不影响已接受导出；不引入取消框架。AR-03的旧授权/UI后续状态明确为历史 |

未新增执行状态、权限票据、重试编排或并发平台；未更换库。PDF直接生成完整A4交付文档，A4工作台不是必经步骤。

## S01—S16收缩核对

| 条目 | 当前实现与裁决 |
| --- | --- |
| S01 | 四严格配置、源与依赖门禁、存储恢复保留；application纯边界不导入Web/UI/引擎 |
| S02 | contracts/identity保留有限消息、taskId与实例身份；无activationEpoch、授权floor、恢复票据链 |
| S03 | previewIdentity按文档/模式/MD UTF-8 SHA-256/统一配置版本建键；修订不作为预览身份 |
| S04 | 运行/停止中/计算交接/完成/失败/取消；generated仅表示交接，完整校验与缓存提交后才completed |
| S05 | 旧通用supervisor/executors/resources/lifecycle移除；生产WorkBenchPreviewRuntime组合唯一协调器，未保留第二个顶层预览入口 |
| S06 | roleQueue/roleScheduler固定两个角色，各自1活跃；后台FIFO合并保持位置；生产双Worker已接入 |
| S07 | 前台最新需求、后台文档/模式引用；派发再读最新快照，无queueDeadline/needsRender |
| S08 | CleanupList局部清理、Worker/DOM适配器各自持有宿主；失败保留诊断，不用通用资源租约 |
| S09 | RoleExecutor固定角色，旧实例/taskId拒收；停止清理后才能复用或重建，无通用执行池 |
| S10 | 执行期限与资源/引擎/分页必要保护保留；排队和系统对话框不设期限；同线程DOM不能承诺硬抢占 |
| S11 | ExportService独立busy和同步接受快照，生成端口复用；下载只反馈发起，PDF只反馈交由浏览器；不自动重试 |
| S12 | 单处运行估算及文档/资产/缓存有界；不是物理堆保证，固定预算/A0证据不回写 |
| S13 | MemoryPreviewCache同步Map、LRU、可失效引用；会话/撤销不由缓存拥有，持久化后端留C阶段 |
| S14 | Web资产净化/访问规则/SHA-256保留；不引入Tauri SDK或未来授权模拟 |
| S15 | MathJax3.2.2、Mermaid/DOT现有路径、Paged.js0.4.3接唯一sharedDOM；数学宏/编号及图表跨文档状态有真实浏览器回归 |
| S16 | 保留正常操作、可控延迟/失败/迟到结果验证；没有新增广泛排列压力平台，未宣称堆泄漏验收 |

检索src/tests未发现TaskSupervisor、ExecutorPool、needsRender、queueDeadline、activationEpoch或recoveryTicket遗留。直接renderDocument/paginateDocument仍可被导出及测量调用，属于明确生成函数，不是重复生产调度所有者。

## AR01—AR12与E01—E12追踪

| 需求 | 实际核对与证据入口 |
| --- | --- |
| AR01 / E01 | check-module-boundaries、check-source-policy及四环境类型覆盖；纯会话/缓存/调度/导出与平台组合分开 |
| AR02 / E02 | PreviewActivation提交检查taskId/缓存键/当前文档；旧结果不能入库或覆盖视图；preview-activation与workbench-tabs用例 |
| AR03 / E10 | ExportService首个await前复制源与选项；prepareExportContent固定实际资源；HTML/DOCX接受后编辑、ZIP散列及PDF独立预览状态用例 |
| AR04 / E04 | 统一activate作废切出/切入未完成任务，停止清理后重排；完成缓存恢复；无关后台任务继续 |
| AR05 / E08 | RoleExecutor及sharedDOM的局部清理、失败保留及显式恢复；真实分页/图表/公式临时宿主回归 |
| AR06 / E07 | MarkdownWorkerAdapter外部terminate、实例检查和新Worker重建；dual-worker及模块失败恢复真实用例；DOM仅协作边界取消 |
| AR07 / E09、E11 | 源导入/源保存函数端口与Web适配分开；普通HTTP生产Tab/Worker、离线HTML及坏存储恢复回归；Tauri仍后续 |
| AR08 / E12 | 严格配置、消息schema、lint、单元、构建及Chromium；逐步证据记录范围，不以替身冒充真实执行 |
| AR09 | 无MathJax升级、无Paged.js替换；P3仅将既有JSZip运行用途移至dependencies，版本3.10.2不变 |
| AR10 / E03、E04 | DocumentSessions唯一激活文档，独立编辑历史/位置/dirty；前后台串行/FIFO与真实生产Tab测试 |
| AR11 / E05、E06 | 完整产物同步入Map，按散列/配置查找、LRU/字节有界；会话仅引用，Tab恢复计数验证不重新生成 |
| AR12 | 产物可序列化、缓存键版本明确，平台存储不泄漏至会话规则；后续异步后端需另加端口，当前不预建模拟 |

## 保留缺口

原产品需求按[A0追踪](architecture-a0-baseline-2026-10-25.md)继续有效：完整编辑器/CodeMirror与高亮搜索目标、PWA整应用离线及更新、完整Graphviz、插件契约覆盖、外部Word/WPS视觉、复杂MathML/实际字体覆盖需后续专项验收。EPUB、Tauri、持久化缓存和引擎替换保持原后续阶段。本轮仅验证现有DOT降级路径，不宣称新增Graphviz。

架构审查范围内未发现未解决P0/P1；源保存不丢失、导入失败不覆盖、导出反馈及临时节点清理的既有故障测试继续执行。已知打包体积和Vite配置提示保留，未作为本次依赖/构建重构扩大范围。
补充目视修复：390px截图中底部按钮挤压折行，改为窄屏上下两排并保留完整按钮文案；MD/资源包诊断不再留空。AR-02中缓存“未实施”和P2后续状态同步为当前事实。
视觉验收：1280px及390px实际截图已检查；窄屏操作区上下分组，关闭与导出文案不折行。Impeccable检测无命中。浏览器测试同步新文案；初轮旧“取消”定位导致等待，修正测试定位后执行完整复验，未修改产品等待期限。

验证：bun run check通过，四份严格配置覆盖167个受管源/配置，309项单元通过，lint/模块边界及生产构建通过；完整Chromium 75项通过（2.9m）。仅记录本机实际结果；其他浏览器、Tauri和Word/WPS视觉未验收。保留既有构建提示。未推送、未合并、未移动标签。
