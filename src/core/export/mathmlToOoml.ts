import {
  Math as DocxMath,
  MathRun,
  MathFraction,
  MathSuperScript,
  MathSubScript,
  MathSubSuperScript,
  MathRadical,
  MathRoundBrackets,
  MathSquareBrackets,
  MathCurlyBrackets,
  MathSum,
  MathIntegral,
  type MathComponent,
} from 'docx';

export type DocxMathChild = MathComponent;

/**
 * 递归将 MathML DOM 节点转换为 Word 原生 Office Open XML Math (OOML) 对象
 */
export function convertMathMLToDocxMath(mathElement: Element): DocxMath {
  const children = convertMathMLChildren(mathElement);
  return new DocxMath({
    children: children.length ? children : [new MathRun('')],
  });
}

export function convertMathMLChildren(element: Element): DocxMathChild[] {
  const results: DocxMathChild[] = [];
  for (const child of Array.from(element.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = child.textContent?.trim();
      if (text) results.push(new MathRun(text));
    } else if (child instanceof Element) {
      const converted = convertMathMLElement(child);
      if (Array.isArray(converted)) {
        results.push(...converted);
      } else if (converted) {
        results.push(converted);
      }
    }
  }
  return results;
}

function getChildElements(el: Element): Element[] {
  return Array.from(el.children);
}

