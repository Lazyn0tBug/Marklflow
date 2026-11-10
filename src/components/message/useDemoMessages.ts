import {useEffect, useState} from 'react';
import {MESSAGE_LEAVE_MS} from '../../presentation/messages';
import type {DemoMessage} from './MessageGallery';

/**
 * 视觉页的演示消息 ✓：**行为跟产品一致** ✓。
 *
 * **瞬时的那几条定时自己走** ✓ ⇒ ⇒ 与产品一样 ✓ ⇒ ⇒ 退场动画才看得见 ✓。
 * **等确认与结果那几条不走** ✓ ⇒ ⇒ 它们等用户 ✓ ⇒ ⇒ 与产品一样 ✓。
 *
 * **演示的计时比产品短** ✓ ⇒ ⇒ 产品是 10 秒 ✓ ⇒ ⇒ 这里 6 秒 ✓ ⇒ ⇒ 看动画不用等那么久 ✓。
 */
const DEMO_AUTO_MS = 6000;

/** 退场动画有多长 ✓ ⇒ ⇒ 与产品一致 ✓ ⇒ ⇒ 与 `messages.css` 里的 transition 一样长 ✓。 */
const DEMO_LEAVE_MS = MESSAGE_LEAVE_MS;

export interface DemoMessages {
  /** 现在演示着哪些 ✓。 */
  demos: readonly DemoMessage[];
  /** 点一个用例 ⇒ ⇒ 换成那一组 ✓。 */
  pick: (demos: readonly DemoMessage[]) => void;
  /** 关掉一条 ⇒ ⇒ 先退场，再收走 ✓。 */
  dismiss: (id: string) => void;
  /** 全清 ✓。 */
  clear: () => void;
}

export function useDemoMessages(): DemoMessages {
  const [demos, setDemos] = useState<readonly DemoMessage[]>([]);
  useEffect(() => {
    const timers = demos
      .filter((demo) => demo.transient && !demo.leaving)
      .map((demo) =>
        setTimeout(() => {
          setDemos((previous) =>
            previous.map((item) =>
              item.id === demo.id && !item.leaving ? {...item, leaving: true} : item,
            ),
          );
        }, DEMO_AUTO_MS),
      );
    return () => {
      for (const timer of timers) clearTimeout(timer);
    };
  }, [demos]);
  useEffect(() => {
    const timers = demos
      .filter((demo) => demo.leaving)
      .map((demo) =>
        setTimeout(() => {
          setDemos((previous) => previous.filter((item) => item.id !== demo.id));
        }, DEMO_LEAVE_MS),
      );
    return () => {
      for (const timer of timers) clearTimeout(timer);
    };
  }, [demos]);
  return {
    demos,
    pick: (next) => setDemos(next),
    dismiss: (id) =>
      setDemos((previous) =>
        previous.map((item) => (item.id === id && !item.leaving ? {...item, leaving: true} : item)),
      ),
    clear: () => setDemos([]),
  };
}
