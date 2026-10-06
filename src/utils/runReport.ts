import type { Collection, HttpMethod, TestResult } from '../types';
import type { RunnerEvent, RunnerSummary } from './collectionRunner';

export interface ReportRequest {
  index: number;
  name: string;
  method: HttpMethod;
  outcome: 'passed' | 'failed' | 'error' | 'skipped';
  durationMs: number;
  statusCode?: number;
  tests: TestResult[];
  error?: string;
  skipReason?: string;
}

export interface RunReport {
  version: 1;
  collection: string;
  startedAt: string;
  summary: RunnerSummary & { skipped: number };
  requests: ReportRequest[];
}

/** Store report metadata only: no request credentials, response bodies or logs. */
export function createRunReporter(collection: Pick<Collection, 'name' | 'requests'>) {
  const report: RunReport = {
    version: 1,
    collection: collection.name,
    startedAt: new Date().toISOString(),
    summary: { total: collection.requests.length, completed: 0, passed: 0, failed: 0, errored: 0, skipped: 0, durationMs: 0 },
    requests: collection.requests.map((request, index) => ({
      index, name: request.name || `Request ${index + 1}`, method: request.method,
      outcome: 'skipped', durationMs: 0, tests: [], skipReason: 'not-run',
    })),
  };

  return {
    record(event: RunnerEvent) {
      if (event.type === 'start') report.startedAt = new Date().toISOString();
      if (event.type === 'request-complete') {
        const row = report.requests[event.index];
        row.outcome = event.result.outcome;
        row.durationMs = event.durationMs;
        row.statusCode = event.result.response.status;
        row.tests = event.result.testResults.map(test => ({ ...test }));
        if (event.result.error) row.error = event.result.error;
        delete row.skipReason;
      }
      if (event.type === 'request-skipped') report.requests[event.index].skipReason = event.reason;
      if (event.type === 'done') {
        report.summary = { ...event.summary, skipped: event.summary.total - event.summary.completed };
      }
    },
    snapshot(): RunReport { return structuredClone(report); },
  };
}

// XML 1.0 excludes most control characters and unpaired UTF-16 surrogates.
function xml(value: string): string {
  return Array.from(value)
    .filter(char => {
      const code = char.codePointAt(0)!;
      return code === 9 || code === 10 || code === 13 ||
        (code >= 0x20 && code <= 0xd7ff) || (code >= 0xe000 && code <= 0xfffd) || code >= 0x10000;
    })
    .join('')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

export type ReportFormat = 'json' | 'junit';

export function serializeRunReport(report: RunReport, format: ReportFormat): string {
  if (format === 'json') return JSON.stringify(report, null, 2) + '\n';
  const counts = { failed: 0, error: 0, skipped: 0 };
  for (const row of report.requests) if (row.outcome !== 'passed') counts[row.outcome]++;
  const cases = report.requests.map(row => {
    let detail = '';
    if (row.outcome === 'skipped') detail = `<skipped message="${xml(row.skipReason || 'not-run')}"/>`;
    if (row.outcome === 'failed' || row.outcome === 'error') {
      const tag = row.outcome === 'failed' ? 'failure' : 'error';
      const message = row.error || row.tests.filter(test => !test.passed)
        .map(test => `${test.name}: ${test.error || 'Assertion failed'}`).join('\n') || `HTTP ${row.statusCode}`;
      detail = `<${tag} message="${xml(message)}">${xml(message)}</${tag}>`;
    }
    return `    <testcase classname="${xml(report.collection)}" name="${row.index + 1}. ${xml(row.name)}" time="${row.durationMs / 1000}">${detail}</testcase>`;
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<testsuites>',
    `  <testsuite name="${xml(report.collection)}" tests="${report.requests.length}" failures="${counts.failed}" errors="${counts.error}" skipped="${counts.skipped}" time="${report.summary.durationMs / 1000}" timestamp="${xml(report.startedAt)}">`,
    ...cases,
    '  </testsuite>',
    '</testsuites>',
    '',
  ].join('\n');
}

export function downloadRunReport(report: RunReport, format: ReportFormat): void {
  const contents = serializeRunReport(report, format);
  const url = URL.createObjectURL(new Blob([contents], { type: format === 'json' ? 'application/json' : 'application/xml' }));
  const anchor = document.createElement('a');
  const name = report.collection.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '') || 'collection';
  anchor.href = url;
  anchor.download = `${name}-report.${format === 'json' ? 'json' : 'xml'}`;
  anchor.click();
  URL.revokeObjectURL(url);
}
