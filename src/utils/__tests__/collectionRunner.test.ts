import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runCollection, type RunnerEvent } from '../collectionRunner';
import { createDefaultRequest } from '../../types';
import type { ExecuteResult } from '../requestExecutor';
import type { ResponseData } from '../../types';

vi.mock('../requestExecutor', () => ({
  executeRequestWithScripts: vi.fn(),
}));

import { executeRequestWithScripts } from '../requestExecutor';
const mockExec = vi.mocked(executeRequestWithScripts);

function okResult(overrides: Partial<ExecuteResult> = {}): ExecuteResult {
  const response: ResponseData = {
    status: 200,
    statusText: 'OK',
    headers: {},
    body: '{}',
    size: 2,
    time: 10,
    cookies: [],
  };
  return {
    resolvedRequest: createDefaultRequest(),
    response,
    testResults: [],
    chainVarUpdates: {},
    logs: [],
    error: null,
    outcome: 'passed',
    ...overrides,
  };
}

function collect(requests = 3) {
  return Array.from({ length: requests }, (_, i) =>
    createDefaultRequest({ name: `req-${i}`, url: `https://api.test/${i}` })
  );
}

beforeEach(() => {
  mockExec.mockReset();
});

// ─── Empty collection ────────────────────────────────────────────────────────

describe('runCollection — empty', () => {
  it('emits start + done only, zero totals', async () => {
    const events: RunnerEvent[] = [];
    await runCollection({
      requests: [],
      variables: {},
      getChainVars: () => ({}),
      onChainVars: () => {},
      stopOnFailure: false,
      delayMs: 0,
      signal: new AbortController().signal,
      onEvent: e => events.push(e),
    });
    expect(events[0]).toEqual({ type: 'start', total: 0 });
    expect(events[events.length - 1].type).toBe('done');
    const done = events.at(-1) as Extract<RunnerEvent, { type: 'done' }>;
    expect(done.summary.total).toBe(0);
    expect(done.summary.completed).toBe(0);
  });
});

// ─── Happy path ──────────────────────────────────────────────────────────────

describe('runCollection — happy path', () => {
  it('emits start + per-request start/complete + done for all passing', async () => {
    mockExec.mockResolvedValue(okResult());
    const events: RunnerEvent[] = [];
    await runCollection({
      requests: collect(3),
      variables: {},
      getChainVars: () => ({}),
      onChainVars: () => {},
      stopOnFailure: false,
      delayMs: 0,
      signal: new AbortController().signal,
      onEvent: e => events.push(e),
    });

    const types = events.map(e => e.type);
    expect(types).toEqual([
      'start',
      'request-start', 'request-complete',
      'request-start', 'request-complete',
      'request-start', 'request-complete',
      'done',
    ]);
    const done = events.at(-1) as Extract<RunnerEvent, { type: 'done' }>;
    expect(done.summary).toMatchObject({ total: 3, completed: 3, passed: 3, failed: 0, errored: 0 });
  });
});

// ─── Outcome counting ───────────────────────────────────────────────────────

describe('runCollection — outcome counting', () => {
  it('tallies passed/failed/errored correctly', async () => {
    mockExec
      .mockResolvedValueOnce(okResult({ outcome: 'passed' }))
      .mockResolvedValueOnce(okResult({ outcome: 'failed' }))
      .mockResolvedValueOnce(okResult({ outcome: 'error' }));

    const events: RunnerEvent[] = [];
    await runCollection({
      requests: collect(3),
      variables: {},
      getChainVars: () => ({}),
      onChainVars: () => {},
      stopOnFailure: false,
      delayMs: 0,
      signal: new AbortController().signal,
      onEvent: e => events.push(e),
    });

    const done = events.at(-1) as Extract<RunnerEvent, { type: 'done' }>;
    expect(done.summary).toMatchObject({ passed: 1, failed: 1, errored: 1, completed: 3 });
  });
});

// ─── Stop on failure ────────────────────────────────────────────────────────

