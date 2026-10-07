import type { RequestConfig, TestResult } from '../types';
import { executionError, type ExecuteContext, type ExecuteResult } from './requestExecutorCore';

export const MAX_BENCHMARK_REQUESTS = 10_000;
export type BenchmarkMetric = 'avg' | 'min' | 'max' | 'median' | 'p95' | 'p99' | 'failureRate';
export interface BenchmarkThreshold { metric: BenchmarkMetric; operator: '<' | '<='; limit: number; expression: string }
export interface BenchmarkConfig {
  iterations: number;
  warmup: number;
  delayMs: number;
  timeoutMs: number;
  stopOnFailure: boolean;
  thresholds: BenchmarkThreshold[];
}
export interface LatencyStats {
  samples: number;
  min: number | null; avg: number | null; median: number | null;
  p95: number | null; p99: number | null; max: number | null;
}
export interface BenchmarkCounts {
  completed: number; passed: number; failed: number; errored: number;
}
export interface BenchmarkSample {
  requestIndex: number;
  iteration: number;
  phase: 'warmup' | 'measured';
  outcome: ExecuteResult['outcome'];
  statusCode: number;
  httpTimeMs: number | null;
  durationMs: number;
  tests: TestResult[];
  error?: string;
}
export interface BenchmarkRequestStats extends BenchmarkCounts {
  index: number; name: string; method: RequestConfig['method'];
  latency: LatencyStats;
  failureRate: number | null;
}
export interface BenchmarkCheck {
  requestIndex: number; expression: string; actual: number | null; passed: boolean;
  message: string;
}
export interface BenchmarkReport {
  version: 1;
  kind: 'benchmark';
  name: string;
  startedAt: string;
  config: BenchmarkConfig;
  outcome: 'passed' | 'failed' | 'aborted';
  stopReason?: 'aborted' | 'stop-on-failure';
  summary: BenchmarkCounts & {
    total: number; skipped: number; durationMs: number; warmup: BenchmarkCounts;
    latency: LatencyStats; failureRate: number | null;
  };
  requests: BenchmarkRequestStats[];
  samples: BenchmarkSample[];
  checks: BenchmarkCheck[];
}
export interface BenchmarkProgress {
  phase: BenchmarkSample['phase']; iteration: number; requestIndex: number; completed: number; total: number;
}

export function parseBenchmarkThreshold(expression: string): BenchmarkThreshold {
  const match = /^(avg|min|max|median|p95|p99|failureRate)\s*(<=|<)\s*(\d+(?:\.\d+)?)$/.exec(expression.trim());
  if (!match) throw new Error('Threshold must use METRIC<NUMBER or METRIC<=NUMBER (avg, min, max, median, p95, p99 in ms; failureRate in %)');
  const metric = match[1] as BenchmarkMetric;
  const limit = Number(match[3]);
  if (!Number.isFinite(limit) || limit > (metric === 'failureRate' ? 100 : 2_147_483_647)) throw new Error('Threshold limit is outside the allowed range');
  return { metric, operator: match[2] as '<' | '<=', limit, expression: `${metric}${match[2]}${limit}` };
}

