# Web 端草稿落盘的可靠性：待查问题清单

**为什么有这份清单。** 本地文档支持的设计把 Web 端的草稿落盘做成自动的（编辑后去抖落 IndexedDB），
顶栏的"保存"按钮在 Web 形态下准备取消 ⇒ ⇒ 于是"关掉标签页时那一次编辑会不会丢"成了唯一的风险点。
仓库现有的 `beforeunload` 守卫只弹提示、**不落盘** ⇒ ⇒ 那是有意的（Chromium 明确：IndexedDB 的 `put()`
在 `beforeunload` / `unload` 处理器里不生效）⇒ ⇒ 缺的是别的兜底。

**这份清单是待查的问题，不是结论。** 查之前不要把任何一条当既定事实写进设计。

**范围**：只关于**浏览器形态**下"页面即将消失时把待落盘的草稿写下去"这件事。
桌面形态（Tauri）没有这个问题 ⇒ ⇒ 原生侧写盘不在这份清单里。

---

## 背景事实（仓库侧，已核对）

| 事实                                                                    | 出处                                                    |
| ----------------------------------------------------------------------- | ------------------------------------------------------- |
| 草稿落盘已经是自动的：每次编辑后 700ms 去抖写 IndexedDB                 | `src/App.tsx` 的 `queueSave`                            |
| 顶栏"保存"按钮在 Web 形态下做的事与自动落盘**是同一件事**（只是提前）   | `src/App.tsx` 的 `handleSaveImmediately` → `persist`    |
| `beforeunload` 守卫只 `preventDefault()` + `returnValue=''`，**不落盘** | `src/App.tsx` 的 `useEffect`                            |
| 守卫的判据是"有待落盘的定时器 **或** 有 dirty 的文档"                   | 同上                                                    |
| Web 形态**没有服务端**：纯静态 + IndexedDB                              | `docs/design/local-document-support-2026-11-05.md` §6.5 |
| Web 形态**没有原生句柄**：没有文件引用、不能写回磁盘                    | 同上                                                    |
| e2e 跑在 `http://127.0.0.1:4173` 等**普通 HTTP** 地址上                 | `playwright.config.ts`                                  |
| 桌面端是 Tauri（`tauri://` 协议）                                       | `src-tauri/`                                            |

---

## ① `visibilitychange` 能不能兜住"关页面前落盘"

- `document.visibilityState` 变成 `'hidden'` 的时机，**覆盖哪些场景**：
  切标签页 / 窗口最小化 / 关闭窗口 / 导航离开 / 标签页被替换 / 进程被杀？
- **关闭窗口**时 `visibilitychange` 一定触发吗？还是**只有导航离开**才触发？
  （若关闭不触发，那它在"用户直接关窗口"这个最危险的场景里没用 ⇒ ⇒ 只能当补充，不能当主力。）
- 在 `visibilitychange` 处理器里**发起**一个 IndexedDB 写（不 await），紧接着页面被销毁 ⇒ ⇒ 写会不会丢？
  ⇒ ⇒ 浏览器会不会给未完成的 IDB 事务一个宽限期？
- `visibilitychange`（hidden）与 `beforeunload` 的**触发顺序**是哪个先？

## ② `pagehide` 相对 `beforeunload` 的差别

- `pagehide` 的 `event.persisted` 是什么？bfcache 命中时（`persisted === true`）它意味着什么？
- 在 `pagehide` 里写 IndexedDB，可靠性比 `beforeunload` **更好还是一样不行**？
- `pagehide` 与 `visibilitychange`：**哪个更适合落盘**？两个都要吗？
- `unload` 事件现在的状态（各浏览器是否已弃用）？它与 `pagehide` 的关系？

## ③ `sendBeacon` 能不能用

- 它的前提是不是**必须发 HTTP 请求**？⇒ ⇒ 我们 Web 形态**没有服务端** ⇒ ⇒ 这条路是不是直接不通？
- 有没有"用 `sendBeacon` 把数据交给 Service Worker"的用法？
  ⇒ ⇒ 若有：页面必须在 SW 控制下 ⇒ ⇒ **首次访问**（还没被 SW 控制）时怎么办？
- `sendBeacon` 的载荷有大小上限吗？

## ④ Service Worker 作为兜底

