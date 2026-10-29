# M2 桌面 build-only CI 迁入记录（2026-10-30）

基线91ce42456edbea8644422f8398ba04b124403482，参考c7c34b942d67fe92d8df242c052b5457c5d14765的tauri-build.yml及35ebcc4/7adbd89/cde20ac历史。状态：本地适配已通过GPT-6 Luna独立审查/测试，无未解决问题；远端矩阵未运行，不标记三系统bundle已验。范围见[迁移方案](../design/tauri-migration-plan-2026-10-29.md)。

## 迁入与调整

- 沿用来源的macos-latest universal双Rust目标、Ubuntu22.04系统库/Noto CJK和windows-latest矩阵。明确要求DMG、DEB+AppImage、MSI+NSIS格式，Windows另有单exe ZIP。Tauri应用配置及0.9.1版本不变，不改业务、权限、文件或导出接口。
- 保留当前ci.yml全部质量步骤，仅增加workflow_call入口；桌面工作流的quality调用同一文件，build-desktop显式needs quality。每个bundle因此以同一提交的类型/lint/单元/生产Web构建及浏览器CI检查为前置，不另写弱化版质量任务。
- 当前仅workflow_dispatch和architecture-refactor相关代码/配置路径push触发，均仅构建。没有tag触发、tagName/releaseName/releaseId、GitHub发布令牌或contents写权限，不会由这套配置发布。后续实际push/运行仍需授权；本轮不触发远端事件。
- 保留Bun1.4.2和frozen lock；Rust明确1.98.1，复用M1验证版本；Cargo传递--locked。Action固定到官方v0/stable引用解析出的SHA，tauriScript明确bun run tauri。原已验证OS/bundle经验作为迁入依据，不将旧分支结果替代目标验证。
- .github/workflows/ci.yml与tauri-build.yml的concurrency前缀不同，避免重用质量工作流时相互取消。缺少格式/产物导致失败；上传范围只含本平台已核对的输出目录，if-no-files-found为error。

## 产物收集与Windows ZIP

scripts/desktop-artifacts.ts只处理本矩阵的三个标识，读取已构建release固定路径。macOS要求universal-apple-darwin目标，不能退回host-only；Windows只读target/release/markflow.exe，不递归选择debug或其他旧exe。

先确认所有必需格式及文件非空，再创建全新desktop-artifacts/<platform>目录；已有输出目录明确拒绝，不清理/混入旧文件。按读取到的字节写入归档并计算SHA-256，生成manifest.json。Windows沿用MarkFlow_<version>_windows_x64_portable.zip命名，但清单明确它只有markflow.exe，需要系统WebView2，干净机器可用性待验；不把ZIP当成安装器或已验证的独立便携运行时。

新增10项单元覆盖ZIP内容/字节和清单哈希、三平台格式、缺失/空产物、host-only macOS、旧debug误选、非法版本/平台、已有输出保护。测试使用临时文本/字节夹具，不声称生成真实MSI/NSIS/DMG/DEB/AppImage或验证可执行文件。

## 本地与远端边界

M2本地检查包括Luna代码/工作流审查、YAML与依赖/权限/Action输入核对、产物工具测试及完整bun run check。无新工具/包安装，不调用远端Actions，不打真实bundle，不重跑M1原生UI或生成PDF。两份M0前已存在架构索引修改保留且不纳入提交。

远端三系统矩阵、真实产物/安装包、Windows ZIP启动/运行时、签名和干净安装均待后续授权与证据；M10仍须补齐所声明OS的实际验证。通过本地适配不解除M7的完整EX-W3前置及原有系统保存/WordWPS门槛。M3未启动，不推送、不创建或移动tag、不发布。

官方输入依据：[Tauri Action固定提交README](https://github.com/tauri-apps/tauri-action/blob/84b9d35b5fc46c1e45415bdb6144030364f7ebc5/README.md)、[Action声明](https://github.com/tauri-apps/tauri-action/blob/84b9d35b5fc46c1e45415bdb6144030364f7ebc5/action.yml)、[Rust工具链Action](https://github.com/dtolnay/rust-toolchain/tree/b725eda525362e7cf34af9a7243cac1e3f01a7ec)。Tauri Action不传releaseId/tagName/releaseName可仅构建；实际远端调度及bundle行为仍需目标运行证明。

## Luna本轮结果

- 定向产物测试10/10通过；完整bun run check退出0：202受管源/配置、60文件、436项单元，类型/覆盖/source/module/lint及Web生产构建通过。首次定向输出只在工具结果中，后续完整检查包含同用例且原始stdout已独立保存，不冒充有单独定向日志。
- Bun1.4.2 YAML解析和工作流结构断言通过：触发、只读权限、复用quality与needs、三系统bundle参数、固定Actions、冻结锁、无发布输入/令牌。无inputs的workflow_dispatch解析为null是合法YAML，校验器已按此修正，没有改正确配置。
- 收尾补齐index.html和docs/contracts/**触发路径，覆盖实际前端入口及运行预算输入；Luna复核通过，helper/source未变，不重复完整测试。
- includeRelease:true表示release优化构建类型，不是创建GitHub Release；发布标识输入全部缺省。此行为已对照官方Action声明/README审查，未执行远端验证。
- 两份预存索引工作区SHA-256与M0记录相同；Git blob ID是另一种算法，不混作SHA-256。无新增依赖或工具安装，未修改package/bun/Cargo锁或当前业务代码。

[验收JSON](../acceptance/tauri-migration-m2-2026-10-30.json)记录本轮5个输入SHA、检查结果及范围。实际证据为D:/codex/m2-review-2026-10-30/bun-run-check.stdout.log、bun-run-check.exit-code.txt和review-notes.md。本轮没有actionlint；采用现有Bun YAML解析、结构断言和独立代码审查，不宣称执行过完整GitHub runner模拟。

本地M2适配收口可提交，远端三系统矩阵及真实bundle仍待授权推送/运行后验证；未开始M3、不推送、不发布。受保护的两份索引修改留在工作区，不纳入M2提交。
