# R0/R1实施记录

分支：architecture-refactor。依据AR-03草案6；不推送、不升级MathJax、不替换Paged.js。

## R0：删除旧治理独立入口

删除未被生产代码使用的TaskSupervisor、TaskQueue及两份专用测试。保留共享contracts/identity/lifecycle/resources/deadlines/executors，后续按消费者收缩。真实Worker烟测仅构造角色调度组件；同步返回值编译负例改指向generated边界，不删除此约束。

旧队列专属恢复票据与100次编辑测试随旧实现移除；产品交互/存储恢复回归未删除。会话容量由R1守卫测试补验。草案6及此前未提交审查文档作为实施依据一并纳入R0，不另创建规划提交。

验证：bun run check通过（四环境类型检查、105受管文件、source/boundaries/lint、153项单元、生产构建）；开发及构建后的真实Worker烟测2项通过。自审确认src中无旧监督/队列引用，生产UI、渲染器、存储、依赖及锁文件未修改。测试数由176降至153，减少的23项仅属于已删除的旧监督/队列专用测试；未据此宣称双Worker生产接入。既有Vite配置/大分块提示未新增。R1尚未实施。
