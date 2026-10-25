import {afterEach,beforeEach,it,expect,vi} from 'vitest';
const native=vi.hoisted(()=>({initialize:vi.fn(),render:vi.fn<(id:string,code:string,host:Element)=>Promise<{svg:string}>>()}));
vi.mock('mermaid',()=>({default:native}));
import {renderMermaidDiagram} from '../../src/core/render/mermaidRender';
import {renderDotDiagram} from '../../src/core/render/diagramRender';
import {renderDocument} from '../../src/core/render/documentRenderer';
import {sharedDom} from '../../src/core/platform/web/sharedDom';
const flush=async()=>{for(let i=0;i<50;i++)await Promise.resolve()};
const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect fill="#aa1122" width="10" height="10"/></svg>';
beforeEach(()=>{native.initialize.mockReset();native.render.mockReset();native.render.mockResolvedValue({svg})});
afterEach(()=>{vi.useRealTimers();expect(document.querySelectorAll('[data-mermaid-host]')).toHaveLength(0);expect(sharedDom.snapshot()).toEqual({active:undefined,waiting:[],blocked:false})});
it('initializes and restores Mermaid configuration per step and removes its local host',async()=>{
 await Promise.all([renderMermaidDiagram('graph LR; A-->B'),renderMermaidDiagram('graph TD; C-->D')]);expect(native.initialize).toHaveBeenCalledTimes(4);expect(native.render).toHaveBeenCalledTimes(2);expect(native.render.mock.calls[0]?.[0]).not.toBe(native.render.mock.calls[1]?.[0]);
});
it('cleans a failed native render and permits a new document',async()=>{
 native.render.mockRejectedValueOnce(new Error('parse failure'));await expect(renderMermaidDiagram('bad')).rejects.toThrow('parse failure');expect(native.initialize).toHaveBeenCalledTimes(2);expect(await renderMermaidDiagram('good')).toContain('<svg');
});
it('removes generated CSS and executable SVG and rejects HTML labels',async()=>{
 native.render.mockResolvedValueOnce({svg:svg.replace('<rect','<style>rect{fill:red}</style><script>bad()</script><rect onclick="bad()"')});const result=await renderMermaidDiagram('good');expect(result).not.toContain('<style');expect(result).not.toContain('<script');expect(result).not.toContain('onclick');
 native.render.mockResolvedValueOnce({svg:'<svg><foreignObject><div>HTML</div></foreignObject></svg>'});await expect(renderMermaidDiagram('html')).rejects.toThrow('HTML labels');
});
it('keeps DOM ownership during cancellation until native rendering actually ends',async()=>{
 let finish=()=>{};native.render.mockImplementationOnce(()=>new Promise(resolve=>{finish=()=>resolve({svg})}));const abort=new AbortController();let done=false;
 const first=renderMermaidDiagram('slow',false,{signal:abort.signal}).catch(error=>String(error)).finally(()=>{done=true});await flush();abort.abort();let dotDone=false;const dot=renderDotDiagram('A -> B',{priority:'export'}).then(value=>{dotDone=true;return value});await flush();expect(done).toBe(false);expect(dotDone).toBe(false);expect(document.querySelectorAll('[data-mermaid-host]')).toHaveLength(1);
 finish();expect(await first).toContain('cancelled');expect(await dot).toContain('<svg');
});
it('shares priority boundaries between Mermaid and DOT without a second diagram queue',async()=>{
 let finish=()=>{};native.render.mockImplementationOnce(()=>new Promise(resolve=>{finish=()=>resolve({svg})}));const first=renderMermaidDiagram('active');await flush();const order:string[]=[];
 const background=renderMermaidDiagram('background',false,{priority:'background'}).then(()=>{order.push('background')});const foreground=renderMermaidDiagram('foreground').then(()=>{order.push('foreground')});const exported=renderDotDiagram('A -> B',{priority:'export'}).then(()=>{order.push('export')});finish();await Promise.all([first,background,foreground,exported]);expect(order).toEqual(['export','foreground','background']);
});
it('preserves mixed diagram source ranges, diagnostics and local SVG fragment scope',async()=>{
 const fence=String.fromCharCode(96).repeat(3);const source=['# 标题 🧪','',fence+'mermaid','graph LR; A-->B',fence,'',fence+'dot','A -> B',fence,'',fence+'graphviz','digraph {}',fence].join('\r\n');
 const result=await renderDocument(source,'mathml');const root=document.createElement('div');root.innerHTML=result.html;const figures=[...root.querySelectorAll('figure.mf-diagram')];expect(figures.map(el=>[el.getAttribute('data-line'),el.getAttribute('data-source-end')])).toEqual([['3','5'],['7','9'],['11','13']]);expect(root.querySelectorAll('svg')).toHaveLength(2);expect(result.html).not.toMatch(/data-(mermaid|dot)-code/);expect(result.diagnostics.some(item=>item.nodeId==='11'&&item.message.includes('DOT'))).toBe(true);
 const marker=root.querySelector('marker')?.id;expect(root.querySelector('path[marker-end]')?.getAttribute('marker-end')).toBe('url(#'+marker+')');
});
it('retains the native host after timeout until settlement, then cleans and recovers',async()=>{
 vi.useFakeTimers();let finish=()=>{};native.render.mockImplementationOnce(()=>new Promise(resolve=>{finish=()=>resolve({svg})}));let done=false;
 const result=renderMermaidDiagram('slow').catch(error=>String(error)).finally(()=>{done=true});await flush();await vi.advanceTimersByTimeAsync(20001);expect(done).toBe(false);expect(document.querySelectorAll('[data-mermaid-host]')).toHaveLength(1);finish();expect(await result).toContain('timed out');expect(await renderDotDiagram('A -> B')).toContain('<svg');expect(vi.getTimerCount()).toBe(0);
});

it('rejects incomplete Mermaid output and prevents author HTML from impersonating diagram placeholders',async()=>{
 native.render.mockResolvedValueOnce({svg:'<div>not SVG</div>'});await expect(renderMermaidDiagram('bad')).rejects.toThrow('SVG 输出结构');native.render.mockClear();
 const result=await renderDocument('<figure data-mermaid-code="bad" data-dot-code="A%20-%3E%20B">author</figure>','mathml');expect(native.render).not.toHaveBeenCalled();expect(result.html).not.toContain('data-dot-code');expect(result.html).not.toContain('data-mermaid-code');
});
it('escapes DOT color attributes before SVG construction and keeps sanitization active',async()=>{
 const code=`A [fillcolor='red" onload="bad()']\nA -> B [color='red" onclick="bad()']`;
 const html=await renderDotDiagram(code),root=document.createElement('div');root.innerHTML=html;expect(root.querySelectorAll('[onload],[onclick],script')).toHaveLength(0);expect(root.querySelectorAll('svg')).toHaveLength(1);
});
