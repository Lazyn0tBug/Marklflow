# EX-W3 代码与验收记录审查（2026-10-29）

基线b33978f，architecture-refactor。按用户协作规范，代码/文档/验收记录审查由GPT-6 Luna（exw3_review）执行，测试与独立证据核验由GPT-6 Luna（exw3_tests）执行；主代理只做协调、文档修订和本地提交。全局规范已写入D:/codex/.codex/AGENTS.md，原配置/H5规范保留。

## 发现与处理

未发现产品代码、锁文件、归档字节或验收门槛的阻断问题。低严重度文档精度问题：W3b原摘要将CJK、末尾、矢量及链接检查并列，可能被理解为五份PDF使用相同强断言。实际辅助脚本按样例有不同检查范围。

已按Luna建议将摘要拆清：全部五份的A4/非空文本/至少一个嵌入字体及至少一个ToUnicode映射；两份native语料的CJK、60行/18段、最终/后来标记、矢量、链接、原始图片及冻结HTML散列；工作台/长文样例各自标记；单页HTML兼容PDF没有附加CJK/末尾/链接断言。不增加原本未执行的验证，也不改变QA脚本和原产物。

为避免修订文档与历史哈希混淆，原阶段JSON新增documentSnapshotCommit=b33978f并保留原documentHashesLF。Luna已按Git历史LF字节独立复核旧哈希，准确性通过。本轮结果独立记录，不回填旧115项全量浏览器运行。

## 审查边界与结果

- bun.lock/清单、MathJax3.2.2/Paged.js0.4.3及本地安装版本相符；离线冻结一致性检查保持no changes。没有将本地缓存检查说成空目录干净安装或远端CI通过。
- W3a历史377项单元和115项浏览器计数有实际日志；新增生产资源测试在全量日志中通过。它只证明受测文档路径不需外部CDN，不宣称应用断网冷启动或任意网络内容离线。
- Luna逐项核对66条稳定归档记录、每份文件/清单/检查脚本SHA-256；联系表共26页已查看。检查脚本未重新执行，避免覆盖历史manifest/inspection；结构、联系表观察与真实系统保存仍分列。
- HTML唯一内容源、源保存例外、PDF原生交接、单busy与局部资源清理维持原实现，没有为本次审查新建调度/保存平台或改变引擎。
- 支持表、三份架构文档、专项路线及计划均保持EX-W3自动部分完成；完整验收与发布未通过，EX-T未启动。EX-W0系统文件/默认名/取消、原生保存实际磁盘/权限/覆盖、Word/WPS显示仍待补；干净安装及远端CI未执行。

工具：Luna使用现有Git、Bun、Python散列/文件检查及PDF技能/联系表检查；不新增安装。用户tag-release.patch受保护，不加入提交。

## 本轮验证

Luna完整check通过：197受管源/配置、57个测试文件、377项单元，严格类型/覆盖/边界/lint/生产构建。日志D:/codex/ex-w3-review-check.log。本轮浏览器选择生产资源、统一保存、Web PDF交付三个spec，使用已有测试浏览器，20/20通过（34.6秒）；日志D:/codex/ex-w3-review-e2e.log，独立结果D:/codex/ex-w3-review-browser-results。没有生成新PDF，也没有重跑全部115项。

EX-W0及原生保存手动验收仍待补，不宣称完整验收通过。不推送、不移动标签，不升级MathJax、不替换Paged.js，不引入Chromium/Puppeteer或截图方案。


运行器输出：测试前后test-results/worker-probe-dist的132个文件均由Luna逐项核对并原字节还原。gitignore内playwright-report正常更新为本轮20项的可再生报告；W3a历史115项仍以D:/codex/ex-w3a-e2e.log和稳定归档为准，不将新HTML报告当作历史全量报告。66项稳定归档的字节数/SHA-256、清单和helper散列未变；package.json、bun.lock和用户补丁未变。

证据导航：[本轮验收JSON](../acceptance/web-regression-code-review-2026-10-29.json)、[支持与待验表](../design/web-export-support-2026-10-29.md)、[历史阶段汇总](../acceptance/web-regression-closeout-2026-10-29.json)、[W3a历史全量记录](../acceptance/web-regression-auto-2026-10-29.json)、[实际产物记录](../acceptance/web-regression-artifacts-2026-10-29.json)、[原执行记录](web-regression-closeout-2026-10-29.md)。历史documentHashesLF必须按documentSnapshotCommit=b33978f核对，而非将后续措辞修订的工作区字节套入历史快照。
