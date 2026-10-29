# EX-W3 自动回归与收口记录（2026-10-29）

计划见[小步计划](../design/web-regression-closeout-plan-2026-10-29.md)。本轮只完成可自动验证部分，不宣称完整验收或发布通过；EX-W0、原生保存及Word/WPS人工显示仍待补，不推进EX-T，不推送。

## W3a：依赖与全量回归

中断前node_modules为空，离线恢复已结束；用户手动bun i并新增、暂存bun.lock，明确授权本轮一并提交。清单未改，MathJax3.2.2/Paged.js0.4.3未变。bun install --offline --frozen-lockfile --ignore-scripts通过，锁文件哈希不变；这只确认本地缓存/锁文件一致，不冒充空目录安装或远端CI。未安装新浏览器，仅使用已有开发测试浏览器。

新增生产站点资源测试：阻断其他HTTP来源，覆盖纯解析、公式、Mermaid、DOT、A4分页及阅读HTML导出，确认样例不依赖外部CDN。自包含HTML断网阅读沿用既有实际浏览器测试；不宣称应用断网冷启动、Service Worker或远程图片无条件离线。

完整check通过：197受管源/配置、57个单元测试文件、377项单元、严格类型/覆盖/边界/lint/生产构建。全量115项浏览器回归通过（3.9分钟），包括最新EX-W2长Unicode/失败/取消/激活时机与三视图、多Tab、缓存/调度、HTML唯一内容源。新增测试上下文网络覆盖调整另经integration类型检查。既有大包/hash.js及Vite配置提示不影响通过，未通过依赖升级处理。

实际环境：Windows win32 10.0.26300，Bun1.4.2，Playwright1.64.1，已有Chromium156.0.8078.4；其他浏览器/OS不由此推断。具体安装版本、日志及源哈希见[自动回归JSON](../acceptance/web-regression-auto-2026-10-29.json)。未跟踪tag-release.patch保持原样，不参与提交。

## 后续

W3b待归档核验实际产物；W3c待同步支持表与开放门槛。工程/自动回归通过不等于系统保存验收通过。
