# EX-H0 架构基线与夹具

基线提交及文件SHA-256见[冻结清单](../acceptance/export-source-h0-baseline.json)，语料见tests/fixtures/export-source/corpus.json；全部仓库自编，不冒充用户原文。包含HTML与MD内容故意不一致的隔离输入、列表/合并表格/链接/代码语言、宏与编号、脚注重排公式、图片和拒绝的原始MathML。

| 入口 | 当前输入与旁路 | 后续所有者 |
| --- | --- | --- |
| ExportService | 接DocumentRecord，纯MD直接写源，PDF调用print | EX-H2分离转换输入与源附件，Web保留原生交接 |
| prepareExportContent | 一次renderDocument和collectAssets，只返回html/document | EX-H1建立独立规范HTML产物及MathML语义 |
| HTML生成 | 从prepared.html构建阅读正文，源附件来自document | EX-H2只准源附件恢复编辑，不作转换旁路 |
| DOCX | 正文读HTML，但inspectDocx再解析MD，公式只有图片 | EX-H2迁移诊断与输入；原生公式仍O1—O5 |
| PDF | HTML经Paged.js后浏览器print | EX-W验证交接，不承诺Web默认名/保存确认 |
| MD/ZIP | 源文原样保存/精确改写链接及打包 | 合法源保存例外，不可供其他格式重解释 |
| 预览 | Worker解析与缓存属于编辑交互 | 不作为导出权威，不增加Worker/平台任务框架 |

审查：本步未改生产代码；夹具只建立后续隔离验收输入，尚未证明各格式转换已跟随HTML。之前未提交的方案/审查文档纳入本步基线归档。没有依赖变动，MathJax/Paged.js版本保持；不引入Chromium/Puppeteer。EX-H1仅准备产物，格式端口旁路的删除仍属EX-H2。

验证：bun run check退出0，严格类型/受管覆盖、源文件策略、模块门禁、lint、全部单元与生产构建通过；新增2项基线测试通过。完整日志位于D:/codex/ex-h0-check.log。构建已有chunk体积及hash.js静态/动态导入提示，未新增依赖；本步无生产行为修改，未重复运行浏览器交互。不以夹具检查宣称PDF原生保存或Tauri验证完成。
