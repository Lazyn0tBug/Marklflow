# EX-H2a HTML/PDF适配边界

前置：EX-H1 / ce21820。本步将HTML封装、PDF封装和纯HTML分页布局从Markdown准备分离；不改Web原生输出，不引入新引擎。

- generateExportHtml与generatePdfHtml输入ExportHtmlArtifact；HTML源附件为组合入口生成的不透明字符串，不参与阅读内容。
- htmlPaginator只布局HTML/样式/页边距，不导入Markdown解析、MathJax、资源收集或DocumentRecord。documentPaginator只负责编辑预览的准备并复用同一布局函数。
- pageCss提取为只接边距的展示函数；共享DOM的优先级、超时、临时清理及完整页数检查保留。
- 应用导出服务尚沿用原端口，Web组合入口临时准备HTML；EX-H2c将统一准备并删除临时包装。此过渡不作为最终双实现。

审查：HTML选项在首次await前复制；源附件编码单独处理；实际内容不从源附件或当前预览DOM读取。取消函数独立于文档渲染，避免HTML布局反向导入Markdown渲染器。预览仍从原编辑源生成，不改变其合法职责。

验证：178个受管源/配置、严格类型、源策略、边界、lint、329项单元测试及生产构建通过；完整Chromium回归83项通过（4.0分钟）。首轮测试附件直接btoa中文导致的夹具错误已修正为URI编码后base64，最终全量通过。新增隔离夹具保证HTML与编辑源冲突时，HTML及PDF都输出HTML权威标题，保留列表/表格与链接；测试源附件含不同源文，不参与内容生成。未验证系统保存框或Tauri，不把开发环境Chromium测试误作发行依赖。
