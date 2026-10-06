import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { validateResponseSchemaInBrowser } from '../responseSchema.browser';

class FakeWorker {
  static latest: FakeWorker;
  onmessage?: (event: { data: unknown }) => void;
  onerror?: () => void;
  onmessageerror?: () => void;
  postMessage = vi.fn();
  terminate = vi.fn();
  constructor() { FakeWorker.latest = this; }
  ready() { this.onmessage?.({ data: { type: 'ready' } }); }
}
beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal('Worker', FakeWorker); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('browser schema worker lifecycle', () => {
  it('waits for loading before sending the response and terminates after a result', async () => {
    const pending = validateResponseSchemaInBrowser('{}', '{}');
    const worker = FakeWorker.latest;
    vi.advanceTimersByTime(3_000);
    expect(worker.postMessage).not.toHaveBeenCalled();
    worker.ready();
    expect(worker.postMessage).toHaveBeenCalledWith({ schema: '{}', body: '{}' });
    const result = { outcome: 'passed', tests: [{ name: 'Response schema', passed: true }] };
    worker.onmessage?.({ data: { type: 'result', result } });
    expect(await pending).toEqual(result);
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('terminates validation that exceeds its time budget', async () => {
    const pending = validateResponseSchemaInBrowser('{}', '{}');
    FakeWorker.latest.ready();
    vi.advanceTimersByTime(2_000);
    expect(await pending).toMatchObject({ outcome: 'error', error: expect.stringContaining('exceeded 2000ms') });
    expect(FakeWorker.latest.terminate).toHaveBeenCalledOnce();
  });

  it('cancels an in-flight worker', async () => {
    const controller = new AbortController();
    const pending = validateResponseSchemaInBrowser('{}', '{}', controller.signal);
    controller.abort();
    expect(await pending).toMatchObject({ outcome: 'error', error: expect.stringContaining('interrupted') });
    expect(FakeWorker.latest.terminate).toHaveBeenCalledOnce();
  });
});
