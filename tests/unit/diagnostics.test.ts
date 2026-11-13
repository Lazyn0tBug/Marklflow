import {it, expect, beforeEach} from 'vitest';
import {
  diagnostic,
  diagnosticTrace,
  resetDiagnosticTrace,
} from '../../src/core/platform/web/diagnostics';

beforeEach(() => {
  resetDiagnosticTrace();
});

it('keeps a bounded single-line trace of the last events', () => {
  diagnostic('export-dialog', 'run-started', 'docx');
  diagnostic('export-dialog', 'review-opened', 2);
  diagnostic('export-dialog', 'review-answered', 'refused');
  const trace = diagnosticTrace();
  expect(trace).toContain('run-started docx');
  expect(trace).toContain('review-opened 2');
  expect(trace).toContain('review-answered refused');
  // **单行** ✓ ⇒ ⇒ 日志基座的"每条记录一行"仍然成立 ✓。
  expect(trace).not.toContain('\n');
  expect(trace.split(' | ')).toHaveLength(3);
});

it('drops the oldest events instead of growing without bound', () => {
  for (let index = 0; index < 60; index += 1) diagnostic('scope', 'event', index);
  const lines = diagnosticTrace().split(' | ');
  expect(lines).toHaveLength(40);
  expect(lines[0]).toContain('event 20');
  expect(lines[39]).toContain('event 59');
});
