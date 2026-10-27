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

## R2：验收观察与MathML断言

P2：原观察器在afterprint时只置标志，没有更新remainingFrames；真实宿主已经移除，报告仍为1。定向新增断言复现失败，见D:/codex/ex-w0-review-observer-reproduce.log。改为在同步清理监听完成后的微任务重新读取宿主数量与busy；afterprint/pagehide分开记录，仍不推断保存。异步散列及afterprint回调持有本次报告引用，不覆盖下一次报告；散列失败显式记录observationError。

原MathML宽度仅检查小于半行，零宽或隐藏元素也可能误通过。现在同时检查两种公式的可见性、非零宽高、原生math布局，以及分式非零宽度、分子中心在分母之上。几何数据附在浏览器报告，保留来源和三环境验证。现有移除display:block的修复未再改动，不以改成SVG/图片绕过MathML。

## 完整路径审查

| 核对点 | 结论 |
| --- | --- |
| 单次准备/冻结 | ExportService接受时复制源与选项；prepareExportContent一次生成只读HTML及冻结资源，切换/编辑不改变本次导出 |
| 唯一HTML源 | generatePdfHtml只接HTML产物，paginatePreparedContent只布局，不再解析MD/LaTeX或重新读取源资源；原生宿主直接使用该HTML |
| 就绪与清理 | load/图片/字体/两次布局帧就绪后才交接；准备期离开停止等待，准备失败/交接失败/afterprint/pagehide移除宿主及归属监听 |
| 中止边界 | 新局部中止从宿主准备开始，不宣称整个渲染/分页跨导航硬取消；不抢占已进入系统打印的操作 |
| 无截图 | PDF链路没有canvas或整页图片生成；测试PDF和渲染PNG仅为开发预检/观察，未进入内容生成源 |
| 命名与保存反馈 | 冻结名称作为HTML标题；无系统路径/默认名保证；状态仅浏览器交接，不由afterprint推断保存/取消 |
| 验收证据 | 原预检PDF两份均存在且散列一致；原记录保留历史日期/数量，不覆盖为新成功；用户人工显示确认与原生文件字节核验继续分列 |

验证通过：189个受管源/配置、358项单元、严格类型/覆盖/边界/lint、生产构建；全部95项浏览器测试通过（3.2分钟），覆盖开发、构建及普通HTTP的两种数学模式，以及就绪/中止/失败/清理。日志D:/codex/ex-w0-review-final-check.log、D:/codex/ex-w0-review-final-e2e.log。

两份新开发预检PDF均6页A4，60行与18段、CJK及末尾完整，后编辑源不存在；字体嵌入并有ToUnicode，内链目标/外链存在，未发现整页图像。PDFium查看MathML/SVG首页与末页，SVG首页另以Poppler交叉复核。结构及历史散列证据见[预检审查证据](../acceptance/web-native-pdf-code-review-preflight-2026-10-27.json)。

记录定义：htmlSha256是加载后DOM序列化的UTF8散列，与归档frozen-paged.html逐字节对应，不是prepare产物包或PDF文件散列。handoff-observation.json是afterprint之前的观察，remainingFrames=1属于等待系统交接的状态；最终清理为0由完整浏览器断言验证，不能把交接前快照误报为泄漏。PDF文件有独立SHA-256。

## 最终状态

本轮代码审查问题已修复并验证；EX-W0整体仍为验证中。原生PDF实际保存文件、系统设备默认名及保存/取消结果未新增证据，不启动EX-W1，不将本次测试浏览器PDF冒充原生保存产物。保留此前用户SVG/MathML正常的人工显示确认。指定引擎版本、包清单、统一导出操作和HTML唯一输出源不变；保留既有大包/hash.js构建提示及用户tag-release.patch。
