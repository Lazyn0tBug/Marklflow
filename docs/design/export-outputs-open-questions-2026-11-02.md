# 统一输出方案：开放问题与决策记录

更新：2026-11-02。项目内决策副本，来源为用户Downloads中的同名问题清单；原件保持不变。本文同步讨论结论，不授权实施、提交或推送。主方案见[完整输出方案](export-outputs-formula-and-print-plan-2026-10-30.md)，平台路线见[迁移方案](tauri-migration-plan-2026-10-29.md)，端口见[契约](tauri-migration-m0-contract-2026-10-29.md)。

代码核对基线：architecture-refactor / 2062655；原清单所称当前HEAD 58bb1a2不作为本次基线。以下区分已核对事实、设计决定与尚未验证的原生能力。

## 1. Q1—Q5决定

| 问题 | 决定 | 依据与边界 | 同步位置 |
| --- | --- | --- | --- |
| Q1 技术验证被发布门槛阻塞 | 前置技术验证重新编号D1，只依赖D0产物核对及现有壳；无需D2、完整EX-W3/M4—M7。完整产品化为D7/M8、生产D8/M9，门槛保留 | 独立探索不等于产品或发布验收，不要求全量历史回归先闭合；只豁免此小夹具，不放行其他EX-T | 主方案§8、迁移§6—10、契约§3.1 |
| Q2 是否重复分页/如何就绪 | 当前固化分页HTML无Paged.js运行脚本，新宿主不再次分页；D1验证隐藏宿主就绪，不能直接照搬双rAF | pdfExporter→paginatePreparedContent→paged.preview后取pages.outerHTML/css；waitForLayout等待图片/字体/双rAF，不是iframe专用，但隐藏可靠性未验 | 主方案§4.1、契约§3.1 |
| Q3 同一PDF端口语义 | 保留deliverPdf一个签名，显式平台内部选择和交付；字节selectSave不参与PDF | Web交接、桌面选择/输出/提交由各适配器处理，调用方根据结果统一反馈 | 三文档端口契约 |
| Q4 两层取消 | 端口显式cancelled→ExportResult.cancelled；handed-off/saved→completed+成功回执，不采用completed+cancelled | 端口报告事实，应用归一化，UI只有一个取消入口；取消目标选择不等于可中断原生计算，端口取消信号不能删 | 三文档与D2 |
| Q5 跨卷提交 | 默认目标同目录临时PDF、同卷提交；D1可顺带核对输出，覆盖失败/权限/清理在D7；确需跨卷再单独设计 | M3已有new_in(parent)/sync/persist保护原则，但commit_bytes接bytes，非已实现PDF文件适配；不默认采用系统临时卷rename或扩展copy分支 | 主方案§4.1/§8，迁移§3.2，契约§3.1 |

## 2. 当前编号及映射

D0基线→D1技术探索→D2契约→D3 Web收口→D4绑定(M4/M5)→D5 DOCX→D6 Web证据→D7产品化(M8)→D8生产(M9)→D9收口(M10/M11)。D5依赖允许可并行；Mac/Linux Future最后，在D9之后，均待验证。

旧D0→D0；D1→D2、D2→D3、D3→D4、D4→D5、D5→D6；旧D6拆为前置D1与产品化D7；旧D7→D8、D8→D9。D6a/D6b仅为讨论时临时叫法，不作为现行编号。历史提交/验收不重编号。

## 3. 其余事实和未完成项

- Vite配置未将@tauri-apps/api external，不能据此推断无法同步检测isTauri；组合方式仍按初始化需要决定。
- ByteSaveTarget.release缺口、回读unknown及监听器/定时器仍归D2/D3核对修复，不能因记录问题就称已修复；D5公式语义缺口仍需定向审查。
- Rust commit_bytes同目录策略仅为复用原则；隐藏WebView就绪、PrintToPdf文件、终止/迟到清理、实际目标保护均未在本项目验证。
- Web/Windows当前范围收口不要求Future平台已验，也不得将包构建成功当其静默PDF支持。系统PDF/WordWPS与发布缺项仍需补齐。
- 本次只读核对和文档同步，不运行代码测试、不修改代码、不提交、不推送。D1尚未实施。

## 4. 原问题清单溯源

原始材料：C:/Users/清明/Downloads/export-outputs-open-questions-2026-11-02.md，未改写；本项目副本保留决定及问题编号，避免把原文待决提问或旧基线当当前约束。原件SHA-256：`2d28d04a9e769540b4a7804e2af3e4c5b5a849be10e03f07359e219af2d05b91`。
