# 导出问题定位报告：DOCX 公式空对象框 / PDF 需第二次打印

日期：2026-10-31；状态：问题一已定位并修复（待外部 Word 复核），问题二待判别；基线 architecture-refactor / 37f7389 + 本轮未提交改动。
环境：Windows 11 + Edge（用户现场）；本机 macOS + Chromium（无头）用于复现与取证。
配套：[导出输出层方案](../design/export-outputs-formula-and-print-plan-2026-10-30.md)、[映射层 position 崩溃评估](mathml-position-crash-assessment-2026-10-31.md)。

## 0. 摘要

| # | 现象 | 归属 | 状态 |
|---|---|---|---|
| 1 | DOCX 中 §2.2 首公式（`\begin{pmatrix}` 矩阵）是**空对象框**：有图片框、无内容 | 本轮引入（公式从「一律图片」改为「三态判定」后才出现降级图片路径） | 根因已定位为**两个叠加因素**（见 §1.5），已修；待用户在 Word 复核 |
| 2 | PDF 需第二次打印才出内容 | **既有缺陷**（基线即有），本轮 A1 改动（视口内 + 延迟释放）**未命中根因** | 已加诊断探针与一项低风险缓解，待现场判别 |
| 3 | DOCX 显示「已保存文件」但目标位置没有文件 | **既有缺陷**（基线即有）：回执由 `close()` resolve 推定，无回读校验、无兜底 | 已改为「顺序归位 + 回读校验 + 兜底下载」，**现场已确认文件落位**（§3） |
| 4 | PDF 打印成功但没有结果通知 | **既有缺陷**（基线即有）：结果只渲染在导出对话框内部，被系统打印对话框遮住 | 已改为应用层常驻通知，**现场已确认可见**（§4） |

---

## 1. 问题一：DOCX 公式显示为空对象框

### 1.1 现象与复现

- 文档：应用初始样本「量子退相干与量子计算系统工程报告」（即 `tests/fixtures/docx-math/o0-cases.json` 的 `cases[3]`，`existing-app-sample`）。
- 位置：§2.2「矩阵表示与多行推导」下第一个公式：

```latex
$$H = \hbar \begin{pmatrix} \frac{\omega_q}{2} & g \cos(\omega_d t) \\ g \cos(\omega_d t) & -\frac{\omega_q}{2} \end{pmatrix}$$
```

- 现象：Word（Windows 11 + Edge 环境导出的 docx）中该公式**只剩一个空的对象框**，没有内容；文档其余部分（原生公式 `m:oMath`、图表图片）正常。
- 用户上传的产物：`tests/量子退相干与量子计算系统工程报告.docx`（233.8 KB）。

### 1.2 产物解剖（对上传文件的实测）

**段落结构**（`word/document.xml`，按顺序）：

```
 5 OMATH  本工程报告评估超导量子处理芯片在极低温环境（）下的相干衰减动力学模型…
 6        [Heading3] 1.1 关键物理指标
 7 OMATH  超导传输子（Transmon）主频：          8 OMATH 平均横向相干弛豫时间：
 9 OMATH  双比特受控非门保真度：
11        [Heading2] 2. 动力学理论与数学公式
12        超导量子比特体系的密度矩阵演化由 Lindblad 主方程 精确描述：
13 IMG    ← §2 的 \frac{d\rho}{dt}=…\sum_k… 公式（降级图片）
14        [Heading3] 2.1 行内物理公式推导
15 OMATH×5 当纯态处于基态 … 满足概率归一条件 …
16        [Heading3] 2.2 矩阵表示与多行推导
17        量子哈密顿量矩阵与测量跃迁算符如下式所示：
18 IMG    ← §2.2 首公式（矩阵）★ 用户报告为空的那一条
19        高斯退相干分布的概率密度函数可表述为：
20 OMATH  P(x)=1σ2exp⁡(−(x−μ)22σ2)
21        著名的欧拉恒等式展现了代数与几何的统一：
22 OMATH  eiπ+1=0
26 IMG / 29 IMG   （mermaid / graphviz 图表，正常）
```

⇒ **公式在文件里是存在的**（第 18 段是一个 `w:drawing`），缺失发生在**渲染期**。

**图片段落的结构与尺寸**（`wp:extent` 为 96dpi 像素）：

