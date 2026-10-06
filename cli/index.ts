#!/usr/bin/env node
import { mkdir, realpath, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { version } from '../package.json';
import { runCollection } from '../src/utils/collectionRunner';
import { executeRequestWithScripts } from '../src/utils/requestExecutor';
import { removeFilesForRequest } from '../src/utils/fileStore';
import { createRunReporter, serializeRunReport } from '../src/utils/runReport';
import { attachFiles, parseCollection, parseEnvironment, readJson } from './input';
import { createNodeRuntime } from './runtime';

const HELP = `CurlIt ${version} — run API collections in CI/CD

Usage: curlit run COLLECTION.json [options]

  --collection NAME_OR_ID    Select a collection from a multi-collection export
  --env FILE                JSON variable map or CurlIt environment object
  --var KEY=VALUE            Override a variable (repeatable)
  --var-from-env KEY=NAME    Read a variable from a process environment variable
  --bail                    Stop after the first failed or errored request
  --delay MS                Delay between requests (default: 0, maximum: 60000)
  --timeout-request MS      Request timeout, including body download (default: 30000)
  --timeout-script MS       Per-script execution timeout (default: 1000)
  --report-json FILE        Write a JSON run report
  --report-junit FILE       Write a JUnit XML run report
  -h, --help                Show help
  -v, --version             Show version

Exit codes: 0 passed, 1 failed/errored run, 2 input/report error, 130 interrupted.
`;

function milliseconds(value: string | undefined, fallback: number, name: string, min: number, max: number): number {
  if (value === undefined) return fallback;
  const number = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(number) || number < min || number > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return number;
}

function assignment(value: string): [string, string] {
  const equals = value.indexOf('=');
  if (equals < 1) throw new Error('Variable overrides must use KEY=VALUE');
  const key = value.slice(0, equals);
  if (!/^[\w.]+$/.test(key) || key.startsWith('chain.')) throw new Error('Variable names must contain letters, digits, underscores or dots, and cannot start with chain.');
  return [key, value.slice(equals + 1)];
}

// Keep control characters in collection names/assertion text out of CI terminals.
function terminal(value: string): string {
  // eslint-disable-next-line no-control-regex -- Intentionally remove terminal control bytes from CI output.
  return value.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ');
}

async function canonical(path: string): Promise<string> {
  const full = await realpath(path).catch(() => resolve(path));
  return process.platform === 'win32' ? full.toLowerCase() : full;
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const { values, positionals, tokens } = parseArgs({
    args: argv, allowPositionals: true, tokens: true,
    options: {
      help: { type: 'boolean', short: 'h' }, version: { type: 'boolean', short: 'v' },
      collection: { type: 'string' }, env: { type: 'string' },
      var: { type: 'string', multiple: true }, 'var-from-env': { type: 'string', multiple: true },
      bail: { type: 'boolean' }, 'stop-on-failure': { type: 'boolean' }, delay: { type: 'string' },
      'timeout-request': { type: 'string' }, 'timeout-script': { type: 'string' },
      'report-json': { type: 'string' }, 'report-junit': { type: 'string' },
    },
  });
  if (values.help || argv.length === 0) { process.stdout.write(HELP); return 0; }
  if (values.version) { process.stdout.write(`${version}\n`); return 0; }
  if (positionals.length !== 2 || positionals[0] !== 'run') throw new Error('Usage: curlit run COLLECTION.json [options]. See --help.');
  const collectionFile = resolve(positionals[1]);
  const collection = parseCollection(await readJson(collectionFile), values.collection);
  const variables: Record<string, string> = values.env ? parseEnvironment(await readJson(values.env)) : Object.create(null);
  // Apply overrides in command-line order, including mixed literal/env overrides.
  for (const token of tokens) {
    if (token.kind !== 'option' || (token.name !== 'var' && token.name !== 'var-from-env')) continue;
    const [key, value] = assignment(token.value!);
    if (token.name === 'var-from-env') {
      if (process.env[value] === undefined) throw new Error(`Environment variable ${value} is not set`);
      variables[key] = process.env[value]!;
    } else variables[key] = value;
  }
  const delayMs = milliseconds(values.delay, 0, '--delay', 0, 60_000);
  const timeoutMs = milliseconds(values['timeout-request'], 30_000, '--timeout-request', 1, 2_147_483_647);
  const scriptTimeoutMs = milliseconds(values['timeout-script'], 1_000, '--timeout-script', 1, 60_000);
  const reports = [
    ...(values['report-json'] ? [{ format: 'json' as const, file: values['report-json'] }] : []),
    ...(values['report-junit'] ? [{ format: 'junit' as const, file: values['report-junit'] }] : []),
  ];
  for (const name of ['report-json', 'report-junit'] as const) {
    if (values[name] === '') throw new Error(`--${name} requires a file path`);
  }
  const inputs = [collectionFile, ...(values.env ? [values.env] : [])];
  const usedPaths = new Set(await Promise.all(inputs.map(canonical)));
  for (const report of reports) {
    const path = await canonical(report.file);
    if (usedPaths.has(path)) throw new Error('Report files must differ from input files and from each other');
    usedPaths.add(path);
  }

  const controller = new AbortController();
  let interrupted = 0;
  const onInterrupt = () => { interrupted = 130; controller.abort(); };
  const onTerminate = () => { interrupted = 143; controller.abort(); };
  process.once('SIGINT', onInterrupt);
  process.once('SIGTERM', onTerminate);
  const runtime = createNodeRuntime(timeoutMs, scriptTimeoutMs, controller.signal);
  const reporter = createRunReporter(collection);
  const chain: Record<string, string> = Object.create(null);
  process.stdout.write(`Running ${terminal(collection.name)} (${collection.requests.length} requests)\n`);
  try {
    await runCollection({
      requests: collection.requests, variables, signal: controller.signal,
      getChainVars: () => ({ ...chain }), onChainVars: updates => Object.assign(chain, updates),
      stopOnFailure: !!(values.bail || values['stop-on-failure']), delayMs,
      execute: async (request, context) => {
        try {
          await attachFiles(request, collectionFile, variables, context.chainVars);
          return await executeRequestWithScripts(request, context, runtime);
        } finally { removeFilesForRequest(request.id); }
      },
      onEvent(event) {
        reporter.record(event);
        if (event.type === 'request-complete') {
          const result = event.result;
          process.stdout.write(`  ${result.outcome.toUpperCase()} ${terminal(collection.requests[event.index].name)} (${result.response.status}, ${event.durationMs}ms)\n`);
          if (result.error) process.stdout.write(`    ${terminal(result.error)}\n`);
          for (const test of result.testResults.filter(test => !test.passed)) {
            process.stdout.write(`    ${terminal(test.name)}: ${terminal(test.error || 'Assertion failed')}\n`);
          }
        }
        if (event.type === 'request-skipped') process.stdout.write(`  SKIPPED ${terminal(collection.requests[event.index].name)} (${event.reason})\n`);
      },
    });
    const report = reporter.snapshot();
    const summary = report.summary;
    process.stdout.write(`${summary.passed} passed, ${summary.failed} failed, ${summary.errored} errored, ${summary.skipped} skipped (${summary.durationMs}ms)\n`);
    for (const output of reports) {
      await mkdir(dirname(resolve(output.file)), { recursive: true });
      await writeFile(output.file, serializeRunReport(report, output.format), 'utf8');
    }
    return interrupted || (summary.failed || summary.errored || summary.skipped ? 1 : 0);
  } finally {
    process.removeListener('SIGINT', onInterrupt);
    process.removeListener('SIGTERM', onTerminate);
  }
}

main().then(code => { process.exitCode = code; }).catch(error => {
  process.stderr.write(`curlit: ${terminal(error instanceof Error ? error.message : String(error))}\n`);
  process.exitCode = 2;
});
