import type {MessagePort, ProblemReport, WebEvent} from '../../../application/messages';
import {pageBuildCommit} from '../buildInfo';
import {readRuntimePrefs} from './runtime';

export type LogChannelStatus =
  | 'idle'
  | 'accepted'
  | 'dropped'
  | 'rejected'
  | 'unavailable'
  | 'timeout'
  | 'failed'
  | 'invalid-receipt';
type NativeBridge = Pick<typeof import('@tauri-apps/api/core'), 'isTauri' | 'invoke'>;
const DEFAULT_TIMEOUT_MS = 200;
const TIMEOUT = Symbol('log-timeout');

/** Bound only the wait: late IPC completion cannot change the settled result. */
async function within<T>(work: Promise<T>, timeoutMs: number): Promise<T | typeof TIMEOUT> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<typeof TIMEOUT>((resolve) => {
        timer = setTimeout(() => resolve(TIMEOUT), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** One last status, no retry queue and no payload retained. accepted means enqueued, not saved. */
export function createTauriMessagePort(
  loadNative: () => Promise<NativeBridge> = () => import('@tauri-apps/api/core'),
  readTimeout: () => Promise<number | undefined> = async () =>
    (await readRuntimePrefs())?.logCallTimeoutMs,
): MessagePort & {health(): Readonly<{status: LogChannelStatus}>} {
  let status: LogChannelStatus = 'idle';
  let latest = 0;
  let timeout: Promise<number> | undefined;
  function configuredTimeout(): Promise<number> {
    timeout ??= within(Promise.resolve().then(readTimeout), DEFAULT_TIMEOUT_MS)
      .then((value) =>
        typeof value === 'number' && Number.isInteger(value) && value >= 10 && value <= 2000
          ? value
          : DEFAULT_TIMEOUT_MS,
      )
      .catch(() => DEFAULT_TIMEOUT_MS);
    return timeout;
  }
  async function send(payload: Record<string, unknown>): Promise<void> {
    const attempt = ++latest;
    let next: LogChannelStatus;
    try {
      const budget = await configuredTimeout();
      const result = await within(
        (async () => {
          const native = await loadNative();
          if (!native.isTauri()) return 'unavailable';
          return await native.invoke<unknown>('log_event', {
            payload: JSON.stringify({...payload, build: pageBuildCommit}),
          });
        })(),
        budget,
      );
      next =
        result === TIMEOUT
          ? 'timeout'
          : result === 'accepted' ||
              result === 'dropped' ||
              result === 'rejected' ||
              result === 'unavailable'
            ? result
            : 'invalid-receipt';
    } catch {
      next = 'failed';
    }
    if (attempt === latest) status = next;
  }
  return {
    health: () => ({status}),
    event: (event: WebEvent) =>
      send({
        event: event.kind,
        ...(event.callId === undefined ? {} : {call_id: event.callId}),
        ...(event.command === undefined ? {} : {command: event.command}),
        ...(event.result === undefined ? {} : {result: event.result}),
      }),
    report: (report: ProblemReport) =>
      send({
        event: 'page_error',
        error_category: report.category,
        source: report.source?.slice(0, 200),
      }),
  };
}

export const tauriMessagePort = createTauriMessagePort();
