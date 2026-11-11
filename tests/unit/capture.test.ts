import {it, expect, vi, afterEach} from 'vitest';
import {ErrorCapture, describeError} from '../../src/application/capture';
import {hereSource, rejectionSource} from '../../src/core/platform/web/capture';
import {isOurBuildUrl, setOurMatcher} from '../../src/core/platform/callsite';
import type {ProblemReport} from '../../src/application/messages';

/**
 * The capture policy: one report per problem, the raw text never leaves the console side, and a
 * failing channel never takes the application down with it.
 */

/** 一个假的出口 ✓：把报告收进数组 ✓。 */
function fakeSink() {
  const reports: ProblemReport[] = [];
  const sink = vi.fn(async (report: ProblemReport) => {
    reports.push(report);
  });
  return {reports, sink};
}

afterEach(() => {
  vi.useRealTimers();
});

it('reports an uncaught error with its category and its raw text', async () => {
  const {reports, sink} = fakeSink();
  const capture = new ErrorCapture(sink);
  const error = new Error('页面里的错误');
  expect(await capture.report('unhandled', error, 'app.js:1')).toBe(true);
  expect(reports).toHaveLength(1);
  expect(reports[0]?.category).toBe('unhandled');
  expect(reports[0]?.detail).toContain('页面里的错误');
  // 原始异常本身也带着 ⇒ 控制台能打出可点的栈 ✓。
  expect(reports[0]?.cause).toBe(error);
});

it('reports the same problem only once', async () => {
  // 一个渲染循环 ⇒ 很多错误对象 ⇒ 只报一条 ✓（P-3 ✓）。
  const {reports, sink} = fakeSink();
  const capture = new ErrorCapture(sink);
  for (let index = 0; index < 5; index++) {
    expect(
      await capture.report('render', new Error('渲染崩了'), 'at Editor (Editor.tsx:1:1)'),
    ).toBe(index === 0);
  }
  expect(reports).toHaveLength(1);
});

it('reports a different problem at the same category', async () => {
  // 同一个类别、不同的抛出点 ⇒ 各报各的 ✓ ⇒ ⇒ 一次崩两处不会只看见一处 ✓。
  const {reports, sink} = fakeSink();
  const capture = new ErrorCapture(sink);
  await capture.report('render', new Error('崩了'), 'at Editor (Editor.tsx:1:1)');
  await capture.report('render', new Error('崩了'), 'at Preview (Preview.tsx:2:1)');
  expect(reports).toHaveLength(2);
});

it('reports the same error object only once', async () => {
  // 一个逃出 React 树的错误会同时触发根选项与 window.onerror ⇒ 只报一次 ✓。
  const {reports, sink} = fakeSink();
  const capture = new ErrorCapture(sink);
  const error = new Error('逃出去了');
  expect(await capture.report('render', error, 'at App (App.tsx:1:1)')).toBe(true);
  expect(await capture.report('unhandled', error, 'app.js:1')).toBe(false);
  expect(reports).toHaveLength(1);
});

it('keeps the rate limit on the application side', async () => {
  // 应用侧先限 ⇒ 不浪费基座的额度 ✓（基座再限一层 ✓）。
  vi.useFakeTimers();
  const {reports, sink} = fakeSink();
  const capture = new ErrorCapture(sink, {maxPerSecond: 2});
  await capture.report('unhandled', new Error('一'), 'a.js:1');
  await capture.report('unhandled', new Error('二'), 'a.js:2');
  expect(await capture.report('unhandled', new Error('三'), 'a.js:3')).toBe(false);
  expect(reports).toHaveLength(2);
  // 下一个窗口重新放开 ✓。
  vi.advanceTimersByTime(1000);
  expect(await capture.report('unhandled', new Error('四'), 'a.js:4')).toBe(true);
  expect(reports).toHaveLength(3);
});

it('does not take the application down when the channel fails', async () => {
  // 报告通道自己失败 ⇒ 应用不因此崩 ⇒ 也不递归报告自己 ✓（P-4 ✓）。
  const failing = vi.fn(async () => {
    throw new Error('通道挂了');
  });
  const capture = new ErrorCapture(failing);
  expect(await capture.report('unhandled', new Error('页面里的错误'), 'app.js:1')).toBe(true);
  // 再报一次也不炸 ✓。
  expect(await capture.report('unhandled', new Error('又一个'), 'app.js:2')).toBe(true);
  expect(failing).toHaveBeenCalledTimes(2);
});

