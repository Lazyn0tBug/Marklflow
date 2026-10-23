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
