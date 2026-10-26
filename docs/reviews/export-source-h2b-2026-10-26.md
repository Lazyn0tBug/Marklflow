# EX-H2b DOCX与HTML能力诊断

前置：EX-H2a / 2655b5d。DOCX仅接ExportHtmlArtifact，段落/列表/表格/锚点/图像从HTML读取；样式和页边距来自HTML产物展示契约。测量样式临时宿主finally清理，图形图片兼容政策不变，OMML未实施。

inspectDocx不再导入Markdown/LaTeX解释器，按可信数学/图表标记、源行及实际HTML结构诊断。生成标记由解析构建器写入，作者data属性先清除；同源行的重复公式仍按独立出现计数。原始MathML、跨行表格及倒序/逐项编号继续阻断。

审查发现：没有math根的原始mrow等片段可能被净化器全部移除。构建阶段将author-mathml来源事实序列化为HTML诊断节点，转换器只读此HTML标记即可阻断，不回头解释Markdown。编译契约推进为export-html-v2；原始MathML既有拒绝政策不放宽。

过渡：UI源文预检暂隔离于legacyDocxSourceDiagnostics，仅作为EX-H2c2前的旧交互入口，不用于生成器。Web组合入口在DOCX准备阶段选择SVG并传递HTML，不由DOCX重新解释公式。下一步删除此临时预检和所有旧源输入端口。

验证：180个受管源/配置、严格类型/源策略/边界/lint、332项单元及生产构建通过；完整Chromium回归83项通过（3.9分钟）。HTML/MD矛盾夹具的受支持HTML实际生成DOCX并解包核对；原始MathML另行阻断，不以移除不支持节点作为生产降级。覆盖24公式汇总、重复同一行公式、伪造标记及净化删除的MathML；普通HTTP/开发/构建均使用真实引擎及实际DOCX封装。不验证Word/WPS或Tauri。
