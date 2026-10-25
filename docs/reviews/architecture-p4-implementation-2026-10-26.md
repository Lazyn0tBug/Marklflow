# P4 DOCX导出实施审查

范围为草案6 P4。现有DOCX生成器改用P2 prepareExportContent，固定SVG公式模式和导出接受时的联网许可；公式/图表先通过共享DOM生成，再将冻结图片与静态HTML交原OpenXML映射。移除生成器重复拥有的renderDocument/collectAssets组合，没有替换docx库或另建队列。

沿用原标题、段落、列表、表格、书签、链接、分页及SVG/PNG后备图片映射，兼容性诊断与用户明确接受语义重排/图片静态化仍保留；不新增OMML。图片测量/栅格后备及临时根节点仍局部try/finally清理。统一ExportService继续负责单busy、来源修订及Web下载反馈，不以当前预览DOM作为输入。

新增DOCX失败释放busy、无虚假下载且可显式再导出的单元；新增真实生产DOCX导出途中修改源文用例，解包word/document.xml验证接受时内容保留、后续编辑不混入。既有正文/列表/表格、中文、图片及公式结构回归继续执行。Word/WPS实际视觉、编辑体验仍是外部阅读器缺口，不能由ZIP结构校验代替。

验证：bun run check通过，四份严格配置覆盖163个受管源/配置，306项单元通过，lint/模块边界及生产构建通过；完整Chromium 69项通过（2.6m）。仅记录本机实际结果；其他浏览器、Tauri和Word/WPS视觉未验收。保留既有构建提示。未推送、未合并、未移动标签。
