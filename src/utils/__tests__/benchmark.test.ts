import { describe, expect, it, vi } from 'vitest';
import { createDefaultRequest } from '../../types';
import { latencyStats, parseBenchmarkThreshold, runBenchmark, type BenchmarkConfig } from '../benchmark';
import { serializeBenchmarkReport } from '../benchmarkReport';
import type { ExecuteResult } from '../requestExecutorCore';

const request = createDefaultRequest({ name: 'User <&>', url: 'https://secret.example?token=private-token' });
const config: BenchmarkConfig = { iterations: 3, warmup: 0, delayMs: 0, timeoutMs: 1000, stopOnFailure: false, thresholds: [] };
function result(time = 10, overrides: Partial<ExecuteResult> = {}): ExecuteResult {
  return { resolvedRequest: request, response: { status: 200, statusText: 'OK', headers: {}, body: 'private-body', time: 9999, httpTimeMs: time, size: 12, cookies: [] },
    testResults: [{ name: 'status', passed: true }], logs: [], chainVarUpdates: {}, outcome: 'passed', error: null, ...overrides };
}
function run(overrides: Partial<Parameters<typeof runBenchmark>[0]> = {}) {
  return runBenchmark({ name: 'Benchmark <&>', requests: [request], variables: {}, config, signal: new AbortController().signal,
    execute: async () => result(), ...overrides });
}

