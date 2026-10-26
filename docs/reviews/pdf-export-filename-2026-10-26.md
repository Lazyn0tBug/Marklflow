# PDF导出名称传递及系统保存边界

日期：2026-10-26；分支architecture-refactor；基线fea23dd。用户反馈Windows系统Microsoft Print to PDF保存名为空，macOS系统PDF保存带默认名称；两端均使用应用既有系统交付路径，不能假设用户可选择应用未提供的另一条PDF路径。

代码核对确认：ExportService已冻结fileName，但PDF分支未传给生成器，生成器仅使用文档meta.title。因此应用自定义导出名称此前对PDF标题无效，与其他格式的名称选项不一致。

本步修复只将已接受的名称传给generatePdfHtml，在首个await前固定标题，做HTML转义，并为空白名称/标题提供MarkFlow-Document回退。保留原完整A4生成、字体/图片就绪、临时框架清理及Web交付，没有增加预览、系统设置或更换引擎。

必须区分：所选名称进入交付文档title已修正；Windows系统PDF驱动保存对话框是否采用该名称尚无可靠保证。标准[window.print API](https://developer.mozilla.org/en-US/docs/Web/API/Window/print)不提供参数，网页不能用它指定输出文件路径/名称。不能把title测试通过写成Windows空文件名已解决，也不修改注册表、调用驱动私有接口或增加“打印预览”功能。

验证增加：导出服务在后续输入修改前传递所选名称；PDF标题的空白回退和HTML转义；流式/A4/预览隐藏三种真实浏览器交付文档均具有用户所选title，正文与分页回归保持。此测试拦截实际系统交付，不能代替Windows/macOS系统保存对话框的手工验收。

若要求两平台均确定建议文件名，应规划生成PDF字节后统一下载/原生保存，而非依赖系统虚拟设备取名。Web侧新增语义PDF布局器会影响现代HTML/CSS保真，远端浏览器服务涉及内容上传/离线；未来Tauri可评估随包受控浏览器生成，须验证安装体积、目标OS、字体、 selectable text和既有分页一致性。不能直接从普通网页调用Playwright/CDP的受控PDF能力。本轮不实现这些候选，也不承诺自动下载PDF。

验证：完整bun run check通过，167个受管源/配置、314项单元、严格类型/lint/边界/生产构建通过；完整Chromium 76项通过。所选名称进入文档标题通过自动验收，Windows/macOS系统设备是否自动填名未验收；Windows用户反馈的空保存名不标记为已解决。未推送或移动标签。
