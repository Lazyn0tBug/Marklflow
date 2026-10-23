/**
 * MarkFlow (墨流) MathJax 数学公式主引擎
 * 严格遵循《Markdown 编辑器总体设计方案 V0.2.8》第 7.4 节：
 * “选型结论：MathJax 为唯一公式主引擎，输入使用 LaTeX 数学语法。首版不引入 Typst 或 KaTeX”
 * 支持原生 MathML 与 MathJax 矢量 SVG 双输出模式
 * 具备行内公式运算符级软换行拆分能力，使 SVG 模式具备与 MathML 完全一致的自然折行排版体验
 */

declare global {
  interface Window {
    MathJax?: {
      tex2mml?: (latex: string, options?: { display?: boolean }) => string;
      tex2svg?: (latex: string, options?: { display?: boolean }) => HTMLElement;
      tex2mmlPromise?: (latex: string, options?: { display?: boolean }) => Promise<string>;
      tex2svgPromise?: (latex: string, options?: { display?: boolean }) => Promise<HTMLElement>;
      startup?: {
        promise?: Promise<void>;
        adaptor?: {
          outerHTML: (node: any) => string;
        };
      };
    };
  }
}

// 转换缓存
const mmlCache = new Map<string, string>();
const svgCache = new Map<string, string>();

/**
 * 清除所有数学渲染缓存 (在模式切换或重新加载时调用)
 */
export function clearMathCaches(): void {
  mmlCache.clear();
  svgCache.clear();
}

/**
 * 等待 MathJax 准备就绪
 */

export async function ensureMathJaxReady():Promise<boolean>{
 if(typeof window==='undefined')return false;
 try{await window.MathJax?.startup?.promise}catch{return false}
 return !!(window.MathJax?.tex2mmlPromise&&window.MathJax?.tex2svgPromise);
}

/**
 * 使用 MathJax 将 LaTeX 渲染为原生 MathML
 */
export function latexToMathML(latex: string, displayMode: boolean = false): string {
  const cleanLatex = latex.trim();
  const cacheKey = `${displayMode ? 'block' : 'inline'}:${cleanLatex}`;

  if (mmlCache.has(cacheKey)) {
    return mmlCache.get(cacheKey)!;
  }

  if (typeof window !== 'undefined' && window.MathJax?.tex2mml) {
    try {
      let mml = window.MathJax.tex2mml(cleanLatex, { display: displayMode });
      if (mml && mml.startsWith('<math')) {
        if (!displayMode) {
          mml = `<span class="markflow-inline-math" style="display:inline;vertical-align:baseline;">${mml}</span>`;
        }
        mmlCache.set(cacheKey, mml);
        return mml;
      }
    } catch (err) {
      console.warn('MathJax tex2mml error:', err, 'for latex:', cleanLatex);
    }
  }

  // 异步预热
  if (typeof window !== 'undefined' && window.MathJax?.tex2mmlPromise) {
    window.MathJax.tex2mmlPromise(cleanLatex, { display: displayMode }).then((res) => {
      if (res && res.startsWith('<math')) {
        let finalRes = res;
        if (!displayMode) {
          finalRes = `<span class="markflow-inline-math" style="display:inline;vertical-align:baseline;">${res}</span>`;
        }
        mmlCache.set(cacheKey, finalRes);
      }
    });
  }

  // 备用兜底
  return `<span class="markflow-inline-math" style="display:${displayMode ? 'block' : 'inline'};vertical-align:baseline;"><math xmlns="http://www.w3.org/1998/Math/MathML"${displayMode ? ' display="block"' : ''}><mrow><mtext>${escapeXml(cleanLatex)}</mtext></mrow></math></span>`;
}

/**
 * 净化 SVG HTML，去除 MathJax 自动追加的 mjx-assistive-mml 辅屏标签与冗余节点
 */
function cleanSvgHtml(rawHtml: string, displayMode: boolean): string {
  let svgHtml = rawHtml;
  // 1. 彻底移除 assistive-mml 节点及其内部的 <math>
  svgHtml = svgHtml.replace(/<mjx-assistive-mml[\s\S]*?<\/mjx-assistive-mml>/gi, '');
  if (svgHtml.includes('<svg') && svgHtml.includes('<math')) {
    svgHtml = svgHtml.replace(/<math[\s\S]*?<\/math>/gi, '');
  }

  if (!displayMode) {
    // 行内 SVG 样式保护
    svgHtml = svgHtml.replace(
      '<mjx-container ',
      '<mjx-container style="display:inline-block!important;vertical-align:-0.25ex!important;margin:0 0.15em!important;line-height:normal!important;" '
    );
    svgHtml = svgHtml.replace(
      '<svg ',
      '<svg style="display:inline!important;vertical-align:-0.25ex!important;margin:0!important;" '
    );
    svgHtml = `<span class="markflow-inline-math" style="display:inline;vertical-align:middle;">${svgHtml}</span>`;
  } else {
    // 独立块级公式
    svgHtml = svgHtml.replace(
      '<mjx-container ',
      '<mjx-container style="display:block!important;text-align:center!important;margin:1.2em auto!important;overflow-x:auto!important;" '
    );
  }
  return svgHtml;
}

/**
 * 渲染单个不可拆分的 LaTeX 片段为 SVG
 */
