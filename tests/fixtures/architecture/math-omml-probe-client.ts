import {renderDocument,assertArtifact} from '../../../src/core/render/documentRenderer';
import {mathExpressions} from '../../../src/core/parse/markdown';
import {apiObject} from '../../../src/core/platform/externalApi';

/** Records the real MathJax 3.2.2 semantic serialization carried by the production artifact. */
interface CorpusCase {id:string;latex:string;display:boolean}
const corpus:CorpusCase[]=[
 {id:'run',latex:String.raw`x + 1`,display:false},
 {id:'identifier',latex:String.raw`\mathbb{R}`,display:false},
 {id:'fraction',latex:String.raw`\frac{a_1}{\sqrt{1+x^2}}`,display:false},
 {id:'nested-fraction',latex:String.raw`\frac{\frac{1}{2}}{3}`,display:true},
 {id:'scripts',latex:String.raw`x^{2}_{i}`,display:false},
 {id:'radical',latex:String.raw`\sqrt[3]{x}`,display:true},
 {id:'delimiter',latex:String.raw`\left(\frac{a}{b}\right)`,display:false},
 {id:'sum',latex:String.raw`\sum_{k=0}^{n} x^k`,display:true},
 {id:'integral',latex:String.raw`\int_0^1 f(x)\,dx`,display:true},
 {id:'limit',latex:String.raw`\lim_{x\to 0} f(x)`,display:true},
 {id:'accent',latex:String.raw`\vec{v}`,display:false},
 {id:'matrix',latex:String.raw`\begin{pmatrix}1&2\\3&4\end{pmatrix}`,display:true},
 {id:'cases',latex:String.raw`\begin{cases}1&x>0\\0&x\le 0\end{cases}`,display:true},
 {id:'aligned',latex:String.raw`\begin{aligned}f(x)&=x\\g(x)&=x^2\end{aligned}`,display:true},
 {id:'text-mixed',latex:String.raw`\text{当 } x > 0`,display:false},
];
const source=corpus.map(item=>item.display?'$$\n'+item.latex+'\n$$':'$'+item.latex+'$').join('\n\n');
const output=document.querySelector('[data-state]');
void(async()=>{let phase='start';try{
 phase='render';const rendered=await renderDocument(source,'svg',undefined,{priority:'export',retainMathML:true});
 phase='assert';assertArtifact(rendered);
 phase='dom';const root=document.createElement('div');root.innerHTML=rendered.html;
 phase='expressions';const expressions=mathExpressions(source,true);
 const byOffset=new Map(expressions.map(expression=>[expression.sourceOffset,expression] as const));
 const hosts=[...root.querySelectorAll('[data-mf-math-id]')];
 if(hosts.length!==corpus.length)throw new Error('Expected '+corpus.length+' formulas, got '+hosts.length);
 const records=hosts.map((host,index)=>{
  const item=corpus[index];
  if(!item)throw new Error('Missing corpus entry');
  const hostId=host.getAttribute('data-mf-math-id')||'';
  const expression=byOffset.get(Number(hostId.replace('math-','')));
  const math=host.querySelector('.mf-math-semantics > math');
  const strayText=math?Array.from(math.childNodes).some(node=>node.nodeType===Node.TEXT_NODE&&!!node.textContent?.trim()):false;
  return {
   id:item.id,latex:expression?.value??'',display:host.localName==='div',
   hostId,line:host.getAttribute('data-line')??'',hostTag:host.localName,
   tex:host.getAttribute('data-mf-tex')??'',
   mathml:math?.outerHTML??'',
   tags:math?[...new Set([...math.querySelectorAll('*')].map(node=>node.localName))].sort():[],
   hasSemantics:!!math?.querySelector('semantics'),
   hasAnnotation:!!math?.querySelector('annotation'),
   strayText,
  };
 });
 const engine=apiObject(window.MathJax,'MathJax');
 if(!output)throw new Error('No report');output.textContent=JSON.stringify({records,version:String(engine.version??'')});output.setAttribute('data-state','ready');
 }catch(error){if(output){output.textContent='['+phase+'] '+String(error)+(error instanceof Error?'\n'+error.stack:'');output.setAttribute('data-state','error')}}})();