| 段落 | 内容 | extent | 媒体 | PNG 尺寸/体积 | PNG 墨量（不透明像素） |
|---|---|---|---|---|---|
| 13 | §2 的 `\sum` 公式 | 360×33 | `9455557c.svg` + `0b563622.png` | 720×66 / 9445 B | 5323 |
| **18** | **§2.2 矩阵公式** | **255×55** | `88ea206a.svg` + `1ff76309.png` | **511×110 / 10209 B** | **4999** |
| 26 | mermaid 图表 | 643×324 | `a8316c4a.svg` + `fd143b9.png` | 1286×648 / 81806 B | 54598 |
| 29 | graphviz 图表 | 643×352 | `6575cc61.svg` + `e51d70ca.png` | 1286×704 / 120746 B | 52410 |

⇒ **在这个文件里，PNG 兜底是有内容的**（4999 个不透明墨点）；而用户另行解包得到的是 **347 字节、510×110、全部像素 alpha=0 的空白 PNG** ⇒ **同一段代码在不同环境/时序下会产出空白位图** ⇒ 兜底不可靠。

**两个 drawing 段落的 XML 结构完全一致**（除尺寸与 id）⇒ 结构差异不是原因：

```xml
<w:drawing><wp:inline …>
  <wp:extent cx="2430066" cy="523478"/><wp:effectExtent …/>
  <wp:docPr id="2" name="公式" descr="H = \hbar \begin{pmatrix} …"/>
  <a:graphic><a:graphicData uri="…/picture"><pic:pic …>
    <pic:blipFill>
      <a:blip r:embed="rId10" cstate="none">          ← 主图位图（PNG）
        <a:extLst><a:ext uri="{96DAC541-7B7A-43D3-8B79-37D633B846F1}">
          <asvg:svgBlip r:embed="rId9"/>                 ← 矢量副本（SVG）
        </a:ext></a:extLst>
      </a:blip>
      <a:stretch><a:fillRect/></a:stretch>
    </pic:blipFill>
    <pic:spPr><a:xfrm><a:ext cx="2430066" cy="523478"/>…</pic:spPr>
```

**媒体 SVG 的标签清单**（决定性差异）：

| 媒体 | use | defs | path | rect | viewBox |
|---|---|---|---|---|---|
| `9455557c`（§2 `\sum` 公式） | **36** | 1 | 22 | 3 | ✓ |
| `88ea206a`（§2.2 矩阵公式） | **32** | 1 | 18 | 2 | ✓ |
| `a8316c4a`（mermaid） | **0** | 0 | 10 | 9 | ✓ |
| `6575cc61`（graphviz） | **0** | 1 | 6 | 13 | ✓ |

⇒ **两条公式 SVG 都靠 `<use xlink:href>` 复用字形；两条图表 SVG 不用 `<use>`** ⇒ 与「只有公式空、图表正常」的现场现象一致。

MathJax 3.2.2 输出中 Word 不友好的写法（实测取自本仓库产物）：

```xml
<svg xmlns="…" width="11.083ex" height="1.636ex" role="img"
     viewBox="0 -683 4898.6 723" xmlns:xlink="…"
     style="vertical-align:-0.09ex">
  <defs><path id="mf_svg_16_0" d="M40 437Q21 …"/></defs>
  … <g fill="currentColor"> … <use xlink:href="#mf_svg_16_0" …/> …
```

- `fill="currentColor"`（2 处）：网页语境下的继承色，Word 渲染器支持不佳；
- 根节点 `style="vertical-align:…"`、`role="img"`：网页语义，Word 不需要；
- 字形全部经 `<use>` 引用 `<defs>` 路径。

### 1.3 问题源码

#### (a) 公式降级判定（谁决定这张公式走图片）

`src/core/export/outputCapabilities.ts`：

```ts
if(node.hasAttribute('data-mf-math-id')){
 const plan=planDocxFormula(node);
 if(plan.kind==='native')continue;
 if(plan.kind==='fallback'&&node.querySelector('svg'))add(node,'static',DOCX_FORMULA_IMAGE_MESSAGE,plan.reason+'；源式：'+docxFormulaSource(node));
 else add(node,'unsupported',plan.kind==='fallback'?'公式没有可用的图像后备：'+plan.reason:plan.reason);
 continue;
}
```

`src/core/export/mathmlToOoml.ts`（`mtable`/`munder`/`mover` 等判为 fallback）：

```ts
if(tag==='munder'||tag==='mover'||tag==='munderover')return {ok:false,reason:'公式包含上下限结构（求和、积分、极限、重音）'};
if(tag==='mtable'||tag==='mtr'||tag==='mtd'||tag==='mlabeledtr')return {ok:false,reason:'公式包含矩阵或表格结构'};
```

