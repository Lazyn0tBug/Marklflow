# 文件名第三方替代：F0/F1执行记录（2026-10-29）

用户批准最终文件名<=255 UTF-8字节、完整grapheme、移除120码点上限，仅实施F0/F1；不推进图片签名/F2/Tauri，不推送，不升级MathJax3.2.2、不替换Paged.js0.4.3。主代理实施，GPT-6 Luna审查和测试。

## F0：契约与目标样例

基线6603e77。纳入已独立审查的[方案](../design/third-party-boundary-replacement-plan-2026-10-29.md)，冻结[命名契约](../design/export-filename-contract-2026-10-29.md)及[目标fixture](../../tests/fixtures/export-filename/f0-targets.json)。目标包括六格式/MIME、复合/重复后缀、trim/空名、库replacement=_下设备名、Unicode/预算临界和超大单grapheme。新增非法名///与空名不同的目标，避免库输出_被错误回退。

Luna已核对库精确选项、样例预算/覆盖及JSON/文档链接；指出leading-space trim、纯点回退应在库调用前处理，已明确；六格式MIME表已补齐。F0目标不是当前生产行为通过证明，尚未接入生产函数。

基线使用项目Vitest脚本：bun run test:unit -- tests/unit/export-file.test.ts tests/unit/export-service.test.ts，2文件/23项通过。Luna先误用bun test导致vi.mocked不兼容的运行器错误，改用package脚本后通过；不把该失败视为代码回归。未新增todo/跳过测试制造新目标通过。

F0只改变文档和JSON目标，无生产/依赖变更。用户tag-release.patch保持原字节且不参与提交。F0最后文档/fixture补充后由Luna只读复核，通过后本地提交一次，再开始F1。

## F1

尚未开始，待F0提交后执行。EX-W0及原生保存手动证据仍待补，不因本轮命名替代宣称完整验收通过。
