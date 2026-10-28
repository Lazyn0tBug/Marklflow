import {afterEach,expect,it,vi} from 'vitest';
import {convertMathMLToDocxMath,convertMathMLChildren} from '../../src/core/export/mathmlToOoml';
import {exportDocumentToDocx} from '../../src/core/export/docxExporter';
import {createNewDocument} from '../../src/core/storage/storage';
import {clearMathCaches} from '../../src/core/render/mathRender';
import {MathFraction,MathSuperScript,MathSubScript,MathRadical,MathSum,MathIntegral,Packer,Paragraph,Document as WordDocument} from 'docx';

afterEach(()=>{
 vi.restoreAllMocks();
 delete (window as {MathJax?: unknown}).MathJax;
 clearMathCaches();
});

function parseXml(xml:string):Element{
 const parser=new DOMParser();
 const doc=parser.parseFromString(xml,'text/xml');
 const errorNode=doc.querySelector('parsererror');
 if(errorNode)throw new Error('XML 解析错误: '+errorNode.textContent);
 return doc.documentElement;
}

it('converts MathML identifiers, numbers, and operators into Word Math runs',()=>{
 const mathEl=parseXml('<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>x</mi><mo>+</mo><mn>1</mn></math>');
 const docxMath=convertMathMLToDocxMath(mathEl);
 expect(docxMath).toBeDefined();
});

it('converts MathML fractions into MathFraction OOML objects',()=>{
 const mathEl=parseXml('<math xmlns="http://www.w3.org/1998/Math/MathML"><mfrac><mi>a</mi><mi>b</mi></mfrac></math>');
 const children=convertMathMLChildren(mathEl);
 expect(children.length).toBe(1);
 expect(children[0]).toBeInstanceOf(MathFraction);
});

it('converts MathML superscript and subscript into corresponding OOML objects',()=>{
 const supEl=parseXml('<math xmlns="http://www.w3.org/1998/Math/MathML"><msup><mi>x</mi><mn>2</mn></msup></math>');
 const supChildren=convertMathMLChildren(supEl);
 expect(supChildren[0]).toBeInstanceOf(MathSuperScript);

 const subEl=parseXml('<math xmlns="http://www.w3.org/1998/Math/MathML"><msub><mi>x</mi><mi>i</mi></msub></math>');
 const subChildren=convertMathMLChildren(subEl);
 expect(subChildren[0]).toBeInstanceOf(MathSubScript);
});

it('converts MathML square roots and roots into MathRadical OOML objects',()=>{
 const sqrtEl=parseXml('<math xmlns="http://www.w3.org/1998/Math/MathML"><msqrt><mi>x</mi></msqrt></math>');
 const sqrtChildren=convertMathMLChildren(sqrtEl);
 expect(sqrtChildren[0]).toBeInstanceOf(MathRadical);
});

it('converts MathML summation and integral operators into MathSum and MathIntegral',()=>{
 const sumEl=parseXml('<math xmlns="http://www.w3.org/1998/Math/MathML"><munderover><mo>∑</mo><mrow><mi>i</mi><mo>=</mo><mn>1</mn></mrow><mi>n</mi></munderover></math>');
 const sumChildren=convertMathMLChildren(sumEl);
 expect(sumChildren[0]).toBeInstanceOf(MathSum);

 const intEl=parseXml('<math xmlns="http://www.w3.org/1998/Math/MathML"><munderover><mo>∫</mo><mn>0</mn><mn>1</mn></munderover></math>');
 const intChildren=convertMathMLChildren(intEl);
 expect(intChildren[0]).toBeInstanceOf(MathIntegral);
});

it('generates valid docx document buffer with OOML math elements',async()=>{
 const mathEl=parseXml('<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>E</mi><mo>=</mo><mi>m</mi><msup><mi>c</mi><mn>2</mn></msup></math>');
 const docxMath=convertMathMLToDocxMath(mathEl);
 const doc=new WordDocument({
  sections:[{children:[new Paragraph({children:[docxMath]})]}],
 });
 const buf=await Packer.toBuffer(doc);
 expect(buf.byteLength).toBeGreaterThan(0);
});

it('exports markdown documents with formulas into native Word DOCX successfully',async()=>{
 const getInputJax=vi.fn(()=>[{name:'TeX',compile:()=>{}}]),getDocument=vi.fn(()=>({convert:()=>{}})),makeMethods=vi.fn();
 (window as {MathJax?: unknown}).MathJax={
  startup:{promise:Promise.resolve(),getInputJax,getDocument,makeMethods},
  tex2mmlPromise:vi.fn(async(latex:string)=>`<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>${latex}</mi></math>`),
  tex2svgPromise:vi.fn(),
 };
 const doc=createNewDocument('公式文档');
 doc.markdown='# 物理学公式\n\n质能方程为 $E = mc^2$。\n\n$$\\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$\n';
 const blob=await exportDocumentToDocx(doc,{allowSourceFallback:true});
 expect(blob).toBeInstanceOf(Blob);
 expect(blob.size).toBeGreaterThan(1000);
});
