# EX-W0 Web原生PDF基线验证

基线：architecture-refactor / c475056。首次实施时主目录为tauri，因此使用独立Git工作目录；当前审查已回到D:/code/Marklflow的architecture-refactor。历史Tauri工作未由本轮改动。

## 小步单位

1. W0a：新增仓库自有验收语料与开发/生产验证夹具，调用真实ExportService→prepareExportContent→generatePdfHtml→printFrozenHtml。自动化只验证冻结、分页、来源/清理及交接，不把模拟print、CDP/page.pdf当作系统保存验收。检查并本地提交。
2. W0b：使用现有已安装浏览器的原生打印/保存UI生成真实PDF；分别记录浏览器另存PDF和Microsoft Print to PDF设备的默认文件名、页面设置、保存路径及取消；抽取PDF页面、文本/CJK、字体、链接、图形/图片对象并渲染核对。必要的范围内修复另开小步，检查后本地提交。

## 共同退出条件

单次HTML准备，之后仅分页；修改源不改变已接受内容；多页与最后标记、连续表格行、CJK、数学及Mermaid/SVG、链接与本地图片保留；正文是真实文本而非整页图像。PDF是浏览器原生输出，测试截图只用于观察。A4、100%缩放、页眉页脚/边距等设置记录为宿主验收参数，不增加应用专属预览。

记录哪些系统设备已验、哪些未验；Web返回仅系统交接，不能根据afterprint推断保存/取消，也不能保证系统驱动默认采用标题。真实系统保存不能由自动化HTML或测试浏览器PDF替代；发现内容缺失则EX-W0不通过并回修；仅证据待补时按用户后续授权条件推进EX-W1，系统验收状态不变。

不推送、不升级MathJax3.2.2、不替换Paged.js0.4.3；不新增Chromium、Puppeteer、PDF字节库或截图生成方案。现有测试浏览器和系统Edge只用于验收。

完整代码审查及修复见[审查记录](../reviews/web-native-pdf-code-review-2026-10-27.md)；原生文件与默认名门槛继续待补；按用户后续授权条件推进EX-W1工程，见[推进计划](web-native-delivery-implementation-plan-2026-10-27.md)。
