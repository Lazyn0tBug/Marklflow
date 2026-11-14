# 文档导航

按读者任务查找文档；不以文件日期或标题的“完整”“已实施”推断当前代码及发布状态。当前开发分支为 `architecture-refactor`，已完成范围、旧基线和未验条件分别看相应正文、提交与验收记录。

## 使用与开发

| 任务                        | 入口                                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------ |
| 产品概览、运行方式          | [项目README](../README.md)                                                           |
| 操作、语法与快捷键          | [使用教程](../TUTORIAL.md)                                                           |
| 版本变化                    | [CHANGELOG](../CHANGELOG.md)                                                         |
| 开发审查、选测、证据复用    | [分析与验证规范](development/analysis-and-verification.md)、[项目指导](../AGENTS.md) |
| 构建与发布流程              | [CI说明](ci.md)，具体配置以 `.github/workflows/` 为准                                |
| 文档是否入库、何时合并/退出 | [文档入库与生命周期指南](development/documentation-lifecycle.md)                     |

## 当前模块规则与有效设计

这些是规则的归属入口，部分文件仍混有旧步骤或未实施范围；引用不意味着所有内容已经实现或验证。文件职责与建议精简去向见生命周期指南，不在这里再维护第二套实施进度。

| 主题                       | 入口                                                                                                                                                                   |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 设计判断与决策定位         | [设计原则与决策索引](design/design-principles.md)                                                                                                                      |
| 架构、会话、预览任务与缓存 | [架构重构方案](design/architecture-refactor-plan-2026-10-25.md)；目前仍混有阶段规划，待收敛为当前架构说明                                                              |
| HTML 内容与目标能力        | [能力说明](contracts/html-capabilities.md)、[机器矩阵](contracts/html-capabilities.json)、[HTML技术决策](design/adr-html-001.md)                                       |
| 输出、公式与交付边界       | [统一输出方案](design/export-outputs-formula-and-print-plan-2026-10-30.md)、[文件名契约](design/export-filename-contract-2026-10-29.md)                                |
| 平台端口与授权             | [平台接口契约](design/tauri-migration-m0-contract-2026-10-29.md)；历史M0与现行规则需区分                                                                               |
| 文档打开、绑定、保存与确认 | [本地文档支持](design/local-document-support-2026-11-05.md)                                                                                                            |
| 本地资源与资产权限         | [本地资源支持](design/local-resource-support-2026-11-09.md)，独立于文档读写方案，包含未实施范围                                                                        |
| 日志和配置                 | [日志基座](design/log-base-plan-2026-11-03.md)、[运行期配置](design/runtime-config-2026-11-05.md)                                                                      |
| 消息语义与独立呈现         | [应用消息](design/app-messaging-plan-2026-11-07.md)、[消息样式](design/message-surface-2026-11-07.md)                                                                  |
| 大纲与工作台               | [大纲折叠](design/outline-collapse-2026-11-06.md)、[工作台界面](design/workbench-ui-design-2026-11-13.md)、[间距契约](design/workbench-spacing-contract-2026-11-01.md) |

`docs/contracts/` 的预算、文件读取和能力 JSON 被应用或检查读取；`docs/acceptance/` 也含被冻结的比较输入。它们不是普通说明副本，禁止随文档整理直接移动或删除。具体调用方见指南。

## 验收与支持范围

只按实际提交、环境、格式和证据声明已验范围；系统保存、默认名/取消、Word/WPS 和各 OS 能力不能由自动化通过替代。以下清单中的缺项继续保留，文档收口不会补齐它们。

| 范围                          | 入口与边界                                                                                                                                                                                                        |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web交付已验/未验矩阵形态      | [Web导出支持记录](design/web-export-support-2026-10-29.md)，这是历史范围，不能直接当作当前版本的全量支持声明                                                                                                      |
| 系统PDF保存、默认文件名与取消 | [当前手动清单](acceptance/ex-w0-native-manual-checklist-2026-11-01.md)；10月27日旧稿已被替代，不用于执行                                                                                                          |
| Web字节格式原生保存           | [保存手动清单](acceptance/web-unified-save-manual-checklist-2026-10-29.md)                                                                                                                                        |
| Word/WPS原生公式              | [阅读器手动清单](acceptance/word-wps-native-formula-manual-checklist-2026-11-01.md)                                                                                                                               |
| 桌面壳、文件I/O与原文件写回   | [桌面壳验收](acceptance/tauri-c-a-manual-checklist-2026-11-01.md)、[原生I/O验收](acceptance/tauri-m3-native-io-manual-checklist-2026-11-01.md)、[M5写回验收](acceptance/m5-b4-desktop-verification-2026-11-10.md) |
| Windows PDF能力与阶段证据     | [探针阶段记录](reviews/pdf-probe-stage-record-2026-11-02.md)、[Windows检查说明](reviews/windows-build-check-2026-11-03.md)；尚在阶段阅读路径，后续提炼为能力结论/操作说明                                         |
| 已知失败与门禁欠账            | [已知失败](contracts/known-failures.md)，随对应测试修复更新，不因整理文档删除                                                                                                                                     |

后续阶段收口应形成一份简洁的发布支持/证据索引，指向必要原始证据；本轮未新建支持结论，也未重新验收这些历史记录。

## 在途与未来方案

| 范围                     | 入口                                                                                                                                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 桌面迁移与剩余阶段       | [Tauri迁移路线](design/tauri-migration-plan-2026-10-29.md)、[输出D7冻结](design/export-outputs-d7-freeze-2026-11-04.md)、[D8/M9接入](design/export-outputs-d8-m9-plan-2026-11-05.md) |
| 平台能力探针计划         | [PDF探针方案](design/pdf-probe-implementation-plan-2026-11-02.md)                                                                                                                    |
| Rust整理                 | [模块整理方案](design/rust-module-organization-plan-2026-11-11.md)，是否实施以实际阶段记录为准                                                                                       |
| 预览优化与解析器条件对照 | [预览优化](design/preview-rerender-plan-2026-11-06.md)、[markdown-it对照](design/markdown-renderer-comparison-plan.md)；两者是可合并的未来计划，不代表选型已变                       |
| 编辑器候选               | [CM6+Vim可行性](design/cm6-vim-feasibility-and-cost-2026-11-01.md)，独立讨论，不是已采纳实现                                                                                         |

## 历史基线与过程记录

- [总体设计V0.2.10](design/Markdown编辑器总体设计方案_V0.2.10.md)、[0.1–0.9版本规划](design/产品版本规划_0.1至0.9与1.0验证_V0.2.10.md)是早期需求/规划；选型与“尚未实现”描述不能覆盖后来变更。
- [第16章摘录](design/html-compatibility-baseline.md)、[HTML执行计划](design/html-compatibility-plan.md)、[实施状态](design/html-implementation-status.md)、[HTML审查](reviews/html-review-2026-10-24.md)属于历史改造依据。
- 架构A/R/U/P/V、输出EX-H/EX-W、迁移M/E、边界F/P/C/X、日志LS等逐步报告见现有 `reviews/` 与 `acceptance/`；不再逐份列作新人必读。如何分组收口与哪些不能删，见[具体分类及处理时机](development/documentation-lifecycle.md)。

目标是把有效规则留在拥有它的正文，把过程交给必要摘要和可追溯历史；本轮仅更新导航与指南，未移动、删除、合并任何现有正文或证据，废弃原型及其他未跟踪试验不纳入本次入库范围。
