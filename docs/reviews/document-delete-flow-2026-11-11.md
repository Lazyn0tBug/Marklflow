# 删除当前文档：落点与确认

日期：2026-11-11。分支：`architecture-refactor`。基线：`bcb478b`。范围：删除文档这一条路的行为与确认；日志侧的定位串缺口另记（见 §4）。

## 1. 症状

在文档列表里删除**当前打开**的那一份之后：编辑器与 HTML 预览一起消失（工作区空白），随后出现一条 `有个操作没能完成(rejection·e-1)`，日志里那条记录是 `source=rejection:string`（**没有定位**）。

## 2. 两个原因

### 2.1 删掉当前那份之后没有落点

`App.tsx` 的删除处理只做了两件事：`removeSession(id)` 与从 `documents` 里过滤掉。

`removeSession` 有一句 `setCurrentDocId(sessions.activeDocumentId ?? '')`，但 **`sessions.documentIds` 是"打开的会话（标签页）"，不是文档列表** ⇒ 文档列表里还有文档 ≠ 还有会话。

⇒ 删掉唯一打开的那一份 ⇒ `activeDocumentId` 为 undefined ⇒ `currentDocId=''` ⇒ `App.tsx` 里 `currentSession` 为 undefined ⇒ **`currentDoc` 为 undefined ⇒ 编辑器与预览都渲染空**。侧边栏里那份还在，所以"列表里有文档、工作区却空着"。

⇒ 与关标签页同一套规矩已有答案：`DocumentSessions.close` 用的是"下一个 ?? 上一个" ⇒ 删除也该有落点。

### 2.2 确认提示靠宿主

删除按钮里写的是 `window.confirm(...)` ⇒ 确认**在代码里存在**，但它是否弹出来由宿主决定 ⇒ 桌面上没拦住。

同一款 `confirm` 还用在三处：`App.tsx` 的门禁、另存为跨目录、关标签页 ⇒ 影响面不止删除。

## 3. 这次改了什么

- **删除前问一句**：新增应用内对话框 `ConfirmDialog` 与提问器 `confirmPrompt`（与冲突那一次同一套规矩：问的那一方持有它、走对话框不走通知）。**默认焦点落在"取消"上** ⇒ 回车不会顺手删掉东西。侧边栏不再自己调 `confirm`。
- **删除后有落点**：新增 `application/workspace/documentDeletion.ts` 的 `nextDocumentAfterDeletion` ⇒ **列表里的下一个**，下一个没有了就退到上一个（与关标签页同一套规矩）。删除后若已经没有别的会话 ⇒ 打开它。
- **删除入口不向外抛**：删除那一段整体被一个 `catch` 兜住 ⇒ 界面调用它不会变成一次未处理的拒绝 ⇒ 日志里不会再出现笼统的 `rejection`。

## 4. 证据与限制

| 项目 | 结果 |
| --- | --- |
| `bun run typecheck` | 通过 |
| `bun run lint`（含边界、命令面、词表、native 隔离） | 通过 |
| `bun run test:unit` | 111 文件 / 819 项通过（新增 7 项） |
| `bun run build` | 通过 |
| `bun run format:check` | **一处既有失败**：`docs/design/log-base-plan-2026-11-03.md`（本次未改动该文件） |

**已自动验证**：落点那条规则（`tests/unit/document-deletion.test.ts`，4 项）、确认对话框（`tests/unit/confirm-dialog.test.ts`，3 项：是对话框、两个答案各落各的、焦点在取消）。

**未验证**：`App.tsx` 里那段接线（删除 → 切落点 → 打开下一个）**没有自动化测试** ⇒ 仓库没有 App 组件测试 ⇒ 这一段只有类型与代码审查作证 ⇒ **需要一次手动跑**：删掉当前打开的那一份，看工作区是否落到列表里的下一个；确认对话框在桌面宿主里是否弹出。

## 5. 还没做的（按次序）

1. **那个字符串拒绝的来源**（`source=rejection:string`）：全仓搜下来应用代码里没有任何一处用字符串 reject ⇒ 只能来自 Tauri IPC；那段时间没有受保护命令（无 `call_started`、四类计数全 0）⇒ 只剩 `get_runtime_prefs` / `get_platform_info` 两个不在 `files.ts` 里的 invoke。**需要一次开发构建下的复现**（控制台会打印原值；桌面包没有 devtools）。
2. **日志定位串的系统性缺口**：24 处 `reportFailure({...})` 里只有 1 处带 `source:` ⇒ 其余应用层失败在日志里都没有定位；且 `hereSource()` 取到的是**它自己那一帧**（`capture.ts`）⇒ 定位指向捕获器而不是出事的地方，且它没有任何测试。
3. **另外三处 `window.confirm`**：门禁、另存为跨目录、关标签页 ⇒ 换不换由用户定。
