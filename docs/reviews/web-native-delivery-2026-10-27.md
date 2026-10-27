# EX-W1 Web原生交付接入记录

工程启动依据见[具体问题与手动验收](../acceptance/ex-w0-native-manual-checklist-2026-10-27.md)、[实施计划](../design/web-native-delivery-implementation-plan-2026-10-27.md)。用户授权缺证据不影响时先推进；EX-W0完整系统验收未改为通过，不推送。

## W1a：Web平台边界

已有preparePrintFrame/printFrozenHtml宿主逻辑原样迁至core/platform/web/pdfDelivery.ts，唯一公开deliverPdfHtml接收完整冻结HTML；prepare为私有。Web组合根接入此函数，原共享documentPrint仅保留布局/期限/纸张样式工具，不留旧原生交付重导出。没有新建iframe管理平台、渲染器、任务队列或PDF字节生成器。

模块门禁覆盖Web PDF适配器的源解析禁入，并拒绝HTML生成/分页反向导入平台PDF交付；Web组合根允许绑定。原生窗口调用仍是适配器内部细节，UI和内容转换器不直接调用。MathJax3.2.2/Paged.js0.4.3保持。

验证：完整check通过，190受管源/配置、359单元、类型/边界/lint及生产构建通过；原生交付9项浏览器定向回归通过，包含三环境双数学模式、就绪离开、交接离开和失败清理。日志D:/codex/ex-w1a-check.log及D:/codex/ex-w1a-e2e.log。
