# 导出文件名契约：F0冻结

日期：2026-10-29。实施基线6603e77；用户已批准本契约及后续F1，不重复请求长度规则确认。F0只纳入方案、契约和目标fixture，**不改变生产函数**。

## 最终规则

- 以最终单个文件名组件计UTF-8字节：完整主名、实际设备名修正字符、完整目标后缀合计不超过255字节。没有120码点或库默认100 UTF-16单元的产品上限。
- 仅在完整grapheme边界截断。一个grapheme无法放入主名预算且没有前缀可用时，回退MarkFlow-Document，再附加目标后缀。预算是应用策略，不保证完整路径、所有文件系统或系统保存窗口采用名称。
- 通用清理采用filenamify7.0.3的browser入口、替换字符_，使用其NFC及受测保留名处理。库默认长度不能隐性截掉本可容纳内容；F1必须明确关闭该额外上限，再执行最终字节策略。
- 六种格式保持现有MIME及后缀：editable-html=.markflow.html，reading-html=.html，docx=.docx，print-pdf=.pdf，markdown=.md，markdown-bundle=.zip。已知输出后缀按大小写不敏感重复剥除；普通非输出后缀如.notes保留。库清理产生的已知尾缀也需归一，防止重复附加。
- 通用清理前先保留既有String.trim()，再处理已知后缀与尾随ASCII点/空格；空白/纯点主名回退MarkFlow-Document。不要把///等纯非法但可替换的输入误判为空名。普通隐藏文件名.report保留；../name只是建议名称输入，经库清理为_name，不视为路径授权。
- 常见Windows设备名使用库在replacement=_下的修正：CON→CON_，CON.txt→CON_.txt，COM¹→COM¹_。这与原_CON前置方式有意不同，不维护一套重复的通用设备名正则。最终预算截断后仍需避免新生成设备名或尾点空格。
- C0/C1、Unicode格式字符、Unicode空白和连续非法字符采用已批准库的清理语义；与旧逐字符替换可能不同。纯非法字符清理成_是有效主名，不等于空字符串；不为保持重复下划线引入另一份清洗器。
- 不产生唯一名，不自动加计数，不静默覆盖文件。规范化、替换或大小写可能同名，保存/下载的现有用户选择语义保持不变。

## MIME描述（维持现值）

| 格式 | 后缀 | MIME |
| --- | --- | --- |
| editable-html | .markflow.html | text/html |
| reading-html | .html | text/html |
| docx | .docx | application/vnd.openxmlformats-officedocument.wordprocessingml.document |
| print-pdf | .pdf | application/pdf |
| markdown | .md | text/markdown |
| markdown-bundle | .zip | application/zip |

## 兼容性与不变范围

长ASCII由旧120字符上限变为按最终字节预算，例如原始MD可有252个ASCII主名字符。完整grapheme可能保留更少字节，这是保持字符完整的预期结果；库marker和非法字符归并差异属于本次显式迁移。

只有导出建议名变化：不改Markdown、文档ID/修订、持久化数据、资源散列、会话/缓存或HTML正文。PDF继续使用统一baseName作HTML标题建议，不走字节选择器，不保证系统默认名。六格式导出入口、prepare、授权、取消、busy和清理不变；MathJax/Paged.js不变。

## 目标fixture与分步证据

[目标样例](../../tests/fixtures/export-filename/f0-targets.json)涵盖六格式、NFC、设备名、复合/重复后缀、相对式输入、长ASCII/中文/emoji、旗帜/家庭/肤色/音标和超大单grapheme。fixture是F1的目标，不是F0生产行为已通过的声明。F0由Luna审查样例并运行现有文件名/导出单元基线；F1才将样例接到真实exportFile断言，禁止todo或跳过测试伪造新行为绿灯。

已有[隔离对比报告](D:/codex/.codex/tmp/marklflow-filename-comparison-2026-10-29/文件名库对比报告.md)只作为参考；不复制其码点截断或共享大适配。F1依赖及纯模块门禁只放行精确filenamify/browser入口，不放行Node主入口或包级通配。

F0契约由GPT-6 Luna审查及基线验证，记录见[执行记录](../reviews/filename-replacement-f0-f1-2026-10-29.md)；通过后本地提交，其后才实施F1。EX-W0及原生保存手动门槛仍待补，不推进F2/图片签名支线或Tauri，不推送。
