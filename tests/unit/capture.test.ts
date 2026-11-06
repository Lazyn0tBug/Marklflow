import {it,expect,vi,afterEach} from 'vitest';
import {ErrorCapture,describeError} from '../../src/application/capture';
import type {ProblemReport} from '../../src/application/messages';

/**
 * The capture policy: one report per problem, the raw text never leaves the console side, and a
 * failing channel never takes the application down with it.
 */

/** 一个假的端口：把报告收进数组 ✓。 */
function fakePort(){
 const reports:ProblemReport[]=[];
 const report=vi.fn(async(report:ProblemReport)=>{reports.push(report)});
 return {reports,port:async()=>({report})};
}

afterEach(()=>{vi.useRealTimers();});

it('reports an uncaught error with its category and its raw text', async()=>{
 const {reports,port}=fakePort();
 const capture=new ErrorCapture(port);
 const error=new Error('页面里的错误');
 expect(await capture.report('unhandled',error,'app.js:1')).toBe(true);
 expect(reports).toHaveLength(1);
 expect(reports[0]?.category).toBe('unhandled');
 expect(reports[0]?.detail).toContain('页面里的错误');
 // 原始异常本身也带着 ⇒ 控制台能打出可点的栈 ✓。
 expect(reports[0]?.cause).toBe(error);
});

it('reports the same problem only once', async()=>{
 // 一个渲染循环 ⇒ 很多错误对象 ⇒ 只报一条 ✓（P-3 ✓）。
 const {reports,port}=fakePort();
 const capture=new ErrorCapture(port);
 for(let index=0;index<5;index++){
  expect(await capture.report('render',new Error('渲染崩了'),'at Editor (Editor.tsx:1:1)')).toBe(index===0);
 }
 expect(reports).toHaveLength(1);
});

it('reports a different problem at the same category', async()=>{
 // 同一个类别、不同的抛出点 ⇒ 各报各的 ✓ ⇒ ⇒ 一次崩两处不会只看见一处 ✓。
 const {reports,port}=fakePort();
 const capture=new ErrorCapture(port);
 await capture.report('render',new Error('崩了'),'at Editor (Editor.tsx:1:1)');
 await capture.report('render',new Error('崩了'),'at Preview (Preview.tsx:2:1)');
 expect(reports).toHaveLength(2);
});

it('reports the same error object only once', async()=>{
 // 一个逃出 React 树的错误会同时触发根选项与 window.onerror ⇒ 只报一次 ✓。
 const {reports,port}=fakePort();
 const capture=new ErrorCapture(port);
 const error=new Error('逃出去了');
 expect(await capture.report('render',error,'at App (App.tsx:1:1)')).toBe(true);
 expect(await capture.report('unhandled',error,'app.js:1')).toBe(false);
 expect(reports).toHaveLength(1);
});

it('keeps the rate limit on the application side', async()=>{
 // 应用侧先限 ⇒ 不浪费基座的额度 ✓（基座再限一层 ✓）。
 vi.useFakeTimers();
 const {reports,port}=fakePort();
 const capture=new ErrorCapture(port,{maxPerSecond:2});
 await capture.report('unhandled',new Error('一'),'a.js:1');
 await capture.report('unhandled',new Error('二'),'a.js:2');
 expect(await capture.report('unhandled',new Error('三'),'a.js:3')).toBe(false);
 expect(reports).toHaveLength(2);
 // 下一个窗口重新放开 ✓。
 vi.advanceTimersByTime(1000);
 expect(await capture.report('unhandled',new Error('四'),'a.js:4')).toBe(true);
 expect(reports).toHaveLength(3);
});

it('does not take the application down when the channel fails', async()=>{
 // 报告通道自己失败 ⇒ 应用不因此崩 ⇒ 也不递归报告自己 ✓（P-4 ✓）。
 const failing=vi.fn(async()=>{throw new Error('通道挂了')});
 const capture=new ErrorCapture(async()=>({report:failing}));
 expect(await capture.report('unhandled',new Error('页面里的错误'),'app.js:1')).toBe(true);
 // 再报一次也不炸 ✓。
 expect(await capture.report('unhandled',new Error('又一个'),'app.js:2')).toBe(true);
 expect(failing).toHaveBeenCalledTimes(2);
});

it('resolves the port only once', async()=>{
 const resolve=vi.fn(async()=>({report:async()=>{}}));
 const capture=new ErrorCapture(resolve);
 await capture.report('unhandled',new Error('一'),'a.js:1');
 await capture.report('unhandled',new Error('二'),'a.js:2');
 expect(resolve).toHaveBeenCalledOnce();
});

it('describes the raw text of anything it is handed',()=>{
 expect(describeError(new Error('坏了'))).toContain('坏了');
 expect(describeError('一句话')).toBe('一句话');
 expect(describeError({code:'x'})).toContain('x');
});
