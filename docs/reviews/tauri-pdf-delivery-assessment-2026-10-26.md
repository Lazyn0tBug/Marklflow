# Tauri PDF命名与当前分支接入评估

日期：2026-10-26；当前architecture-refactor；只读对照本地tauri及origin/tauri引用，二者均为7cef9071cac1f2a6377b28368918fe6def938e43；未fetch、未切换分支、未修改tauri，未合入或cherry-pick。用户当前要求先考虑实现方式与是否现在修改，因此本文为建议，不实施PDF路径迁移。

## 1. 实际实现与未完成部分

| 路径 | 本地代码证据 | 结论 |
| --- | --- | --- |
| tauri:src/core/platform/desktop.ts / exportPdfDirect | 调用原生save，defaultPath使用所选名称并补.pdf；取消保存时不invoke | 原生建议文件名及路径选择逻辑已存在，可参考 |
| 同函数调用export_pdf_direct | 将冻结HTML和target_path传给Rust；invoke成功后显示“已成功导出矢量PDF” | 前端返回值不能单独证明文件已生成 |
| tauri:src-tauri/src/lib.rs / export_pdf_direct | 创建目标父目录，向系统临时目录写markflow_print_时间戳.html，然后直接Ok；未调用WebView PDF生成API、未写target_path | 当前仍为占位，不是已完成的PDF生成；会产生虚假成功反馈，临时HTML也没有清理 |
| tauri:src/components/export/ExportModal.tsx | UI自行调用generateExportHtml及原生函数；使用旧导出逻辑，非当前ExportService单busy/完整A4路径 | 不能直接覆盖当前弹窗或照搬其顶层流程，否则回退架构及P5行为 |

本轮只读检查源码，不运行原生构建或命令；不能把API命名、注释“原生静默导出”或Web单元替身当成PDF生成/落盘证据。这里指出的是当前可访问的本地提交状态，不推断其他未同步修改。

## 2. 建议：现在不继续修改PDF文件名路径

当前Web已将所选名称放进交付文档title。系统Microsoft Print to PDF的保存框不由网页控制，继续改title不构成可保证的命名修复。当前分支也没有原生运行环境；提前引入Tauri SDK、额外浏览器或新的Web PDF排版器，会扩大本轮O0范围并与后续合入重复。

建议保留现有Web交付及明确反馈，Windows系统默认名问题继续标记未解决；未来Tauri合入时实现“原生保存对话框建议名 → 实际PDF生成 → 文件提交 → 成功反馈”，从系统PDF设备路径迁移到应用可控制的保存路径。既有OMML O0工作不等待该迁移。

不增加应用打印预览，不要求用户先打开A4视图，不以截图拼页替代可选择文本PDF。无需为当前未接入平台预建通用任务/权限/交付状态机。

## 3. 将来如何接入现有架构

1. 保留ExportService的单busy和接受时冻结源/配置，复用当前generatePdfHtml完成完整A4排版；不从当前预览DOM取内容，也不复制旧弹窗内生成流程。
2. 在平台组合入口选择Web或Tauri交付适配器。需要时把既有print端口演进为有限的PDF交付函数，接收冻结HTML和建议名；不在UI直接调用invoke、文件系统或原生PDF API。本轮不提前加空接口。
3. Tauri适配器沿用save({defaultPath})取得用户选择，取消就是取消，不提示失败或自动回退系统PDF设备。具体路径只在平台边界流转，原生命令验证选择/授权范围；不能接受任意前端target_path便创建目录并写入。
4. 在独立、可清理的原生渲染宿主加载冻结HTML，等待真实字体/图片/布局就绪，调用对应平台PDF生成API；不能用固定sleep代替就绪。原生生成完成后才确认目标写入，失败或取消不伪报成功。
5. Windows评估WebView2 PrintToPdf接口；macOS评估WKWebView createPDF等原生能力。Tauri/Rust绑定方式、A4分页、背景、页数及全文覆盖须分别证明，不由“都使用WebView”推断等价。若平台API不能维持现有分页，再独立比较其他受控生成方案。
6. 使用本次操作的临时文件/宿主并finally清理；按真实文件系统安排暂存/提交及失败保留原件，避免失败后留下被截断的已有PDF。只处理当前一个导出，不新增任务池。

参考：[WebView2打印与PDF导出](https://learn.microsoft.com/en-us/microsoft-edge/webview2/how-to/print)、[Apple WKWebView createPDF](<https://developer.apple.com/documentation/webkit/wkwebview/createpdf(configuration:completionhandler:)>)、[Web window.print接口](https://developer.mozilla.org/en-US/docs/Web/API/Window/print)。这些是平台能力参考，不代表本项目已接入或跨平台已验证。

## 4. 合入前的验收与冲突清单

- 先审查并拆分Tauri平台能力、PDF实际生成、UI/保存适配及测试；不能把原分支全部当作无冲突功能集一次覆盖。尤其保护当前多Tab会话、源保存、统一导出、MD资源包、P5完整A4及O0诊断汇总。
- 不 cherry 旧ExportModal整体实现；将原生能力重新接入当前组合根，保留严格类型与模块门禁。desktop.ts的Tauri SDK引用需要按当前平台边界迁移，而非放宽依赖门禁。
- 在Windows和macOS分别验证建议名（中文/空名/已有.pdf）、路径取消、覆盖确认、不可写目录、引擎失败、窗口关闭与临时清理。
- 必须实际创建目标PDF，核对PDF头/可读性、A4尺寸与页数、最后内容、可提取正文、公式/图表/图片完整性。仅对话框返回路径或Rust返回Ok不能通过。
- 仅在生成与目标文件提交完成后反馈“已保存”；Web系统交付继续使用“已交由浏览器处理”，不能把两种成功语义混用。

当前建议：不立即调整architecture-refactor的PDF实现；保存本评估供未来Tauri合入使用。O0仍独立完成并验证，不升级MathJax、不替换Paged.js。
