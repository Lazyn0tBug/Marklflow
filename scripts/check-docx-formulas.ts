import {readFile} from 'node:fs/promises';
import JSZip from 'jszip';

/**
 * Reports how a .docx carries its formulas: the ones that became native Word math and the ones
 * that degraded to an image carrying their LaTeX source. The report is the expected answer for
 * the manual check in Word and WPS.
 */
export interface NativeFormula {
  text: string;
  structure: string[];
}
export interface FormulaReport {
  native: NativeFormula[];
  formulaImages: string[];
  otherImages: number;
}

const NATIVE_TAGS = [
  'm:f',
  'm:num',
  'm:den',
  'm:rad',
  'm:sSub',
  'm:sSup',
  'm:sSubSup',
  'm:d',
  'm:e',
  'm:r',
] as const;

/** The alt text carries XML entities; the reader wants the LaTeX as written. */
export function unescapeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/** The text a native formula shows, and the structural elements it uses. */
export function reportNativeFormula(xml: string): NativeFormula {
  const text = [...xml.matchAll(/<m:t[^>]*>([\s\S]*?)<\/m:t>/g)]
    .map((match) => match[1] ?? '')
    .join('');
  const structure = NATIVE_TAGS.filter((tag) => xml.includes('<' + tag));
  return {text, structure};
}

/** The alt text of the images the exporter marked as formulas, and how many other images there are. */
export function reportFormulaImages(xml: string): {formulaImages: string[]; otherImages: number} {
  const formulaImages: string[] = [];
  let otherImages = 0;
  for (const match of xml.matchAll(/<wp:docPr\b([^>]*)\/?>/g)) {
    const attributes = match[1] ?? '',
      name = /\bname="([^"]*)"/.exec(attributes)?.[1] ?? '',
      descr = /\bdescr="([^"]*)"/.exec(attributes)?.[1] ?? '';
    if (name === '公式') formulaImages.push(unescapeXml(descr));
    else otherImages++;
  }
  return {formulaImages, otherImages};
}

/** Parse the document part of an unpacked .docx. */
export function reportDocxFormulas(documentXml: string): FormulaReport {
  const native: string[] = [];
  for (const match of documentXml.matchAll(/<m:oMath[ >][\s\S]*?<\/m:oMath>/g))
    native.push(match[0]);
  const images = reportFormulaImages(documentXml);
  return {native: native.map(reportNativeFormula), ...images};
}

export async function checkDocxFormulas(path: string): Promise<FormulaReport> {
  const zip = await JSZip.loadAsync(await readFile(path));
  const document = zip.file('word/document.xml');
  if (!document) throw new Error('word/document.xml is missing: ' + path);
  return reportDocxFormulas(await document.async('string'));
}

if (process.argv[1]?.endsWith('check-docx-formulas.ts')) {
  const path = process.argv[2];
  if (!path) {
    console.error('usage: bun scripts/check-docx-formulas.ts <file.docx>');
    process.exitCode = 1;
  } else {
    const report = await checkDocxFormulas(path);
    console.log('原生公式（Word 可编辑）:', report.native.length);
    report.native.forEach((formula, index) =>
      console.log(
        '  ' +
          (index + 1) +
          '. 文本=' +
          JSON.stringify(formula.text) +
          ' 结构=' +
          formula.structure.join(','),
      ),
    );
    console.log('降级公式图片（替代文本带源 LaTeX）:', report.formulaImages.length);
    report.formulaImages.forEach((alt, index) => console.log('  ' + (index + 1) + '. ' + alt));
    console.log('其他图片:', report.otherImages);
  }
}
