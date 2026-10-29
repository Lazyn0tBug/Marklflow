# C0 既有边界检查去重清单（2026-10-29）

基线 f594bb4，GPT-6 Luna 对源码做只读逐项核对；未改代码、未跑测试。独立正式审查留到 X。结论：没有值得引入的通用校验包装或新第三方库；只发现一处同一前台快照在队列内部的重复 UTF-8 测量，建议作为唯一 C1。另有一处资产重复校验候选先延期，见下文。

## 候选与处置

| 位置 | 同一性判断 | 处置 |
| --- | --- | --- |
| `roleQueue.ts` enqueuePreview / claim | 前台入队时先检查 UTF-8字节限额，再把输入 `structuredClone` 到私有 pending；claim取出同一不可变队列值，又完整编码一次。该值无外部可变引用。 | C1仅跳过前台claim处的重复编码；保留入队前校验以免过大内容先复制/计入队列。 |
| `roleQueue.ts` background claim | 后台队列只保存文档/模式引用，实际文档在claim时经PreviewReader读取。 | 保留claim处预算检查；它是迟延读取后的首个字节预算边界。 |
| `markdownWorkerTask.ts` worker入口 | 接收 `unknown` Worker消息，独立校验完整命令和Markdown字节预算。 | 保留。它跨Worker消息边界，队列校验不能替代。 |
| `contracts.ts`、`markdownWorkerAdapter.ts`、`roleExecutor.ts` | Zod schema分别约束消息形状/身份/资源，adapter检查平台消息及路由，executor约束通用执行接口。 | 保留。字段结构、跨字段约束、来源映射及不同层的消息接收职责不等价。 |
| `sourceImport.ts` 输入与最终document字节限制 | 第一处限制读入Markdown原文；第二处限制由Markdown/HTML适配器产生、通过 `documentSchema.parse` 后的最终文档。输入来源和值不保证相同。`documentSchema` 的revision为整数及非负，但不包含此处的 `Number.isSafeInteger` 规则。 | 保留两项字节检查及revision检查。 |
| `documentSchema.ts` / `documentAssets.ts` | Schema限制MIME/URI/哈希字符串/数量和声明字节范围；运行时解码、来源安全、精确字节、SHA、签名验证使用真实解码后的资源。 | 保留。结构与实际内容校验不可互换。 |
| `verifyAssets` / `collectAssets` previous asset | collectAssets会先验证existing，再为被引用资源decode并计算字节/hash/signature。表面上同一既有素材可能验两次，但需要确认快照稳定性及单资源/总量预算仍可正确累计；不应跳过现有预算核算。 | 次选候选，延期；本轮C1不动，待有可证明收益和安全短路方案再议。 |
| `safeUrl` 于存储资产、收集输入、HTML净化 | 同一函数被不同来源和阶段调用；HTML sanitizer另行防范输出标记中的恶意链接/资源。 | 保留。调用值相似不等于校验边界重复。 |
| `previewIdentity` SHA 与 `estimatedBytes`、HTML/文件字节上限 | 分别计算源身份、序列化内存估算、导出字节及完整名称长度；单位和被保护对象不同。同步哈希也有明确调用者约束。 | 保留原生TextEncoder及现有哈希，不抽全局包装、不改同步哈希。 |

## C1边界

仅对 `entry.kind === 'work'` 的前台队列项，复用入队时已做的预算检查；claim时后台项仍检查。Worker接收入口仍重复执行独立预算检查。本次不做schema重排、不抽公共helper、不碰任务调度/哈希、缓存或资产路径。

风险限定：如果未来队列引入未经入队预算校验的work种类，或向调用者暴露可变队列快照，必须恢复该类型的claim前校验。本次实现保持pending私有，snapshot仍返回副本。

Luna确认该项收益是减少一次前台字符串UTF-8临时编码；功能风险很低，收益有限但边界证据清楚。其余候选均不满足安全删除条件。tag-release.patch按既有约束保持未跟踪且不纳入提交。
