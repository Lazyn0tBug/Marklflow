# EX-H0—EX-H2 完整代码审查

范围：H0冻结夹具、H1只读HTML生产、H2a/b/c1/c2格式输入与应用确认。基线5f11fdc；不推进EX-W/EX-T或OMML，不升级引擎，不推送。

## 修复单位1：MathML诊断覆盖

P1：原始MathML检测仅列出8种标签。孤立mi/mn/mo/mroot/mover/munder/mmultiscripts/mtext在净化后被抹去，HTML没有留下可信事实，DOCX未阻断。8种真实prepareExportContent回归均复现失败。将原始MathML选择器集中在纯策略模块，生产诊断与目标能力检查复用；净化前留事实，目标仍只读HTML，不重新解释源。

验证：完整bun run check通过，185受管源/配置、349单元测试、生产构建通过。日志D:/codex/ex-h-review-mathml-check.log。已复现的弹窗生命周期问题作为下一独立修复单位，未混入本提交。

## 修复单位2：关闭后不恢复旧确认

P2：准备尚未完成时关闭并重新打开同一弹窗，旧回调只判断当前isOpen，会把已关闭操作的确认重新显示并继续占busy。真实React挂载、关闭、重开、延迟准备夹具复现。新增本次操作的dismissed标志，只在接受新导出时重置；关闭、外部隐藏或卸载均使未发出的旧确认失效。没有增加队列或通用取消平台；不需要确认的已接受生成操作继续沿用原策略。

验证：完整bun run check通过，350项单元测试、类型/边界/lint及生产构建通过。日志D:/codex/ex-h-review-confirmation-check.log。视觉与全部浏览器回归在审查收口统一执行；本修复不改布局。

## 修复单位3：DOCX忠实使用HTML编号和锚点

P2：HTML的ol start=0/-2被强制改为1；容器ID虽加入目标映射，却没有生成书签；同时带id和href的a元素因提前返回也丢失书签。解包DOCX的两项独立回归均复现失败。

列表读取HTML原生start属性，不重新解释MD。链接转换后仍处理自身ID；容器书签落在已有首个段落，无段落的容器才新增最小书签段落。验证所有内部链接均存在实际书签目标，不仅检查XML中出现anchor字样。没有引入新的格式解析器。

验证：4项DOCX定向测试及完整bun run check通过，352项单元测试、185受管源/配置、生产构建通过。日志D:/codex/ex-h-review-docx-check.log；Word/WPS视觉及负起始编号显示仍需后续人工兼容性验收，当前证明OOXML语义保留。