function renderSingleSVG(cleanLatex: string, displayMode: boolean): string {
  if (typeof window !== 'undefined' && window.MathJax?.tex2svg) {
    try {
      const node = window.MathJax.tex2svg(cleanLatex, { display: displayMode });
      if (node) {
        const raw = node.outerHTML || (window.MathJax.startup?.adaptor ? window.MathJax.startup.adaptor.outerHTML(node) : '');
        if (raw) {
          return cleanSvgHtml(raw, displayMode);
        }
      }
    } catch (err) {
      console.warn('MathJax single tex2svg error:', err, 'for latex:', cleanLatex);
    }
  }

  return latexToMathML(cleanLatex, displayMode);
}

interface MathPart {
  type: 'math' | 'op';
  text: string;
}

/**
 * 智能拆分顶层运算符（深度为 0 的 =、+、-、\le 等）
 * 使行内长公式可以在运算符位置自然断行，避免像一个刚体图片一样整体换行
 */
function splitInlineMathForWrapping(latex: string): MathPart[] {
  let depth = 0;
  const parts: MathPart[] = [];
  let current = '';

  let i = 0;
  while (i < latex.length) {
    const ch = latex[i];
    if (ch === '{' || ch === '(' || ch === '[') {
      depth++;
      current += ch;
      i++;
    } else if (ch === '}' || ch === ')' || ch === ']') {
      depth = Math.max(0, depth - 1);
      current += ch;
      i++;
    } else if (depth === 0) {
      let matchedMacroOp = '';
      for (const op of ['\\le', '\\ge', '\\ne', '\\approx', '\\equiv', '\\sim', '\\to']) {
        if (latex.startsWith(op, i)) {
          matchedMacroOp = op;
          break;
        }
      }

      if (matchedMacroOp) {
        if (current.trim()) parts.push({ type: 'math', text: current.trim() });
        parts.push({ type: 'op', text: matchedMacroOp });
        current = '';
        i += matchedMacroOp.length;
      } else if (ch === '=' || ch === '+' || (ch === '-' && i > 0 && latex[i - 1] === ' ')) {
        if (current.trim()) parts.push({ type: 'math', text: current.trim() });
        parts.push({ type: 'op', text: ch });
        current = '';
        i++;
      } else {
        current += ch;
        i++;
      }
    } else {
      current += ch;
      i++;
    }
  }

  if (current.trim()) parts.push({ type: 'math', text: current.trim() });
  return parts.length > 1 ? parts : [{ type: 'math', text: latex.trim() }];
}

/**
 * 使用 MathJax 将 LaTeX 渲染为纯净 SVG 矢量图
 * 支持行内长公式运算符级软折行，与 MathML 自然排版完全一致
 */
export function latexToSVG(latex: string, displayMode: boolean = false): string {
  const cleanLatex = latex.trim();
  const cacheKey = `${displayMode ? 'block' : 'inline'}:${cleanLatex}`;

  if (svgCache.has(cacheKey)) {
    return svgCache.get(cacheKey)!;
  }

  // 针对行内公式，若含有可折行的顶层等号或加号等运算符，进行分段包裹以支持自然换行
  if (!displayMode) {
    const parts = splitInlineMathForWrapping(cleanLatex);
    if (parts.length > 1) {
      const renderedParts = parts.map((p) => {
        if (p.type === 'op') {
          return ` <span class="markflow-inline-op">${renderSingleSVG(p.text, false)}</span> `;
        }
        return renderSingleSVG(p.text, false);
      });
      const combined = `<span class="markflow-inline-math-group" style="display:inline;vertical-align:middle;white-space:normal;">${renderedParts.join('')}</span>`;
      svgCache.set(cacheKey, combined);
      return combined;
    }
  }

  // 单一公式渲染
  const result = renderSingleSVG(cleanLatex, displayMode);
  if (result && !result.startsWith('<span class="markflow-inline-math"><math')) {
    svgCache.set(cacheKey, result);
  }
  return result;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}


export async function prepareMath(expressions:{value:string;display:boolean}[],mode:'mathml'|'svg'):Promise<void> {
 if(!expressions.length)return;
 if(!await ensureMathJaxReady())throw new Error('MathJax 尚未就绪，不能以源码回退作为完成结果');
 clearMathCaches();
 for(const expression of expressions){
  const key=(expression.display?'block:':'inline:')+expression.value.trim();
  const engine=window.MathJax!;
  if(mode==='svg'){
   if(!engine.tex2svgPromise)throw new Error('MathJax SVG Promise API 不可用');
   const node=await engine.tex2svgPromise(expression.value,{display:expression.display});
   const html=cleanSvgHtml(node.outerHTML,expression.display);
   if(/data-mjx-error|<merror|mjx-merror/.test(html))throw new Error('公式解析失败：'+expression.value);
   svgCache.set(key,html);
  }else{
   if(!engine.tex2mmlPromise)throw new Error('MathJax MathML Promise API 不可用');
   const html=await engine.tex2mmlPromise(expression.value,{display:expression.display});
   if(/<merror|data-mjx-error/.test(html))throw new Error('公式解析失败：'+expression.value);
   mmlCache.set(key,expression.display?html:'<span class="markflow-inline-math">'+html+'</span>');
  }
 }
}
