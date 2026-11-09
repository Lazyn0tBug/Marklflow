import {test as base, expect, type Page, type TestInfo} from '@playwright/test';

/** 这一轮用例额外拿到的东西：页面抛出的未捕获错误。 */
export interface MessageFixtures {
  /** 页面抛出的未捕获错误（按发生顺序）。 */
  pageErrors: string[];
  /** 控制台里的错误输出 ✓（失败时能对上根因 ✓）。 */
  consoleErrors: string[];
}

/**
 * 记录弹窗 ✓：**不弹**是目标 ✓ ⇒ ⇒ 于是要能断言"一个都没弹" ✓。
 *
 * 弹窗一律**自动收掉** ✓ ⇒ ⇒ 弹窗不会把流程卡住 ✓ ⇒ ⇒ 用例的其余断言照常跑 ✓。
 */
export function recordDialogs(page: Page): string[] {
  const messages: string[] = [];
  page.on('dialog', (dialog) => {
    messages.push(dialog.message());
    void dialog.accept();
  });
  return messages;
}

/**
 * 全套端到端共用的 `test`：**每个用例都带着页面错误的记录**。
 *
 * 页面抛出未捕获错误时（缺一个 import、一个 TypeError、一个渲染期崩溃），
 * 浏览器会把它交给 `pageerror` ⇒ 这里把它**记进测试输出与归档** ⇒ ⇒
 * 失败时直接指到根因，而不是只剩"等不到某个元素"的派生症状 ✓。
 *
 * **不因为页面有错就判失败** ✓：Playwright 默认就不判（实测 ✓）⇒ 这里也不加 ⇒ ⇒
 * 有若干用例**故意**触发错误（来源拒绝、诊断、坏图）⇒ 失败与否由用例自己的断言判定 ✓。
 *
 * 与应用侧的关系：应用消费的是**同一个事件源**（浏览器的 `pageerror`）⇒
 * 这是同一个信号的两个消费者，不是两套机制 ✓（见设计 §5 测试侧）。
 */
export const test = base.extend<MessageFixtures>({
  pageErrors: async ({}, use, testInfo: TestInfo) => {
    const errors: string[] = [];
    await use(errors);
    if (errors.length) {
      const text = errors.join('\n---\n');
      console.log('[pageerror]\n' + text);
      await testInfo.attach('page-errors', {body: text, contentType: 'text/plain'});
    }
  },
  consoleErrors: async ({}, use) => {
    const errors: string[] = [];
    await use(errors);
  },
  page: async ({page, pageErrors, consoleErrors}, use) => {
    page.on('pageerror', (error) => pageErrors.push(String(error?.stack ?? error)));
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    await use(page);
  },
});

export {expect};
export type {Page, TestInfo};
