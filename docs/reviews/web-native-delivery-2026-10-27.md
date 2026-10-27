# EX-W1 Web原生交付接入记录

工程启动依据见[具体问题与手动验收](../acceptance/ex-w0-native-manual-checklist-2026-10-27.md)、[实施计划](../design/web-native-delivery-implementation-plan-2026-10-27.md)。用户授权缺证据不影响时先推进；EX-W0完整系统验收未改为通过，不推送。

## W1a：Web平台边界

已有preparePrintFrame/printFrozenHtml宿主逻辑原样迁至core/platform/web/pdfDelivery.ts，唯一公开deliverPdfHtml接收完整冻结HTML；prepare为私有。Web组合根接入此函数，原共享documentPrint仅保留布局/期限/纸张样式工具，不留旧原生交付重导出。没有新建iframe管理平台、渲染器、任务队列或PDF字节生成器。

模块门禁覆盖Web PDF适配器的源解析禁入，并拒绝HTML生成/分页反向导入平台PDF交付；Web组合根允许绑定。原生窗口调用仍是适配器内部细节，UI和内容转换器不直接调用。MathJax3.2.2/Paged.js0.4.3保持。

验证：完整check通过，190受管源/配置、359单元、类型/边界/lint及生产构建通过；原生交付9项浏览器定向回归通过，包含三环境双数学模式、就绪离开、交接离开和失败清理。日志D:/codex/ex-w1a-check.log及D:/codex/ex-w1a-e2e.log。

## W1b：统一导出服务交付端口

ExportPorts.print收口为deliverPdf(html):Promise<void>，平台细节留在Web适配器；应用保持原print-pdf格式键、同一导出窗口及同一ExportService，不增加PDF专属预览或A4前置，不改变原生保存步骤。该Promise完成仅表示交接，不要求返回PDF字节、路径或保存结果。

新增受控异步交接验证：busy在交接完成前保持、第二次请求返回busy；来源/名称不漂移；异步失败释放且无静默重试或改走下载。负类型约束拒绝DocumentRecord输入和将交接结果当作PDF字节。原生beforeprint诊断验证调用时导出仍busy，该导出的分页步骤及临时宿主已释放；隔离夹具中共享DOM空闲，不能将此解读为实际工作台禁止其他独立预览任务运行。

完整check通过：191受管源/配置、361单元、严格类型/覆盖/模块门禁/lint及生产构建；全量96项浏览器测试通过（3.2分钟），包括原双模式三环境、隐藏/等待预览、冻结来源、native失败、pagehide/afterprint清理及新平台交接用例。日志D:/codex/ex-w1b-check.log及D:/codex/ex-w1b-e2e.log。已有hash.js混合导入与大包构建提示保留，未改依赖清单。

## 状态与后续边界

EX-W1工程接入完成。EX-W0系统保存证据仍待补；不能将本轮自动化交接/测试PDF视为实际系统保存，也不能宣称Windows设备默认名已修复。具体问题、保存矩阵、取消步骤与记录格式已单独保存到[手动清单](../acceptance/ex-w0-native-manual-checklist-2026-10-27.md)。本次按用户授权分离工程启动与系统验收/发布门槛，不改写历史未验结果。

Web组合根是当前实现；未来Tauri须在EX-T绑定自身原生交付，审查保存/取消回执及反馈文案，不照搬浏览器打印或当前Web交接文案。本轮不实施原生桥接，也不构造通用平台保存协议。EX-W2命名/保存选择器、EX-W3发布验收及EX-T均未启动；MathJax3.2.2/Paged.js0.4.3不变，不推送、不引入Chromium/Puppeteer/PDF字节库或截图方案。