⇒ 矩阵（`mtable`）⇒ fallback ⇒ 走图片路径 ⇒ **本轮才第一次产生「Word 里可能空的公式图」**（改动前所有公式都是图片，但那时用户看到的是图片正常渲染 ⇒ 说明**图片路径本身在当时是没问题的**；现在空，是因为新路径下的 SVG/PNG 组合不同 ⇒ 见 §1.5）。

#### (b) 图片写入（DOCX 里的双图结构）

`src/core/export/docxExporter.ts`，**修复前**原文：

```ts
async function rasterImage(source:string,width:number,height:number):Promise<Uint8Array>{
 const image=new Image();image.src=source;await withDeadline(image.decode(),'DOCX 图片转换超时');
 const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.ceil(width*2));canvas.height=Math.max(1,Math.ceil(height*2));
 const ctx=canvas.getContext('2d');if(!ctx)throw new Error('DOCX 图片转换不可用');ctx.drawImage(image,0,0,canvas.width,canvas.height);
 const base64=canvas.toDataURL('image/png').split(',')[1];if(!base64)throw new Error('DOCX 图片编码失败');return Uint8Array.from(atob(base64),c=>c.charCodeAt(0));
}
…
 if(el.tagName.toLowerCase()==='svg'){
  const clone=el.cloneNode(true) as SVGElement;clone.setAttribute('xmlns','http://www.w3.org/2000/svg');…;
  const xml=new XMLSerializer().serializeToString(clone),data=new TextEncoder().encode(xml);
  const source='data:image/svg+xml;base64,'+btoa(unescape(encodeURIComponent(xml)));
  const fallback=await rasterImage(source,width,height);
  return new ImageRun({type:'svg',data,transformation:{width,height},fallback:{type:'png',data:fallback},…});
 }
```

三个缺陷点：

1. **`rasterImage` 不校验结果**：`decode()` 对「已解码但内部引用（`<use>`）尚未绘制」的 SVG 会提前 resolve ⇒ `drawImage` 画出全透明画布 ⇒ **静默产出空白 PNG**（用户实测 347 字节、全 alpha=0）。
2. **SVG 未做 Word 兼容清洗**：`currentColor` / 根节点 `style` / `role` 原样写入 ⇒ Word 渲染 SVG 时不受支持。
3. **Word 优先用 SVG 且不回退**：Word 2019+/365 走 `asvg:svgBlip`，SVG 画不出来时**不会**改用 PNG ⇒ SVG 与 PNG 同时为空 ⇒ 只剩对象框。

#### (c) SVG 的来源

`src/core/render/mathJaxAdapter.ts`：`retainMathML` 时把 `startup.toMML` 的语义树放进隐藏的 `.mf-math-semantics`，同时保留 MathJax 的 SVG 容器；`src/core/render/documentRenderer.ts` 的 `uniqueSvgIds` 会重写 SVG 内所有 id（含 `<use>` 的 `xlink:href`，由 `rewriteFragments` 处理 ✓）。

### 1.4 错误细节

