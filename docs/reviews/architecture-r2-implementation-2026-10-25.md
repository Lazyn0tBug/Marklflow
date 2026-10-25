# R2 实施与审查记录

日期：2026-10-25；分支：architecture-refactor；父提交：95183fb。依据AR-03草案6 R2；不推送、不升级MathJax、不替换Paged.js。

## 实现

前台仅保留一个最新待办，flow/A4之间也覆盖；执行中的任务仍占角色槽，停止/切换不在本步重写。后台待办只保存taskId、角色、documentId、previewKind及估算字节元数据，不保存正文、配置快照、缓存键或逐任务闭包。按文档/模式合并，替换保留FIFO位置，不同模式分别排队。

一个构造时注入的同步PreviewReader回调提供当前文档与配置版本；后台claim时才取得、校验并拥有最新快照及计算MD散列。回调未来接U3会话，队列不建立第二份文档存储。enqueuePreview入参沿用R1严格类型，后台分支只提取标识，不保留入参对象。

删除NeedsRender/dirty、expire/nextExpiry/expiresAt、排队deadline及调度器排队计时器。导出也无排队期限；执行总期限从dispatch起计。阶段期限、取消宽限及原平台等待规则暂留，按R3b/R4继续收缩。每角色最多1活跃，停止清理前不放行；导出单busy及下一可用步骤优先保持。

文档缺失、读取错误或dispatch预算失败记录失败，不占活跃槽，不阻塞后续待办；无needsRender或自动重试。关闭文档移除对应待办，不影响其他活跃文档。完整执行快照归调度器运行记录，活跃槽仅保存ID/角色/字节计数。

## 自审与范围

运行策略architecture-dual-worker-budget.json改为schemaVersion 3、foregroundPending=1，删除后台等待到期字段。U0旧版由Git历史及原证据保留，不维护另一套重复运行策略。冻结A0的architecture-runtime-budget.json及全部历史证据JSON未改。原JSON乘3/16MiB仍是估算，R3b去重、U5b实测，不宣称物理堆上限。

仅改纯任务组件及其策略/夹具/测试。生产UI、渲染、存储、实际导出入口、依赖和锁文件不变；真实双Worker、Tab UI和完整缓存提交仍未接入。未提前实施R3。

## 验证

- 相关37项测试通过。
- bun run check通过：四环境类型、106受管文件、source/boundaries/lint、162项单元（29文件）及生产构建。
- 开发及构建后真实Worker烟测2项通过；不等于生产双Worker调度验收。本轮未重跑完整应用E2E。
- 核对修改前文件散列及所有Git引用：生产入口、依赖、冻结预算和历史证据不变。git diff --check通过。
- 既有Vite __dirname及大分块提示保留。中断时保存记录曾因自动审批服务使用限额未执行，用户继续后重新通过正常审批完成；未绕过审批。

证据：[R2验证记录](../acceptance/architecture-r2-evidence.json)。本步通过后仅一次本地提交，不推送；后续从R3a开始，尚未实施。
