# EX-W0 Web原生PDF基线审查

基线c475056。步骤计划见[实施说明](../design/web-native-pdf-baseline-plan-2026-10-27.md)。W0a提供开发/构建/普通HTTP、MathML/SVG共6个真实生产流水线夹具；仅测试交接时替换print，不把该替换视为系统保存。

## W0a结果

冻结来源Rev1后，调用方修改至Rev2，不改变接受内容；18段标记及60表格行、末尾、2个数学节点、SVG与图片、内外链接保留，afterprint清理通过。6项定向浏览器测试通过；严格类型等完整检查、353单元及构建通过。日志D:/codex/ex-w0-fixture-check.log及D:/codex/ex-w0-focused-e2e.log。

在现有测试浏览器用同一分页HTML生成的预检文件是开发证据，不是原生系统保存证据：SVG6页、MathML7页，正文可抽取、CJK及末尾完整，字体嵌入及ToUnicode存在，未发现整页图片，原文图片1个；内部PDF命名目标与链接对应。文件及结构提取记录在D:/codex/ex-w0-native-evidence。没有引入新的浏览器或PDF生成库。

视觉检查发现块级MathML布局缺陷：document.css中的display:block覆盖原生数学布局，导致分数线撑满行；已在独立W0-fix小步修复并重验，结果见下。整体EX-W0仍需原生文件和默认名证据。

## 系统验收状态

已安装Edge155.0.4283.62，Windows10.0.26300；尚未实测其保存结果。Computer Use的Edge应用授权超时，未执行系统保存操作；已向用户请求手动保存及默认文件名反馈。浏览器“另存为PDF”、Microsoft Print to PDF、取消及保存框默认名均待实测。不能将afterprint或上述自动化PDF当作用户已保存。

## W0-fix：原生MathML布局修复

用户同时复现“等号左侧分数线占满行”。回归实测分数宽642.52px，与正文可用宽一致；移除document.css中math[display=block]的display:block覆盖，让原生block math布局生效。修复后宽39.09px，保持等号、根式与分式在正确数学布局中。没有转换为图片、SVG或引入新引擎；MathML仍是MathML。CSS已纳入HTML配置散列，改变自然反映到新产物。

自动化新增真实几何断言；原生print调用抛错时，实际交付iframe清理且busy释放，不出现成功结果。完整检查通过：188个受管源/配置、353单元、严格类型/覆盖/边界/lint和生产构建；全部93项浏览器测试通过（3.2分钟）。日志D:/codex/ex-w0-mathml-check.log及D:/codex/ex-w0-final-e2e.log。

修复后的开发预检PDF：MathML与SVG均为6页A4，60行和18段标记完整，最后内容存在、后续编辑内容不存在；CJK可提取，字体嵌入/ToUnicode，内链命名目标和外链均存在，无整页图像替代。MathML使用Cambria Math，SVG保留矢量路径；原始图片单独作为图片。修复前全页联系图及修复后两种模式首页已查看，公式恢复正常。结构详见[预检证据](../acceptance/web-native-pdf-preflight-2026-10-27.json)，这些是测试浏览器文件，不能替代原生系统保存产物核验。

## 人工反馈与最终门槛

2026-10-27，用户先确认“svg pdf is ok”，并指出MathML分数线缺陷；修复后确认“mathml pdf is ok”。记为原生输出显示的用户人工确认通过，不能扩展为已检查原生文件字体、文本对象和链接。未提供原生PDF实际路径，在约定证据目录及预期名称的标准下载/文档/桌面位置未取得对应原生文件；没有读取其他个人文档。

| 验收层 | 状态 |
| --- | --- |
| 冻结HTML→Paged.js完整分页、交接、失败清理 | 自动化通过 |
| SVG及MathML原生输出显示 | 用户人工确认通过 |
| 同一HTML的PDF结构、文本/CJK、字体、链接、矢量 | 开发预检通过，原生保存文件字节核验待补 |
| 系统另存文件及默认名是否为空 | 未取得可复核记录，不宣称修复或跨设备保证 |
| EX-W0完整退出 / EX-W1启动 | EX-W0验证中；不启动EX-W1 |

Web限制保持：文件名仅作为冻结HTML标题建议；window.print没有保存路径/文件名参数，浏览器另存PDF与Windows设备可有不同默认名。应用不保证驱动采用标题，不把历史Windows空名问题宣称已解决。afterprint不能区分保存或取消，交接反馈仅“PDF导出已交由浏览器处理”。未改变应用统一导出入口，不增加PDF专属预览；不推送，不升级MathJax、不替换Paged.js、不引入Chromium/Puppeteer或截图方案。
