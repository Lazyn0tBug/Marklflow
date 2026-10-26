# EX-H0—EX-H2 完整代码审查

范围：H0冻结夹具、H1只读HTML生产、H2a/b/c1/c2格式输入与应用确认。基线5f11fdc；不推进EX-W/EX-T或OMML，不升级引擎，不推送。

## 修复单位1：MathML诊断覆盖

P1：原始MathML检测仅列出8种标签。孤立mi/mn/mo/mroot/mover/munder/mmultiscripts/mtext在净化后被抹去，HTML没有留下可信事实，DOCX未阻断。8种真实prepareExportContent回归均复现失败。将原始MathML选择器集中在纯策略模块，生产诊断与目标能力检查复用；净化前留事实，目标仍只读HTML，不重新解释源。

验证：完整bun run check通过，185受管源/配置、349单元测试、生产构建通过。日志D:/codex/ex-h-review-mathml-check.log。已复现的弹窗生命周期问题作为下一独立修复单位，未混入本提交。

## 修复单位2：关闭后不恢复旧确认

P2：准备尚未完成时关闭并重新打开同一弹窗，旧回调只判断当前isOpen，会把已关闭操作的确认重新显示并继续占busy。真实React挂载、关闭、重开、延迟准备夹具复现。新增本次操作的dismissed标志，只在接受新导出时重置；关闭、外部隐藏或卸载均使未发出的旧确认失效。没有增加队列或通用取消平台；不需要确认的已接受生成操作继续沿用原策略。

验证：完整bun run check通过，350项单元测试、类型/边界/lint及生产构建通过。日志D:/codex/ex-h-review-confirmation-check.log。视觉与全部浏览器回归在审查收口统一执行；本修复不改布局。
