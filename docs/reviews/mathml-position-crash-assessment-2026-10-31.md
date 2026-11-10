# 问题说明：注入 MathJax 产物后 Markdown 解析崩溃（position.start 缺失）

日期：2026-10-31；状态：**根因已定位并修复**（详见第 0 节）；基线 architecture-refactor / 37f7389 + 未提交的 B 线改动（DOCX 原生公式）。
性质：映射层（`src/core/render/markdownHtml.ts`）在把真实 MathJax SVG 注入 Markdown 时，偶发崩溃；**不是本轮 DOCX 改动引入的逻辑错误**，但由本轮新增的探针首次暴露。

## 0. 结论（已修复）

**根因**：注入的 raw 节点没有 `position` ⇒ hast-util-raw 的 `setPoint` 被跳过 ⇒ tokenizer 沿用上一个换行后的 `lineStartPos` ⇒ 注入串内某个元素的列号算成 0 ⇒ `hast-util-from-parse5` 的 `point()` 判否、但 `position()` 仍返回对象 ⇒ 得到**半截 position**（`start` 缺失、`end` 有效）⇒ 我们读 `node.position?.start.offset` 即崩。

**修复（两处，均在 `src/core/render/markdownHtml.ts`）**：

1. **根因**：math / inlineMath / code 三个处理器创建的 raw 节点补上 mdast 的 `position`（`{type:'raw',value,position:node.position!}`）⇒ `setPoint` 正常锚定 ⇒ `lineStartPos = -column+1 ≤ 0` ⇒ 段内元素列号恒 ≥ 1，**不再产生半截 position**。
2. **消费端守卫**：源偏移只在「非生成节点且有有效起点」时计算；生成节点（注入内容）与合成节点（脚注等包装）一律跳过源映射。原先 `markdown.slice(undefined)` 会返回**整篇文档**、可能被误判为作者 HTML，守卫一并消除该风险。

**验证**：探针（15 个真实 MathJax 公式）由崩溃转为通过；新增回归用例 `tests/e2e/math-render-stability.spec.ts`（首屏即渲染含矩阵/对齐/重音的文档）；新增单测用真实 MathJax 语料 `tests/fixtures/mathml-corpus.json` 覆盖转换判定。

**未采纳的方向**：`hast-util-from-html` fragment 模式（不产生任何位置）作为根治方案——它需要新依赖并重写注入机制；而它的目标（不伪造位置）已被第 1 项以极小代价达成。**B 作为独立一步保留，但动机改为「注入内容不再参与整篇重解析」的性能与稳健性**，不再是为修这个崩溃。

**仍存的同类风险**：`hast-util-from-parse5` 的「半截 position」是上游的**合法输出形态**，任何未来的新注入点都可能再次触发；第 2 项守卫即为此保留。

下面保留原始排查过程与证据，供后续查阅。

## 1. 精确错误

```
TypeError: Cannot read properties of undefined (reading 'offset')
    at src/core/render/markdownHtml.ts (rehype 步骤，dev 转换后第 106 行)
    at overload (node_modules/.vite/deps/unist-util-visit-*.js)
    at node (element<g>)
    at node (element<g>)
    ...
    at node (element<mjx-container>)
    at node (element<div>)
    at node (root)
```

触发表达式（源码，`src/core/render/markdownHtml.ts` 的 rehype 访问步骤）：

```js
const sourceOffset = originalOffset(node.position?.start.offset),
  opening = markdown.slice(sourceOffset),
  prefix = "<" + node.tagName;
```

即：**某个 hast 元素节点的 `node.position` 存在，但 `node.position.start` 为 undefined**。可选链只保护了 `node.position`，没有保护 `.start`。

同一段里还有两处同类访问（当前靠 `if(node.position && ...)` 保护，但同样会读 `node.position.start.line`）：

```js
if (node.position && !generated) node.properties.dataLine = node.position.start.line + offset;
if (node.position && !generated) node.properties.dataSourceEnd = node.position.end.line + offset;
```

栈中的祖先链显示：**出问题的节点位于 MathJax SVG 的 `<g>` 子树内**（`<g>` → … → `<mjx-container>` → `<div>` → root）。

## 2. 复现方式

```bash
bun run build
bunx playwright test tests/e2e/math-omml-probe.spec.ts
```

