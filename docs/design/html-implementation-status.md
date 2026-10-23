# HTML 分支实施记录

基线 fae4376 / 0.9。每步骤一次本地提交，不推送。新增源码、依赖、证据随对应步骤提交，0.9不移动。

## A0
建立能力契约/fixtures、Vitest及Playwright入口，ADR批准既定unified管线和Paged.js适配器。真实显示/阅读器支持均保持unverified。

## A1
采用unified AST保持解析入口，统一HTML/URL/CSS值边界，Mermaid切strict并转义错误。围栏/重复标题/嵌套/表格/HTML与CSS负例7项测试通过，类型检查及生产构建通过。未将此阶段认定为真实浏览器输出验收。
