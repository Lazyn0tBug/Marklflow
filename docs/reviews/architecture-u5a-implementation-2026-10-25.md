# U5a 单真实Markdown计算Worker实施与审查

日期：2026-10-25；分支：architecture-refactor；父提交：6dc62ce。依据草案6 U5a；一次本地提交，不推送、不接应用UI、不启用生产双角色。

## 纵向实现与协议

新增workers/markdownWorker.ts，以模块Worker接收unknown；workerStartSchema仅封装现有协议版本、TaskRequest与ExecutionIdentity，不增加新的票据/代际链。验证任务身份、MD散列及实例关联后开始解析；输入不合格且执行身份可归属时返回现有input错误，无法归属的坏消息丢弃，由调用侧原期限处理。当前只支持preview.flow；preview.a4不冒充已分页。

计算端复用现有unified/remark纯解析器，一次解析生成语义区块、大纲和原文范围。输出为schemaVersion 1的可序列化解析摘要（blocks/outline），不跨线程传DOM、引擎或整个MDAST对象，不生成HTML/公式/图表/页面。TaskArtifact使用application/json，并从同一组区块构造sourceMap。保留MD UTF-8大小、语义节点数及产物大小限制，计算异常使用原engine错误消息。

core/platform/web/MarkdownWorkerAdapter实现原WorkerAdapter，持有一个常驻真实模块Worker；每次只有一个请求，任务清理确认后可在同实例顺序处理下一个。旧任务/实例消息在完整解析前过滤；当前坏响应、浏览器error/messageerror有明确host反馈。硬停止调用terminate并返回现有terminated证明，此实例不再复用；重建和双角色策略仍归U5b。任务局部清理释放回调引用，常驻Worker由适配器dispose负责；不会在每个任务完成时增生新Worker。

workspace的必需完整性断言接入validateMarkdownWorkerArtifact：验证摘要结构、原文范围/节点ID、正文覆盖及外层sourceMap对应关系，不在主线程重复解析Markdown。夹具把该适配器安装为单个前台计算角色，走U4b真实校验/同步缓存/展示引用路径；没有生产UI引用。

## 审查修复

- remark会去掉开头BOM，旧纯解析范围相对编辑器原文少一个字符。parseMarkdownSyntax现在对全部节点补回偏移和首行列位置；MD散列及原文不归一化。补BOM/CRLF/CR/中文/emoji精确范围测试。
- 新浏览器夹具最初被类型覆盖门禁拒绝；已明确加入integration配置，没有扩大忽略范围。
- 解析摘要增加原文正文覆盖检查，拒绝JSON结构有效却缺少正文区块的半成品；检查返回映射时不再次运行解析器。
- dispose活动适配器沿用终止证明释放当前任务；错误或终止实例必须显式更换，未添加自动重试平台。

## 验证规划与实际口径

新增11项单元覆盖纯解析/原文位置、摘要正文覆盖/大纲完整性、最小协议/错误归属、映射校验、同一适配器串行复用、匹配停止、迟到过滤、坏响应及消息解码失败。

新增3项真实浏览器测试分别运行开发模块、Vite生产Worker资源及普通HTTP非安全来源，比较Worker区块/大纲/sourceMap与同一纯解析器结果，并核对连续任务复用和缓存命中零重新生成。夹具先用同一个适配器Worker处理两次解析并dispose，再单独建立协议错误探针Worker；两段顺序运行，不构成双角色生产接入。错误探针验证坏散列能得到可归属input响应。测试还确认生产路径使用构建后的/assets/markdownWorker-*.js，HTTP下没有randomUUID/subtle也能完成。

最终bun run check退出0：四环境严格类型、126个受管源/配置、源策略/模块边界/lint、36文件233项单元及生产构建通过。完整bun run test:e2e退出0，35项Chromium通过（1.2分钟）；最后收紧大纲完整性后，完整门禁再次通过，并对受影响的开发/生产/普通HTTP三项Worker场景复测3项通过（9.5秒）。证据见[验证JSON](architecture-u5a-evidence-2026-10-25.json)。保留既有Vite __dirname/大分块和NO_COLOR/FORCE_COLOR提示，没有遗留门禁失败。原A1导入烟测继续保留，但不能代替这次真实请求/响应纵向验证。没有执行生产双Worker、引擎DOM、跨浏览器或实体打印验收；Worker运行开销测量及重建收口留给U5b。

## 范围保护

应用UI、存储后端、导出和原公式/分页生成器不改；MathJax 3.2.2、Paged.js 0.4.3及依赖锁保持不变。只更新测试构建入口以同时构建旧烟测与新纵向夹具；不改变正式发布入口、不合并、不移动标签、不推送。
