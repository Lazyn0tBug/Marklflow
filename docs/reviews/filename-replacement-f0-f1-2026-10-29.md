# 文件名第三方替代：F0/F1执行记录（2026-10-29）

用户批准最终文件名<=255 UTF-8字节、完整grapheme、移除120码点上限，仅实施F0/F1；不推进图片签名/F2/Tauri，不推送，不升级MathJax3.2.2、不替换Paged.js0.4.3。主代理实施，GPT-6 Luna审查和测试。

## F0：契约与目标样例

基线6603e77。纳入已独立审查的[方案](../design/third-party-boundary-replacement-plan-2026-10-29.md)，冻结[命名契约](../design/export-filename-contract-2026-10-29.md)及[目标fixture](../../tests/fixtures/export-filename/f0-targets.json)。目标包括六格式/MIME、复合/重复后缀、trim/空名、库replacement=_下设备名、Unicode/预算临界和超大单grapheme。新增非法名///与空名不同的目标，避免库输出_被错误回退。

Luna已核对库精确选项、样例预算/覆盖及JSON/文档链接；指出leading-space trim、纯点回退应在库调用前处理，已明确；六格式MIME表已补齐。F0目标不是当前生产行为通过证明，尚未接入生产函数。

基线使用项目Vitest脚本：bun run test:unit -- tests/unit/export-file.test.ts tests/unit/export-service.test.ts，2文件/23项通过。Luna先误用bun test导致vi.mocked不兼容的运行器错误，改用package脚本后通过；不把该失败视为代码回归。未新增todo/跳过测试制造新目标通过。

F0只改变文档和JSON目标，无生产/依赖变更。用户tag-release.patch保持原字节且不参与提交。F0最后文档/fixture补充后由Luna只读复核，通过后已本地提交39d042f，随后开始F1。

## F1

F0已提交39d042f，F1在此后实施。固定新增filenamify7.0.3及锁中的filename-reserved-regex4.1.0；原依赖版本均未变。仅exportFile模块可导入精确filenamify/browser入口，其他位置/Node主入口均受模块门禁拒绝。

生产保留一个exportFile适配：库负责通用清洗/NFC/保留名，显式maxLength=Infinity关闭库默认100 UTF-16截断；产品通过原生Intl.Segmenter按剩余UTF-8预算取完整grapheme。预算包括实际库修正和完整目标后缀，无120码点上限。截断后再走同一清洗规则，处理新暴露的设备名、尾点或已知后缀。旧通用清洗正则、ASCII-only设备名正则及码点截断删除，无旧新运行时双实现。

首轮目标化51/53通过，两个失败来自F0 combining-boundary及重复cluster期望仍使用x+U+0308，而NFC应为U+1E8D（ẍ）。修正fixture/测试期望并增加q+U+0308的不可预组合覆盖；没有更改产品实现绕过NFC。这是F0目标数据纠正，不将原静态预算核对称为当时生产行为已通过。首轮日志保留。

Luna最终验证：

- Vitest目标化3文件53/53通过（真实25个fixture+导出服务+依赖边界）。
- 完整bun run check：197受管源/配置，57文件405/405单元，严格类型/覆盖、边界、lint、Vite生产构建通过。仅有既有chunk/hash.js提示。
- 最小browser bundle导入真实exportFile.ts，现有Chromium156.0.8078.4运行25/25目标名称精确一致，最大255 UTF-8字节，无Node/Buffer shim。7220字节是该测试bundle，不是宣称生产净增包体。
- 清单/锁仅新增上述两包；MathJax3.2.2/Paged.js0.4.3不变，用户patch散列未变，diff --check通过。

日志D:/codex/f1-filename-targeted-initial.log、D:/codex/f1-filename-targeted.log、D:/codex/f1-filename-check.log；browser结果D:/codex/.codex/tmp/marklflow-f1-browser-2026-10-29/result.log。本轮只做F1最小构建/纯函数浏览器验证，没有重跑F2工作台全量或跨OS/系统保存。

[验收JSON](../acceptance/filename-replacement-f1-2026-10-29.json)记录源码/清单/锁/fixture当前LF哈希。F1通过后本地提交一次，不推送。EX-W0/原生保存/WordWPS/跨OS/干净安装/远端CI仍按各自记录待补或未执行，不因命名库宣称完整验收通过。未推进F2、图片签名、C线或Tauri。

F1依赖一致性补验：Luna执行bun install --frozen-lockfile --offline --ignore-scripts成功，报告no changes；package.json/bun.lock执行前后SHA-256不变。日志D:/codex/f1-filename-lock-check.log。该检查不等于空目录干净安装或远端CI。
