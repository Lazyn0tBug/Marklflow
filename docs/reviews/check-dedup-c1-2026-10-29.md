# C1 前台队列 UTF-8预算重复计算精简（2026-10-29）

基线 2da2d00。按 C0 清单仅调整 `src/application/tasks/roleQueue.ts`：foreground `work` 已在入队时验证 UTF-8预算，再由队列私有持有 `structuredClone`；claim使用这份同一快照，不再重复编码Markdown。此改动减少一次字符串UTF-8临时分配，错误规则不变。

前台入队检查仍在复制快照前执行，防止超预算内容先进入队列。`background-preview` 只存文档/模式标识，领取时重新读取当前文档，因此claim时预算检查保留。`markdownWorkerTask` 入口接收 `unknown` 独立Worker命令，其预算校验仍保留。没有抽helper、引入依赖或改变同步哈希/任务协议。

## Luna验证

目标 `tasks-role-queue.test.ts`：13项通过，0失败，44次断言。覆盖正常前台只编码一次、前台超预算在入队前拒绝、后台懒读取超预算在claim拒绝且不占active槽位。

完整 `bun run check`：198受管源/配置；58文件、421项单元测试通过；严格类型、source/module边界、lint与Vite生产构建通过。日志：D:/codex/c1-dedup-check.log。

按用户要求未做独立正式审查，留到X；未推送，未触碰MathJax/Paged.js或tag-release.patch。
