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
2. **日志定位串的系统性缺口** ⇒ **这一轮做掉了一半**（见 §6）。
3. **另外三处 `window.confirm`**：门禁、另存为跨目录、关标签页 ⇒ 换不换由用户定。

## 6. 定位串：失败出口自己补（2026-11-11 追加）

调查"日志没有定位"时发现的是**两个叠加的缺口**，都不在原生命令那一侧：

- **调用点几乎都不填定位串**：24 处 `reportFailure({...})` 里只有 1 处带 `source:` ⇒ 其余应用层失败在日志里**根本没有定位** ⇒ ⇒ 这就是"所有日志都没有定位"那一类。
- **`hereSource()` 指着它自己**：`new Error()` 在 `capture.ts` 里造 ⇒ 栈的第一帧是捕获器自己 ⇒ `topFrame` 返回的是 `capture.ts` 那一行 ⇒ **定位说的是"哪儿捕获"，不是"哪儿出问题"** ⇒ ⇒ 而它此前**没有任何测试**。

⇒ ⇒ 改法：**位置由发射点自己带** ⇒ ⇒ 调用点没填时，**失败出口替它补上** ⇒ ⇒ 补的是**调用它的那一处**（跳过失败出口自己那一帧）⇒ ⇒ 不用给 24 个调用点逐个手写 ⇒ ⇒ 也就不会"漏填一个就没有定位"。

- 新增 `src/core/platform/callsite.ts`：**定位原语**（什么算"我们自己的帧"、栈里取哪一帧、跳过几帧）✓ 一处事实 ✓。
- `reportFailure`：`input.source ?? ourFrame(new Error().stack, 1)` ⇒ **定位落在调用它的那一处** ✓。
- `hereSource()`：同样跳过自己那一帧 ⇒ **落在调用它的那一处** ✓。
- `rejectionSource` 行为不变 ✓（拒绝值自己的栈 ⇒ 指向抛出点 ✓）。

**测试**：`tests/unit/capture.test.ts` 与 `tests/unit/failures.test.ts` 各加一条 ⇒ **在旧行为下两条都变红**（已实测：把 `skip` 改回 0、把自动补源去掉 ⇒ 两红 ⇒ 恢复后两绿）⇒ ⇒ 这两条不是恒绿的检查 ✓。

**限制**：生产构建里页面是打包产物 ⇒ 帧指向 bundle 里的位置 ⇒ 定位仍然有，但**不是源文件与行** ⇒ ⇒ 开发构建里才是源文件与行 ⇒ ⇒ 真机验收要看生产包里的那条长什么样 ⇒ ⇒ 这一条**未验证**。

**还没做**：应用层那些**漏了 catch 的 promise**（`ExportModal` 里 `resolveExportRoot().then(...)` 没有 catch ⇒ 失败会变成一次未处理拒绝 ⇒ 类别笼统、没有定位）⇒ 属应用层 ⇒ 下一轮 ⇒ ⇒ 且**那一次字符串拒绝到底是不是它，仍需一次开发构建下的复现**来坐实（桌面包没有 devtools ⇒ 控制台看不到原值）。

