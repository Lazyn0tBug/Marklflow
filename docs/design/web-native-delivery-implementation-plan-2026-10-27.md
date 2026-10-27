# EX-W1 Web原生交付接入小步计划

基线64920d0。用户授权：保存具体手动验收缺项及建议；不影响EX-W1时先推进。结论：EX-W0代码/自动化通过且已有用户显示确认，剩余为原生文件及设备记录，无已知内容缺陷；可以条件启动EX-W1工程，不把EX-W0完整验收视为通过。

## 提交单位

1. W1-plan：保存手动验收清单与条件推进裁决，同步现行路线；只改文档，检查本地链接/JSON后本地提交。
2. W1a：将已有原生iframe准备/打印交接/清理原样迁至core/platform/web/pdfDelivery.ts；唯一公开入口deliverPdfHtml仅接完整HTML字符串，prepare宿主为私有。Web组合根接此入口，documentPrint保留共享布局/期限工具，移除旧原生入口。沿用现有取消/就绪/清理，不新建调度器。增加边界门禁，检查和定向回归后提交。
3. W1b：应用端口print更名deliverPdf，语义为原生PDF交付、返回Promise<void>，不承诺文件字节/路径/保存结果；沿用唯一ExportService、现格式键print-pdf及统一UI。补冻结/单busy/失败/DOM归属验证，全部回归后提交并同步状态。

## 验收

HTML单次准备和Paged.js完整分页保持；目标只消费冻结HTML。Web原生调用仅在平台适配器，转换器不可反向调用交付器。交付阶段不持有分页DOM步骤；busy覆盖准备/生成/实际交接，异常释放。就绪后才调用原生输出，afterprint/pagehide/失败清理仍有效，不强制超时删除系统正在使用的宿主。工作台A4关闭/尚未渲染也可导出，无应用PDF专属预览。

原生保存/默认名清单见[手动验收](../acceptance/ex-w0-native-manual-checklist-2026-10-27.md)。工程完成与系统验收分列；EX-W3完整交付/发布前补齐宣称支持路径的证据。EX-W2/Tauri/OMML不在本轮；不推送、不升级MathJax3.2.2、不替换Paged.js0.4.3，不引入Chromium、Puppeteer、PDF字节库或截图方案。

执行结果：W1-plan、W1a、W1b已按小步完成。W1a提交e72f538；全部验证及系统证据状态见[实施记录](../reviews/web-native-delivery-2026-10-27.md)。EX-W0未标通过，不推进EX-W2。