export function validateBenchmarkConfig(config: BenchmarkConfig, requests: RequestConfig[]): void {
  for (const [name, value, min, max] of [
    ['Iterations', config.iterations, 1, MAX_BENCHMARK_REQUESTS], ['Warm-up iterations', config.warmup, 0, 1_000],
    ['Delay', config.delayMs, 0, 60_000], ['Request timeout', config.timeoutMs, 1, 2_147_483_647],
  ] as const) {
    if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  if (!requests.length) throw new Error('Select at least one request to benchmark');
  if (requests.some(request => request.protocol === 'websocket')) throw new Error('Benchmarks support HTTP and GraphQL requests only');
  if ((config.iterations + config.warmup) * requests.length > MAX_BENCHMARK_REQUESTS) throw new Error(`Benchmark exceeds ${MAX_BENCHMARK_REQUESTS.toLocaleString('en-US')} total requests, including warm-up`);
  if (config.thresholds.length > 20) throw new Error('A benchmark supports at most 20 thresholds');
  for (const threshold of config.thresholds) {
    const parsed = parseBenchmarkThreshold(threshold.expression);
    if (parsed.metric !== threshold.metric || parsed.operator !== threshold.operator || parsed.limit !== threshold.limit) throw new Error('Invalid benchmark threshold');
  }
}

/** Percentiles use linear interpolation at (n - 1) * p; preserve precision until display. */
export function latencyStats(values: number[]): LatencyStats {
  const sorted = values.filter(value => Number.isFinite(value) && value >= 0).sort((a, b) => a - b);
  if (!sorted.length) return { samples: 0, min: null, avg: null, median: null, p95: null, p99: null, max: null };
  const percentile = (p: number) => {
    const rank = (sorted.length - 1) * p;
    const lower = Math.floor(rank);
    return sorted[lower] + (sorted[Math.ceil(rank)] - sorted[lower]) * (rank - lower);
  };
  return { samples: sorted.length, min: sorted[0], avg: sorted.reduce((a, b) => a + b, 0) / sorted.length,
    median: percentile(0.5), p95: percentile(0.95), p99: percentile(0.99), max: sorted.at(-1)! };
}

function counts(samples: BenchmarkSample[]): BenchmarkCounts {
  return { completed: samples.length, passed: samples.filter(s => s.outcome === 'passed').length,
    failed: samples.filter(s => s.outcome === 'failed').length, errored: samples.filter(s => s.outcome === 'error').length };
}
function failureRate(count: BenchmarkCounts): number | null {
  return count.completed ? (count.failed + count.errored) / count.completed * 100 : null;
}
function timings(samples: BenchmarkSample[]): number[] {
  return samples.flatMap(sample => sample.httpTimeMs === null ? [] : [sample.httpTimeMs]);
}
function delay(ms: number, signal: AbortSignal): Promise<void> {
  if (!ms || signal.aborted) return Promise.resolve();
  return new Promise(resolve => {
    const finish = () => { clearTimeout(timer); signal.removeEventListener('abort', finish); resolve(); };
    const timer = setTimeout(finish, ms);
    signal.addEventListener('abort', finish, { once: true });
    if (signal.aborted) finish();
  });
}

export async function runBenchmark(options: {
  name: string; requests: RequestConfig[]; variables: Record<string, string>; config: BenchmarkConfig;
  signal: AbortSignal; execute: (request: RequestConfig, context: ExecuteContext) => Promise<ExecuteResult>;
  onProgress?: (progress: BenchmarkProgress) => void;
}): Promise<BenchmarkReport> {
  // Snapshot inputs before awaiting so edits cannot alter an in-flight benchmark.
  const requests = structuredClone(options.requests);
  const config = structuredClone(options.config);
  const variables = { ...options.variables };
  validateBenchmarkConfig(config, requests);
  const startedAt = new Date().toISOString();
  const started = performance.now();
  const total = (config.iterations + config.warmup) * requests.length;
  const samples: BenchmarkSample[] = [];
  let stopReason: BenchmarkReport['stopReason'];

  rounds: for (let round = 0; round < config.warmup + config.iterations; round++) {
    const phase = round < config.warmup ? 'warmup' : 'measured';
    const iteration = phase === 'warmup' ? round + 1 : round - config.warmup + 1;
    const chain: Record<string, string> = Object.create(null);
    for (let index = 0; index < requests.length; index++) {
      if (options.signal.aborted) { stopReason = 'aborted'; break rounds; }
      if (samples.length) await delay(config.delayMs, options.signal);
      if (options.signal.aborted) { stopReason = 'aborted'; break rounds; }
      options.onProgress?.({ phase, iteration, requestIndex: index, completed: samples.length, total });
      const requestStarted = performance.now();
      let result: ExecuteResult;
      try {
        result = await options.execute(requests[index], {
          variables, chainVars: { ...chain }, signal: options.signal, requestTimeoutMs: config.timeoutMs,
        });
      } catch (error) { result = executionError(requests[index], error); }
      const time = result.response.httpTimeMs;
      const hasTiming = typeof time === 'number' && Number.isFinite(time) && time >= 0;
      const timingError = result.response.status > 0 && !hasTiming ? 'HTTP latency unavailable. Update the proxy or local agent and retry.' : undefined;
      const sample: BenchmarkSample = {
        requestIndex: index, iteration, phase, outcome: timingError ? 'error' : result.outcome, statusCode: result.response.status,
        httpTimeMs: result.response.status > 0 && hasTiming ? time : null,
        durationMs: performance.now() - requestStarted, tests: [...result.testResults.map(test => ({ ...test })), ...(timingError ? [{ name: 'HTTP latency', passed: false, error: timingError }] : [])],
        ...(result.error || timingError ? { error: result.error || timingError } : {}),
      };
      samples.push(sample);
      Object.assign(chain, result.chainVarUpdates);
      options.onProgress?.({ phase, iteration, requestIndex: index, completed: samples.length, total });
      if (options.signal.aborted) { stopReason = 'aborted'; break rounds; }
      if (config.stopOnFailure && sample.outcome !== 'passed') { stopReason = 'stop-on-failure'; break rounds; }
    }
  }

  const measured = samples.filter(sample => sample.phase === 'measured');
  const warmup = counts(samples.filter(sample => sample.phase === 'warmup'));
  const measuredCounts = counts(measured);
  const grouped = requests.map(() => [] as BenchmarkSample[]);
  for (const sample of measured) grouped[sample.requestIndex].push(sample);
  const requestStats = requests.map((request, index): BenchmarkRequestStats => {
    const requestSamples = grouped[index];
    const count = counts(requestSamples);
    return { index, name: request.name || `Request ${index + 1}`, method: request.method, ...count,
      latency: latencyStats(timings(requestSamples)), failureRate: failureRate(count) };
  });
  const checks = requestStats.flatMap(request => config.thresholds.map((threshold): BenchmarkCheck => {
    const actual = threshold.metric === 'failureRate' ? request.failureRate : request.latency[threshold.metric];
    const complete = request.completed === config.iterations;
    const measuredAllResponses = threshold.metric === 'failureRate' || request.latency.samples === request.completed;
    const passed = complete && measuredAllResponses && actual !== null && (threshold.operator === '<' ? actual < threshold.limit : actual <= threshold.limit);
    const detail = !complete ? 'Measured iterations did not complete' : !measuredAllResponses || actual === null ? 'HTTP latency unavailable for one or more samples' :
      `${threshold.metric} = ${actual.toFixed(2)}${threshold.metric === 'failureRate' ? '%' : 'ms'}; expected ${threshold.expression}`;
    return { requestIndex: request.index, expression: threshold.expression, actual, passed, message: detail };
  }));
  return {
    version: 1, kind: 'benchmark', name: options.name, startedAt, config,
    outcome: stopReason === 'aborted' ? 'aborted' : stopReason || measuredCounts.failed || measuredCounts.errored || warmup.failed || warmup.errored || checks.some(check => !check.passed) ? 'failed' : 'passed',
    ...(stopReason ? { stopReason } : {}),
    summary: { ...measuredCounts, total: config.iterations * requests.length, skipped: config.iterations * requests.length - measured.length,
      durationMs: performance.now() - started, warmup, latency: latencyStats(timings(measured)), failureRate: failureRate(measuredCounts) },
    requests: requestStats, samples, checks,
  };
}
