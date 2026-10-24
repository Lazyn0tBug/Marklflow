# HTML 静态能力契约 H0/H1

能力清单见 html-capabilities.json。status 区分 planned、unverified、verified、unsupported；适配分 native、mapped、static、unsupported。JSON 中的目标适配不是当前能力声明。

批准语义HTML、MathML/SVG及受管理模板；普通Markdown不执行作者JS，不接入任意CSS。预览与独立HTML共享正文CSS，默认HEX/RGB；应用OKLCH独立。A4及DOCX分别验收；字体/资源/环境未测试时不得标verified。

验证记录须有 featureId、提交、环境/版本、模式、格式、日期、检测/真实显示结果、文字可选取/可编辑/交互/视觉及限制。H2–H4均未实施，0.9标签不变。源码原文权威；导出冻结文档修订。数据不丢失、图表不留占位、失败不宣称成功为强制要求。


当前证据索引：../acceptance/html-review-evidence.json，审查说明：../reviews/html-review-2026-10-24.md。html-capabilities.json中的status仍为跨环境总体unverified；索引中的sample-verified只适用于指定Windows/Chromium、样例和检测层次，不能覆盖Word阅读器、实体打印或H2–H4。禁止以语法检测替代显示，也不以ZIP对象存在替代原生可编辑/视觉验证。
