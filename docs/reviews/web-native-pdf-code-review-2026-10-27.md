# EX-W0完整代码审查

基线f72b9ef，当前在D:/code/Marklflow的architecture-refactor执行。旧临时工作目录已由外部操作收回；保留未跟踪tag-release.patch。本轮不重做EX-W1，不推送，不升级MathJax、不替换Paged.js、不引入浏览器/Puppeteer或截图方案。

## 审查与小步单位

1. 原生宿主准备的页面生命周期：复现页面离开时仍等待布局的问题；修复局部中止、移除宿主及等待清理，验证后提交。
2. 验收夹具：afterprint后重新观察真实清理状态，避免旧回调写入新记录；加强MathML可见性/数学几何断言，复核证据散列和原生保存边界，完整回归后提交。

既有修复依靠原生MathML布局，不改为SVG/图片。单次prepareExportContent生成只读产物；generatePdfHtml只分页，printFrozenHtml仅接HTML字符串。打印后的系统保存不能从浏览器事件判断，人工显示确认与文件字节核验继续分列。

## R1：宿主准备阶段页面离开

P1：准备阶段仅等待load/图片/字体/布局，pagehide清理直到preparePrintFrame返回后才注册。暂停字体就绪并在load后触发pagehide可复现：旧实现仍保持running、宿主未及时移除。失败证据D:/codex/ex-w0-review-leave-reproduce.log。

局部AbortController只管理准备阶段；pagehide中止等待并移除宿主。withDeadline支持可选信号并清理定时器/监听器，已取消时仍观察输入Promise的迟到拒绝；等待布局结束/取消时释放排队的rAF。load/error处理器和准备期pagehide监听在finally移除；就绪后的afterprint/pagehide/打印抛错走同一局部清理，同时移除两种监听。

不向正在进行的系统打印添加强制超时，不判断保存/取消，不建设任务平台；原生图片decode和字体工作不宣称被物理中断，中止后不再继续布局/交付。普通调用省略信号时的完成及超时行为保持。

验证：新增5项等待/中止单元测试，完整check通过（189受管源/配置、358单元、严格类型/边界/lint及构建）；准备离开、就绪离开、打印抛错浏览器定向验证见D:/codex/ex-w0-review-readiness-e2e.log。其余全量浏览器回归在R2收口执行。
