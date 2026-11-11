# 日志收口实施记录

分支：`architecture-refactor`。不推送。范围：调用关联、stdout 配置和通道健康；其余设计项继续按原计划验收。

## S1：stdout 显式开关与默认级别

- `log.stdout` 为布尔配置，缺省关闭；普通记录与健康摘要均遵循此开关。文件不可用不自动开启 stdout。
- stdout 首次写错后停止镜像，保持文件路径独立；`run_start.log_stdout` 记录有效值。默认级别统一 INFO。
- 修正 Windows 源定位串的路径分隔符，保持跨系统定位断言一致。
- 两份相关设计文档仅按现有格式工具整理表格，未改变设计内容。

验证由 GPT-6 Luna 执行。原工作区全量类型检查被已有未跟踪 PDF 试验测试引用缺失脚本阻断；保留这些文件。以 `5e5f707` 跟踪文件加本步改动复制到 `D:\codex\markflow-log-check`，共享已按锁恢复的依赖，执行 `bun run check`：类型/覆盖率、格式、lint、109 个测试文件的 781 项测试及生产构建通过。构建仅有原有分包警告。

在同一跟踪快照执行 `bun run check:rust`，设置可写 TEMP/TMP 与隔离 CARGO_HOME：90 项 Rust 测试及 Clippy 通过。首次完整 Rust 测试保留了临时目录写入失败与 Windows 路径断言失败；更换可写临时目录并修正路径归一化后通过。默认关闭/显式开启的真实 Windows GUI 日志落盘仍待后续系统验收，以上自动检查不代替它。
