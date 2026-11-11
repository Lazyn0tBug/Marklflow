import {useCallback, useLayoutEffect, useRef, type RefObject} from 'react';

const EXIT_MARGIN_MS = 150;
const EXCEPTION_DEADLINE_MS = 500;

interface MessageLifecycleOptions {
  elementRef: RefObject<HTMLDivElement | null>;
  leaving?: boolean | undefined;
  autoHideMs?: number | undefined;
  onHide: () => void;
  onExited: () => void;
}

/** CSS owns the effect; this adapter only owns its wait and cleanup. */
export function useMessageLifecycle(options: MessageLifecycleOptions): () => void {
  const {elementRef, leaving = false, autoHideMs} = options;
  const callbacks = useRef(options);
  const requested = useRef(false);
  const exited = useRef(false);
  const restoreFocus = useRef(false);
  useLayoutEffect(() => {
    callbacks.current = options;
  });

  const requestHide = useCallback((manual: boolean) => {
    if (requested.current || callbacks.current.leaving) return;
    requested.current = true;
    const element = callbacks.current.elementRef.current;
    if (element) {
      // Geometry only: CSS owns the viewport destination, easing and duration.
      const bounds = element.getBoundingClientRect();
      element.style.setProperty('--mf-message-exit-top', `${bounds.top}px`);
      element.style.setProperty('--mf-message-exit-left', `${bounds.left}px`);
      element.style.setProperty('--mf-message-exit-width', `${bounds.width}px`);
      element.style.setProperty('--mf-message-exit-position', 'fixed');
    }
    const active = element?.ownerDocument.activeElement;
    restoreFocus.current = Boolean(
      element &&
      (element.contains(active ?? null) || (manual && active === element.ownerDocument.body)),
    );
    callbacks.current.onHide();
  }, []);
  const dismiss = useCallback(() => requestHide(true), [requestHide]);

  useLayoutEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    const controller = new AbortController();
    const {signal} = controller;
    let timer: ReturnType<typeof setTimeout> | undefined;
    signal.addEventListener('abort', () => clearTimeout(timer), {once: true});

    if (!leaving) {
      // Establish a shown style before an immediate subsequent hide. No rAF loop.
      void getComputedStyle(element).opacity;
      if (autoHideMs !== undefined)
        timer = setTimeout(() => {
          if (!signal.aborted) requestHide(false);
        }, autoHideMs);
      return () => controller.abort();
    }

    const finish = () => {
      if (exited.current || signal.aborted) return;
      exited.current = true;
      controller.abort();
      const active = element.ownerDocument.activeElement;
      if (
        restoreFocus.current &&
        (active === element.ownerDocument.body || element.contains(active))
      ) {
        const region = element.closest<HTMLElement>('.mf-message');
        const next = Array.from(
          region?.querySelectorAll<HTMLElement>('.mf-message-button') ?? [],
        ).find(
          (button) =>
            !button.closest('[data-leaving="true"], [inert]') && !button.matches(':disabled'),
        );
        (next ?? region)?.focus();
      }
      callbacks.current.onExited();
    };
    const transitions = element
      .getAnimations()
      .filter(
        (animation): animation is CSSTransition =>
          animation instanceof CSSTransition &&
          animation.effect instanceof KeyframeEffect &&
          animation.effect.target === element &&
          !animation.effect.pseudoElement &&
          (animation.transitionProperty === 'opacity' ||
            animation.transitionProperty === 'transform'),
      );
    if (transitions.length === 0) finish();
    else {
      const endTimes = transitions.map((animation) =>
        Number(animation.effect?.getComputedTiming().endTime),
      );
      const end = Math.max(...endTimes);
      timer = setTimeout(
        finish,
        Number.isFinite(end) ? Math.max(0, end) + EXIT_MARGIN_MS : EXCEPTION_DEADLINE_MS,
      );
      void Promise.allSettled(transitions.map((animation) => animation.finished)).then(finish);
    }
    // Do not cancel the CSS-owned transitions, or call onExited on unmount.
    return () => controller.abort();
  }, [elementRef, leaving, autoHideMs, requestHide]);

  return dismiss;
}
