import {afterEach,it,expect,vi} from 'vitest';
import {prepareMath} from '../../src/core/render/mathRender';
import {loadMathJaxAdapter} from '../../src/core/render/mathJaxAdapter';
import {renderDocument} from '../../src/core/render/documentRenderer';
import {parseMarkdownDocument} from '../../src/core/render/markdownHtml';
const flush=async()=>{for(let i=0;i<60;i++)await Promise.resolve()};
function runtime(){
 interface Input {name:string;compile:()=>void;macros:Set<string>;number:number}
 const baseline:Input={name:'TeX',compile:()=>{},macros:new Set(),number:0};
 const startup={promise:Promise.resolve(),input:[baseline],document:{convert:()=>{}},getInputJax:vi.fn(()=>[{name:'TeX',compile:()=>{},macros:new Set<string>(),number:0}]),getDocument:vi.fn(()=>({convert:()=>{}})),makeMethods:vi.fn()};
 const convert=vi.fn(async(value:string)=>{const input=startup.input[0];if(!input)throw new Error('No input');if(value.startsWith('define:'))input.macros.add(value.slice(7));if(value.startsWith('use:')&&!input.macros.has(value.slice(4)))throw new Error('Undefined macro');if(value==='number')return '<math><mn>'+ ++input.number+'</mn></math>';return '<math><mi>'+value+'</mi></math>'});
 const engine={startup,tex2mmlPromise:convert,tex2svgPromise:vi.fn()};window.MathJax=engine;return {engine,baseline,convert,startup};
}
afterEach(()=>{delete window.MathJax;vi.useRealTimers()});
it('keeps macro definitions and equation numbers in their own interleaved preparation',async()=>{
 const s=runtime();const a=prepareMath([{value:'define:A',display:false},{value:'use:A',display:false},{value:'number',display:true},{value:'number',display:true}],'mathml',{priority:'background'});
 const b=prepareMath([{value:'define:B',display:false},{value:'use:B',display:false},{value:'number',display:true}],'mathml',{priority:'foreground'});
 const [first,second]=await Promise.all([a,b]);first('define:A',false);first('use:A',false);expect(first('number',true)).toContain('<mn>1');expect(first('number',true)).toContain('<mn>2');second('define:B',false);second('use:B',false);expect(second('number',true)).toContain('<mn>1');expect(s.startup.input[0]).toBe(s.baseline);
 await expect(prepareMath([{value:'use:A',display:false}],'mathml')).rejects.toThrow('Undefined macro');expect(s.startup.input[0]).toBe(s.baseline);
});
it('keeps duplicate formula occurrences distinct and parser output owned by each render',async()=>{
 const s=runtime();const preparedMath=await prepareMath([{value:'number',display:false},{value:'number',display:false}],'mathml');
 await prepareMath([{value:'other',display:false}],'mathml');const result=parseMarkdownDocument('$number$ and $number$',{preparedMath});const root=document.createElement('div');root.innerHTML=result.html;expect([...root.querySelectorAll('mn')].map(node=>node.textContent)).toEqual(['1','2']);expect(s.startup.input[0]).toBe(s.baseline);
 expect(()=>preparedMath('number',false)).toThrow('顺序');
});
it('does not publish partial output on failure and permits a fresh document afterward',async()=>{
 const s=runtime();await expect(prepareMath([{value:'define:A',display:false},{value:'use:missing',display:false}],'mathml')).rejects.toThrow('Undefined');expect(s.startup.input[0]).toBe(s.baseline);
 const next=await prepareMath([{value:'number',display:true}],'mathml');expect(next('number',true)).toContain('<mn>1');
});
it('retains the shared engine until a cancelled conversion settles, then runs the next document',async()=>{
 const s=runtime(),abort=new AbortController();let finish=()=>{};
 s.convert.mockImplementationOnce(()=>new Promise<string>(resolve=>{finish=()=>resolve('<math><mi>x</mi></math>')}));
 let settled=false;const first=prepareMath([{value:'slow',display:false}],'mathml',{signal:abort.signal}).catch(error=>error).finally(()=>{settled=true});await flush();
 abort.abort();const next=prepareMath([{value:'number',display:true}],'mathml',{priority:'export'});await flush();expect(s.convert).toHaveBeenCalledTimes(1);expect(settled).toBe(false);
 finish();expect(String(await first)).toContain('cancelled');expect((await next)('number',true)).toContain('<mn>1');expect(s.startup.input[0]).toBe(s.baseline);
});
it('rejects released sessions and guards native engine access across adapter instances',async()=>{
 const s=runtime(),a=await loadMathJaxAdapter(s.engine),b=await loadMathJaxAdapter(s.engine);a.resetDocument();b.resetDocument();let finish=()=>{};
 s.convert.mockImplementationOnce(()=>new Promise<string>(resolve=>{finish=()=>resolve('<math><mi>x</mi></math>')}));const active=a.convert('x',false,'mathml');
 await expect(b.convert('y',false,'mathml')).rejects.toThrow('并发');expect(()=>b.releaseDocument()).toThrow('未结束');finish();await active;a.releaseDocument();b.releaseDocument();await expect(a.convert('x',false,'mathml')).rejects.toThrow('初始化');
});
it('skips cancelled pending documents and leaves missing-engine failures recoverable',async()=>{
 const abort=new AbortController();abort.abort();await expect(prepareMath([{value:'x',display:false}],'mathml',{signal:abort.signal})).rejects.toThrow('cancelled');
 await expect(prepareMath([{value:'x',display:false}],'mathml')).rejects.toThrow('MathJax');runtime();const next=await prepareMath([{value:'number',display:true}],'mathml');expect(next('number',true)).toContain('<mn>1');
});

it('keeps native conversion ownership after timeout and recovers only after it settles',async()=>{
 vi.useFakeTimers();const s=runtime();let finish=()=>{},settled=false;
 s.convert.mockImplementationOnce(()=>new Promise<string>(resolve=>{finish=()=>resolve('<math><mi>x</mi></math>')}));
 const first=prepareMath([{value:'slow',display:false}],'mathml').catch(error=>error).finally(()=>{settled=true});await flush();
 await vi.advanceTimersByTimeAsync(20001);const next=prepareMath([{value:'number',display:true}],'mathml');await flush();expect(settled).toBe(false);expect(s.convert).toHaveBeenCalledTimes(1);
 finish();expect(String(await first)).toContain('timed out');expect((await next)('number',true)).toContain('<mn>1');expect(s.startup.input[0]).toBe(s.baseline);expect(vi.getTimerCount()).toBe(0);
});

it('maps formula occurrences by source offset when footnotes change output order',async()=>{
 runtime();const source='Main $a$[^note].\n\n[^note]: Foot $b$.\n\nTail $c$.';
 const rendered=await renderDocument(source,'mathml');const root=document.createElement('div');root.innerHTML=rendered.html;
 expect([...root.querySelectorAll('math mi')].map(node=>node.textContent)).toEqual(['a','c','b']);
});

it('preserves original formula offsets with a BOM, CJK, emoji and CRLF',async()=>{
 runtime();const rendered=await renderDocument('\ufeff# 中文🧪\r\n\r\n$a$ and $b$','mathml');const root=document.createElement('div');root.innerHTML=rendered.html;expect([...root.querySelectorAll('math mi')].map(node=>node.textContent)).toEqual(['a','b']);
});
