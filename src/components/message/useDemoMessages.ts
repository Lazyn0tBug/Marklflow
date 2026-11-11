import {useCallback, useRef, useState} from 'react';
import type {DemoMessage} from './MessageGallery';

export function useDemoMessages() {
  const [demos, setDemos] = useState<readonly DemoMessage[]>([]);
  const sequence = useRef(0);
  return {
    demos,
    // Re-picking a case creates new presentation instances, not stale exits.
    pick: (next: readonly DemoMessage[]) => {
      sequence.current += 1;
      setDemos(next.map((item) => ({...item, id: `${sequence.current}-${item.id}`})));
    },
    dismiss: useCallback(
      (id: string) =>
        setDemos((previous) =>
          previous.map((item) =>
            item.id === id && !item.leaving ? {...item, leaving: true} : item,
          ),
        ),
      [],
    ),
    remove: useCallback(
      (id: string) => setDemos((previous) => previous.filter((item) => item.id !== id)),
      [],
    ),
    clear: () => setDemos([]),
  };
}
