# EX-H0—EX-H2 完整代码审查

范围：H0冻结夹具、H1只读HTML生产、H2a/b/c1/c2格式输入与应用确认。基线5f11fdc；不推进EX-W/EX-T或OMML，不升级引擎，不推送。

## 修复单位1：MathML诊断覆盖

P1：原始MathML检测仅列出8种标签。孤立mi/mn/mo/mroot/mover/munder/mmultiscripts/mtext在净化后被抹去，HTML没有留下可信事实，DOCX未阻断。8种真实prepareExportContent回归均复现失败。将原始MathML选择器集中在纯策略模块，生产诊断与目标能力检查复用；净化前留事实，目标仍只读HTML，不重新解释源。

验证：完整bun run check通过，185受管源/配置、349单元测试、生产构建通过。日志D:/codex/ex-h-review-mathml-check.log。已复现的弹窗生命周期问题作为下一独立修复单位，未混入本提交。

## 修复单位2：关闭后不恢复旧确认

P2：准备尚未完成时关闭并重新打开同一弹窗，旧回调只判断当前isOpen，会把已关闭操作的确认重新显示并继续占busy。真实React挂载、关闭、重开、延迟准备夹具复现。新增本次操作的dismissed标志，只在接受新导出时重置；关闭、外部隐藏或卸载均使未发出的旧确认失效。没有增加队列或通用取消平台；不需要确认的已接受生成操作继续沿用原策略。

验证：完整bun run check通过，350项单元测试、类型/边界/lint及生产构建通过。日志D:/codex/ex-h-review-confirmation-check.log。视觉与全部浏览器回归在审查收口统一执行；本修复不改布局。

## 修复单位3：DOCX忠实使用HTML编号和锚点

P2：HTML的ol start=0/-2被强制改为1；容器ID虽加入目标映射，却没有生成书签；同时带id和href的a元素因提前返回也丢失书签。解包DOCX的两项独立回归均复现失败。

列表读取HTML原生start属性，不重新解释MD。链接转换后仍处理自身ID；容器书签落在已有首个段落，无段落的容器才新增最小书签段落。验证所有内部链接均存在实际书签目标，不仅检查XML中出现anchor字样。没有引入新的格式解析器。

验证：4项DOCX定向测试及完整bun run check通过，352项单元测试、185受管源/配置、生产构建通过。日志D:/codex/ex-h-review-docx-check.log；Word/WPS视觉及负起始编号显示仍需后续人工兼容性验收，当前证明OOXML语义保留。

## 修复单位4：失败不留下兄弟图片转换

P2：段落及嵌套行内节点用Promise.all启动图片转换。一张失败时，DOM步骤已拒绝并移除测量宿主，另一张仍在等待解码，随后可能继续创建画布。可控Image.decode夹具复现：宿主已清理但两个转换都已启动。改为内容顺序逐项await，首个失败即停止，不启动后续图片；未增加取消平台、任务池或预算。现有单图形DOCX兼容图片后备保留，与被禁止的PDF正文截图无关。

验证：353项单元测试、严格类型及覆盖、源策略/模块边界/lint、生产构建通过；完整Chromium回归86项通过（3.1分钟），包含新增零/负编号与实际锚点目标校验。全部修复后无失败项。日志D:/codex/ex-h-review-final-check.log及D:/codex/ex-h-review-final-e2e.log。390px详情和1280px摘要截图已查看，弹窗内容滚动、固定操作区与确认状态正常；Impeccable检测为空。

## 完整审查结论与追踪

| 核对项 | 实际入口与结论 | 验证证据 |
| --- | --- | --- |
| H0基线 | 冻结语料未修改，历史文件散列不重写成当前结果 | corpus SHA-256与H0记录一致 |
| HTML唯一内容源 | prepareExportContent构建一次；HTML/PDF/DOCX、分页及能力诊断只读产物；不读源附件 | 依赖门禁、负类型、不同MD/HTML隔离夹具；开发/生产/普通HTTP真实引擎测试 |
| 源保存例外 | MD原样；ZIP只为源引用改写读取图片；编辑附件核对ID/修订/MD散列 | 坏公式/图表源保存、字节与链接保真、附件不匹配拒绝 |
| 单次准备与所有权 | 首次await前复制文档、名称、选项及权限；产物深只读，资产URL去重及SHA；同一引用完成诊断/确认/转换 | export-content/export-service/资产与HTML契约测试 |
| 确认与阻断 | 不支持项不能接受降级绕过；一次确认；等待不占DOM，关闭/卸载/重开不恢复旧确认 | 生命周期夹具与浏览器确认/编辑期间冻结/ESC回归 |
| 格式边界 | DOCX仅映射HTML，不能解析LaTeX；MathML是HTML语义，不表示OMML已完成 | 原始MathML/伪造标记/同次编译语义；OOXML结构、列表与目标书签验证 |
| 清理与失败 | 公式会话恢复；分页实例/样式/宿主局部清理；DOCX构造在DOM内、压缩在外，图片失败停止；下载finally释放URL/链接；PDF就绪失败移除frame，afterprint/pagehide清理交付宿主 | MathJax/Paged适配器、共享DOM及DOCX失败重试测试；浏览器图片错误与afterprint清理 |
| 统一操作 | 单busy；PDF不依赖工作台A4；反馈仅浏览器交接，其他下载只承诺发起 | 全部导出与工作台回归 |

本轮未发现仍需修复的HTML内容旁路、重复准备或绕过确认的生产调用。未引入新依赖；MathJax3.2.2、Paged.js0.4.3保持，未新增Chromium/Puppeteer。依赖大包、hash.js混合导入等已有构建提示保留。

范围限制：未人工保存并检查系统PDF、未验证Windows驱动默认文件名、Word/WPS显示及Tauri。浏览器afterprint不能证明已保存，且宿主生命周期仍依赖浏览器事件；系统交付存续验收继续归EX-W0/W1。不能把自动化的打印交接/事件模拟当作系统保存验收；也不把当前保留MathML和图片DOCX当作原生OMML完成。