it('describes the raw text of anything it is handed', () => {
  expect(describeError(new Error('坏了'))).toContain('坏了');
  expect(describeError('一句话')).toBe('一句话');
  expect(describeError({code: 'x'})).toContain('x');
});

it('the rejection source points at the place and keeps the message out', () => {
  const error = new TypeError('Cannot read properties of undefined');
  error.stack =
    'TypeError: Cannot read properties of undefined\n    at saveTo (http://tauri.localhost/assets/index.js:1204:17)\n    at run (http://tauri.localhost/assets/index.js:900:5)';
  const source = rejectionSource(error);
  // **指出是哪儿** ✓ ⇒ ⇒ **日志因此能定位** ✓ ⇒ ⇒ 不必再开控制台找那一行 ✓。
  expect(source).toContain('TypeError');
  expect(source).toContain('index.js:1204');
  // **不含空格** ✓ ⇒ ⇒ 日志里那一条始终是一行 ✓。
  expect(source).not.toContain(' ');
  // **原始 message 不在里面** ✓ ⇒ ⇒ **日志里不落用户数据** ✓（基座 §5.2 ✓）。
  expect(source).not.toContain('Cannot read properties');
  // **同一个抛出点每次都一样** ✓ ⇒ ⇒ 循环收敛成一条 ✓。
  expect(rejectionSource(error)).toBe(source);
});

it('the rejection source leaves a user path out and still finds our own frame', () => {
  const error = new TypeError('Cannot read properties of undefined');
  error.stack =
    'TypeError: Cannot read properties of undefined\n    at read (file:///C:/Users/someone/notes.md:12:5)\n    at saveTo (http://tauri.localhost/assets/index.js:1204:17)';
  const source = rejectionSource(error);
  // **用户路径不进定位串** ✓ ⇒ ⇒ 日志里不落用户数据 ✓（基座 §5.2 ✓）。
  // **这不是假设，是约束** ✓ ⇒ ⇒ 别的来源的帧一律不取 ✓。
  expect(source).not.toContain('notes.md');
  expect(source).not.toContain('Users');
  // **它仍然指出我们自己的代码** ✓ ⇒ ⇒ 定位串没白算 ✓。
  expect(source).toContain('index.js:1204');
});

it('the rejection source says only the kind when no frame of ours is there', () => {
  const error = new TypeError('boom');
  error.stack = 'TypeError: boom\n    at read (file:///C:/Users/someone/notes.md:12:5)';
  // **没有我们的帧就只说种类** ✓ ⇒ ⇒ 不拿用户路径凑数 ✓ ⇒ ⇒ 日志仍然说得清是哪种错 ✓。
  expect(rejectionSource(error)).toBe('TypeError@no-frame');
});

it('the rejection source says what kind of value was rejected', () => {
  // **原生命令失败拒绝的是字符串** ✓ ⇒ ⇒ 与"栈不可用"分得开 ✓ ⇒ ⇒
  // 看日志就知道问题在哪一侧 ✓ ⇒ ⇒ 不用再猜 ✓。
  expect(rejectionSource('command not allowed')).toBe('rejection:string');
  expect(rejectionSource(undefined)).toBe('rejection:undefined');
  expect(rejectionSource(null)).toBe('rejection:null');
  expect(rejectionSource({code: 7})).toBe('rejection:object');
  // **内容一个字都不带** ✓ ⇒ ⇒ 不落用户数据 ✓。
  expect(rejectionSource('/Users/someone/notes.md')).not.toContain('notes.md');
});

it('hereSource points at the caller, not at the capture itself', () => {
  setOurMatcher((file) => file.includes('/src/') || file.includes('/tests/'));
  try {
    const source = hereSource();
    // **落在调用它的那一处** ✓ ⇒ ⇒ 定位说的是"哪儿出问题" ✓ ⇒ ⇒ 不是"哪儿捕获" ✓。
    expect(source).toContain('capture.test.ts');
    expect(source).not.toContain('platform/web/capture.ts');
  } finally {
    setOurMatcher(isOurBuildUrl);
  }
});
