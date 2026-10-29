# EX-W2 完整代码审查（2026-10-29）

基线4025491，architecture-refactor。范围：统一命名、用户激活、取消/失败、HTML内容来源、busy、资源清理及验收记录。不推进EX-W3/EX-T，不推送；EX-W0系统证据仍待补。

## R1：Unicode命名字节预算

P2：原名称仅限120码点及UTF-16长度，未限UTF-8字节。可编辑HTML建议名的120个中文字符为374字节、120个emoji为494字节；原“长度通过”测试不能证明建议名满足字节长度预算。修复为保留原120码点上限，同时按255字节的保守组件预算逐码点截断，预留目标扩展名及可能的Windows设备名下划线。不会拆分代理对、移除扩展名或改动正文。该预算不替代系统的完整路径及实际保存验收。

新增六格式×中文/emoji/ASCII/设备名前缀组合验证，检查UTF-8与UTF-16均不超过255；更新emoji期望上限。完整check通过：196受管源/配置、57个文件、377项单元、严格类型/覆盖/边界/lint/生产构建。日志D:/codex/ex-w2-review-naming-check.log。历史W2a测试计数保持历史事实，不回写为本轮结果。

## R2：平台审查、回归与证据归档

已确认历史4025491的九个Git LF源文件哈希及五份PDF预检哈希均吻合；原始PDF已按字节复制至D:/codex/ex-w2-acceptance-archive，避免后续test-results清理覆盖历史证据，不把归档视为新增系统验收。


P2：历史PDF路径位于会被Playwright清理的test-results，后续回归会使验收JSON失去文件引用。已在重跑前确认五份原始哈希，原样归档并将JSON的path改为稳定归档路径；originalPath保存旧路径，所有原哈希/页数/验证计数不变。九个源文件哈希匹配4025491，补sourceSnapshotCommit明确历史口径；本轮结果另记，不用新文件冒充旧产物。

审查结论：

- 用户点击→handleExport→run→selectSave之间无await；同步建立busy及冻结快照后才调用选择器。Web适配在安全环境/API/瞬时激活均可用时调用；普通HTTP/缺能力/无激活在调用前选下载。受控浏览器测试确认真实点击时picker观察到active=true；不将此当作原生选择框实测。
- 选择AbortError只返回取消；不生成或下载。权限/选择/写入/close失败向上报告，无静默后备。生成失败、DOCX不支持/拒绝不打开写流；选中句柄无需额外销毁，也不删除用户路径或选择器可能创建的空文件。
- 字节目标仅接Blob；其他内容格式仍只消费单次prepare的冻结HTML，MD/ZIP及可编辑源附件仍是原定源保存例外。PDF只经generatePdfHtml→deliverPdf，不接字节选择器，工作台A4/缓存不是前置。
- 所有保存返回均被await，busy保持到平台提交/交接完成，finally在取消/失败时释放；write和close均完成才报保存，下载只报发起，PDF只报浏览器交接。平台流失败尝试abort并保留原错误，锚点/URL在finally清理；未增加队列、通用资源框架或重试机制。
- 旧记录的111项浏览器测试是4025491历史结果。本轮完整check通过377项单元；增加3项工作台用例（长Unicode、close失败、生成失败及显式源保存重试），选择相关四个浏览器测试文件25/25通过（1.3分钟），未重跑全量浏览器套件。最新integration类型检查及lint/边界通过。日志：D:/codex/ex-w2-review-naming-check.log、D:/codex/ex-w2-review-integration-types.log、D:/codex/ex-w2-review-lint.log、D:/codex/ex-w2-review-e2e.log。

[本轮验收JSON](../acceptance/web-unified-save-code-review-2026-10-29.json)记录当前源码哈希；[原验收JSON](../acceptance/web-unified-save-2026-10-29.json)保留历史源码与产物哈希。本轮只核验并归档原PDF字节，未新增PDF内容/视觉或系统保存验收。EX-W0系统文件/默认名/取消仍待补，字节格式原生选择器的真实磁盘/权限/覆盖证据也仍待补。工程验证不替代EX-W3发布门槛。

API依据：[选择器安全环境与激活要求](https://developer.mozilla.org/en-US/docs/Web/API/Window/showSaveFilePicker)、[写入与close提交](https://developer.mozilla.org/en-US/docs/Web/API/FileSystemWritableFileStream/write)。静态调用顺序、受控协议验证、浏览器交接和系统保存证据分别记录。

MathJax3.2.2/Paged.js0.4.3不变；未新增依赖、Chromium/Puppeteer/PDF字节引擎或截图方案；不推送，不推进EX-W3/EX-T。
