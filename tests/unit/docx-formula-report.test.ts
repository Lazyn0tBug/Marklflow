// @vitest-environment node
import {it, expect} from 'vitest';
import {resolve} from 'node:path';
import {
  reportNativeFormula,
  reportFormulaImages,
  reportDocxFormulas,
  checkDocxFormulas,
} from '../../scripts/check-docx-formulas';

/**
 * The formula report is the expected answer for the manual Word and WPS check, so its parsing has
 * to tell a native formula from a degraded image and read the LaTeX source back out of the image.
 */
const NATIVE =
  '<m:oMath><m:f><m:num><m:r><m:t>a+b</m:t></m:r></m:num><m:den><m:r><m:t>c</m:t></m:r></m:den></m:f></m:oMath>';
const PARAGRAPH_MATH =
  '<m:oMathPara><m:oMath><m:sSup><m:e><m:r><m:t>x</m:t></m:r></m:e><m:sup><m:r><m:t>2</m:t></m:r></m:sup></m:sSup></m:oMath></m:oMathPara>';
const FORMULA_IMAGE = '<wp:docPr id="1" name="公式" descr="\\sum_{i=1}^{n} i"/>';
const PLAIN_IMAGE = '<wp:docPr id="2" name="图片 2" descr="示例图片"/>';

it('reads the text and the structure of a native formula', () => {
  const formula = reportNativeFormula(NATIVE);
  expect(formula.text).toBe('a+bc');
  expect(formula.structure).toContain('m:f');
  expect(formula.structure).toContain('m:num');
  expect(formula.structure).toContain('m:den');
});

it('reads a native formula that sits in a paragraph level wrapper', () => {
  const formula = reportNativeFormula(PARAGRAPH_MATH);
  expect(formula.text).toBe('x2');
  expect(formula.structure).toContain('m:sSup');
});

it('separates formula images from other images and reads the LaTeX source', () => {
  const images = reportFormulaImages(FORMULA_IMAGE + PLAIN_IMAGE);
  expect(images.formulaImages).toEqual(['\\sum_{i=1}^{n} i']);
  expect(images.otherImages).toBe(1);
});

it('counts the native formulas and the degraded ones in one document', () => {
  const document =
    '<w:document>' + NATIVE + PARAGRAPH_MATH + FORMULA_IMAGE + PLAIN_IMAGE + '</w:document>';
  const report = reportDocxFormulas(document);
  expect(report.native).toHaveLength(2);
  expect(report.formulaImages).toHaveLength(1);
  expect(report.otherImages).toBe(1);
});

it('carries the acceptance sample with the expected native and degraded formulas', async () => {
  const report = await checkDocxFormulas(
    resolve(process.cwd(), 'tests/fixtures/acceptance/word-wps-formula-sample.docx'),
  );
  expect(report.native.map((formula) => formula.text)).toEqual([
    'E=mc2',
    'a+bc=x2',
    '3x+1',
    'xi2 yij zijk',
    '(a+b)2=c',
  ]);
  expect(report.native[1]!.structure).toEqual(
    expect.arrayContaining(['m:f', 'm:num', 'm:den', 'm:rad']),
  );
  expect(report.native[3]!.structure).toEqual(expect.arrayContaining(['m:sSub', 'm:sSubSup']));
  expect(report.formulaImages).toEqual([
    '\\sum_{i=1}^{n} i',
    '\\begin{matrix} a & b \\\\ c & d \\end{matrix}',
  ]);
});
