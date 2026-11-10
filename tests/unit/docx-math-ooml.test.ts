import {it, expect, vi} from 'vitest';
import JSZip from 'jszip';
import {Document as WordDocument, Packer, Paragraph} from 'docx';
vi.mock('../../src/core/export/documentPrint', async (original) => ({
  ...(await original<typeof import('../../src/core/export/documentPrint')>()),
  waitForLayout: vi.fn(async () => {}),
}));
import {planDocxFormula, docxFormulaSource} from '../../src/core/export/mathmlToOoml';
import {exportDocumentToDocx} from '../../src/core/export/docxExporter';
import {inspectDocx, DOCX_FORMULA_IMAGE_MESSAGE} from '../../src/core/export/outputCapabilities';
import {diagnosticArtifact, nativeFormulaArtifact} from './export-fixtures';
import corpus from '../fixtures/mathml-corpus.json' with {type: 'json'};

const MATHML = 'xmlns="http://www.w3.org/1998/Math/MathML"';
const escape = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** Mirrors the production host: the formula keeps its semantic MathML beside the visual layer, and its source beside both. */
function host(inner: string, options: {source?: string; visual?: boolean} = {}) {
  const root = document.createElement('div');
  root.innerHTML =
    '<div data-mf-math-id="math-0" data-line="1"' +
    (options.source ? ' data-mf-tex="' + escape(options.source) + '"' : '') +
    '>' +
    (options.visual === false
      ? ''
      : '<mjx-container><svg xmlns="http://www.w3.org/2000/svg"></svg></mjx-container>') +
    '<span class="mf-math-semantics" hidden><math ' +
    MATHML +
    '>' +
    inner +
    '</math></span></div>';
  return root.querySelector('[data-mf-math-id]')!;
}
async function omml(plan: ReturnType<typeof planDocxFormula>) {
  if (plan.kind !== 'native') throw new Error('Expected a native formula');
  const document = new WordDocument({
    sections: [{children: [new Paragraph({children: [plan.math]})]}],
  });
  const zip = await JSZip.loadAsync(Packer.toBuffer(document));
  return zip.file('word/document.xml')!.async('string');
}

it('converts identifiers, numbers and operators into native Word math', async () => {
  const plan = planDocxFormula(host('<mi>x</mi><mo>+</mo><mn>1</mn>'));
  expect(plan.kind).toBe('native');
  const xml = await omml(plan);
  expect(xml).toContain('<m:oMath>');
  expect(xml).toContain('<m:t>x</m:t>');
});

it('converts fractions into a numerator and denominator', async () => {
  const plan = planDocxFormula(host('<mfrac><mi>a</mi><mi>b</mi></mfrac>'));
  expect(plan.kind).toBe('native');
  const xml = await omml(plan);
  expect(xml).toContain('<m:f>');
  expect(xml).toContain('<m:num>');
  expect(xml).toContain('<m:den>');
});

it('converts superscripts, subscripts and radicals', async () => {
  const sup = planDocxFormula(host('<msup><mi>x</mi><mn>2</mn></msup>'));
  expect(sup.kind).toBe('native');
  expect(await omml(sup)).toContain('<m:sSup>');
  const sub = planDocxFormula(host('<msub><mi>x</mi><mi>i</mi></msub>'));
  expect(sub.kind).toBe('native');
  expect(await omml(sub)).toContain('<m:sSub>');
  const radical = planDocxFormula(host('<msqrt><mi>x</mi></msqrt>'));
  expect(radical.kind).toBe('native');
  expect(await omml(radical)).toContain('<m:rad>');
});

it('keeps the source beside the formula and out of the equation', async () => {
  const plan = planDocxFormula(host('<mi>E</mi>', {source: 'E = mc^2'}));
  expect(plan.kind).toBe('native');
  expect(await omml(plan)).not.toContain('mc^2');
  expect(docxFormulaSource(host('<mi>E</mi>', {source: 'E = mc^2'}))).toBe('E = mc^2');
});

