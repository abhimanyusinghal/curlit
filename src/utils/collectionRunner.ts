import type { RequestConfig } from '../types';
import { executeRequestWithScripts, type ExecuteResult } from './requestExecutor';

export interface RunnerSummary {
  total: number;
  completed: number;
  passed: number;
  failed: number;
  errored: number;
  durationMs: number;
}

export type RunnerEvent =
  | { type: 'start'; total: number }
  | { type: 'request-start'; index: number }
  | { type: 'request-complete'; index: number; result: ExecuteResult; durationMs: number }
  | { type: 'request-skipped'; index: number; reason: 'aborted' | 'stop-on-failure' }
  | { type: 'done'; summary: RunnerSummary };

export interface RunnerOptions {
  requests: RequestConfig[];
  /** Env vars for variable substitution — captured once at run start. */
  variables: Record<string, string>;
  /** Live read of chain vars — called before each request so prior updates flow. */
  getChainVars: () => Record<string, string>;
  /** Called after each request with the chain var updates to merge into the store. */
  onChainVars: (updates: Record<string, string>) => void;
  stopOnFailure: boolean;
  delayMs: number;
  signal: AbortSignal;
  onEvent: (event: RunnerEvent) => void;
}

/**
 * Cancellable sleep that resolves early when the signal aborts (so Stop is snappy).
 */
function sleep(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0 || signal.aborted) return Promise.resolve();
  return new Promise(resolve => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Drive a sequential run over a collection's requests. Emits events so the UI
 * can render row state; no store writes happen here — the caller wires chain
 * variable updates through the store via `onChainVars`.
 */
export async function runCollection(options: RunnerOptions): Promise<void> {
  const { requests, variables, getChainVars, onChainVars, stopOnFailure, delayMs, signal, onEvent } = options;
  const startedAt = Date.now();
  const summary: RunnerSummary = {
    total: requests.length,
    completed: 0,
    passed: 0,
    failed: 0,
    errored: 0,
    durationMs: 0,
  };

  onEvent({ type: 'start', total: requests.length });

  let shouldSkipRest: 'aborted' | 'stop-on-failure' | null = null;

  for (let i = 0; i < requests.length; i++) {
    if (signal.aborted) shouldSkipRest = 'aborted';

    if (shouldSkipRest) {
      onEvent({ type: 'request-skipped', index: i, reason: shouldSkipRest });
      continue;
    }

    onEvent({ type: 'request-start', index: i });
    const reqStartedAt = Date.now();

    const result = await executeRequestWithScripts(requests[i], {
      variables,
      chainVars: getChainVars(),
    });

    const durationMs = Date.now() - reqStartedAt;
    summary.completed++;
    if (result.outcome === 'passed') summary.passed++;
    else if (result.outcome === 'failed') summary.failed++;
    else summary.errored++;

    if (Object.keys(result.chainVarUpdates).length > 0) {
      onChainVars(result.chainVarUpdates);
    }

    onEvent({ type: 'request-complete', index: i, result, durationMs });

    if (signal.aborted) {
      shouldSkipRest = 'aborted';
      continue;
    }

    if (stopOnFailure && result.outcome !== 'passed') {
      shouldSkipRest = 'stop-on-failure';
      continue;
    }

    if (i < requests.length - 1 && delayMs > 0) {
      await sleep(delayMs, signal);
      if (signal.aborted) shouldSkipRest = 'aborted';
    }
  }

  summary.durationMs = Date.now() - startedAt;
  onEvent({ type: 'done', summary });
}
