# EX-H0—EX-H2 完整代码审查

范围：H0冻结夹具、H1只读HTML生产、H2a/b/c1/c2格式输入与应用确认。基线5f11fdc；不推进EX-W/EX-T或OMML，不升级引擎，不推送。

## 修复单位1：MathML诊断覆盖

P1：原始MathML检测仅列出8种标签。孤立mi/mn/mo/mroot/mover/munder/mmultiscripts/mtext在净化后被抹去，HTML没有留下可信事实，DOCX未阻断。8种真实prepareExportContent回归均复现失败。将原始MathML选择器集中在纯策略模块，生产诊断与目标能力检查复用；净化前留事实，目标仍只读HTML，不重新解释源。

验证：完整bun run check通过，185受管源/配置、349单元测试、生产构建通过。日志D:/codex/ex-h-review-mathml-check.log。已复现的弹窗生命周期问题作为下一独立修复单位，未混入本提交。