describe('runCollection — stopOnFailure', () => {
  it('skips the rest after a failure when enabled', async () => {
    mockExec
      .mockResolvedValueOnce(okResult({ outcome: 'passed' }))
      .mockResolvedValueOnce(okResult({ outcome: 'failed' }));

    const events: RunnerEvent[] = [];
    await runCollection({
      requests: collect(3),
      variables: {},
      getChainVars: () => ({}),
      onChainVars: () => {},
      stopOnFailure: true,
      delayMs: 0,
      signal: new AbortController().signal,
      onEvent: e => events.push(e),
    });

    // Only two executes ran; the 3rd became a skip event
    expect(mockExec).toHaveBeenCalledTimes(2);
    const skip = events.find(e => e.type === 'request-skipped');
    expect(skip).toEqual({ type: 'request-skipped', index: 2, reason: 'stop-on-failure' });
  });

  it('skips the rest after an error when enabled', async () => {
    mockExec
      .mockResolvedValueOnce(okResult({ outcome: 'error' }))
      .mockResolvedValueOnce(okResult()); // should never be reached

    const events: RunnerEvent[] = [];
    await runCollection({
      requests: collect(2),
      variables: {},
      getChainVars: () => ({}),
      onChainVars: () => {},
      stopOnFailure: true,
      delayMs: 0,
      signal: new AbortController().signal,
      onEvent: e => events.push(e),
    });
    expect(mockExec).toHaveBeenCalledTimes(1);
    expect(events.some(e => e.type === 'request-skipped' && e.reason === 'stop-on-failure')).toBe(true);
  });

  it('does NOT stop when disabled (default)', async () => {
    mockExec
      .mockResolvedValueOnce(okResult({ outcome: 'failed' }))
      .mockResolvedValueOnce(okResult({ outcome: 'passed' }));

    await runCollection({
      requests: collect(2),
      variables: {},
      getChainVars: () => ({}),
      onChainVars: () => {},
      stopOnFailure: false,
      delayMs: 0,
      signal: new AbortController().signal,
      onEvent: () => {},
    });
    expect(mockExec).toHaveBeenCalledTimes(2);
  });
});

// ─── Abort ──────────────────────────────────────────────────────────────────

describe('runCollection — abort', () => {
  it('skips remaining requests after the signal aborts', async () => {
    const controller = new AbortController();
    mockExec
      .mockResolvedValueOnce(okResult())
      .mockImplementationOnce(async () => {
        controller.abort();
        return okResult();
      });

    const events: RunnerEvent[] = [];
    await runCollection({
      requests: collect(4),
      variables: {},
      getChainVars: () => ({}),
      onChainVars: () => {},
      stopOnFailure: false,
      delayMs: 0,
      signal: controller.signal,
      onEvent: e => events.push(e),
    });

    // Only 2 ran; 2 and 3 are skipped with 'aborted'
    expect(mockExec).toHaveBeenCalledTimes(2);
    const skips = events.filter(e => e.type === 'request-skipped');
    expect(skips).toHaveLength(2);
    expect(skips.every(s => s.type === 'request-skipped' && s.reason === 'aborted')).toBe(true);
  });
});

// ─── Chain variables ────────────────────────────────────────────────────────

describe('runCollection — chain variables', () => {
  it('reads fresh chain vars before each request and pipes updates back', async () => {
    const chainStore: Record<string, string> = {};
    const seenChains: Record<string, string>[] = [];

    mockExec.mockImplementation(async (_req, ctx) => {
      seenChains.push({ ...ctx.chainVars });
      return okResult({ chainVarUpdates: { counter: String(seenChains.length) } });
    });

    await runCollection({
      requests: collect(3),
      variables: {},
      getChainVars: () => ({ ...chainStore }),
      onChainVars: updates => Object.assign(chainStore, updates),
      stopOnFailure: false,
      delayMs: 0,
      signal: new AbortController().signal,
      onEvent: () => {},
    });

    // Each execution saw the chain state from the prior one's update
    expect(seenChains[0]).toEqual({});
    expect(seenChains[1]).toEqual({ counter: '1' });
    expect(seenChains[2]).toEqual({ counter: '2' });
    expect(chainStore).toEqual({ counter: '3' });
  });

  it('does not call onChainVars when there are no updates', async () => {
    mockExec.mockResolvedValue(okResult({ chainVarUpdates: {} }));
    const onChainVars = vi.fn();
    await runCollection({
      requests: collect(2),
      variables: {},
      getChainVars: () => ({}),
      onChainVars,
      stopOnFailure: false,
      delayMs: 0,
      signal: new AbortController().signal,
      onEvent: () => {},
    });
    expect(onChainVars).not.toHaveBeenCalled();
  });
});

// ─── Delay ──────────────────────────────────────────────────────────────────

describe('runCollection — delay', () => {
  it('waits delayMs between successful requests', async () => {
    vi.useFakeTimers();
    mockExec.mockResolvedValue(okResult());
    const completedAt: number[] = [];
    mockExec.mockImplementation(async () => {
      completedAt.push(Date.now());
      return okResult();
    });

    const run = runCollection({
      requests: collect(2),
      variables: {},
      getChainVars: () => ({}),
      onChainVars: () => {},
      stopOnFailure: false,
      delayMs: 500,
      signal: new AbortController().signal,
      onEvent: () => {},
    });

    // Let the first execute run to completion, then advance past the delay
    await vi.runAllTimersAsync();
    await run;

    expect(completedAt[1] - completedAt[0]).toBeGreaterThanOrEqual(500);
    vi.useRealTimers();
  });

  it('does not delay after the final request', async () => {
    mockExec.mockResolvedValue(okResult());
    const start = Date.now();
    await runCollection({
      requests: collect(1),
      variables: {},
      getChainVars: () => ({}),
      onChainVars: () => {},
      stopOnFailure: false,
      delayMs: 10_000, // if this were applied, the test would time out
      signal: new AbortController().signal,
      onEvent: () => {},
    });
    expect(Date.now() - start).toBeLessThan(1_000);
  });
});
