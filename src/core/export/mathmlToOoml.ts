/** Converts the semantic MathML carried by the frozen artifact into Word native math (OMML). */
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
  MathAngledBrackets,
  type MathComponent,
  type MathRunStyle,
  type MathRunScript,
} from 'docx';
import {MATHML_NAMESPACE} from '../policy/htmlRules';

/**
 * Every formula ends in exactly one conclusion, and the DOCX capability check and the DOCX writer share it.
 * - native: the structure maps onto OOML without changing meaning.
 * - fallback: the structure cannot be expressed natively; the visual layer stays the only faithful copy.
 * - unsupported: nothing safe can be produced at all.
 */
export type DocxFormulaPlan =
  | {kind: 'native'; math: DocxMath}
  | {kind: 'fallback'; reason: string}
  | {kind: 'unsupported'; reason: string};
type Converted = {ok: true; components: MathComponent[]} | {ok: false; reason: string};

const RUN_STYLES: Record<string, MathRunStyle> = {
  normal: 'plain',
  italic: 'italic',
  bold: 'bold',
  'bold-italic': 'boldItalic',
};
const RUN_SCRIPTS: Record<string, MathRunScript> = {
  fraktur: 'fraktur',
  'bold-fraktur': 'fraktur',
  script: 'script',
  'double-struck': 'doubleStruck',
  'sans-serif': 'sansSerif',
  monospace: 'monospace',
};

/** The semantic MathML of one formula host, or null when the host carries no convertible structure. */
export function findFormulaMathML(host: Element): Element | null {
  const scoped = host.querySelector('.mf-math-semantics math');
  return scoped ?? host.querySelector('math');
}

/** The source LaTeX carried by the formula host; used for fallback descriptions, never for conversion. */
export function docxFormulaSource(host: Element): string {
  return host.getAttribute('data-mf-tex')?.trim() ?? '';
}

/** Plan one formula host: native math, an image fallback with a reason, or an unsupported stop. */
export function planDocxFormula(host: Element): DocxFormulaPlan {
  const math = findFormulaMathML(host);
  if (!math) return {kind: 'unsupported', reason: '公式缺少可转换的语义结构'};
  if (math.namespaceURI !== MATHML_NAMESPACE)
    return {kind: 'unsupported', reason: '公式语义结构不是MathML命名空间'};
  const converted = convertChildren(math);
  if (!converted.ok) return {kind: 'fallback', reason: converted.reason};
  return {
    kind: 'native',
    math: new DocxMath({
      children: converted.components.length ? converted.components : [new MathRun('')],
    }),
  };
}

function convertChildren(element: Element): Converted {
  const components: MathComponent[] = [];
  for (const child of Array.from(element.childNodes)) {
    // MathML keeps text in leaf elements only; text directly under a container is never equation content.
    if (!(child instanceof Element)) continue;
    const converted = convertElement(child);
    if (!converted.ok) return converted;
    components.push(...converted.components);
  }
  return {ok: true, components};
}

/** A leaf contributes its own text; a container contributes its converted children. */
function convertGroup(element: Element): Converted {
  const tag = element.localName;
  if (tag === 'mi' || tag === 'mn' || tag === 'mo' || tag === 'mtext' || tag === 'ms')
    return {
      ok: true,
      components: [new MathRun({text: element.textContent ?? '', ...runStyle(element, tag)})],
    };
  if (tag === 'mspace') return {ok: true, components: [new MathRun(' ')]};
  return convertChildren(element);
}