- SW 里能开 IndexedDB 事务写数据吗？SW 会在什么时候被终止（空闲超时）？
- **前提是不是必须 HTTPS 或 localhost**？
  ⇒ ⇒ 我们的部署形态：桌面端 `tauri://` ✓；Web 形态部署在**普通 HTTP 站点**上 ⇒ ⇒ 非 localhost 的 HTTP 站点上 SW 不可用
  ⇒ ⇒ **这条兜底在真实部署里成不成立**？
- 有没有比 SW 更轻的办法达到同样效果？

## ⑤ 有没有"同步"的存法能绕开卸载事件的不确定性

- `localStorage` 是**同步**的 ⇒ ⇒ 在 `beforeunload` 里写**一定**落盘
  ⇒ ⇒ 但 5MB 配额 + 同步阻塞主线程
  ⇒ ⇒ 拿它存**文档正文**现实吗？
  ⇒ ⇒ 拿它存一小块"最后的编辑"（例如最后 N 个字符 / 一段增量补丁）现实吗？
  ⇒ ⇒ 这种"双写"方案能不能让恢复时的数据足够完整？
- **IndexedDB 的 "relaxed durability"**（`chromestatuslite.com/feature/5730701489995776`）：
  那是什么？能让事务更快落盘吗？代价是什么？各浏览器支持吗？
- 有没有别的**同步持久化**手段（OPFS 的同步写入？`navigator.storage.persist()`？）

## ⑥ 兜底的"上策"是什么

- 业界的通行做法是不是这一套：
  **不依赖卸载事件** ⇒ 缩短去抖（很短）⇒ ⇒ `visibilitychange` 时冲刷 ⇒ ⇒ `beforeunload` 只负责"问用户"？
- 有没有"每次按键都落盘"的实践？代价（主线程占用、IO、耗电）？
- 有没有"把待落盘的内容放在内存里、页面重开时从别处恢复"的更彻底做法？
  ⇒ ⇒ 例如把草稿同时放进 URL / `sessionStorage` / `localStorage` 小块？

---

## 查完之后要回答的应用侧问题

这些不依赖浏览器行为，**是本仓库自己能定的** ⇒ ⇒ 查证结果只影响它们的**权重**，不影响它们**要不要做**。

1. **去抖从 700ms 缩到多少？**
   ⇒ ⇒ 缩短是纯应用侧可控的 ⇒ ⇒ 它应当是主力兜底（不依赖任何浏览器行为）
   ⇒ ⇒ 需要一个取值依据（代价与收益）。
2. **`beforeunload` 那个提示要不要留？**
   ⇒ ⇒ 现状是留（只提示不落盘）⇒ ⇒ 若 `visibilitychange` 可靠，它可能变成冗余。
3. **顶栏"保存"按钮在 Web 形态取消后，快捷键 `Ctrl/Cmd+S` 做什么？**
   ⇒ ⇒ 候选：(a) 禁用；(b) 仍能"立即落盘"（把待落盘的冲掉，绕过去抖等待）
   ⇒ ⇒ (b) 仍是"立即落盘"的出口 ⇒ ⇒ 与取消按钮不冲突。
4. **要不要为"关页面前有未落盘编辑"做一份恢复机制？**
   ⇒ ⇒ 若 ①② 的结论是"关闭标签页时 `visibilitychange` 不触发"，则这个问题**必须**有答案。

---

## 查证时要挑的来源

- **优先**：MDN（`developer.mozilla.org`）、Chromium 状态页（`chromestatus.com`）、
  W3C/WHATWG 规范、Chromium issue tracker
- **其次**：Chromium 官方博客、Web Platform Tests
- **慎用**：个人博客与 Stack Overflow 回答 ⇒ ⇒ 它们可作线索，**结论要回到规范或浏览器 issue 上核实**
  ⇒ ⇒ 本清单里已知的两个来源（Chromium issue 40269401、`chromestatuslite` 的 relaxed durability）
  属于可引用的那一档

**查完请把结论与出处一起记回来** ⇒ ⇒ 记进本文件 ⇒ ⇒ 设计里只引用本文件的结论 ⇒ ⇒
不引用二手转述 ⇒ ⇒（《分析与验证规范》§5 的证据纪律 ✓）。