describe('benchmark statistics and thresholds', () => {
  it('interpolates percentiles, computes an even median, and preserves zero timings', () => {
    const stats = latencyStats([30, 0, 10, 20]);
    expect(stats).toMatchObject({ samples: 4, min: 0, max: 30, avg: 15, median: 15 });
    expect(stats.p95).toBeCloseTo(28.5);
    expect(stats.p99).toBeCloseTo(29.7);
    expect(latencyStats([12])).toEqual({ samples: 1, min: 12, max: 12, avg: 12, median: 12, p95: 12, p99: 12 });
    expect(latencyStats([NaN, Infinity, -1])).toMatchObject({ samples: 0, avg: null, p95: null });
  });

  it.each(['p95=20', 'p95<NaN', 'failureRate<=101', 'avg<-1', 'p100<2', 'p95<Infinity'])('rejects invalid threshold %s', expression => {
    expect(() => parseBenchmarkThreshold(expression)).toThrow();
  });

  it('excludes warm-up and execution overhead, and resets chain variables each iteration', async () => {
    const contexts: Record<string, string>[] = [];
    const execute = vi.fn(async (_request, context) => {
      contexts.push(context.chainVars);
      expect(context.variables).toEqual({ host: 'local' });
      expect(context.requestTimeoutMs).toBe(1000);
      return result(contexts.length <= 2 ? 10000 : 10, { chainVarUpdates: { token: 'current-iteration' } });
    });
    const report = await run({ requests: [request, createDefaultRequest({ name: 'Next' })], variables: { host: 'local' }, config: { ...config, iterations: 2, warmup: 1 }, execute });
    expect(contexts).toEqual([{}, { token: 'current-iteration' }, {}, { token: 'current-iteration' }, {}, { token: 'current-iteration' }]);
    expect(report.summary).toMatchObject({ total: 4, completed: 4, passed: 4, latency: { samples: 4, avg: 10 }, warmup: { completed: 2 } });
    expect(report.samples.map(sample => sample.iteration)).toEqual([1, 1, 1, 1, 2, 2]);
  });

  it('applies limits per endpoint and distinguishes strict from inclusive comparisons', async () => {
    const report = await run({ requests: [request, createDefaultRequest({ name: 'Slow' })], execute: async selected => result(selected.id === request.id ? 0 : 100),
      config: { ...config, thresholds: ['p95<100', 'p95<=100', 'failureRate<=0'].map(parseBenchmarkThreshold) } });
    expect(report.summary.latency.avg).toBe(50);
    expect(report.outcome).toBe('failed');
    expect(report.checks.filter(check => !check.passed)).toEqual([expect.objectContaining({ requestIndex: 1, expression: 'p95<100', actual: 100 })]);
  });

  it('retains validation failures and excludes missing network measurements from latency', async () => {
    let call = 0;
    const report = await run({ execute: async () => ++call === 1 ? result(20, { outcome: 'failed', testResults: [{ name: 'Response schema: /id', passed: false, error: 'must be integer' }] }) :
      call === 2 ? result(10, { response: { ...result().response, status: 0 }, outcome: 'error', error: 'Connection refused' }) : result(5),
      config: { ...config, thresholds: ['p95<100', 'failureRate<=50'].map(parseBenchmarkThreshold) } });
    expect(report.summary).toMatchObject({ completed: 3, passed: 1, failed: 1, errored: 1, latency: { samples: 2, avg: 12.5 } });
    expect(report.summary.failureRate).toBeCloseTo(66.6667);
    expect(report.checks.every(check => !check.passed)).toBe(true);
    expect(report.samples[0].tests[0].error).toBe('must be integer');
  });

  it('fails explicitly if the transport has no HTTP timing instead of inventing zero latency', async () => {
    const report = await run({ execute: async () => result(10, { response: { ...result().response, httpTimeMs: undefined } }) });
    expect(report.outcome).toBe('failed');
    expect(report.summary).toMatchObject({ errored: 3, latency: { samples: 0, avg: null } });
    expect(report.samples[0].error).toContain('HTTP latency unavailable');
  });

  it('bails on warm-up failures and reports unmeasured thresholds as failures', async () => {
    const execute = vi.fn(async () => result(10, { outcome: 'error', error: 'Invalid schema' }));
    const report = await run({ config: { ...config, warmup: 1, stopOnFailure: true, thresholds: [parseBenchmarkThreshold('p95<100')] }, execute });
    expect(execute).toHaveBeenCalledOnce();
    expect(report.summary).toMatchObject({ completed: 0, skipped: 3, warmup: { completed: 1, errored: 1 }, latency: { samples: 0, p95: null } });
    expect(report.checks[0]).toMatchObject({ passed: false, actual: null });
    expect(report.stopReason).toBe('stop-on-failure');
  });

  it('interrupts delay, writes partial results and exports an explicit interruption in JUnit', async () => {
    vi.useFakeTimers();
    try {
      const controller = new AbortController();
      const execute = vi.fn(async () => result());
      const pending = run({ config: { ...config, delayMs: 60000 }, signal: controller.signal, execute });
      await vi.advanceTimersByTimeAsync(1);
      controller.abort();
      const report = await pending;
      expect(execute).toHaveBeenCalledOnce();
      expect(report.outcome).toBe('aborted');
      expect(report.summary).toMatchObject({ completed: 1, skipped: 2 });
      const document = new DOMParser().parseFromString(serializeBenchmarkReport(report, 'junit'), 'application/xml');
      expect(document.querySelector('parsererror')).toBeNull();
      expect(document.querySelectorAll('skipped')).toHaveLength(2);
      expect(document.querySelectorAll('error')).toHaveLength(1);
    } finally { vi.useRealTimers(); }
  });

  it('exports warm-ups, iterations and threshold cases without private payloads', async () => {
    const report = await run({ config: { ...config, warmup: 1, thresholds: [parseBenchmarkThreshold('p95<5')] } });
    const json = serializeBenchmarkReport(report, 'json');
    for (const secret of ['private-token', 'private-body', 'secret.example']) expect(json).not.toContain(secret);
    const document = new DOMParser().parseFromString(serializeBenchmarkReport(report, 'junit'), 'application/xml');
    expect(document.querySelector('parsererror')).toBeNull();
    expect(document.querySelector('testsuite')?.getAttribute('tests')).toBe('5');
    expect(document.querySelector('testsuite')?.getAttribute('failures')).toBe('1');
    expect(document.querySelectorAll('testcase')[0].getAttribute('name')).toContain('Warm-up 1: User <&>');
    expect(document.querySelector('failure')?.textContent).toContain('p95 = 10.00ms');
  });

  it.each([{ iterations: 0 }, { iterations: 1.5 }, { warmup: -1 }, { delayMs: 60001 }, { timeoutMs: 0 }, { iterations: 10000, warmup: 1 }])('rejects invalid bounds before execution: %j', invalid => {
    const execute = vi.fn();
    return expect(run({ config: { ...config, ...invalid }, execute })).rejects.toThrow().then(() => expect(execute).not.toHaveBeenCalled());
  });
});