function convertElement(element: Element): Converted {
  const tag = element.localName;
  if (element.namespaceURI !== MATHML_NAMESPACE)
    return {ok: false, reason: '公式包含非MathML节点：' + tag};
  // The source annotation is metadata; it never becomes equation content.
  if (tag === 'annotation' || tag === 'annotation-xml') return {ok: true, components: []};
  // Textual leaves keep their MathML variant so Word draws identifiers, digits and operators the way LaTeX does.
  if (
    tag === 'mi' ||
    tag === 'mn' ||
    tag === 'mo' ||
    tag === 'mtext' ||
    tag === 'ms' ||
    tag === 'mspace'
  )
    return convertGroup(element);
  // Containers carry no structure of their own; attributes such as color or padding are recorded as known losses.
  if (tag === 'mrow' || tag === 'mstyle' || tag === 'mpadded' || tag === 'mphantom')
    return convertChildren(element);
  // The source annotation is metadata, never equation content.
  if (tag === 'semantics') {
    const presentation = Array.from(element.children).find(
      (child) => child.localName !== 'annotation' && child.localName !== 'annotation-xml',
    );
    return presentation
      ? convertElement(presentation)
      : {ok: false, reason: '公式语义结构缺少可转换内容'};
  }
  if (tag === 'mfrac') {
    const [numerator, denominator] = element.children;
    if (!numerator || !denominator) return {ok: false, reason: '分式缺少分子或分母'};
    const top = convertGroup(numerator),
      bottom = convertGroup(denominator);
    if (!top.ok) return top;
    if (!bottom.ok) return bottom;
    return {
      ok: true,
      components: [new MathFraction({numerator: top.components, denominator: bottom.components})],
    };
  }
  if (tag === 'msup' || tag === 'msub' || tag === 'msubsup') {
    const [base, ...rest] = element.children;
    if (!base) return {ok: false, reason: '上下标缺少基式'};
    const body = convertGroup(base);
    if (!body.ok) return body;
    // MathML orders the scripts as base, subscript, superscript.
    const second = rest[0] ? convertGroup(rest[0]) : undefined;
    const third = rest[1] ? convertGroup(rest[1]) : undefined;
    const sub = tag === 'msub' || tag === 'msubsup' ? second : undefined;
    const sup = tag === 'msup' ? second : tag === 'msubsup' ? third : undefined;
    if (tag === 'msup' && !sup) return {ok: false, reason: '上标缺少内容'};
    if (tag === 'msub' && !sub) return {ok: false, reason: '下标缺少内容'};
    if (tag === 'msubsup' && (!sub || !sup)) return {ok: false, reason: '上下标缺少内容'};
    if (sub && !sub.ok) return sub;
    if (sup && !sup.ok) return sup;
    const subComponents = sub ? sub.components : [],
      supComponents = sup ? sup.components : [];
    if (tag === 'msup')
      return {
        ok: true,
        components: [new MathSuperScript({children: body.components, superScript: supComponents})],
      };
    if (tag === 'msub')
      return {
        ok: true,
        components: [new MathSubScript({children: body.components, subScript: subComponents})],
      };
    return {
      ok: true,
      components: [
        new MathSubSuperScript({
          children: body.components,
          subScript: subComponents,
          superScript: supComponents,
        }),
      ],
    };
  }
  if (tag === 'msqrt' || tag === 'mroot') {
    const [base, degree] = element.children;
    if (!base) return {ok: false, reason: '根式缺少被开方式'};
    const body = convertGroup(base);
    if (!body.ok) return body;
    if (tag === 'msqrt')
      return {ok: true, components: [new MathRadical({children: body.components})]};
    if (!degree) return {ok: false, reason: '根式缺少次数'};
    const index = convertGroup(degree);
    if (!index.ok) return index;
    return {
      ok: true,
      components: [new MathRadical({children: body.components, degree: index.components})],
    };
  }
  if (tag === 'mfenced') return convertFenced(element);
  // Structures that are not equivalent to any OOML component stay images instead of a plausible but wrong equation.
  if (tag === 'munder' || tag === 'mover' || tag === 'munderover')
    return {ok: false, reason: '公式包含上下限结构（求和、积分、极限、重音）'};
  if (tag === 'mtable' || tag === 'mtr' || tag === 'mtd' || tag === 'mlabeledtr')
    return {ok: false, reason: '公式包含矩阵或表格结构'};
  return {ok: false, reason: '公式包含暂不支持的结构：' + tag};
}

function convertFenced(element: Element): Converted {
  const open = element.getAttribute('open') ?? '(';
  const close = element.getAttribute('close') ?? ')';
  const body = convertChildren(element);
  if (!body.ok) return body;
  if (open === '(' && close === ')')
    return {ok: true, components: [new MathRoundBrackets({children: body.components})]};
  if (open === '[' && close === ']')
    return {ok: true, components: [new MathSquareBrackets({children: body.components})]};
  if (open === '{' && close === '}')
    return {ok: true, components: [new MathCurlyBrackets({children: body.components})]};
  if (open === '⟨' && close === '⟩')
    return {ok: true, components: [new MathAngledBrackets({children: body.components})]};
  return {ok: false, reason: '公式包含非标准定界符'};
}

/** MathML mathvariant decides upright, italic, bold and alphabet variants; Word models the same choices. */
function runStyle(element: Element, tag: string): {style?: MathRunStyle; script?: MathRunScript} {
  const variant = element.getAttribute('mathvariant');
  if (variant) {
    const style = RUN_STYLES[variant];
    if (style) return {style};
    const script = RUN_SCRIPTS[variant];
    if (script) return {script};
    return {};
  }
  if (tag === 'mtext' || tag === 'ms') return {style: 'plain'};
  // A multi-character identifier is upright by MathML rules; a single character stays italic.
  const text = element.textContent ?? '';
  return text.length > 1 ? {style: 'plain'} : {};
}
