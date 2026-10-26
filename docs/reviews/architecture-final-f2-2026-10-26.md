# architecture-refactor 最终完整审查与 F2 修复

日期：2026-10-26；审查起点90701ae；F1已独立提交c9e0c08。本轮按现有编辑器操作场景核对架构方案和生产调用链，不增设通用并发治理、持久化缓存或Tauri模拟层。仅本地提交，不推送、不合并、不移动标签。

## 确认问题与处理

| 编号/级别 | 触发及影响 | 修复与证据 |
| --- | --- | --- |
| F1 / P2 | 原始HTML包装跨Markdown空行，ZIP重写图片时DOM序列化提前闭合标签并改写原文格式 | [F1记录](architecture-final-f1-2026-10-26.md)及独立提交c9e0c08；属性源码区间替换，311单元/76 Chromium通过 |
| F2 / P2 | 结果到达时观察到超时，外部Worker适配器同步回送终止确认；嵌套receive已结算，外层仍再次finish，产生两次释放/完成通知 | 超时检查后重核当前实例、当前run及settled，已结算立即返回。只加局部守卫，不改变队列/Worker数量/期限；新增回归先失败（通知2次），修复后只1次，迟到结果不交接，资源只清理1次 |
| D1 / 文档一致性 | AR-01 3.2仍要求未来多目标保存修订及关闭Tab处理导出；第6节又隐含当前生成取消，与第6节现行规则/代码冲突 | 明确当前Web按来源文档revision/savedRevision记录草稿保存；Tauri源写回状态后续加入；关闭Tab/弹窗不取消或阻塞冻结导出；当前没有应用生成取消 |

F2复现采用可控时钟：时间已到、定时器尚未派发，由结果回调观察超时；适配器同步回送与真实Web terminate相同的终止确认。不是频繁切换/大量并发压力假设。首次直接复现及新增单元均观察到2次释放，未通过放宽期限掩盖问题。修复保留超时失败、停止确认、旧实例/taskId拒收及清理后再复用。

## 完整审查矩阵

| 主题/需求 | 核对调用链与结论 | 验证范围 |
| --- | --- | --- |
| 多Tab / AR10、E04、E09 | App → DocumentSessions；单激活，重复打开保留已有草稿；独立undo/redo、位置、dirty；关闭脏文档等待保存修订且失败保留。切换不取消保存，导出不markSaved | 会话单元、真实workbench-tabs/source-import、坏存储恢复与保存失败 |
| 统一切换 / AR02、AR04、E02、E04 | PreviewActivation唯一activate；切出/切入相关未完成任务作废，切出后台从头排队；无关后台不取消。完成与展示按taskId/键/当前文档分别核验 | activation/completion及生产延迟切换、后台只缓存回归 |
| 队列 / S05—S07、E03 | RoleTaskQueue最新前台需求、后台文档/模式轻量引用与FIFO；替换不改变FIFO位置，执行再读源文。RoleTaskScheduler/RoleExecutor固定角色，逻辑任务等待DOM仍占角色槽位 | 队列单元、真实双Worker开发/构建/HTTP，峰值每角色1 |
| 停止与期限 / AR04—AR06、E07 | 旧回调先核实例/run/taskId；超时为failed原因，不续期。F2补齐同步终止确认重入守卫；终止/清理未完成不复用；无自动任务重试 | F2新增可控边界及原有timeout/stop/late callback/重建回归 |
| 资源与DOM / S08—S10、E08 | 局部CleanupList；一个SharedDom在步骤边界按export/foreground/background选择，不抢占同步步骤。MathJax文档状态与Mermaid样式隔离，分页宿主/样式清理 | 公式/图表/分页跨文档、失败/取消清理及shared-dom真实集成；同线程硬抢占仍不承诺 |
| 缓存 / AR11—AR12、E05—E06 | MemoryPreviewCache同步Map；文档/模式/原文UTF-8 SHA-256/配置版本键，完整校验后put；LRU/估算字节有界，活动引用不被误淘汰，会话只存可失效引用 | 命中不重新生成、MD/配置失效、半成品与迟到拒绝、淘汰及flow/A4独立缓存 |
| 生产组合 / AR01、AR07—AR08 | WorkbenchPreviewRuntime → MarkdownWorkerRuntime → 统一协调器；Worker纯解析/映射，DOM引擎在主宿主；application不直接依赖Web/UI/引擎。未发现旧TaskSupervisor/ExecutorPool/needsRender/queueDeadline路径 | 四环境严格类型、源/模块门禁、消息schema、真实HTTP/模块失败恢复；不将DOM伪装为Worker |
| 统一导出 / AR03、E10—E11 | UI → webExportService → ExportService单busy，首个await前固定来源源文/选项；prepareExportContent固定资源字节/SHA-256，各生成器复用。纯MD直接下载；ZIP只改受支持引用；HTML离线与载荷往返；DOCX保留降级接受；PDF独立A4生成，不读预览DOM | 接受后编辑、切Tab、busy、失败手动重试、ZIP真实解包、HTML离线、DOCX结构、PDF四种预览状态及就绪/清理 |
| 平台反馈 / AR07、S11、S14 | Web下载只确认发起，PDF只确认交由浏览器；关闭弹窗不表示取消。Tauri文件权限/目录访问/原子写回仍是未来适配，未引入SDK或预建交付锁 | 本机Chromium当前Web路径；未宣称用户磁盘保存或系统对话框验收 |
| 三视图 / E11—E12 | 源节点/行区间同步、大纲定位/高亮、7种非空显隐、最后视图保护、横滚、宽度弹窗与Tab恢复继续沿用 | 生产工作台回归；本步不改界面样式，沿用V1已记录视觉边界 |

时限检查并非缺少result路径检查：原代码在短路表达式左侧已对所有消息执行check；实际缺陷是该检查可同步触发嵌套终止确认。按实证修复重入后续处理，没有为假设场景额外增加计时器。

## 严格化、范围及残余限制

MathJax 3.2.2、Paged.js 0.4.3及其适配器字节与审查起点一致。F1仅声明既有parse5 7.3.0直接依赖，包版本集合不变；F2不调整依赖。冻结A0证据和运行预算保持原样。

本轮没有为旧复杂模型恢复通用监督器/租约/恢复票据、排队期限或needsRender；导入与导出独立于预览治理。源保存仍沿用现有存储后端及恢复机制，无数据迁移。架构审查与产品完整性分开：完整编辑器/高亮搜索目标、整应用PWA离线更新、完整Graphviz、插件manifest/conformance、复杂MathML/字体、Word/WPS实际视觉等既有缺口仍按[V2记录](architecture-v2-implementation-2026-10-26.md)后续跟踪。EPUB、Tauri及持久化缓存不在本轮实施。

审查覆盖当前源码及模块引用、架构方案与测试；没有远端CI、全浏览器或1.0就绪认证。已确认代码问题按F1/F2分别修复验证；范围内未遗留已知P0/P1。Web同线程DOM不能硬抢占，系统PDF交付不能确认落盘，估算内存不等于物理堆上限，均保持现有明确边界。

验证：bun run check退出0，167个受管源/配置覆盖、312项单元、严格类型/lint/模块门禁/生产构建通过；完整Chromium 76项通过（2.8m）。没有推送、合并或移动标签。其他浏览器、Word/WPS、Tauri及系统实际保存未验收。
