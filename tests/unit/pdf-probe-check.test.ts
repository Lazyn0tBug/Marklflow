import {describe, expect, it} from 'vitest';
import {
  evaluateRuns,
  groupRuns,
  parseLogLine,
  type CheckReport,
  type LogRecord,
  type ParsedFile,
  type Verdict,
} from '../../scripts/pdf-probe-check';

/**
 * D1b 校验器的行为：证据不足记「未能确认」，不自动补齐；两侧不一致只作诊断；
 * 缺失、重复、损坏与未知 schema 都不得被当成通过。
 */

interface RecordSpec {
  event: string;
  origin?: 'rust' | 'web';
  span?: {name: string; id: number; parent_id: number | null} | null;
  run?: string;
  fields?: Record<string, string>;
}

let clock = 0;
const nextStamp = (): string => {
  clock += 1;
  return `2026-11-03T00:00:0${Math.floor(clock / 100) % 10}.${String(clock % 1000).padStart(3, '0')}Z`;
};

const record = (spec: RecordSpec): LogRecord => {
  const origin = spec.origin ?? 'rust';
  const fields = {...(spec.fields ?? {})};
  return {
    schema_version: 1,
    run_id: spec.run ?? 'run-1',
    timestamp: nextStamp(),
    level: 'INFO',
    event: spec.event,
    origin,
    span: spec.span === undefined ? {name: 'run', id: 1, parent_id: null} : spec.span,
    fields,
  };
};

const file = (records: LogRecord[], path = 'memory.log'): ParsedFile => ({
  path,
  sha256: 'x',
  bytes: 0,
  records,
  issues: [],
  unknownSchema: [],
  format: 'jsonl',
});

const verdictOf = (report: CheckReport, id: string): Verdict => {
  const item = report.assertions.find((entry) => entry.id === id);
  if (!item) throw new Error(`断言缺失：${id}`);
  return item.verdict;
};

const diagnosticsOf = (report: CheckReport, id: string) =>
  report.diagnostics.filter((item) => item.id === id);

