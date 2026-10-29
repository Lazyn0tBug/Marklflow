# F2工作台与导出回归执行记录（2026-10-29）

基线f9028b9。用户授权F2，并明确独立代码/文档审查集中到X；本步主代理补测试及记录，GPT-6 Luna只负责测试执行和数据/格式核对，**未做独立代码审查**。通过后本地提交，不推送、不推进图片签名/C/X/Tauri；不升级MathJax或替换Paged.js。

## 实施范围

在既有web-unified-save测试中补7项F2工作台用例：五种字节格式使用长家庭ZWJ输入和大小写重复后缀，逐项比对界面建议名、保存选择器suggestedName、生成内容和编辑器源内容；PDF核对同一规则得到的HTML标题、正文和原生交接/清理，确认不走字节选择器；普通HTTP真实下载252个ASCII主名+.md，核对建议文件名及保存的精确UTF-8源内容，证明120码点上限没有从UI路径重新出现。

普通HTTP用例断言download.suggestedFilename，再将内容以固定测试名f2-original.md归档读回；这不是在系统保存框中验证255字节名称，也不证明任意文件系统/完整路径均可写。

没有修改生产源码、依赖清单或锁文件；无需为已有正确路径制造新的UI或平台分支。支持表更新为最终255字节与完整grapheme，移除旧120码点描述；原阶段历史测试计数不回写。

## Luna测试结果

- 完整bun run check通过：197受管源/配置、57个单元测试文件、405项单元、严格类型/覆盖、模块门禁、lint及Vite生产构建。
- 指定五个浏览器spec共38/38通过：web-unified-save、web-pdf-delivery、export-service、export-confirmation、source-import。覆盖六格式命名与内容、普通HTTP实际下载、旧格式导入/身份恢复、来源冻结、取消、写入/close/生成失败及显式重试。使用既有Chromium156.0.8078.4，版本经Playwright API取得，不安装浏览器。
- 新浏览器结果独立保存D:/codex/f2-filename-browser-results；没有生成新PDF或打开系统保存框。字节选择器为受控替身，PDFprint被拦截，只证明交接与清理，不证明系统保存/取消/最终默认名。
- 旧稳定归档66项逐项存在、字节数及SHA-256一致；src/package.json/bun.lock无变化。tag-release.patch保持原散列9284099EDCD54CE0D9580C42C370BC3163E4DE5DF0652E163BF9411F31683D48，不加入提交。

日志D:/codex/f2-filename-check.log、D:/codex/f2-filename-e2e.log。现有配置会重建test-results/worker-probe-dist，本次没有备份或恢复旧的可再生夹具，不宣称原字节恢复；独立结果目录及D:/codex的稳定归档不受影响。gitignore内HTML报告为本轮可再生报告，不能冒充历史115项全量。环境探测中直接chrome.exe --version遇到SxS启动错误，随后通过Playwright API成功取得实际版本；测试执行成功，未安装/修改运行时。

## 状态与后续

[验收JSON](../acceptance/filename-replacement-f2-2026-10-29.json)、[替代方案](../design/third-party-boundary-replacement-plan-2026-10-29.md)、[支持表](../design/web-export-support-2026-10-29.md)。本步独立代码审查延期X，未自动启动X。EX-W0及原生保存、Word/WPS、跨OS、干净安装及远端CI按各自门槛待补/未执行，不宣称完整验收通过。