| 现象 | 细节 |
|---|---|
| Word 侧 | 公式位置是一个**有边框尺寸、无内容**的对象框（图片框已按 255×55 px 排版，但未绘制任何像素） |
| 位图侧（用户解包） | `word/media/image1.png`：**347 字节**、510×110、**56100 个像素全部 alpha=0** |
| 位图侧（本机复现） | 同一条公式的 PNG：10209 字节、511×110、4999 个不透明墨点 ⇒ **空白与否取决于时序/环境，不稳定** |
| 空白 PNG 的成因 | **推断**：`image.decode()` 在 SVG 的 `<use>` 引用就绪前 resolve ⇒ `drawImage` 得到空白画布；原实现不做任何检查 ⇒ 静默写出空白图。**成因未被证实**（本机复现不出空白），但「绘制后校验 alpha、重试、失败即中止」不依赖成因判断，故仍然成立 |
| 矢量侧 | **两条关于 Word 行为的判断目前只有间接证据**：① Word 不解析 MathJax 的 `<use>` 字形复用；② Word 优先用 `svgBlip` 且画不出时不回退 PNG。两者的检索线索见下（标题指向「Word 渲染 SVG 有问题」，但正文未读到），**在 Word 中复核仍是必需的一步**；本轮实现已改为**不依赖这两条判断**（见 §1.7） |
| 上游线索（标题级，正文未读） | [metanorma/metanorma-iso#226「Word: SVG images showing up as blank space in Word Doc」](https://github.com/metanorma/metanorma-iso/issues/226)；[「Office cannot handle basic SVG text」](https://learn.microsoft.com/en-us/answers/questions/5161307/office-cannot-handle-basic-svg-text)；[「Word doesn't rasterize your Mermaid SVG — it drops the labels」](https://teckdeck.io/posts/word-doesn-t-rasterize-your-mermaid-svg-it-drops-the-labels) |

### 1.5 因果链（两个因素叠加，缺一不空）

```
MathJax SVG 用 <use> 复用字形 ──► Word 可能画不出矢量副本（主图空）
                                        ▲
                                        │ Word 优先 svgBlip（且可能不回退 PNG）
                                        │
PNG 兜底在 <use> 引用就绪前被栅格化 ──► 全透明空白位图（兜底也空）
                                        ▲
                                        │ decode() 过早 resolve（推断）+ 无结果校验
```

⇒ **只修其一仍会得到空框**：只清洗 SVG ⇒ 兜底可能空白；只修栅格化 ⇒ Word 仍可能不用 PNG。

⇒ **本轮的实现不再依赖上面两条推断**：矢量副本改为**自包含**（`<use>` 全部展开为内联路径、不再依赖引用解析与继承色），位图兜底改为**必然非空**（绘制后校验、重试、失败即中止）。两条推断即便不成立，修复依然有效；Word 中复核用于确认最终观感。

### 1.6 测试用例

| 层次 | 用例 | 断言 |
|---|---|---|
| 单元（转换器） | `tests/unit/docx-math-ooml.test.ts` | 真实 MathJax 语料逐例判定 native/fallback；源式不入方程；原生公式导出后无 `<w:drawing>` |
| e2e（同意流 + 媒体契约） | `tests/e2e/docx-diagnostics.spec.ts` | 2 个降级公式 ⇒ 一致性提示「本次 2 个公式」；下载后的 docx：含 `svgBlip`（矢量副本在位）、**每个 PNG 体积 > 1 KB**（空白位图约 350 B） |
| e2e（原生 DOCX 结构） | `tests/e2e/html-compatibility.spec.ts`「exports native DOCX structure with a native formula and embedded diagram pictures」 | 原生公式为 `<m:oMath>`；图表仍为图片；媒体数量 |
| 人工（必须在 Word 做） | 导出初始样本 → Word 打开 → 看 §2.2 首公式 | 公式可见（矢量或位图皆可），非空对象框 |

### 1.7 本轮已实施的修复（`src/core/export/docxExporter.ts`）

1. **矢量副本自包含（不再依赖对 Word 行为的推断）**：`inlineGlyphReferences` 把每个 `<use>` 替换为它指向的形状的内联副本（`<g transform="translate(x y)">` + 克隆的 `<path>`），并移除已被内联的 `<defs>` 定义 ⇒ 成品 SVG **`<use>` 数为 0、`<defs>` 清空、`currentColor` 为 0、根节点无 `style`/`role`** ⇒ 一次性排除 `<use>`／`xlink:href`／命名空间／继承色这一整类兼容风险。实测体积：13.3 KB→29.4 KB、11.0 KB→23.8 KB（字形路径内联的代价，可接受）。
2. **位图兜底必然非空**：`rasterImage` 绘制后检查 alpha 通道（`hasInk`），最多重试 3 次（间隔 60 ms，**用定时器而非 `requestAnimationFrame`**——页面不可见时 rAF 不触发会挂死），仍为空则**抛错中止导出**（fail closed，绝不写出空白图）。**每次重试都重新创建 `Image` 并重新 `decode()`**：已解码的图像不会重新绘制其内部引用，复用同一实例重试必然仍是空白。
3. **保留矢量 + 位图双份**（不改成只嵌 PNG）：Word 能画矢量时保持清晰度，画不出时位图兜底（位图已被保证非空）。
4. 撤回了「尺寸为 0 ⇒ 抛错」的守卫：jsdom 等无布局环境里所有元素的盒子都是 0×0，该守卫会误伤正常路径；而「栅格化为空」这条守卫已经覆盖了同一失效模式。

**实测（导出初始样本）**：`svgBlip` 4 处（两条公式 + 两条图表的矢量副本在位）；两条公式的 SVG `use=0 / currentColor=0 / 根 style=0`；四条 PNG 分别为 13.2 KB / 14.1 KB / 106.8 KB / 123.9 KB（均非空白）。

**回归**：`bun run typecheck` ✅、`bun run lint` ✅、`bun run test:unit` ✅ 468/468、`bun run test:e2e` ✅ 135/138（余下三项为既有失败，见 §4）。e2e 新增断言：降级公式的 docx 必须含 `svgBlip`，且**每个 PNG 体积 > 1 KB**（空白位图约 350 B）。

---

## 2. 问题二：PDF 需要第二次打印

### 2.1 现象与环境

- Windows 11 + Edge；导出 PDF 时**第一次打印不出内容，第二次才出**。
- 与 6a448c7 想解决的是同一症状；本轮 A1 改动（视口内 + 延迟释放 + 顶层 afterprint 兜底）**没有解决**。

### 2.2 归属与已排除项

| 项 | 结论 | 依据 |
|---|---|---|
| 是否本轮引入 | **否**，既有缺陷 | 基线（37f7389）同样复现 |
| 打印目标是谁的文档 | **打印的是 iframe 自己的文档**（`iframe.contentWindow.print()`），不是父文档的快照 | [printThis #112](https://github.com/jasonday/printThis/issues/112)：对 iframe 的 `contentWindow` 先 `focus()` 再 `print()`，打印的是该 iframe 自身内容 |
| 「让父窗口先合成，父窗口截取快照」 | **前提不成立**（证据指向不成立，非已证伪） | 同上；因此「把帧放进视口 / 改 `opacity` / 父窗口等两帧」这类改动**对准的不是根因** |
| 是否需要 `allow-scripts`（tauri 的做法） | **不需要** | 交付给打印宿主的 HTML **不含任何脚本**：`grep '<script'` 在 `pdfExporter.ts` / `htmlPaginator.ts` / `pagedJsAdapter.ts` 零命中；内容是主文档里已分页好的静态页 |
| 「宿主过早被移除」是不是本症状 | **不是同一现象** | [Print.js #572](https://github.com/crabbly/Print.js/issues/572)、[jQuery.print #40](https://github.com/DoersGuild/jQuery.print/issues/40) 记录的是「打印对话框弹出但什么都没打印」，与「第二次才正常」不同 ⇒ 延迟释放方向合理，但不能直接当作本症状的解 |
| 是否内容未就绪 | **待判别** | 需要现场事实（§2.4 的实验 A/B/C） |

### 2.3 问题源码（`src/core/platform/web/pdfDelivery.ts`，当前实现）

```ts
import {withDeadline,waitForLayout} from '../../export/documentPrint';
/** Web-only native PDF handoff. Input is complete frozen HTML, never source or PDF bytes. */
/** The system spooler keeps reading after the print dialog closes; destroying the frame too early truncates the output. */
export const FRAME_RELEASE_DELAY=1500;
let activeFrame:HTMLIFrameElement|null=null;

function removeFrame(frame:HTMLIFrameElement):void{
 try{frame.remove()}catch{}
 if(activeFrame===frame)activeFrame=null;
}
/** Release the print host after the spooler had time to flush, never before. */
export function scheduleFrameRelease(frame:HTMLIFrameElement):void{
 setTimeout(()=>removeFrame(frame),FRAME_RELEASE_DELAY);
}
async function preparePrintFrame(html:string):Promise<HTMLIFrameElement>{
 if(activeFrame)removeFrame(activeFrame);
 const frame=document.createElement('iframe');frame.title='PDF导出文档';frame.setAttribute('aria-hidden','true');
 frame.setAttribute('sandbox','allow-same-origin allow-modals');
 frame.style.cssText='position:fixed;left:-20000px;top:0;width:794px;height:1123px;border:0';
 const loaded=new Promise<void>((resolve,reject)=>{frame.onload=()=>resolve();frame.onerror=()=>reject(new Error('打印文档加载失败'))});
 const controller=new AbortController();
 const leave=()=>{controller.abort(new Error('PDF导出页面已离开'));removeFrame(frame)};
 frame.srcdoc=html;
 try{
  window.addEventListener('pagehide',leave,{once:true});document.body.append(frame);
  await withDeadline(loaded,'打印文档就绪超时',20000,controller.signal);
  const doc=frame.contentDocument;if(!doc)throw new Error('PDF导出文档不可读取');
  await waitForLayout(doc,doc,controller.signal);controller.signal.throwIfAborted();
  activeFrame=frame;return frame;
 }catch(error){removeFrame(frame);throw error}
 finally{window.removeEventListener('pagehide',leave);frame.onload=null;frame.onerror=null}
}
export async function deliverPdfHtml(html:string):Promise<void>{
 const frame=await preparePrintFrame(html);
 const view=frame.contentWindow;if(!view){removeFrame(frame);throw new Error('PDF导出窗口不可读取')}
 const cleanup=()=>{view.removeEventListener('afterprint',cleanup);window.removeEventListener('pagehide',cleanup);removeFrame(frame)};
 // Print readiness comes from load/decode/fonts/layout inside the host document, never from an arbitrary sleep.
 try{
  view.addEventListener('afterprint',()=>scheduleFrameRelease(frame),{once:true});
  window.addEventListener('afterprint',()=>scheduleFrameRelease(frame),{once:true});
  window.addEventListener('pagehide',cleanup,{once:true});
  view.focus();view.print();
 }catch(error){cleanup();throw error}
}
```

就绪等待的实际覆盖面（`src/core/export/documentPrint.ts` 的 `waitForLayout`）：宿主文档内的 `img` 与 `svg image` 逐个 `decode()`、`doc.fonts.ready`、两帧 rAF（在**宿主自己的窗口**内）⇒ 与「候选 2：等待发生在错误的窗口」不同，这一层本来就发生在宿主窗口内；**未覆盖**：首次打印才完成的其它异步工作（`content-visibility`、`decoding=async`、字体子集、`loading=lazy`）⇒ 由实验 B 判定。

对照 tauri 分支（`6a448c7`）的 `printFrozenHtml`：多了 `allow-scripts`、`width:100%;height:100%`、`z-index:-9999`，以及「顶层窗口 afterprint + 1500 ms 延迟销毁」。

### 2.4 错误细节与判别实验

现象是「第一次不出、第二次出」，必须先分清是哪一种：

| 分支 | 判别方式 | 若成立，修法方向 |
|---|---|---|
| **A. 内容没准备好** | 第一次点打印，打印对话框里的**预览是空的** | 就绪等待要覆盖「首次打印才完成的异步工作」：宿主窗口内的图片解码、字体、`content-visibility`、`decoding=async`、延迟图片；当前 `waitForLayout` 只等布局与 `img`/`svg image` 的 `decode()`，不覆盖其余 |
| **B. Spooler 侧空** | 预览**有内容**，但保存出的 PDF 为空 | 宿主在打印期间必须存活且可被 Spooler 读取（当前 1500 ms 延迟释放是否足够） |

⇒ **诊断探针已就绪**（`tests/fixtures/architecture/web-native-pdf-probe-client.ts`）：

- **实验 A（就绪时序）**：探针支持 `?settle=<毫秒>`，会把**真正发起打印**的时刻延后 ⇒ 打开 `/tests/fixtures/architecture/web-native-pdf-probe.html?settle=4000` 再导出：若首次打印就正常 ⇒ 根因是就绪时序（候选 1/2）；仍为空 ⇒ 转向宿主或渲染层。**该开关只在探针侧，不改产品行为。**
- **实验 B（就绪指标）**：`beforeprint` 时记录 `printReadiness`：
  ```json
  { "incompleteImages": 0, "imageCount": 0, "fontsStatus": "loaded",
    "lazyImages": 0, "contentVisibility": 0, "pagesWithSize": 6 }
  ```
  外加 `printHostState`（宿主矩形、`readyState`、`innerWidth/Height`、页数、首屏尺寸、透明度、视口、`visibilityState`）。
- **实验 C（现场事实）**：记录第一次打印对话框的**预览是否为空**。

⇒ **请在 Windows 11 + Edge（Web 与 Tauri 各一次）**：先跑默认探针，再跑 `?settle=4000`，各导出一次，把页面 JSON 贴回。

### 2.5 测试用例

| 层次 | 用例 | 断言 |
|---|---|---|
| 单元 | `tests/unit/pdf-delivery.test.ts` | 帧样式在视口内且不含负偏移；就绪后才 `print()`；`afterprint` 后**不立即**销毁、延迟后销毁；`pagehide` 立即销毁 |
| e2e（契约） | `tests/e2e/web-native-pdf-baseline.spec.ts` | 交接后 `remainingFrames:1`（事件瞬间）→ `settledFrames:0`（释放后）；打印失败/就绪期离开/交接后离开三种路径都清理干净 |
| 人工 | `docs/acceptance/ex-w0-native-manual-checklist-2026-10-27.md` | 系统保存对话框的真实结果、默认名、取消行为、页数与正文完整性（**自动化 PDF 不作为系统保存证据**） |

### 2.6 本轮已做的改动（已收敛为「有依据的最小集」）

**保留**（有 Print.js 类问题作支撑）：

1. `afterprint` 后**延迟 1500 ms** 释放打印宿主（`scheduleFrameRelease`）；
2. 顶层窗口的 `afterprint` 兜底监听（原生打印对话框可能在顶层派发该事件）；
3. `pagehide` 仍**立即**清理（页面卸载没有 Spooler 可等）。

**撤回**（对准的不是根因，或存在隐患）：

4. 「`print()` 前在**父窗口**等两帧 rAF」——两个问题：① 前提不成立；② **违反本仓库自己的规则**（页面不可见时 rAF 不触发，`print()` 永不被调用 ⇒ 用户切走标签页或在某些 WebView 中即挂死）。就绪等待一律用**定时器**，且尽量放在**宿主自己的窗口**内。

**改回（2026-10-31 复核：先前的撤回是推理过头）**：

5. **打印宿主归位到视口内**（`PRINT_FRAME_STYLE`：`position:fixed;left:0;top:0;width:794px;height:1123px;opacity:0;pointer-events:none`）。先前的撤回理由是「打印的是 iframe 自身文档，父窗口的合成与快照不是前提」——该理由只否掉了**父窗口合成**这一个假设，却顺带否掉了**更接近规范**的那一版：打印的是**被渲染过的**框架，视口外（`left:-20000px`）的框架可能从未参与栅格化，这与「第一次空、第二次好」（第一次打印请求本身促成了渲染，第二次就有内容）的特征吻合；通行做法（print.js）同样把打印 iframe 放在视口内。**判别方式**：一次导出，看第一次打印是否直接出内容。

**新增**（诊断，不改产品行为）：

6. 探针的 `?settle=<毫秒>` 开关（实验 A）与 `printReadiness` / `printHostState` 指标（实验 B）。

⇒ A 线当前的 diff = 「宿主归位（做正确）+ 延迟释放/顶层兜底（guard）+ 探针诊断」；根因由现场首打结果与实验 A/B/C 判别。

---

## 3. 问题三：DOCX「已保存文件」但目标位置没有文件（Windows 11 + Edge）

### 3.1 现象

Web 形态（Edge）导出 DOCX：出现系统「另存为」对话框、选定位置后，应用显示「已保存文件」，但**该位置没有文件**。

### 3.2 问题源码

`src/core/platform/web/byteDelivery.ts` 的选择器路径：`showSaveFilePicker` → `createWritable` → `write(blob)` → `close()` → 返回 `'saved'`；`src/application/exports/exportService.ts` 把 `'saved'` 直接翻译成「已保存文件」。

**回执不是证据**：`close()` resolve 只说明浏览器接受了写入流，不说明字节已经落到用户选定的路径；应用既不回读校验，也没有兜底路径 —— 写坏了，用户既没有文件也没有错误提示。

### 3.3 因果链

1. 流在浏览器侧 resolve，但目标路径未获得字节（swap 文件未提交 / 路径不可写 / 目标被占用等）；
2. 适配器把「API 已 resolve」当作「文件已存在」；
3. 应用层据此显示「已保存文件」；
4. 没有兜底路径 ⇒ 用户空手而归。

### 3.4 本轮修复：把写入做正确 + 可验证的回执

**（a）顺序归位（做正确）**：`ExportService.run()` 的顺序由「先选保存位置 → 生成 → 写」改为「**先生成字节 → 再选位置 → 紧接写入**」。效果：picker 与 write 落在同一手势内（不再横跨数秒并跨一次交互）；被拒绝或不支持的输出**不再要求用户先选位置**；生成失败时**根本不弹保存框**。代价：`showSaveFilePicker` 现在发生在异步生成之后，依赖浏览器的瞬时激活窗口；`selectWebSave` 已在激活过期时自动改走浏览器下载分支（用户仍拿到文件，只是没有自定义位置）。彻底消除该依赖需要「预生成 + 缓存 + 二次点击保存」，属下一步（待定交互改动）。

**（b）回读校验（guard）**：`close()` 之后用 `handle.getFile()` 回读目标文件。文件不存在（`NotFoundError`）或大小与待写字节不符 ⇒ 判定「写丢了」；最多重试 3 次（间隔 120 ms），容忍 swap 文件提交的延迟；无法回读（无 `getFile` 或读权限被拒）⇒ 判定「未知」，保留浏览器的结论并在控制台告警。

- **兜底**：判定「写丢了」时把字节交给浏览器下载（锚点下载），回执改为 `'recovered-download'`，应用层文案「所选位置未生成文件，已改为浏览器下载」。**「报告成功但没有文件」不再可能发生**。
- **不静默改投**：硬失败（`createWritable` / `write` / `close` 抛错）仍原样上报错误，既有原则不变（`tests/e2e/web-unified-save.spec.ts` 的 permission / write-fail / close-fail 三例仍在断言「无静默下载兜底」）。
- 校验口径是**文件大小**：足以证明「写丢了」，但无法区分「恰好等长的旧文件」这一极端情形。

### 3.5 现场判别（用户在 Edge 执行一次导出即可）

- 应用显示「所选位置未生成文件，已改为浏览器下载」⇒ 浏览器确实写丢了，文件已落在 Edge 下载目录，可直接使用；
- 控制台出现 `[export] 文件已提交，但无法回读校验所选位置` ⇒ 浏览器不给读权限，结论仍是「已保存」，请回报该行；
- 应用显示「已保存文件」但仍无文件 ⇒ 回读校验已通过（文件确实存在且大小一致），问题转为「所选位置与实际落盘位置不一致」，需要 Edge 侧保存路径信息才能进一步定位。

### 3.6 测试用例

- `tests/unit/web-byte-delivery.test.ts`：回读一致 ⇒ `'saved'`；回读 `NotFoundError` ⇒ 锚点下载 + `'recovered-download'`；回读延迟一致 ⇒ 仍 `'saved'`。
- `tests/e2e/web-unified-save.spec.ts`「a chosen path that holds no file hands the bytes to the browser and says so」：探针 `getFile` 抛 `NotFoundError` ⇒ 断言产生一次浏览器下载、文案为「所选位置未生成文件，已改为浏览器下载」、写入流 create/write/close 各一次。

## 4. 问题四：PDF 打印成功但没有结果通知

### 4.1 现象

PDF 导出后系统打印对话框正常打印，但应用**没有给出任何结果提示**。

### 4.2 问题源码

结果文案只渲染在导出对话框内部（`ExportModal` 的 `role="status"` 区块）。系统打印对话框是**原生模态窗口**，压在应用窗口之上；打印结束后用户面对的是打印结果，而不是对话框底部那行小字。应用在对话框之外**没有任何结果面**。

### 4.3 本轮修复：唯一的结果面

- 结果移到**应用层常驻通知**（`src/App.tsx`：`role="status"`、`aria-label="导出结果通知"`、fixed、层级高于对话框、`no-print`），10 秒后自动消失，可手动关闭；
- 对话框内部原状态行删除：**同一句话只出现一次**，避免屏幕上同时出现两处相同文案；
- 导出抛异常时也走同一通知面并附带原因；`busy` 提示同样走通知面。

### 4.4 测试用例

- `tests/e2e/web-unified-save.spec.ts` 的 PDF 用例断言通知面含「PDF导出已交由浏览器处理」。

---

## 5. 检索关键词

英文：`Word docx svgBlip blank` / `Word SVG image blank space` / `Office SVG <use> element unsupported` / `docx SVG fallback PNG not shown` / `Chromium print iframe blank first print` / `window.print iframe empty first time` / `Paged.js print blank first attempt` / `Edge print preview blank iframe`。

中文：`Word 插入 SVG 空白` / `docx 公式 图片 空框` / `浏览器 打印 iframe 第一次空白` / `打印 预览 空白 第二次才正常`。

依赖版本：`docx@9.15.0`、`hast-util-raw@9.1.0`、`hast-util-from-parse5@8.0.3`、`parse5@7.3.0`、`mathjax@3.2.2`、`pagedjs@0.4.3`。

## 6. 状态

- **问题一**：修复已落地并本地验证（矢量副本自包含、位图兜底必然非空、失败即中止），门禁全绿；**待用户在 Word 复核 §2.2 首公式的观感**（Word 侧只需确认公式可见；矢量副本已不再依赖 `<use>`/`currentColor` 的支持情况）。
- **问题二**：A 线改为「**宿主归位（做正确）+ 延迟释放/顶层兜底（guard）+ 探针诊断**」；**现场已确认**：宿主归位后**第一次打印即产出内容**，不需要第二次打印 ⇒ 视口外未渲染即为根因。
- **问题三**：改为「**顺序归位（做正确）+ 回读校验/兜底（guard）**」；**现场已确认**：DOCX **目标位置出现文件**（此前显示成功但无文件）。
- **问题四**：结果面移到应用层常驻通知；**现场已确认**：打印对话框关闭后能看到通知。
- 门禁：`bun run typecheck` ✅（218 个受管源文件）、`bun run lint` ✅、`bun run test:unit` ✅ **473/473**、`bun run test:e2e` ✅ **136/138**。
  - e2e 的两项失败均为**既有失败**：`workbench-tabs`「changed math configuration」与 `source-import`「shows import busy while reading」在干净 HEAD 上同样失败（后者 3/3 失败，时序相关）。
- 全部改动**尚未提交**；提交流程见 `docs/design/export-outputs-formula-and-print-plan-2026-10-30.md` §10。
