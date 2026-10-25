# R0/R1实施记录

分支：architecture-refactor。依据AR-03草案6；不推送、不升级MathJax、不替换Paged.js。

## R0：删除旧治理独立入口

删除未被生产代码使用的TaskSupervisor、TaskQueue及两份专用测试。保留共享contracts/identity/lifecycle/resources/deadlines/executors，后续按消费者收缩。真实Worker烟测仅构造角色调度组件；同步返回值编译负例改指向generated边界，不删除此约束。

旧队列专属恢复票据与100次编辑测试随旧实现移除；产品交互/存储恢复回归未删除。会话容量由R1守卫测试补验。草案6及此前未提交审查文档作为实施依据一并纳入R0，不另创建规划提交。

验证：bun run check通过（四环境类型检查、105受管文件、source/boundaries/lint、153项单元、生产构建）；开发及构建后的真实Worker烟测2项通过。自审确认src中无旧监督/队列引用，生产UI、渲染器、存储、依赖及锁文件未修改。测试数由176降至153，减少的23项仅属于已删除的旧监督/队列专用测试；未据此宣称双Worker生产接入。既有Vite配置/大分块提示未新增。R0提交：2243c5f。

## R1：最小预览身份

预览包改为protocolVersion/taskId/role/document/cacheKey，不再嵌套旧TaskRequest。缓存键仍为documentId/previewKind/mdHash/renderConfigVersion；源document.revision只属于编辑/保存记录，MD相同但revision不同时可复用缓存键。

共享请求身份缩为协议/taskId/documentId，预览附缓存键、导出保留自己的授权快照；没有为旧执行器合成多指纹兼容票据。产物删除重复的引擎/布局/资源/策略指纹，资源内容SHA-256保留。资源登记同步去掉snapshot/session身份字段，账本机制留待R3b收缩。生产导出/资源授权函数未修改；具体平台访问限制不因删除未使用的授权floor而取消。

IdentityGate仅保留打开文档、当前激活文档及每文档/模式当前taskId。关闭清掉对应ID，新任务使用模块内不复用的序号；完成时检查当前ID，旧编辑/关闭文档的结果不交给消费者。这里不实现U3完整Tab切换或U4缓存提交。角色队列仍暂保留原到期/needsRender，R2才删除；执行器代际仅留在适配器，通用执行池/资源/期限继续由R3收缩。

createPreviewSubmission在输入边界校验并拥有文档快照、只计算一次原文UTF-8 SHA-256；previewSubmissionSchema供unknown外部消息验证。内部队列/调度接收严格类型，传递时按输入拥有、执行器隔离和对外快照需要保留结构化复制，不重复parse或hash。ExecutorPool仍从unknown验证回传消息；已验证产物不在调度层再parse。

验证：bun run check通过，四环境类型检查覆盖106受管文件；source/boundaries/lint、159项单元（29文件）、生产构建通过；开发/构建后的真实Worker烟测2项通过。本轮未重跑全部30项应用E2E；生产UI/渲染/存储入口未变。新增6项针对会话容量/关闭、任务ID不复用、旧结果拒收及内部不重复散列的测试；未扩大编译忽略或移除既有负例。自审确认无activationEpoch/snapshotId/sessionGeneration/多指纹/恢复票据残留于任务代码。

验证中修正了新测试误取前台槽位的问题，最终检查通过。既有Vite __dirname与大分块提示不影响通过；未升级/安装依赖。证据见architecture-r0-r1-evidence.json。后续从R2继续，未提前实施R2、R3、U3。
