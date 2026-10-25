# 文档导航

当前产品版本：**0.9.1**，发布于2026-10-25，位于`html`分支；未合并到`main`。设计修订号V0.2.10与产品版本0.9.1分别管理。

## 设计基线

- [总体设计方案 V0.2.10](design/Markdown编辑器总体设计方案_V0.2.10.md)：完整总体方案，包含第16章HTML兼容性与输出适配规划。
- [产品版本规划 V0.2.10](design/产品版本规划_0.1至0.9与1.0验证_V0.2.10.md)：0.1–0.9开发及0.9至1.0审查验证阶段。
- [第16章冻结摘录](design/html-compatibility-baseline.md)：与完整方案相同的HTML设计要求。

总体方案与版本规划保留2026-10-23原文，其中“尚未实现”、计划技术版本和原型描述属于设计形成时的历史状态，不代表0.9.1当前实现；已实现内容与差异以以下记录为准。总体方案原始SHA-256为`8E0FF3F4D4CABFF6502B87073BC3CDEF050E16A5BA36936261BF761B1BAD425E`。

## HTML实施与审查

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

0.9.1是HTML兼容性改造、审查修复与设计文档归档版本，不是1.0验收放行。MathJax当前实现仍为3.2.2，编辑器仍采用现有textarea；设计中的高级编辑器/高亮、H2字体模板、H3脚本交互、H4增强能力不因文档入库而变成已实现。Word/WPS、原生系统及实体打印、其他浏览器与Tauri仍需后续验收。用户端环境要求与开发依赖分别记录。

## TypeScript 严格化（本地分支）

本地 0.9.2 标签标记 HTTP 兼容性修复基线；后续严格化位于 typescript-strict，尚未推送。

- [严格化分步计划](design/typescript-strict-plan.md)
- [严格化本地验证记录](acceptance/typescript-strict-2026-10-25.md)

- [严格化分支完整代码审查](reviews/typescript-strict-review-2026-10-25.md)
- [严格化审查结构化证据](acceptance/typescript-strict-review-evidence.json)