/** 一份完整、无毛病的 pdf-probe 运行。 */
const healthyProbeRun = (): LogRecord[] => [
  record({
    event: 'run_start',
    span: {name: 'run', id: 1, parent_id: null},
    fields: {feature: 'pdf-probe', os: 'macos', arch: 'aarch64', app_version: '0.9.1'},
  }),
  record({
    event: 'source_decision',
    span: {name: 'command', id: 10, parent_id: 1},
    fields: {decision: 'allow', command: 'read_native_text', window: 'main', webview: 'main'},
  }),
  record({
    event: 'operation_result',
    span: {name: 'command', id: 10, parent_id: 1},
    fields: {result: 'ok', command: 'read_native_text', bytes: '25', elapsed_ms: '0'},
  }),
  record({
    event: 'source_decision',
    span: {name: 'command', id: 11, parent_id: 1},
    fields: {
      decision: 'deny',
      reason_code: 'native-source-denied',
      command: 'read_native_text',
      window: 'pdf-output',
      webview: 'pdf-output',
    },
  }),
  record({
    event: 'operation_result',
    span: {name: 'command', id: 11, parent_id: 1},
    fields: {
      result: 'error',
      reason_code: 'native-source-denied',
      command: 'read_native_text',
      elapsed_ms: '0',
    },
  }),
  record({
    event: 'source_decision',
    span: {name: 'command', id: 12, parent_id: 1},
    fields: {
      decision: 'deny',
      reason_code: 'native-source-denied',
      command: 'select_native_open',
      window: 'pdf-output',
      webview: 'pdf-output',
    },
  }),
  record({
    event: 'operation_result',
    span: {name: 'command', id: 12, parent_id: 1},
    fields: {
      result: 'error',
      reason_code: 'native-source-denied',
      command: 'select_native_open',
      elapsed_ms: '0',
    },
  }),
  record({
    event: 'source_decision',
    span: {name: 'command', id: 13, parent_id: 1},
    fields: {decision: 'allow', command: 'release_native_file', window: 'main', webview: 'main'},
  }),
  record({
    event: 'operation_result',
    span: {name: 'command', id: 13, parent_id: 1},
    fields: {result: 'ok', command: 'release_native_file', elapsed_ms: '0'},
  }),
  record({
    event: 'source_decision',
    span: {name: 'command', id: 14, parent_id: 1},
    fields: {
      decision: 'deny',
      reason_code: 'native-source-denied',
      command: 'release_native_file',
      window: 'pdf-output',
      webview: 'pdf-output',
    },
  }),
  record({
    event: 'operation_result',
    span: {name: 'command', id: 14, parent_id: 1},
    fields: {
      result: 'error',
      reason_code: 'native-source-denied',
      command: 'release_native_file',
      elapsed_ms: '0',
    },
  }),
  record({
    event: 'page_report_observed',
    span: {name: 'probe', id: 3, parent_id: 1},
    fields: {
      host: 'main',
      role: 'main-window',
      read_ok: 'true',
      read_matches_fixture: 'true',
      read_error: '',
    },
  }),
  record({
    event: 'page_report_observed',
    span: {name: 'probe', id: 3, parent_id: 1},
    fields: {
      host: 'output',
      role: 'output-host',
      read_ok: 'false',
      read_matches_fixture: 'false',
      read_error: 'native-source-denied',
    },
  }),
  record({
    event: 'probe_cleanup',
    span: {name: 'probe', id: 3, parent_id: 1},
    fields: {revoked: 'true'},
  }),
  record({
    event: 'log_health',
    span: {name: 'log', id: 2, parent_id: 1},
    fields: {
      dropped: '0',
      rejected: '0',
      write_failures: '0',
      rotate_failures: '0',
      delete_failures: '0',
      file_unavailable: 'false',
      stdout_failed: 'false',
    },
  }),
  record({
    event: 'web_event',
    origin: 'web',
    span: {name: 'page_call', id: 20, parent_id: 1},
    fields: {
      page_event: 'call_finished',
      command: 'get_platform_info',
      result: 'ok',
      window_label: 'main',
      webview_label: 'main',
    },
  }),
  record({
    event: 'web_event',
    origin: 'web',
    span: {name: 'page_call', id: 21, parent_id: 1},
    fields: {
      page_event: 'call_finished',
      command: 'read_native_text',
      result: 'ok',
      bytes: '25',
      window_label: 'main',
      webview_label: 'main',
    },
  }),
  record({
    event: 'web_event',
    origin: 'web',
    span: {name: 'page_call', id: 22, parent_id: 1},
    fields: {
      page_event: 'call_finished',
      command: 'read_native_text',
      result: 'denied',
      error_category: 'invoke-rejected',
      window_label: 'pdf-output',
      webview_label: 'pdf-output',
    },
  }),
  record({
    event: 'web_event',
    origin: 'web',
    span: {name: 'page_call', id: 23, parent_id: 1},
    fields: {
      page_event: 'call_finished',
      command: 'select_native_open',
      result: 'denied',
      error_category: 'invoke-rejected',
      window_label: 'pdf-output',
      webview_label: 'pdf-output',
    },
  }),
  record({
    event: 'web_event',
    origin: 'web',
    span: {name: 'page_call', id: 24, parent_id: 1},
    fields: {
      page_event: 'call_finished',
      command: 'release_native_file',
      result: 'ok',
      window_label: 'main',
      webview_label: 'main',
    },
  }),
  record({
    event: 'web_event',
    origin: 'web',
    span: {name: 'page_call', id: 25, parent_id: 1},
    fields: {
      page_event: 'call_finished',
      command: 'release_native_file',
      result: 'denied',
      error_category: 'invoke-rejected',
      window_label: 'pdf-output',
      webview_label: 'pdf-output',
    },
  }),
];

/** 一份默认构建的运行：只有主窗口放行，无探针痕迹。 */
const healthyDefaultRun = (): LogRecord[] => [
  record({
    event: 'run_start',
    run: 'run-2',
    span: {name: 'run', id: 1, parent_id: null},
    fields: {feature: 'default', os: 'macos', arch: 'aarch64', app_version: '0.9.1'},
  }),
  record({
    event: 'source_decision',
    run: 'run-2',
    span: {name: 'command', id: 10, parent_id: 1},
    fields: {decision: 'allow', command: 'read_native_text', window: 'main', webview: 'main'},
  }),
  record({
    event: 'operation_result',
    run: 'run-2',
    span: {name: 'command', id: 10, parent_id: 1},
    fields: {result: 'ok', command: 'read_native_text', bytes: '25', elapsed_ms: '0'},
  }),
];

