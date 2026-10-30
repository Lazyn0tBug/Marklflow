# CI E2E 稳定性修复（2026-10-30）

状态：GPT-6 Luna审查与本地验证通过；远端Linux CI待授权推送后验证。基线67da7e17fe62aba8b62c7e08e8de5af7d9e9cd70。

## 失败证据与修复

真实失败运行：[CI 40995815886](https://github.com/Lazyn0tBug/Marklflow/actions/runs/40995815886)。完整失败日志保存在D:/codex/ci-e2e-fix-2026-10-30/github-ci-failed.log，不能只按用户摘录的idle/connection refused推断导出业务失败。

- CI日志03:13:10.906 UTC：前一项“离开等待中的交付页面”已通过，随后Bun1.4.2/Linux下Vite服务报ERR_STREAM_WRITE_AFTER_END并exit1；接着原生PDF夹具保持idle超时，后续4176连接拒绝。日志足以确认服务进程异常退出及故障先后关系，未取得更深内部trace，不能断言具体哪次HTTP响应导致异常。本机Windows局部原版2/2及重复6/6通过，未稳定复现Linux崩溃。
- Playwright的三项Vite HTTP服务改由Node显式启动；Bun1.4.2仍负责包管理、脚本和构建，依赖/MathJax/Paged.js不变。CI使用固定setup-node v4提交与Node24.21.0，版本与本机一致，官方发行文件可访问；不在应用中封装Node或浏览器，不改变正式应用运行方式。
- 完整CI另有lostpointercapture测试失败。releasePointerCapture只设置待处理捕获状态，按[W3C Pointer Events的待处理捕获机制](https://www.w3.org/TR/pointerevents3/#process-pending-pointer-capture)，测试需继续发送原生指针事件，让浏览器派发lostpointercapture后再检查恢复；不靠增加超时/重试、合成生产取消回调或修改分栏业务来通过。
- 不改变原生PDF交付、HTML唯一输出源、busy或资源清理的生产实现；不把浏览器交接或自动预检当作真实系统保存证据。

## 验证门槛

Luna负责配置/测试代码审查、指针时序验证、最终完整check及CI模式启动的全套e2e。远端Linux CI需用户后续授权推送后重跑，本地通过不等同远端已通过。EX-W0系统文件/默认名、真实OS IME/原生保存、WordWPS及跨OS包等已有门槛不变。两份预存architecture索引保留，不纳入提交；不推送、不移动标签。

## 本地最终验证

- Luna完成bun run check：212受管源/配置、63单元文件、453项单元及类型/源策略/边界/lint/生产构建通过。应用源码、package.json/bun.lock和MathJax/Paged.js版本未改。
- 最终CI=true全量e2e为134/134通过，5.3m，明确记录进程退出码0；包括原始故障相关PDF交付用例及修正的lostpointercapture用例。三个端口PID/完整命令确认均为node.exe；未复用旧Bun服务。
- 最终原始stdout/stderr、exit-code/result JSON、passed且failedTests为空的last-run JSON及Playwright完整报告ZIP均已保存。此前一次通过后的本地报告曾被补录短运行覆盖，已通过此次预先记录输出的完整执行补齐；此前摘要不作为最终原始报告。未因此放宽超时、添加自动重试或跳过测试。
- workflow YAML解析和固定setup-node SHA核对通过；指针事件侦听在release前注册，再用真实pointermove处理待释放捕获，确保观察到lost事件后恢复原比例且不保存取消的拖动。分栏生产代码不变。
- 证据目录D:/codex/ci-e2e-fix-2026-10-30/；最终以node-runtime-full-e2e.*、node-runtime-last-run.json、node-runtime-playwright-report.zip和node-server-processes.log为准。[验收清单](../acceptance/ci-e2e-stability-2026-10-30.json)记录输入哈希与各层证据。
- 本机为Windows；远端原始失败发生在Linux，当前未推送也未执行修复后的远端运行，不声明GitHub CI已转绿。两份预存索引保留原SHA且不暂存，其他既有发布待补门槛不变。
