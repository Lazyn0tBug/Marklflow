# R3a 实施与审查记录

日期：2026-10-25；分支：architecture-refactor；父提交：994f782。依据AR-03草案6 R3a；只做一次本地提交，不推送，不升级MathJax、不替换Paged.js。

## 改造

删除executors.ts的ExecutorPool及compute/DOM动态通道Map。新增RoleExecutor，每个实例固定foreground或background角色，只有一个已安装适配器、一个当前执行记录；RoleTaskScheduler固定持有两个RoleExecutor，不再维护额外installed注册Map。ready/supports/start/stop直接作用于该角色，无lane参数。

WorkerAdapter替换TaskExecutor，删除lane、requiresDOM/isolation/rebuildable/concurrency能力注册字段。接口只保留实例ID/代次、停止方式、有限任务种类及start/stop。移除恒为1的attempt消息字段，不引入重试框架。DOM不属于该计算适配器，后续U6共享DOM入口另行接入，不将角色与compute/DOM环境混用。

适配器内部只保留idle/running及阻止继续使用的blocked标志：未停止/清理失败时仍持有当前执行，确认停止与清理成功才释放；实例已经失效或被物理终止后需显式安装新实例。没有quarantined/restarting/disposed状态机或替代宿主池。

回调先检查安装实例对象和当前执行对象，再检查taskId/实例头、从unknown校验消息、核对完整最小执行身份。旧实例/旧任务的迟到回调和资源登记不能影响新任务。安装拒绝未释放执行和重复/旧实例；前后台拒绝共享同一实例标识。停止确认核对是否已请求停止以及适配器是否允许terminated证明，避免错误回执被当作健康完成；停止函数抛错保留占用并反馈错误。

## 审查范围

保留R2轻量后台FIFO和最新前台需求，不修改源读取、Tab切换或缓存规则。现有资源账本、清理重试、停止宽限与执行期限暂留R3b处理，未通过删除这些保护降低本步验收。没有构造真实Worker，也没有新增DOM执行宿主。

本轮组件及测试说明不等于生产双Worker已经运行。生产UI、渲染、存储、导出入口、依赖/锁文件和历史预算/验收证据保持不变。

## 验证

相关28项适配器/角色调度测试通过。bun run check通过：四环境类型覆盖106受管文件、source/boundaries/lint、167项单元（29文件）及生产构建；开发/构建后的真实Worker导入烟测2项通过。未重跑完整应用E2E，未验证生产双Worker。测试覆盖停止后异步清理、未确认停止不复用、旧实例同taskId、同实例旧taskId、畸形消息、外部停止回执、迟到资源及停止抛错；保留并新增编译负例，禁止泛化lane与attempt协议回流。


自审与修改前散列对比确认生产入口、依赖/锁文件、冻结预算及历史证据不变，所有Git引用在提交前不变。git diff --check通过；既有Vite __dirname及大分块警告保留，没有新增依赖或忽略规则。证据：[R3a验证记录](../acceptance/architecture-r3a-evidence.json)。本轮到R3a为止，R3b尚未实施。
