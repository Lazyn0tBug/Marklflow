# EX-W0 Web原生PDF基线审查

基线c475056。步骤计划见[实施说明](../design/web-native-pdf-baseline-plan-2026-10-27.md)。W0a提供开发/构建/普通HTTP、MathML/SVG共6个真实生产流水线夹具；仅测试交接时替换print，不把该替换视为系统保存。

## W0a结果

冻结来源Rev1后，调用方修改至Rev2，不改变接受内容；18段标记及60表格行、末尾、2个数学节点、SVG与图片、内外链接保留，afterprint清理通过。6项定向浏览器测试通过；严格类型等完整检查、353单元及构建通过。日志D:/codex/ex-w0-fixture-check.log及D:/codex/ex-w0-focused-e2e.log。

在现有测试浏览器用同一分页HTML生成的预检文件是开发证据，不是原生系统保存证据：SVG6页、MathML7页，正文可抽取、CJK及末尾完整，字体嵌入及ToUnicode存在，未发现整页图片，原文图片1个；内部PDF命名目标与链接对应。文件及结构提取记录在D:/codex/ex-w0-native-evidence。没有引入新的浏览器或PDF生成库。

视觉检查发现块级MathML布局缺陷：document.css中的display:block覆盖原生数学布局，导致分数线撑满行；后续独立小步修复及重验。当前不能宣称EX-W0通过。

## 系统验收状态

已安装Edge155.0.4283.62，Windows10.0.26300；尚未实测其保存结果。Computer Use的Edge应用授权超时，未执行系统保存操作；已向用户请求手动保存及默认文件名反馈。浏览器“另存为PDF”、Microsoft Print to PDF、取消及保存框默认名均待实测。不能将afterprint或上述自动化PDF当作用户已保存。
