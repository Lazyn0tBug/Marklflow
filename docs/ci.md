# CI

GitHub Actions 工作流：`.github/workflows/ci.yml`。

## 触发与检查

- 推送 main、所有目标分支的 Pull Request、手动 workflow_dispatch。
- Ubuntu 24.04，Bun 1.4.2，15 分钟超时；同分支/PR 的旧运行由新运行取消。
- `bun install --frozen-lockfile`，不更新锁文件。
- `bun run --bun lint`：目前实际为 `tsc --noEmit`，不是 ESLint。
- `bun run --bun build`：使用 Bun 运行现有 Vite 构建；类型检查失败后仍收集构建结果，但整体不会变绿。
- 验证 dist/index.html、JavaScript 构建资产及清单/锁文件没有被改写。
- 全部成功才上传带提交 SHA 的 dist 产物，保存14天。

本地对应命令（仓库根目录）：

```sh
bun install --frozen-lockfile
bun run --bun lint
bun run --bun build
```

## 权限和范围

Action 固定到官方仓库提交；默认只读权限，checkout 不持久化凭据；无需 Secrets。不使用 pull_request_target，不部署站点、不公开预览、不发布软件包。

当前仓库没有测试脚本/测试文件，也没有 ESLint/格式检查配置，因此本工作流不宣称覆盖测试、代码风格、浏览器、离线或打印验收。接入相应工具后再增加独立检查，不使用“没有测试也通过”的占位步骤。依赖、源码及已有 lint 脚本保持原样。

可在 GitHub 分支保护中将 `Typecheck and build` 配置为必需检查；本次只创建配置文件，不更改远端分支保护。工作流推送后方可在 Actions 页面实际执行；本地构建通过不代表 Linux Actions 已通过。


## html 分支增加的门禁

已加入Vitest契约/单元与Playwright生产构建测试，main/html推送或PR触发；CI安装独立Chromium，验证语义/负例、容器响应、图表/资源离线与源载荷往返、长文自动分页和DOCX静态化提示/媒体结构、打印资源就绪及失败路径。浏览器证据保存14天。前述“没有测试”为初始CI历史，现以本节/工作流为准，不宣称已配置ESLint或全浏览器/系统打印验收。

本地：bun run test:unit；bun run --bun playwright install chromium；先build再bun run test:e2e。未推送，不存在本分支远端CI通过结论。


R0–R4审查后，本地样例为37项单元/契约及19项Chromium测试，覆盖SVG资源/公式隔离、DOCX文本/编号/锚点、分页外壳隔离与容器、七种显隐组合、设置对话框、草稿恢复及双向同步。数量为本次快照，以实际测试收集为准。运行环境JSON与长表格/代码的独立HTML/PDF也进入test-results证据目录；CI既有上传覆盖这些文件。远端尚未执行本分支。


## 普通 HTTP 兼容性回归（0.9.1 之后）

新增浏览器测试使用普通 HTTP 来源，断言 isSecureContext=false 且 randomUUID/subtle 缺失，再验证预览、公式与图片导出、SHA-256 校验和源文档重导入。随机标识优先 randomUUID，回退到 getRandomValues；资产摘要优先原生 SHA-256，回退到动态加载的 hash.js。单元测试覆盖 SHA-256 分块和填充边界以及随机数能力缺失的明确失败，不使用弱随机数代替。历史 R0–R4 验证记录保持原样；本次运行结果以当前 CI 为准。
