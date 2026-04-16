import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeRequestWithScripts } from '../requestExecutor';
import { createDefaultRequest } from '../../types';
import type { ResponseData } from '../../types';

vi.mock('../http', async () => {
  const actual = await vi.importActual<typeof import('../http')>('../http');
  return {
    ...actual,
    sendRequest: vi.fn(),
  };
});

import { sendRequest } from '../http';
const mockSend = vi.mocked(sendRequest);

function okResponse(body = '{}'): ResponseData {
  return {
    status: 200,
    statusText: 'OK',
    headers: { 'content-type': 'application/json' },
    body,
    size: body.length,
    time: 42,
    cookies: [],
  };
}

beforeEach(() => {
  mockSend.mockReset();
});

// ─── Happy path ──────────────────────────────────────────────────────────────

describe('executeRequestWithScripts — happy path', () => {
  it('returns passed outcome with no scripts', async () => {
    mockSend.mockResolvedValueOnce(okResponse());
    const result = await executeRequestWithScripts(
      createDefaultRequest({ url: 'https://api.test/x' }),
      { variables: {}, chainVars: {} },
    );
    expect(result.outcome).toBe('passed');
    expect(result.error).toBeNull();
    expect(result.response.status).toBe(200);
    expect(result.testResults).toEqual([]);
  });

  it('substitutes env variables before sending', async () => {
    mockSend.mockResolvedValueOnce(okResponse());
    await executeRequestWithScripts(
      createDefaultRequest({ url: '{{base}}/items' }),
      { variables: { base: 'https://api.test' }, chainVars: {} },
    );
    expect(mockSend.mock.calls[0][0].url).toBe('https://api.test/items');
  });
});

// ─── Test script outcomes ───────────────────────────────────────────────────

describe('executeRequestWithScripts — test scripts', () => {
  it('reports passed when all tests pass', async () => {
    mockSend.mockResolvedValueOnce(okResponse('{"ok":true}'));
    const result = await executeRequestWithScripts(
      createDefaultRequest({
        url: 'https://api.test/x',
        testScript: 'curlit.test("status is 200", () => { if (curlit.response.status !== 200) throw new Error("nope"); });',
      }),
      { variables: {}, chainVars: {} },
    );
    expect(result.outcome).toBe('passed');
    expect(result.testResults).toHaveLength(1);
    expect(result.testResults[0].passed).toBe(true);
  });

  it('reports failed when any test assertion fails', async () => {
    mockSend.mockResolvedValueOnce(okResponse('{"ok":true}'));
    const result = await executeRequestWithScripts(
      createDefaultRequest({
        url: 'https://api.test/x',
        testScript: `
          curlit.test("a passes", () => {});
          curlit.test("b fails", () => { throw new Error("boom"); });
        `,
      }),
      { variables: {}, chainVars: {} },
    );
    expect(result.outcome).toBe('failed');
    expect(result.error).toBeNull();
    expect(result.testResults).toHaveLength(2);
    expect(result.testResults[0].passed).toBe(true);
    expect(result.testResults[1].passed).toBe(false);
  });

  it('does NOT flag 4xx/5xx as failure on its own (tests are authoritative)', async () => {
    mockSend.mockResolvedValueOnce({ ...okResponse(), status: 500, statusText: 'Internal Server Error' });
    const result = await executeRequestWithScripts(
      createDefaultRequest({ url: 'https://api.test/x' }),
      { variables: {}, chainVars: {} },
    );
    expect(result.outcome).toBe('passed'); // no tests, no assertions = no failure
  });
});

// ─── Chain variables ─────────────────────────────────────────────────────────

describe('executeRequestWithScripts — chain variables', () => {
  it('collects chain var updates from the test script', async () => {
    mockSend.mockResolvedValueOnce(okResponse('{"token":"abc"}'));
    const result = await executeRequestWithScripts(
      createDefaultRequest({
        url: 'https://api.test/login',
        testScript: 'curlit.chain.authToken = JSON.parse(curlit.response.body).token;',
      }),
      { variables: {}, chainVars: {} },
    );
    expect(result.chainVarUpdates.authToken).toBe('abc');
  });

  it('passes incoming chain vars to pre-request and test scripts', async () => {
    mockSend.mockResolvedValueOnce(okResponse());
    const result = await executeRequestWithScripts(
      createDefaultRequest({
        url: 'https://api.test/x',
        preRequestScript: 'curlit.request.headers["X-Saw"] = curlit.chain.existing;',
      }),
      { variables: {}, chainVars: { existing: 'hello' } },
    );
    expect(result.outcome).toBe('passed');
    // Header was applied before send
    const call = mockSend.mock.calls[0][0];
    const sawHeader = call.headers.find(h => h.key === 'X-Saw');
    expect(sawHeader?.value).toBe('hello');
  });
});

// ─── Error paths ─────────────────────────────────────────────────────────────

describe('executeRequestWithScripts — error paths', () => {
  it('returns error outcome on pre-request script error and does NOT send', async () => {
    const result = await executeRequestWithScripts(
      createDefaultRequest({
        url: 'https://api.test/x',
        preRequestScript: 'throw new Error("bad setup");',
      }),
      { variables: {}, chainVars: {} },
    );
    expect(result.outcome).toBe('error');
    expect(result.error).toMatch(/bad setup/);
    expect(mockSend).not.toHaveBeenCalled();
    expect(result.response.status).toBe(0);
    expect(result.response.statusText).toBe('Script Error');
  });

  it('returns error outcome on network failure', async () => {
    mockSend.mockRejectedValueOnce(new Error('Failed to fetch'));
    const result = await executeRequestWithScripts(
      createDefaultRequest({ url: 'https://api.test/x' }),
      { variables: {}, chainVars: {} },
    );
    expect(result.outcome).toBe('error');
    expect(result.error).toBe('Failed to fetch');
    expect(result.response.status).toBe(0);
    expect(result.response.body).toContain('proxy server');
  });

  it('surfaces generic network error messages in the response body', async () => {
    mockSend.mockRejectedValueOnce(new Error('Gateway timeout'));
    const result = await executeRequestWithScripts(
      createDefaultRequest({ url: 'https://api.test/x' }),
      { variables: {}, chainVars: {} },
    );
    expect(result.response.body).toBe('Gateway timeout');
  });
});

// ─── Logs ────────────────────────────────────────────────────────────────────

describe('executeRequestWithScripts — logs', () => {
  it('accumulates logs from pre-request and test scripts in order', async () => {
    mockSend.mockResolvedValueOnce(okResponse());
    const result = await executeRequestWithScripts(
      createDefaultRequest({
        url: 'https://api.test/x',
        preRequestScript: 'console.log("pre");',
        testScript: 'console.log("post");',
      }),
      { variables: {}, chainVars: {} },
    );
    const messages = result.logs.map(l => l.args[0]);
    expect(messages).toEqual(['pre', 'post']);
  });
});