两种环境（development=4175 / built=4176）**都稳定失败**，探针页 `data-state` 为 `error`，阶段标记显示崩溃发生在 `render` 阶段（即 `renderDocument` 内部，不是后续的 DOM 提取）。

触发语料（探针 `tests/fixtures/architecture/math-omml-probe-client.ts`，15 个公式，markdown 由 `'$'+latex+'$'` / `'$$\n'+latex+'\n$$'` 拼接）：

```
run x+1 | identifier \mathbb{R} | fraction \frac{a_1}{\sqrt{1+x^2}} | nested-fraction \frac{\frac{1}{2}}{3}
scripts x^{2}_{i} | radical \sqrt[3]{x} | delimiter \left(\frac{a}{b}\right) | sum \sum_{k=0}^{n} x^k
integral \int_0^1 f(x)\,dx | limit \lim_{x\to 0} f(x) | accent \vec{v}
matrix \begin{pmatrix}1&2\\3&4\end{pmatrix} | cases \begin{cases}1&x>0\\0&x\le 0\end{cases}
aligned \begin{aligned}f(x)&=x\\g(x)&=x^2\end{aligned} | text-mixed \text{当 } x > 0
```

## 3. 已排除的假设（附证据）

| 编号 | 假设                                           | 结果                   | 证据                                                                                                                                                                         |
| ---- | ---------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1   | 自造 `<mjx-container>` 标记会触发              | **排除**               | 合成 HTML（含 `<math>` 语义层、`munderover` 等）逐条与整篇解析全部通过                                                                                                       |
| E2   | 某个单独公式的真实 MathJax 产物会触发          | **排除**               | 15 个公式各自用真实 `prepareMath` 产物解析，全部通过                                                                                                                         |
| E3   | 15 个公式的真实产物合在一起会触发              | **排除**               | 在浏览器里捕获 15 段真实产物（长度 2162,1897,4545,2736,3025,2827,3048,5098,5959,6590,1886,4493,5313,6342,2609）后 `parseMarkdownDocument` 通过；加载后与加载时各测一次均通过 |
| E4   | `renderDocument` 全量语料会触发                | **排除**               | 拦截掉探针脚本后在干净页面直接调 `renderDocument(同一语料)`，加载后与加载时均通过                                                                                            |
| E5   | `parseMarkdownDocument` 的 `mathMode` 参数影响 | **排除**               | grep 确认 `options.mathMode` 在 `parseMarkdownDocument` 内**从未被使用**（只有 `parseInline` 用它）                                                                          |
| E6   | 探针页的 `tex.tags:'ams'` 是主因               | **未排除但非充分条件** | 应用页 `index.html` 无 `tags`，探针页有；但在**探针页**上（同一配置）我的复现不崩，说明 `tags` 单独不足以触发                                                                |

**尚未解释的核心矛盾**：探针（模块脚本，页面加载时执行）稳定崩溃；我在**同一页面、同一时刻之后**用 `page.evaluate` 调用**同样的 `renderDocument`、同样的语料**却从不崩溃，且捕获到的注入产物长度完全一致。

注意一个可能掩盖差异的点：MathJax 的 SVG 里 `<defs><path id="MJX-16-TEX-I-1D465">` 的 id 前缀含**数学实例序号**（同一页面第 N 次转换为 `MJX-N`）。因此「长度相同」**不等于**「内容相同」——我的复现用的是后续转换的产物（id 前缀不同），探针用的是它自己那次转换的产物。**id 前缀是否影响 hast 重解析的 position 匹配，是目前最值得先查的线索。**

## 4. 仍然存活的假设（按可能性排序）

