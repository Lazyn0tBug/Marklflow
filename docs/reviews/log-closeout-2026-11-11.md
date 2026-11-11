# 日志收口实施记录

分支：`architecture-refactor`。不推送。范围：调用关联、stdout 配置和通道健康；其余设计项继续按原计划验收。

## S1：stdout 显式开关与默认级别

- `log.stdout` 为布尔配置，缺省关闭；普通记录与健康摘要均遵循此开关。文件不可用不自动开启 stdout。
- stdout 首次写错后停止镜像，保持文件路径独立；`run_start.log_stdout` 记录有效值。默认级别统一 INFO。
- 修正 Windows 源定位串的路径分隔符，保持跨系统定位断言一致。
- 两份相关设计文档仅按现有格式工具整理表格，未改变设计内容。

验证由 GPT-6 Luna 执行。原工作区全量类型检查被已有未跟踪 PDF 试验测试引用缺失脚本阻断；保留这些文件。以 `5e5f707` 跟踪文件加本步改动复制到 `D:\codex\markflow-log-check`，共享已按锁恢复的依赖，执行 `bun run check`：类型/覆盖率、格式、lint、109 个测试文件的 781 项测试及生产构建通过。构建仅有原有分包警告。

在同一跟踪快照执行 `bun run check:rust`，设置可写 TEMP/TMP 与隔离 CARGO_HOME：90 项 Rust 测试及 Clippy 通过。首次完整 Rust 测试保留了临时目录写入失败与 Windows 路径断言失败；更换可写临时目录并修正路径归一化后通过。默认关闭/显式开启的真实 Windows GUI 日志落盘仍待后续系统验收，以上自动检查不代替它。

## S2：通道接收健康与业务隔离

- `log.call_timeout_ms` 默认 200 ms，接受 10–2000 ms；配置读数与每次接收均有等待上限。配置读取失败使用默认等待值，不影响业务。
- 消息端口只保留最后状态：accepted/dropped/rejected、异常、超时、不可用或无效回执。不重试、不递归；迟到接收及旧调用完成不能覆盖较新状态。
- 用户通知与调用方返回不等待日志；accepted 仅表示已入队。Rust 发送口按实际入队返回回执。
- 原生健康拆分 web_rate_limited、web_rejected、queue_dropped、record_too_long。队列已关闭亦计 queue_dropped；每次丢弃只归一因。校验器兼容旧合计；缺失旧字段不误报丢失。
- 真实 GUI 通道与有效配置验收仍待补。

Luna 首轮定向测试暴露了异步报告未结束即重置共享 mock 的夹具缺陷；已改为按对应控制台或通道状态等待测试启动的报告结束，并将配置响应与日志响应分路。复验消息端口、事件、失败出口和 runtime 五组 28/28 通过；validator 组 27/27 通过。跟踪快照 `bun run check` 通过（109 文件/790 测试，后补的计数测试单独验证）；`bun run check:rust` 92 项及 Clippy 通过。随后仅补 `run_start.log_call_timeout_ms` 有效值字段，32 项 logging 测试与 Clippy 补验通过。该字段的序列化值未独立断言，依据为事件接线审查和配置边界测试，不将其写作真实 GUI 输出证据。
