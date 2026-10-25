# R4 实施与审查记录

日期：2026-10-25；分支：architecture-refactor；父提交：e109d27。依据AR-03草案6 R4；一次本地提交，不推送，不升级MathJax、不替换Paged.js。

## 实现与边界

新增application/exports/ExportService，一个同步busy标志、一份提交时输入副本、简单完成/错误反馈。文档经现有schema复制，格式、文件名、mathMode、远端资源和DOCX降级选项在首个await前捕获；来源文档ID/修订随结果返回，进度/完成文字标明来源。再次调用直接busy，不进入队列，也不重置正在执行操作的busy；所有异常由finally释放，用户可手动重试，不自动重试。

core/platform/web/exportService组合现有generateExportHtml、exportDocumentToDocx和printFrozenHtml。下载函数从ExportModal搬到Web适配文件，保持浏览器下载路径，并用finally保证点击失败也删除链接、释放URL。应用使用同一服务实例，关闭/重开面板不重建busy或取消已接受操作。ExportModal只提交当前选择和展示状态/错误，不再直接编排格式生成与下载。

Web反馈为“已生成并发起下载”或“已打开打印”，不宣称磁盘落盘/PDF保存/实体打印成功。打印后面板保留反馈供查看；关闭面板不代表撤回浏览器打印。既有alert错误路径保留，失败不显示成功。

RoleTaskQueue/RoleTaskScheduler删除导出入队、导出优先、busy接受槽和交付释放接口，Worker请求仅允许preview.flow/preview.a4。删除导出授权/交付回执schema、导出专属阶段/期限选择及二进制产物协议；真实导出的资源访问、SHA-256与内容诊断仍由原生成函数执行，不受此删除影响。双Worker策略升级schemaVersion 5，移除activeExports队列字段。

没有重写HTML/DOCX/打印生成器及其资源收集函数；源保存、存储、预览和源映射入口不变。P2—P5未来迁移复用此服务和函数，不重新实现busy/快照；MD资源包、统一DOM步骤优先级、真实双Worker、Tab缓存、Tauri交付均未提前实施。当前共享引擎仍沿用旧串行函数，不能把R4说成U6共享DOM调度已完成。

## 自审与验证

- 从预览任务代码核对已无export.*、enqueueExport/finishExport/releaseExportReservation或DeliveryReceipt；新增编译负例及运行时负例拒收导出请求。
- 独立服务5项单元验证同步busy、输入/配置冻结、纯MD不调用生成器、各格式函数路由、生成/下载/打印错误释放busy且不重试、坏输入后可继续。
- bun run check通过：四环境类型覆盖110受管文件，source/boundaries/lint、172项单元（30文件）及生产构建。
- 完整Chromium回归32项通过（含2项真实Worker导入烟测）。新增2项验证导出接受后同一事件内编辑不改输出、下载抛错清理链接/URL并允许手动重试；既有HTML离线往返、DOCX公式/图表、打印准备与清理、普通HTTP、分页、存储与三视图全部通过。
- 初次代码迁移的对象返回括号和测试换行转义问题已修正；最终类型/单元/浏览器全部通过，未扩大忽略规则或削弱原产品回归。
- 对照修改前散列：现有生成器、打印函数、资产校验、依赖/锁文件、冻结A0及全部历史证据未变；提交前所有Git引用不变。既有Vite __dirname和大分块警告保留。

证据：[R4验证记录](../acceptance/architecture-r4-evidence.json)。未验证Word/WPS视觉或实体打印，不以浏览器交接冒充磁盘保存；未执行远端CI。本轮停在R4，R5及后续尚未实施。
