# EX-W2 Web统一保存实施与审查（2026-10-29）

计划见[小步实施计划](../design/web-unified-save-implementation-plan-2026-10-29.md)。EX-W0系统证据仍待补，未推送。

## W2a：统一命名

纯应用层exportFile负责格式扩展名/MIME及建议名称。保留Unicode中文与空格，NFC规范化，替换跨平台无效字符；清理重复已知输出扩展名（允许用户切换格式），空名回退；Windows设备保留名加前缀，限制Unicode码点数量而不截断代理对。下载名称与PDF标题来自同一描述；PDF标题使用主名称，不承诺系统采用。

审查：无平台/DOM依赖、无用户内容解析；不改正文或原始Markdown。表驱动覆盖所有六种格式与Unicode/中文/空名/多重后缀/设备名/非法字符/长度。完整check通过：193受管源/配置、56个测试文件、364项单元，严格类型/覆盖/边界/lint/生产构建通过。日志D:/codex/ex-w2a-check.log。已有Vite配置与大包提示保留；引擎和依赖未变。

## W2b：目标选择与字节提交

应用端口selectSave仅接最终文件描述，返回局部ByteSaveTarget或取消；handle/stream由Web适配器持有。选择调用在run首次await前发生，busy与冻结来源已建立。取消不准备HTML；生成与确认后才写入，write和close都成功才反馈已保存。未知API结果经现有externalApi严格边界收窄，方法保留原接收者。普通HTTP/API缺失/无激活在调用前选下载；选择器错误或写入失败不静默降级。流失败尝试abort、保留原始错误。PDF仍只调用deliverPdf；源MD/ZIP例外不变。

审查修正：源MD也必须await字节提交后才能退出finally释放busy；已落实。测试替身补齐显式参数/字面量返回类型，通过严格检查，无any绕过。新增选择取消、等待选择时冻结、等待close时busy、拒绝DOCX不写入、权限/生成/提交失败、无激活和下载清理覆盖。完整check通过：195受管源/配置、57个单元测试文件、376项单元，严格类型/覆盖/边界/lint/构建通过；定向26项测试通过。日志D:/codex/ex-w2b-check.log及D:/codex/ex-w2b-targeted.log。尚未以替身写入结果冒充系统文件验收，工作台全链路回归在W2c执行。
