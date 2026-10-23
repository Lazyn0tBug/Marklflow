# ADR HTML-001：静态文档管线与语法树

选择：H1采用既定unified路线（remark-parse/gfm/math→remark-rehype/raw→受控HTML），由解析位置构建源码锚点，统一清理。避免继续在手写正则上叠加HTML语法：围栏、公式、分页与链接属性顺序已产生无法可靠组合的边界。

替代：原位修复可少加依赖，但难证明CommonMark嵌套结构及HTML边界；markdown-it可用但偏离既有unified设计。保持parseMarkdownToHtml/extractOutline公开入口兼容，不同步重写编辑器/DOCX或升级MathJax。

文档CSS单独文件供预览、独立HTML和分页使用；先用命名空间宿主，禁止任意作者CSS/JS。分页使用Paged.js适配器（既有选型），不自研增量分页。DOMPurify负责标记，CSS语法树/URL校验独立处理，不将iframe隔离扩展为当前任务。

回退：本地逐步骤提交可分别回退；schema导入保持v1兼容，添加可选资产字段。不移动0.9，不推送；样例/实际浏览器验证未通过前不升级支持状态。
