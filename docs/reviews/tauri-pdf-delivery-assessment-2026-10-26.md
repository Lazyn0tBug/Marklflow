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

## 2. 当前裁决：撤回等待Tauri解决Web问题的建议

此前建议“保留Web现状、等Tauri再迁移”已被用户确认的双平台统一导出原则取代。当前轻量方案允许Web以浏览器原生输出交接文档型PDF；系统window.print不能保证默认名，作为明确限制，不再要求Web直接生成PDF字节。按[HTML唯一输出源规划](../design/html-export-source-plan-2026-10-26.md)先共同架构，再Web验证与接入，最后Tauri；本次仍只改文档。

PDF输入必须为统一冻结HTML；截图拼页、正文栅格化及任何截图后备全部排除，不仅是不默认。不能从Markdown另建PDF内容模型。无合格路径时记录缺口，不宣称解决或自动降级。以下Tauri接入细节仅为最后阶段候选，不构成已实现能力。

## 3. 将来如何接入现有架构

1. 保留ExportService的单busy和接受时冻结源/配置，复用当前HTML构建与分页职责；跨宿主传未分页的统一HTML，在最终系统WebView内完成一次A4分页，不直接照搬浏览器内已分页DOM；不从当前预览DOM取内容，也不复制旧弹窗内生成流程。
2. 在平台组合入口选择Web或Tauri交付适配器。需要时把既有print端口演进为有限的PDF交付函数，接收冻结HTML和建议名；不在UI直接调用invoke、文件系统或原生PDF API。本轮不提前加空接口。
3. Tauri适配器沿用save({defaultPath})取得用户选择，取消就是取消，不提示失败或自动回退系统PDF设备。具体路径只在平台边界流转，原生命令验证选择/授权范围；不能接受任意前端target_path便创建目录并写入。
4. 在独立、可清理的原生渲染宿主加载冻结HTML和冻结资产，只执行受信任渲染脚本并完成一次Paged.js分页，等待真实字体/图片/布局就绪，调用对应平台PDF生成API；不能用固定sleep代替就绪。原生生成完成后才确认目标写入，失败或取消不伪报成功。
5. Windows评估WebView2 PrintToPdf接口；macOS评估WKWebView createPDF等原生能力。Tauri/Rust绑定方式、A4分页、背景、页数及全文覆盖须分别证明，不由“都使用WebView”推断等价。若平台API不能维持现有分页，先记录缺口并讨论支持范围；不自动引入随包Chromium、Puppeteer或截图后备。
6. 使用本次操作的临时文件/宿主并finally清理；按真实文件系统安排暂存/提交及失败保留原件，避免失败后留下被截断的已有PDF。只处理当前一个导出，不新增任务池。

参考：[WebView2打印与PDF导出](https://learn.microsoft.com/en-us/microsoft-edge/webview2/how-to/print)、[Apple WKWebView createPDF](<https://developer.apple.com/documentation/webkit/wkwebview/createpdf(configuration:completionhandler:)>)、[Web window.print接口](https://developer.mozilla.org/en-US/docs/Web/API/Window/print)。这些是平台能力参考，不代表本项目已接入或跨平台已验证。

## 4. 合入前的验收与冲突清单

- 先审查并拆分Tauri平台能力、PDF实际生成、UI/保存适配及测试；不能把原分支全部当作无冲突功能集一次覆盖。尤其保护当前多Tab会话、源保存、统一导出、MD资源包、P5完整A4及O0诊断汇总。
- 不 cherry 旧ExportModal整体实现；将原生能力重新接入当前组合根，保留严格类型与模块门禁。desktop.ts的Tauri SDK引用需要按当前平台边界迁移，而非放宽依赖门禁。
- 在Windows和macOS分别验证建议名（中文/空名/已有.pdf）、路径取消、覆盖确认、不可写目录、引擎失败、窗口关闭与临时清理。
- 必须实际创建目标PDF，核对PDF头/可读性、A4尺寸与页数、最后内容、可提取正文、公式/图表/图片完整性。仅对话框返回路径或Rust返回Ok不能通过。
- 仅在生成与目标文件提交完成后反馈“已保存”；Web系统交付继续使用“已交由浏览器处理”，不能把两种成功语义混用。

当前安排：本轮仅更新文档；后续按EX-H→EX-W→EX-T路线实施，Web不等待Tauri。O0完成事实保留，不升级MathJax、不替换Paged.js。

轻量路线确认：保留Paged.js，不封装Chromium、不采用Puppeteer；Web浏览器原生输出与Tauri系统WebView原生PDF可采用不同实现，应用操作保持一致。系统WebView能力、运行时发布条件与分页兼容性尚未实际验证。
