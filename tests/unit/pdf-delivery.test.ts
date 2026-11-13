import {it, expect, vi, afterEach} from 'vitest';
import {
  deliverPdfHtml,
  FRAME_RELEASE_DELAY,
  printFrameStyle,
  scheduleFrameRelease,
} from '../../src/core/platform/web/pdfDelivery';

const flush = async (count = 40) => {
  for (let i = 0; i < count; i++) await Promise.resolve();
};
interface FakeWindow {
  focus: ReturnType<typeof vi.fn>;
  print: ReturnType<typeof vi.fn>;
  fire: (type: string) => void;
}
function fakeWindow(): {
  window: FakeWindow;
  document: {defaultView: unknown; fonts: undefined; querySelectorAll: () => never[]};
} {
  const listeners = new Map<string, (() => void)[]>();
  const window: FakeWindow = {
    focus: vi.fn(),
    print: vi.fn(),
    fire: (type: string) => {
      for (const listener of listeners.get(type) || []) listener();
    },
  };
  const host = Object.assign(window, {
    addEventListener: (type: string, listener: () => void) => {
      const list = listeners.get(type) || [];
      list.push(listener);
      listeners.set(type, list);
    },
    removeEventListener: vi.fn(),
    requestAnimationFrame: (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    },
    cancelAnimationFrame: vi.fn(),
  });
  return {window, document: {defaultView: host, fonts: undefined, querySelectorAll: () => []}};
}
/** Drives one real delivery: the host is a real iframe, only its browsing context is replaced. */
async function deliver() {
  const pending = deliverPdfHtml('<!doctype html><html><body>paged</body></html>', undefined);
  const frame = document.querySelector('iframe');
  if (!frame) throw new Error('print host was not created');
  const stub = fakeWindow();
  Object.defineProperty(frame, 'contentWindow', {get: () => stub.window, configurable: true});
  Object.defineProperty(frame, 'contentDocument', {get: () => stub.document, configurable: true});
  frame.onload?.(new Event('load'));
  await flush();
  await pending;
  return {frame, host: stub.window};
}
afterEach(() => {
  vi.useRealTimers();
  document.querySelectorAll('iframe').forEach((frame) => frame.remove());
});

it('keeps the print host alive long enough for the spooler to flush', () => {
  expect(FRAME_RELEASE_DELAY).toBeGreaterThan(0);
});

it('keeps the print host inside the viewport so the browser can render it', () => {
  // A host parked outside the viewport is never rendered, and printing it yields an empty first print.
  const style = printFrameStyle();
  expect(style).toContain('left:0');
  expect(style).toContain('top:0');
  expect(style).not.toMatch(/left:-/);
  expect(style).not.toMatch(/top:-/);
  expect(style).toContain('opacity:0');
  expect(style).toContain('pointer-events:none');
  // 打印宿主按**文档的纸张尺寸** ✓（设计 §7 ✓）。
  expect(style).toContain('width:794px');
  expect(style).toContain('height:1123px');
  expect(printFrameStyle('A3')).toContain('width:1123px');
  expect(printFrameStyle('B5')).toContain('height:945px');
});

it('prints only after the frozen document is ready', async () => {
  const {host} = await deliver();
  expect(host.print).toHaveBeenCalledOnce();
});

it('keeps the print host for the spooler and releases it afterwards', async () => {
  vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout']});
  const {frame, host} = await deliver();
  expect(document.body.contains(frame)).toBe(true);
  host.fire('afterprint');
  expect(document.body.contains(frame)).toBe(true);
  vi.advanceTimersByTime(FRAME_RELEASE_DELAY);
  expect(document.body.contains(frame)).toBe(false);
});

it('releases the print host immediately when the page goes away', async () => {
  const {frame} = await deliver();
  expect(document.body.contains(frame)).toBe(true);
  window.dispatchEvent(new Event('pagehide'));
  expect(document.body.contains(frame)).toBe(false);
});

it('never removes a print host before the release delay elapsed', async () => {
  vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout']});
  const frame = document.createElement('iframe');
  document.body.append(frame);
  scheduleFrameRelease(frame);
  expect(document.body.contains(frame)).toBe(true);
  vi.advanceTimersByTime(FRAME_RELEASE_DELAY - 1);
  expect(document.body.contains(frame)).toBe(true);
  vi.advanceTimersByTime(1);
  expect(document.body.contains(frame)).toBe(false);
});
