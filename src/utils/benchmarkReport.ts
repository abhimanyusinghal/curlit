import type { BenchmarkReport } from './benchmark';
import { serializeRunReport, type ReportFormat, type ReportRequest } from './runReport';

export function serializeBenchmarkReport(report: BenchmarkReport, format: ReportFormat): string {
  if (format === 'json') return JSON.stringify(report, null, 2) + '\n';
  const total = (report.config.warmup + report.config.iterations) * report.requests.length;
  const rows: ReportRequest[] = Array.from({ length: total }, (_, index) => {
    const request = report.requests[index % report.requests.length];
    const round = Math.floor(index / report.requests.length);
    const warmup = round < report.config.warmup;
    const iteration = warmup ? round + 1 : round - report.config.warmup + 1;
    const sample = report.samples[index];
    return { index, name: `${warmup ? 'Warm-up' : 'Iteration'} ${iteration}: ${request.name}`, method: request.method,
      outcome: sample?.outcome ?? 'skipped', durationMs: sample?.durationMs ?? 0, tests: sample?.tests ?? [],
      ...(sample ? { statusCode: sample.statusCode, ...(sample.error ? { error: sample.error } : {}) } : { skipReason: report.stopReason || 'not-run' }) };
  });
  for (const check of report.checks) {
    const request = report.requests[check.requestIndex];
    rows.push({ index: rows.length, name: `${check.requestIndex + 1}. ${request.name}: ${check.expression}`, method: request.method,
      outcome: check.passed ? 'passed' : 'failed', durationMs: 0,
      tests: [{ name: check.expression, passed: check.passed, ...(check.passed ? {} : { error: check.message }) }] });
  }
  if (report.outcome === 'aborted') rows.push({ index: rows.length, name: 'Benchmark interrupted', method: 'GET', outcome: 'error', durationMs: 0, tests: [], error: 'Benchmark was cancelled' });
  const skipped = rows.filter(row => row.outcome === 'skipped').length;
  return serializeRunReport({ version: 1, collection: report.name, startedAt: report.startedAt, requests: rows,
    summary: { total: rows.length, completed: rows.length - skipped, skipped, durationMs: report.summary.durationMs,
      passed: rows.filter(row => row.outcome === 'passed').length, failed: rows.filter(row => row.outcome === 'failed').length,
      errored: rows.filter(row => row.outcome === 'error').length } }, 'junit');
}

export function downloadBenchmarkReport(report: BenchmarkReport, format: ReportFormat): void {
  const url = URL.createObjectURL(new Blob([serializeBenchmarkReport(report, format)], { type: format === 'json' ? 'application/json' : 'application/xml' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  const name = report.name.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '') || 'requests';
  anchor.download = `${name}-benchmark.${format === 'json' ? 'json' : 'xml'}`;
  anchor.click();
  URL.revokeObjectURL(url);
}