- **H1｜hast-util-raw / hast-util-from-parse5 的 position 丢失缺陷**：unified 生态有已知同类问题——
  - [hast-util-raw issue #12「Field position is being removed」](https://github.com/syntax-tree/hast-util-raw/issues/12)（重解析时 `position` 被移除/改写）
  - [hast-util-from-parse5 issue #11「Cannot read property 'end' of null」](https://github.com/syntax-tree/hast-util-from-parse5/issues/11)（parse5→hast 转换时位置处理崩溃）
    若其中任一在**外层内容（SVG/MathML）**场景下留下「有 position 但缺 start」的节点，就与本现象完全吻合。需要确认：hast-util-raw 对**无法匹配回原树的节点**写入的 position 具体形状。
- **H2｜rehype-raw 的节点匹配失败**：rehype-raw 把 raw HTML 重新解析并按顺序/结构匹配回原树；当注入内容含**自闭合外层元素**（SVG 里 `<path .../>`、`<use .../>` 等）或 **foreign content（MathML/SVG）**时，匹配可能失败并留下半截 position。
- **H3｜id 前缀参与匹配**：MathJax 的 `MJX-N-...` id 是否让 hast-util-raw 的节点匹配错位（探针那次是页面内首次转换，前缀与后续不同）。
- **H4｜`<use>` / `xlink:href` 等 SVG 专有结构**在 rehypeRaw 的重解析中产生特殊节点。

## 5. 建议的检索关键词

英文（issue / 讨论板）：

- `hast-util-raw position removed issue`
- `hast-util-raw "position" undefined foreign content svg`
- `hast-util-from-parse5 "end" of null`
- `rehype-raw svg path self-closing position`
- `unified "node.position.start" undefined rehype`
- `remark rehype-raw MathML svg position lost`
- `hast-util-raw matches nodes by index position mismatch`

中文：

- `rehype-raw 位置信息 position 丢失`
- `unified 解析 position undefined 崩溃`

依赖版本（本仓库 `bun.lock` 锁定）：`rehype-raw`、`hast-util-raw`、`hast-util-from-parse5`、`parse5@7.3.0`、`remark-parse@11.0.0`、`remark-rehype@11.1.2`、`rehype-stringify@10.0.1`、`unist-util-visit`（版本可用 `bun pm ls` 或读 `bun.lock` 确认）。

## 6. 若根因一时定位不到：候选修法

**修法 A（防御性访问，推荐）**：把位置读取改成双层可选链，并对写入加同一守卫：

```js
const sourceOffset=originalOffset(node.position?.start?.offset),...
if(node.position?.start && !generated) node.properties.dataLine=node.position.start.line+offset;
if(node.position?.end && !generated) node.properties.dataSourceEnd=node.position.end.line+offset;
```

语义论证：位置只用于两件事——① 判定「作者 HTML」（作者节点必有位置）② 给节点打 `data-line`/`data-source-end`（生成节点的位置可有可无）。**没有位置的生成节点本就无需源映射**，跳过不丢信息；而当前实现会因一个缺 `start` 的节点让整篇渲染崩掉。

**修法 B（隔离注入内容）**：在注入前把 MathJax 产物做一次「位置无关化」处理（例如去掉 `<defs>` 之外的可疑结构），或改为在 hast 树里用 programmatic 节点替换 raw 字符串注入。

**修法 C（换注入方式）**：不再用 raw HTML 字符串注入，改成在 hast 树里直接构造 `<mjx-container>` 节点（绕开 rehypeRaw 的重解析与 position 匹配）。改动面较大，但能根治这一类问题。

## 7. 影响面（需要外部确认后再定级）

- **当前是否影响真实用户**：应用自身渲染路径走同一段代码，但既有 e2e 从未覆盖「加载即渲染含复杂公式的文档」——`docx-diagnostics` 用的是 `$x_{N}^2+y^2$`，`html-compatibility` 用的是 `$x^2+1$`，都属最简结构。**因此不能断言「应用路径安全」**，需要按 H1—H4 定位后，用真实复杂公式文档验证一次加载即渲染。
- **对下游的影响**：一旦定位，需同步决定是否把「复杂公式文档的首次渲染」补进 e2e 语料（防止回归）。

## 8. 相关文件

| 文件                                                              | 角色                                                                                                      |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `src/core/render/markdownHtml.ts`                                 | 崩溃点（rehype 访问步骤，`node.position?.start.offset` 与两处 `position.start.line`/`position.end.line`） |
| `src/core/render/documentRenderer.ts`                             | 调用 `parseMarkdownDocument` 的上游（`renderDocument`）                                                   |
| `src/core/render/mathRender.ts` / `mathJaxAdapter.ts`             | 真实 MathJax 产物的来源（`retainMathML` 时附带语义层）                                                    |
| `tests/fixtures/architecture/math-omml-probe-client.ts`           | 触发语料与阶段标记                                                                                        |
| `tests/e2e/math-omml-probe.spec.ts`                               | 失败用例（development / built 均失败）                                                                    |
| `docs/design/export-outputs-formula-and-print-plan-2026-10-30.md` | 本轮 DOCX 原生公式方案（探针属其 B0-① 步骤）                                                              |
