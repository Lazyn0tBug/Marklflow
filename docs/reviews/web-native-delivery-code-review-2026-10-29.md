# EX-W1 完整代码审查（2026-10-29）

基线 cb8824e，分支 architecture-refactor；主工作区为 tauri，本轮在独立工作区审查，未改动主工作区。范围为 Web 平台边界、deliverPdf、HTML 唯一输出源、busy、资源清理和验收记录。不推进 EX-W2。

## 发现与修复

P2：模块门禁对导入后缀覆盖不完整。HTML 格式适配器可以通过 `model/document.ts` 导入源文档类型；内容生成器可以通过 `pdfDelivery.js` 形式绕过禁止反向依赖平台交付的规则。当前生产代码没有这些越界导入。本轮补齐 TS/JS 及其模块扩展形式，并用实际导入/重导出门禁测试防止回归。不改变运行时平台实现。

补充两项实际浏览器回归：focus 抛错时移除交付宿主、释放 busy，允许显式重试；pagehide 清理后再次交付另一数学模式，afterprint 仍能清理，不报告保存成功。合成 pagehide/afterprint 用于生命周期验证，不代表真实系统保存或取消验收。

验收记录补充：历史 JSON 的五个文件哈希全部与 cb8824e 的 CRLF 工作区字节吻合；原记录未声明换行约定，易被按 Git LF 内容校验时误判。本轮仅补充哈希口径与对应提交，保留原哈希和验证计数。

## 审查结论

- 原生 focus/print 仅存在于 Web pdfDelivery 适配器，组合根绑定 deliverPdf；共享 documentPrint 不提供原生交付旁路。平台适配器只接受完整 HTML，无 Markdown/LaTeX 解析或 PDF 字节生成。
- 应用服务在首次 await 前冻结文档、文件名与配置；正文只准备一次 HTML；PDF 只分页同一 HTML 产物。原始 Markdown/资源包保存和可编辑 HTML 附件仍是既定源保存例外。
- busy 覆盖准备、生成到平台交接返回；finally 在失败后释放。交接返回不能证明保存、取消或默认名。未来 Tauri 回执及反馈仍留待 EX-T，不在本轮构造通用协议。
- 资源为局部所有：就绪阶段 pagehide 中止等待并移除 iframe；load/error 回调及准备监听器在 finally 解除；布局帧、计时器与 abort 监听按现有工具释放；交付失败、afterprint 和 pagehide 清除交付宿主及对应监听。不加可能截断系统保存的定时强制销毁。未观察到新的运行时清理缺陷。
- 分页步骤在交接前退出共享 DOM；独立夹具的 DOM 空闲断言不解释为禁止其他预览。后台预览、缓存和 A4 工作台不作为导出前置。
- 2026-10-27 接入记录与 JSON 是历史验证快照，保留原计数及哈希；本轮另记结果，不将历史记录写成当前文件哈希。EX-W0 系统 PDF 文件、默认文件名和取消记录继续待补，检查清单仍适用；自动浏览器交接不可替代。

## 验证

完整 check 通过：191 受管源/配置、55 个单元测试文件、361 项单元测试、严格类型/覆盖/边界/lint 和生产构建。Web 平台交付定向浏览器回归 3/3 通过；本轮未重跑此前 96 项全量浏览器测试，不新增系统保存证明。日志：D:/codex/ex-w1-review-check.log、D:/codex/ex-w1-review-e2e.log。

MathJax 3.2.2、Paged.js 0.4.3 不变；未安装/引入 Chromium、Puppeteer 或 PDF 字节库，不采用截图 PDF，不推送。