const evaluate = (records: LogRecord[], extra: LogRecord[] = []): CheckReport => {
  const runs = groupRuns([file(records), file(extra, 'default.log')]);
  return evaluateRuns(runs);
};

describe('pdf-probe 校验器', () => {
  it('证据齐全时六条断言中可机器判定的都通过', () => {
    const report = evaluate(healthyProbeRun(), healthyDefaultRun());
    expect(verdictOf(report, 'D1b-1')).toBe('pass');
    expect(verdictOf(report, 'D1b-2')).toBe('pass');
    expect(verdictOf(report, 'D1b-3')).toBe('pass');
    expect(verdictOf(report, 'D1b-4')).toBe('pass');
    expect(verdictOf(report, 'D1b-5')).toBe('pass');
    expect(verdictOf(report, 'D1b-6')).toBe('pass');
    expect(diagnosticsOf(report, 'credential-fragment')).toHaveLength(0);
    expect(diagnosticsOf(report, 'duplicate-event')).toHaveLength(0);
    expect(diagnosticsOf(report, 'duplicate-web-event')).toHaveLength(0);
    expect(diagnosticsOf(report, 'cross-side-mismatch')).toHaveLength(0);
  });

  it('同一次页面调用的事件被报了两遍时报重复，不看 span', () => {
    // 页面侧每个 web 事件各开一个 span ✓：同一份 call_finished 落在两个 span 里 ✓，
    // "同一 span 内重复"抓不到 ✓ —— 交付宿主上就漏过一次 ✓。
    const duplicated = [
      record({
        event: 'web_event',
        origin: 'web',
        span: {name: 'page_call', id: 30, parent_id: 1},
        fields: {
          page_event: 'call_finished',
          command: 'read_native_text',
          result: 'ok',
          call_id: 'call-1',
          window_label: 'main',
          webview_label: 'main',
        },
      }),
      record({
        event: 'web_event',
        origin: 'web',
        span: {name: 'page_call', id: 31, parent_id: 1},
        fields: {
          page_event: 'call_finished',
          command: 'read_native_text',
          result: 'ok',
          call_id: 'call-1',
          window_label: 'main',
          webview_label: 'main',
        },
      }),
    ];
    const report = evaluate([...healthyProbeRun(), ...duplicated], healthyDefaultRun());
    expect(diagnosticsOf(report, 'duplicate-web-event').length).toBeGreaterThan(0);
    // 两个 span 不同 ✓：那条按 span 去重的诊断不该报 ✓。
    expect(diagnosticsOf(report, 'duplicate-event')).toHaveLength(0);
  });

  it('一次调用有 started 与 finished 两件事，不算重复', () => {
    const call = [
      record({
        event: 'web_event',
        origin: 'web',
        span: {name: 'page_call', id: 30, parent_id: 1},
        fields: {
          page_event: 'call_started',
          command: 'read_native_text',
          call_id: 'call-2',
          window_label: 'main',
          webview_label: 'main',
        },
      }),
      record({
        event: 'web_event',
        origin: 'web',
        span: {name: 'page_call', id: 31, parent_id: 1},
        fields: {
          page_event: 'call_finished',
          command: 'read_native_text',
          result: 'ok',
          call_id: 'call-2',
          window_label: 'main',
          webview_label: 'main',
        },
      }),
    ];
    const report = evaluate([...healthyProbeRun(), ...call], healthyDefaultRun());
    expect(diagnosticsOf(report, 'duplicate-web-event')).toHaveLength(0);
  });

  it('缺 run_start 时全部记未能确认，不按缺证当作失败也不当作通过', () => {
    const records = healthyProbeRun().filter((entry) => entry.event !== 'run_start');
    const report = evaluate(records, healthyDefaultRun());
    for (const id of ['D1b-1', 'D1b-2', 'D1b-3', 'D1b-4', 'D1b-5', 'D1b-6']) {
      expect(verdictOf(report, id)).toBe('unconfirmed');
    }
  });

  it('native 拒绝而 web 报成功时判未通过：内容泄露不能被 web 声明覆盖', () => {
    const records = healthyProbeRun().map((entry) => {
      if (
        entry.event === 'web_event' &&
        entry.fields.window_label === 'pdf-output' &&
        entry.fields.command === 'read_native_text'
      ) {
        return {...entry, fields: {...entry.fields, result: 'ok'}};
      }
      return entry;
    });
    const report = evaluate(records, healthyDefaultRun());
    expect(verdictOf(report, 'D1b-3')).toBe('fail');
  });

  it('native 放行但缺 operation_result 时相关断言记未能确认', () => {
    const records = healthyProbeRun().filter(
      (entry) =>
        !(
          entry.event === 'operation_result' &&
          entry.fields.command === 'read_native_text' &&
          entry.fields.result === 'ok'
        ),
    );
    const report = evaluate(records, healthyDefaultRun());
    expect(verdictOf(report, 'D1b-2')).toBe('unconfirmed');
  });

  it('默认构建的运行缺失时 D1b-5 记未能确认', () => {
    const report = evaluate(healthyProbeRun());
    expect(verdictOf(report, 'D1b-5')).toBe('unconfirmed');
  });

  it('默认构建里没有主窗口放行记录时 D1b-5 记未能确认，不是不成立', () => {
    // 没有观察到 ≠ 不成立：缺证只能记未能确认。
    const report = evaluate(
      healthyProbeRun(),
      healthyDefaultRun().filter((entry) => entry.event !== 'source_decision'),
    );
    expect(verdictOf(report, 'D1b-5')).toBe('unconfirmed');
  });

  it('默认构建里主窗口被拒时 D1b-5 判未通过', () => {
    const denied = healthyDefaultRun().map((entry) =>
      entry.event === 'source_decision'
        ? {
            ...entry,
            fields: {...entry.fields, decision: 'deny', reason_code: 'native-source-denied'},
          }
        : entry,
    );
    const report = evaluate(healthyProbeRun(), denied);
    expect(verdictOf(report, 'D1b-5')).toBe('fail');
  });

  it('默认构建里出现探针事件时 D1b-5 判未通过', () => {
    const defaultRun = [
      ...healthyDefaultRun(),
      record({
        event: 'probe_cleanup',
        run: 'run-2',
        span: {name: 'probe', id: 3, parent_id: 1},
        fields: {revoked: 'true'},
      }),
    ];
    const report = evaluate(healthyProbeRun(), defaultRun);
    expect(verdictOf(report, 'D1b-5')).toBe('fail');
  });

  it('探针和退出的健康快照不是重复事件', () => {
    const records = healthyProbeRun().map((entry) =>
      entry.event === 'log_health'
        ? {...entry, fields: {...entry.fields, observed_by: 'probe'}}
        : entry,
    );
    const health = records.find((entry) => entry.event === 'log_health');
    if (!health) throw new Error('missing health fixture');
    records.push({...health, fields: {...health.fields, observed_by: 'shutdown'}});
    expect(diagnosticsOf(evaluate(records, healthyDefaultRun()), 'duplicate-event')).toHaveLength(
      0,
    );
  });

  it('同一观察位置重复健康快照仍报重复事件', () => {
    const records = healthyProbeRun().map((entry) =>
      entry.event === 'log_health'
        ? {...entry, fields: {...entry.fields, observed_by: 'shutdown'}}
        : entry,
    );
    const health = records.find((entry) => entry.event === 'log_health');
    if (!health) throw new Error('missing health fixture');
    records.push(health);
    expect(
      diagnosticsOf(evaluate(records, healthyDefaultRun()), 'duplicate-event').length,
    ).toBeGreaterThan(0);
  });

  it('同一 span 内同名事件重复时报重复输出', () => {
    const records = [
      ...healthyProbeRun(),
      record({
        event: 'source_decision',
        span: {name: 'command', id: 10, parent_id: 1},
        fields: {decision: 'allow', command: 'read_native_text', window: 'main', webview: 'main'},
      }),
    ];
    const report = evaluate(records, healthyDefaultRun());
    expect(diagnosticsOf(report, 'duplicate-event')).not.toHaveLength(0);
  });

  it('两侧记录数量不符时报关联不匹配，不宣称调用已对应', () => {
    const records = healthyProbeRun().filter(
      (entry) =>
        !(
          entry.event === 'web_event' &&
          entry.fields.window_label === 'main' &&
          entry.fields.command === 'release_native_file'
        ),
    );
    const report = evaluate(records, healthyDefaultRun());
    expect(diagnosticsOf(report, 'correlation-mismatch').length).toBeGreaterThan(0);
  });

  it('同一 span 内同名事件按宿主区分：两个宿主各一次不是重复', () => {
    const records = [
      ...healthyProbeRun(),
      record({
        event: 'probe_report_unreadable',
        span: {name: 'probe', id: 3, parent_id: 1},
        fields: {host: 'main', reason: 'x'},
      }),
      record({
        event: 'probe_report_unreadable',
        span: {name: 'probe', id: 3, parent_id: 1},
        fields: {host: 'output', reason: 'x'},
      }),
    ];
    const report = evaluate(records, healthyDefaultRun());
    expect(diagnosticsOf(report, 'duplicate-event')).toHaveLength(0);
  });

  it('同一宿主同名事件重复仍报重复输出', () => {
    const records = [
      ...healthyProbeRun(),
      record({
        event: 'probe_report_unreadable',
        span: {name: 'probe', id: 3, parent_id: 1},
        fields: {host: 'main', reason: 'x'},
      }),
      record({
        event: 'probe_report_unreadable',
        span: {name: 'probe', id: 3, parent_id: 1},
        fields: {host: 'main', reason: 'x'},
      }),
    ];
    const report = evaluate(records, healthyDefaultRun());
    expect(diagnosticsOf(report, 'duplicate-event').length).toBeGreaterThan(0);
  });

  it('调用 span 不是根的直接子时报结构错误', () => {
    const records = healthyProbeRun().map((entry) =>
      entry.span?.name === 'command' ? {...entry, span: {...entry.span, parent_id: null}} : entry,
    );
    const report = evaluate(records, healthyDefaultRun());
    expect(diagnosticsOf(report, 'span-not-child-of-run').length).toBeGreaterThan(0);
  });

  it('凭据片段入日志时报脱敏问题', () => {
    const records = healthyProbeRun().map((entry) =>
      entry.event === 'probe_cleanup'
        ? {...entry, fields: {...entry.fields, read_key_prefix: 'a2eba7e1'}}
        : entry,
    );
    const report = evaluate(records, healthyDefaultRun());
    expect(diagnosticsOf(report, 'credential-fragment').length).toBeGreaterThan(0);
  });

  it('查询串里带前缀的凭据参数名也算泄露', () => {
    // 交付宿主上的一次运行把 readKey= 与 writeKey= 原样写进了日志：
    // 只匹配 `?key=` 的规则漏了它。
    const records = [
      ...healthyProbeRun(),
      record({
        event: 'probe_source_check',
        span: {name: 'probe', id: 3, parent_id: 1},
        fields: {
          page_origin:
            'about:%2Ftests/x.html?readKey=d06ec667-da05-4ea3-8afc-1545cb73cdc6&writeKey=71c31a7d',
          reachable: 'false',
        },
      }),
    ];
    const report = evaluate(records, healthyDefaultRun());
    const hits = diagnosticsOf(report, 'credential-url');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.message).toContain('readKey');
  });

  it('人读形态的一行能解析出同样的字段', () => {
    const parsed = parseLogLine(
      '2026-11-03T11:15:17.042Z INFO  run_id=r1 event=source_decision span=command{id=274877906945,parent_id=1} command=read_native_text decision=allow origin=rust webview=main window=main',
      'a.log',
      1,
    );
    const record = parsed.record;
    expect(record?.event).toBe('source_decision');
    expect(record?.level).toBe('INFO');
    expect(record?.origin).toBe('rust');
    expect(record?.run_id).toBe('r1');
    expect(record?.span?.name).toBe('command');
    expect(record?.span?.id).toBe(274877906945);
    expect(record?.span?.parent_id).toBe(1);
    expect(record?.fields.decision).toBe('allow');
    expect(record?.fields.window).toBe('main');
  });

  it('人读形态里无 span 写作 -，值含空格按续写还原', () => {
    const parsed = parseLogLine(
      '2026-11-03T09:38:03.915Z WARN  run_id=r1 event=probe_abort span=- origin=rust reason=源不可达 且须同源',
      'a.log',
      1,
    );
    expect(parsed.record?.span).toBeNull();
    expect(parsed.record?.fields.reason).toBe('源不可达 且须同源');
  });

  it('JSON 损坏与未知 schema 不进证据池', () => {
    const broken = parseLogLine('{"schema_version":1,', 'a.log', 1);
    expect(broken.record).toBeUndefined();
    expect(broken.issue?.reason).toContain('JSON 损坏');
    const unknown = parseLogLine(
      '{"schema_version":9,"run_id":"r","timestamp":"t","level":"INFO","event":"x","origin":"rust"}',
      'a.log',
      2,
    );
    expect(unknown.record?.schema_version).toBe(9);
  });

  it('web 侧只记开始没有完成时报调用中断', () => {
    const records = [
      ...healthyProbeRun(),
      record({
        event: 'web_event',
        origin: 'web',
        span: {name: 'page_call', id: 30, parent_id: 1},
        fields: {
          page_event: 'call_started',
          command: 'write_native_bytes',
          call_id: 'c-1',
          window_label: 'main',
          webview_label: 'main',
        },
      }),
    ];
    const report = evaluate(records, healthyDefaultRun());
    expect(diagnosticsOf(report, 'call-without-finish').length).toBeGreaterThan(0);
  });

  it('受保护命令不靠名单：原生守卫过而页面侧没回传的，照样报关联不匹配', () => {
    // 这正是刚修的那个形状：页面回传的命令名不在 Rust 的枚举里 ✓，
    // 整条事件被拒收丢弃 ✓，原生那边却留下守卫记录 ✓。
    // 校验器必须自己看出来 ✓，而不是靠一份"受保护命令名单"恰好列到了它 ✓——
    // 那份名单曾与 Rust 的枚举同时漏掉同一个命令 ✓，于是两端都没有人看 ✓。
    const records = [
      ...healthyProbeRun(),
      record({
        event: 'source_decision',
        span: {name: 'command', id: 30, parent_id: 1},
        fields: {decision: 'allow', command: 'select_native_html', window: 'main', webview: 'main'},
      }),
      record({
        event: 'operation_result',
        span: {name: 'command', id: 30, parent_id: 1},
        fields: {result: 'ok', command: 'select_native_html', elapsed_ms: '0'},
      }),
    ];
    const report = evaluate(records, healthyDefaultRun());
    expect(diagnosticsOf(report, 'correlation-mismatch').length).toBeGreaterThan(0);
  });

  it('页面侧没有事件的身份不做关联判定：那条路径本来就不走页面', () => {
    // 生产轮的导出由界面发起 ✓：只有原生侧有记录 ✓，页面侧一条也没有 ✓ ——
    // 那不是"页面调了而原生没记" ✓，是"这条路不经过页面" ✓ ✓。
    const records = [
      record({
        event: 'run_start',
        span: {name: 'run', id: 1, parent_id: null},
        fields: {feature: 'default', os: 'windows', arch: 'x86_64', app_version: '0.9.1'},
      }),
      record({
        event: 'source_decision',
        span: {name: 'command', id: 10, parent_id: 1},
        fields: {decision: 'allow', command: 'select_native_save', window: 'main', webview: 'main'},
      }),
      record({
        event: 'operation_result',
        span: {name: 'command', id: 10, parent_id: 1},
        fields: {result: 'ok', command: 'select_native_save', granted: 'true', elapsed_ms: '0'},
      }),
    ];
    const report = evaluate(records, []);
    expect(diagnosticsOf(report, 'correlation-mismatch')).toHaveLength(0);
  });

  it('健康的运行没有关联不匹配，且受保护命令由原生守卫记录推出', () => {
    const report = evaluate(healthyProbeRun(), healthyDefaultRun());
    expect(diagnosticsOf(report, 'correlation-mismatch')).toHaveLength(0);
    const probeRun = report.runs.find((entry) => entry.feature === 'pdf-probe');
    // 受保护命令从原生自己的守卫记录推出 ✓，不含没有守卫记录的 get_platform_info ✓。
    expect(probeRun?.guarded_commands).toContain('read_native_text');
    expect(probeRun?.guarded_commands).not.toContain('get_platform_info');
  });
});