export function convertMathMLElement(el: Element): DocxMathChild | DocxMathChild[] {
  const tag = el.localName.toLowerCase();

  // 基础文本/符号/标识符/数字/运算符
  if (tag === 'mi' || tag === 'mn' || tag === 'mo' || tag === 'mtext' || tag === 'ms') {
    const text = el.textContent || '';
    return new MathRun(text);
  }

  if (tag === 'mspace') {
    return new MathRun(' ');
  }

  // 容器类节点：展开子节点
  if (['mrow', 'mstyle', 'mpadded', 'mphantom', 'semantics', 'annotation-xml'].includes(tag)) {
    return convertMathMLChildren(el);
  }

  // 分数：<mfrac><num/><den/></mfrac>
  if (tag === 'mfrac') {
    const children = getChildElements(el);
    const num = children[0] ? convertMathMLChildren(children[0]) : [new MathRun('1')];
    const den = children[1] ? convertMathMLChildren(children[1]) : [new MathRun('1')];
    return new MathFraction({
      numerator: num.length ? num : [new MathRun('1')],
      denominator: den.length ? den : [new MathRun('1')],
    });
  }

  // 上标：<msup><base/><sup/></msup>
  if (tag === 'msup') {
    const children = getChildElements(el);
    const base = children[0] ? convertMathMLChildren(children[0]) : [new MathRun('')];
    const sup = children[1] ? convertMathMLChildren(children[1]) : [new MathRun('')];
    return new MathSuperScript({
      children: base.length ? base : [new MathRun('')],
      superScript: sup.length ? sup : [new MathRun('')],
    });
  }

  // 下标：<msub><base/><sub/></msub>
  if (tag === 'msub') {
    const children = getChildElements(el);
    const base = children[0] ? convertMathMLChildren(children[0]) : [new MathRun('')];
    const sub = children[1] ? convertMathMLChildren(children[1]) : [new MathRun('')];
    return new MathSubScript({
      children: base.length ? base : [new MathRun('')],
      subScript: sub.length ? sub : [new MathRun('')],
    });
  }

  // 上下标：<msubsup><base/><sub/><sup/></msubsup>
  if (tag === 'msubsup') {
    const children = getChildElements(el);
    const base = children[0] ? convertMathMLChildren(children[0]) : [new MathRun('')];
    const sub = children[1] ? convertMathMLChildren(children[1]) : [new MathRun('')];
    const sup = children[2] ? convertMathMLChildren(children[2]) : [new MathRun('')];
    return new MathSubSuperScript({
      children: base.length ? base : [new MathRun('')],
      subScript: sub.length ? sub : [new MathRun('')],
      superScript: sup.length ? sup : [new MathRun('')],
    });
  }

  // 根号：<msqrt><base/></msqrt> 或 <mroot><base/><deg/></mroot>
  if (tag === 'msqrt') {
    const children = convertMathMLChildren(el);
    return new MathRadical({
      children: children.length ? children : [new MathRun('')],
    });
  }
  if (tag === 'mroot') {
    const children = getChildElements(el);
    const base = children[0] ? convertMathMLChildren(children[0]) : [new MathRun('')];
    const deg = children[1] ? convertMathMLChildren(children[1]) : [new MathRun('2')];
    return new MathRadical({
      children: base.length ? base : [new MathRun('')],
      degree: deg.length ? deg : [new MathRun('2')],
    });
  }

  // 上下界运算（求和、积分、极限等）：<munderover>, <munder>, <mover>
  if (tag === 'munderover') {
    const children = getChildElements(el);
    const baseText = children[0]?.textContent?.trim() || '';
    const under = children[1] ? convertMathMLChildren(children[1]) : [new MathRun('')];
    const over = children[2] ? convertMathMLChildren(children[2]) : [new MathRun('')];

    if (/^[∑\u2211]/.test(baseText) || baseText.toLowerCase() === 'sum') {
      return new MathSum({
        children: [new MathRun('')],
        subScript: under.length ? under : [new MathRun('')],
        superScript: over.length ? over : [new MathRun('')],
      });
    }
    if (/^[∫\u222B]/.test(baseText) || baseText.toLowerCase() === 'int') {
      return new MathIntegral({
        children: [new MathRun('')],
        subScript: under.length ? under : [new MathRun('')],
        superScript: over.length ? over : [new MathRun('')],
      });
    }

    const base = children[0] ? convertMathMLChildren(children[0]) : [new MathRun('')];
    return new MathSubSuperScript({
      children: base.length ? base : [new MathRun('')],
      subScript: under.length ? under : [new MathRun('')],
      superScript: over.length ? over : [new MathRun('')],
    });
  }

  if (tag === 'munder') {
    const children = getChildElements(el);
    const base = children[0] ? convertMathMLChildren(children[0]) : [new MathRun('')];
    const under = children[1] ? convertMathMLChildren(children[1]) : [new MathRun('')];
    return new MathSubScript({
      children: base.length ? base : [new MathRun('')],
      subScript: under.length ? under : [new MathRun('')],
    });
  }

  if (tag === 'mover') {
    const children = getChildElements(el);
    const base = children[0] ? convertMathMLChildren(children[0]) : [new MathRun('')];
    const over = children[1] ? convertMathMLChildren(children[1]) : [new MathRun('')];
    return new MathSuperScript({
      children: base.length ? base : [new MathRun('')],
      superScript: over.length ? over : [new MathRun('')],
    });
  }

  // 括号括起结构：<mfenced open="(" close=")">
  if (tag === 'mfenced') {
    const open = el.getAttribute('open') ?? '(';
    const close = el.getAttribute('close') ?? ')';
    const children = convertMathMLChildren(el);
    if (open === '(' && close === ')') {
      return new MathRoundBrackets({ children });
    }
    if (open === '[' && close === ']') {
      return new MathSquareBrackets({ children });
    }
    if (open === '{' && close === '}') {
      return new MathCurlyBrackets({ children });
    }
    return [new MathRun(open), ...children, new MathRun(close)];
  }

  // 表格/矩阵：<mtable><mtr><mtd>
  if (tag === 'mtable') {
    const children = convertMathMLChildren(el);
    return children.length ? children : [new MathRun('')];
  }
  if (tag === 'mtr' || tag === 'mtd') {
    return convertMathMLChildren(el);
  }

  // 默认兜底
  const subChildren = convertMathMLChildren(el);
  if (subChildren.length) return subChildren;
  return new MathRun(el.textContent || '');
}
