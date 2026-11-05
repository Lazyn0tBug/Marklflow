# 文档导航

当前开发分支：`architecture-refactor`；package.json 版本字段仍为 **0.9.1**，不等于本分支已完成发布验收。0.9.1/html、0.9.2及严格化记录作为历史基线保留，远端状态以对应提交与运行记录为准。

## 设计基线

- [总体设计方案 V0.2.10](design/Markdown编辑器总体设计方案_V0.2.10.md)：完整总体方案，包含第16章HTML兼容性与输出适配规划。
- [产品版本规划 V0.2.10](design/产品版本规划_0.1至0.9与1.0验证_V0.2.10.md)：0.1–0.9开发及0.9至1.0审查验证阶段。
- [第16章冻结摘录](design/html-compatibility-baseline.md)：与完整方案相同的HTML设计要求。

总体方案与版本规划源自2026-10-23设计，后续定向补充以文件内容为准，其中“尚未实现”、计划技术版本和原型描述属于设计形成时的历史状态，不代表当前实现；已实现内容与差异以以下记录为准。总体方案归档时原始SHA-256（非当前文件校验值）为`8E0FF3F4D4CABFF6502B87073BC3CDEF050E16A5BA36936261BF761B1BAD425E`。

## 当前方案与开发规范

- [统一输出与桌面交付完整方案](design/export-outputs-formula-and-print-plan-2026-10-30.md)：当前代码事实、独立PDF回执、授权释放及剩余D0—D8范围。
- [Tauri迁移路线](design/tauri-migration-plan-2026-10-29.md)与[平台接口契约](design/tauri-migration-m0-contract-2026-10-29.md)：会话绑定、双平台组合及已有阶段/待验边界。
- [本地文档支持设计](design/local-document-support-2026-11-05.md)：M4/M5/M6 的语义、授权与绑定模型、UI规格与验收条目；设计稿，未实施。
- [大纲折叠设计](design/outline-collapse-2026-11-06.md)：侧栏大纲树的展开与收起、稳定键、默认深度与验收条目；设计稿，未实施。
- [CM6 + Vim可行性与代价](design/cm6-vim-feasibility-and-cost-2026-11-01.md)：独立讨论稿，无实施步骤、排期或迁移决定。
- [审查与测试规范](development/review-and-testing.md)：增量审查、风险选测、证据复用和全量触发；[项目指导](../AGENTS.md)。

当前保留MathJax 3.2.2/Paged.js 0.4.3和textarea。多Tab、软换行、分栏及OMML已有实现，但不由本文宣称当前全量回归或系统验收通过。系统PDF文件/默认名、Word/WPS、目标OS桌面能力及发布条件按实际证据分别记录；不要求实体打印作为文档导出必经门槛。

## HTML实施与审查（历史基线）

- [A0–A7改造计划](design/html-compatibility-plan.md)
- [技术决策 ADR-HTML-001](design/adr-html-001.md)
- [实施状态](design/html-implementation-status.md)
- [完整代码审查与第16章对照](reviews/html-review-2026-10-24.md)
- [能力契约](contracts/html-capabilities.md)及[目标矩阵](contracts/html-capabilities.json)
- [环境、源代码指纹与分层验证证据](acceptance/html-review-evidence.json)
- [PDF文字完整性检查](acceptance/html-review-pdf-check.json)
- [CI说明](ci.md)

## 版本与使用

- [CHANGELOG](../CHANGELOG.md)
- [项目说明](../README.md)
- [使用教程](../TUTORIAL.md)

0.9.1是HTML兼容性改造、审查修复与设计文档归档版本，不是1.0验收放行。MathJax当前实现仍为3.2.2，编辑器仍采用现有textarea；设计中的高级编辑器/高亮、H2字体模板、H3脚本交互、H4增强能力不因文档入库而变成已实现。Word/WPS、系统PDF保存、其他浏览器与Tauri按声明范围独立验收。用户端环境要求与开发依赖分别记录。

## TypeScript 严格化（历史阶段记录）

本地 0.9.2 标签标记 HTTP 兼容性修复基线；当时严格化位于 typescript-strict；下面记录描述当时本地验证，不作为当前推送状态判断。

- [严格化分步计划](design/typescript-strict-plan.md)
- [严格化本地验证记录](acceptance/typescript-strict-2026-10-25.md)

- [严格化分支完整代码审查](reviews/typescript-strict-review-2026-10-25.md)
- [严格化审查结构化证据](acceptance/typescript-strict-review-evidence.json)
