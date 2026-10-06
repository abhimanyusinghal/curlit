import { describe, expect, it } from 'vitest';
import { createDefaultRequest } from '../../types';
import { createRunReporter, serializeRunReport } from '../runReport';
import type { ExecuteResult } from '../requestExecutor';

function result(overrides: Partial<ExecuteResult> = {}): ExecuteResult {
  return {
    resolvedRequest: createDefaultRequest({ url: 'https://user:password@example.test?token=secret', auth: { type: 'bearer', bearer: { token: 'secret' } } }),
    response: { status: 200, statusText: 'OK', headers: { 'set-cookie': 'secret' }, body: 'private response', size: 16, time: 12, cookies: [] },
    testResults: [], chainVarUpdates: { token: 'secret' }, logs: [{ type: 'log', args: ['private log'], timestamp: 0 }],
    error: null, outcome: 'passed', ...overrides,
  };
}

describe('shared run reports', () => {
  it('retains assertion results and skips without exporting requests, responses or script logs', () => {
    const reporter = createRunReporter({ name: 'Suite', requests: [createDefaultRequest({ name: 'One' }), createDefaultRequest({ name: 'Two' })] });
    reporter.record({ type: 'start', total: 2 });
    reporter.record({ type: 'request-complete', index: 0, durationMs: 12, result: result({ outcome: 'failed', testResults: [{ name: 'status', passed: false, error: 'Expected 201' }] }) });
    reporter.record({ type: 'request-skipped', index: 1, reason: 'stop-on-failure' });
    reporter.record({ type: 'done', summary: { total: 2, completed: 1, passed: 0, failed: 1, errored: 0, durationMs: 12 } });
    const report = reporter.snapshot();
    expect(report.summary.skipped).toBe(1);
    expect(report.requests[0].tests[0].error).toBe('Expected 201');
    expect(report.requests[1].skipReason).toBe('stop-on-failure');
    const serialized = serializeRunReport(report, 'json');
    for (const privateValue of ['password', 'secret', 'private response', 'private log', 'example.test']) expect(serialized).not.toContain(privateValue);
    report.requests[0].tests[0].error = 'modified';
    expect(reporter.snapshot().requests[0].tests[0].error).toBe('Expected 201');
  });

  it('writes parseable JUnit with accurate failures, errors, skips and escaped XML', () => {
    const reporter = createRunReporter({ name: 'Suite <&"\u0001', requests: Array.from({ length: 4 }, (_, index) => createDefaultRequest({ name: `Case ${index} <&"\ud800` })) });
    reporter.record({ type: 'request-complete', index: 0, durationMs: 20, result: result() });
    reporter.record({ type: 'request-complete', index: 1, durationMs: 30, result: result({ outcome: 'failed', testResults: [{ name: 'a < b', passed: false, error: '<tag attr="x"> & \u0000' }] }) });
    reporter.record({ type: 'request-complete', index: 2, durationMs: 40, result: result({ outcome: 'error', error: 'Network "error"' }) });
    reporter.record({ type: 'request-skipped', index: 3, reason: 'aborted' });
    reporter.record({ type: 'done', summary: { total: 4, completed: 3, passed: 1, failed: 1, errored: 1, durationMs: 90 } });
    const document = new DOMParser().parseFromString(serializeRunReport(reporter.snapshot(), 'junit'), 'application/xml');
    expect(document.querySelector('parsererror')).toBeNull();
    const suite = document.querySelector('testsuite')!;
    expect(suite.getAttribute('name')).toBe('Suite <&"');
    expect(suite.getAttribute('tests')).toBe('4');
    expect(suite.getAttribute('failures')).toBe('1');
    expect(suite.getAttribute('errors')).toBe('1');
    expect(suite.getAttribute('skipped')).toBe('1');
    expect(document.querySelectorAll('testcase')).toHaveLength(4);
    expect(document.querySelector('failure')!.textContent).toBe('a < b: <tag attr="x"> & ');
    expect(document.querySelector('error')!.textContent).toBe('Network "error"');
    expect(document.querySelector('skipped')!.getAttribute('message')).toBe('aborted');
  });
});