it('falls back for structures that have no equivalent native form', async () => {
  const sum = planDocxFormula(
    host(
      '<munderover><mo>∑</mo><mrow><mi>i</mi><mo>=</mo><mn>1</mn></mrow><mi>n</mi></munderover>',
    ),
  );
  expect(sum.kind).toBe('fallback');
  expect(sum.kind === 'fallback' ? sum.reason : '').toContain('上下限');
  const matrix = planDocxFormula(host('<mtable><mtr><mtd><mn>1</mn></mtd></mtr></mtable>'));
  expect(matrix.kind).toBe('fallback');
  expect(matrix.kind === 'fallback' ? matrix.reason : '').toContain('矩阵');
  const accent = planDocxFormula(host('<mover accent="true"><mi>v</mi><mo>→</mo></mover>'));
  expect(accent.kind).toBe('fallback');
});

it('refuses a formula without semantic structure instead of guessing', () => {
  const plan = planDocxFormula(host('<mi>x</mi>', {visual: false}));
  expect(plan.kind).toBe('native');
  const empty = document.createElement('div');
  empty.innerHTML = '<div data-mf-math-id="math-1"><span>no math here</span></div>';
  expect(planDocxFormula(empty.querySelector('[data-mf-math-id]')!).kind).toBe('unsupported');
});

it('writes a convertible formula as native Word math without an image', async () => {
  const blob = await exportDocumentToDocx(nativeFormulaArtifact('公式 $x^2$'), {
    allowSourceFallback: true,
  });
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const xml = await zip.file('word/document.xml')!.async('string');
  expect(xml).toContain('<m:oMath>');
  expect(xml).not.toContain('<w:drawing>');
  expect(
    inspectDocx(nativeFormulaArtifact('公式 $x^2$')).some(
      (issue) => issue.message === DOCX_FORMULA_IMAGE_MESSAGE,
    ),
  ).toBe(false);
});

it('keeps a formula without an equivalent native structure as an image and reports its source', () => {
  const artifact = diagnosticArtifact('公式 $\\sum_{i=1}^{n} x_i$');
  const issues = inspectDocx(artifact);
  expect(
    issues.some(
      (issue) => issue.adaptation === 'static' && issue.message === DOCX_FORMULA_IMAGE_MESSAGE,
    ),
  ).toBe(true);
  expect(issues.some((issue) => issue.detail?.includes('\\sum'))).toBe(true);
});

/** The corpus is the real MathJax 3.2.2 semantic serialization captured by the browser probe. */
const corpusHost = (record: {mathml: string; tex: string}) => {
  const root = document.createElement('div');
  root.innerHTML =
    '<div data-mf-math-id="math-0" data-line="1" data-mf-tex="' +
    escape(record.tex) +
    '"><span class="mf-math-semantics" hidden>' +
    record.mathml +
    '</span></div>';
  return root.querySelector('[data-mf-math-id]')!;
};
it('classifies the real MathJax corpus into native formulas and image fallbacks', async () => {
  const expected: {id: string; kind: 'native' | 'fallback'}[] = [
    {id: 'run', kind: 'native'},
    {id: 'identifier', kind: 'native'},
    {id: 'fraction', kind: 'native'},
    {id: 'nested-fraction', kind: 'native'},
    {id: 'scripts', kind: 'native'},
    {id: 'radical', kind: 'native'},
    {id: 'delimiter', kind: 'native'},
    {id: 'sum', kind: 'fallback'},
    {id: 'integral', kind: 'native'},
    {id: 'limit', kind: 'fallback'},
    {id: 'accent', kind: 'fallback'},
    {id: 'matrix', kind: 'fallback'},
    {id: 'cases', kind: 'fallback'},
    {id: 'aligned', kind: 'fallback'},
    {id: 'text-mixed', kind: 'native'},
  ];
  expect(corpus.records.map((record) => record.id)).toEqual(expected.map((item) => item.id));
  for (const item of expected) {
    const record = corpus.records.find((candidate) => candidate.id === item.id)!;
    const plan = planDocxFormula(corpusHost(record));
    expect(plan.kind, item.id).toBe(item.kind);
    if (item.kind === 'fallback') {
      expect(plan.kind === 'fallback' ? plan.reason : '', item.id).not.toBe('');
      continue;
    }
    const xml = await omml(plan);
    expect(xml, item.id).toContain('<m:oMath>');
    expect(xml, item.id).toContain('<m:t>');
  }
});
it('keeps the source beside every real formula and out of its equation', async () => {
  for (const record of corpus.records) {
    const host = corpusHost(record);
    expect(docxFormulaSource(host), record.id).toBe(record.tex);
    const plan = planDocxFormula(host);
    if (plan.kind !== 'native') continue;
    expect(await omml(plan), record.id).not.toContain(record.tex);
  }
});
