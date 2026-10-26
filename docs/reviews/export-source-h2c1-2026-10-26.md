# EX-H2c1 源保存与产物收口

前置：EX-H2b / 5cde670。prepareExportContent直接返回ExportHtmlArtifact；旧document/html/artifact包装及PreparedExportContent类型删除。格式内容输入不再携带原始Markdown。

源保存例外独立：纯MD仍原样输出；Markdown资源包只解析源图片/引用/原始HTML图片地址，沿用collectAssets的访问限制与SHA-256，按来源精确改写链接，不调用MathJax、图表或文档渲染。重复源URL合并，未引用定义不触发读取。未知公式/无效图表不再阻止保存源文件。

编辑附件独立于HTML封装器：encodeEditableSource在首次await前复制源，核对来源ID/修订/MD散列后将实际冻结资源及输出公式模式编码；正文仍完全来自HTML。构造不匹配的源附件会失败，不能附错文档或让附件改变阅读正文。

审查：源资源包是唯一允许解析MD以保存/重写源的位置之一，不可由PDF/DOCX/HTML内容转换器调用。ZIP编码在await压缩前已固定源和清单；资产字节独立解码，后续编辑不影响本次操作。Web组合根暂保留单次准备包装，EX-H2c2原子迁移到应用服务。

验证通过：182个受管源/配置、严格类型/边界/源策略/lint、334项单元及生产构建通过；完整Chromium回归83项通过（4.0分钟）。新增源保存坏公式/坏图表测试及附件来源不匹配测试；已有严格门禁、全部单元、完整浏览器与普通HTTP/单文件HTML/ZIP回归。不验证Word/WPS或Tauri原生文件输出。
