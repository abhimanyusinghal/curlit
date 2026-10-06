import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeRequestWithScripts } from '../requestExecutor';
import { createDefaultRequest } from '../../types';
import type { ResponseData } from '../../types';
import { validateResponseSchema } from '../responseSchema';
import { runPreRequestScript, runTestScript } from '../scriptEngine';

vi.mock('../http', async () => {
  const actual = await vi.importActual<typeof import('../http')>('../http');
  return {
    ...actual,
    sendRequest: vi.fn(),
  };
});

import { sendRequest } from '../http';
const mockSend = vi.mocked(sendRequest);

const schemaRuntime = {
  sendRequest: mockSend, runPreRequestScript, runTestScript,
  validateResponseSchema: async (schema: string, body: string) => validateResponseSchema(schema, body),
};

describe('response schemas in shared request execution', () => {
  const config = { enabled: true, schema: '{"type":"object","required":["id"],"properties":{"id":{"type":"integer"}}}' };

  it('cannot be overridden by a passing test script and preserves the response', async () => {
    mockSend.mockResolvedValueOnce(okResponse('{"id":"123"}'));
    const result = await executeRequestWithScripts(createDefaultRequest({ responseSchema: config, testScript: 'test("status", () => expect(response.status).toBe(200));' }), { variables: {}, chainVars: {} }, schemaRuntime);
    expect(result.outcome).toBe('failed');
    expect(result.response.body).toBe('{"id":"123"}');
    expect(result.testResults).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'Response schema: /id', passed: false }), expect.objectContaining({ name: 'status', passed: true })]));
  });

  it('does not let a valid schema bypass HTTP failures without a test script', async () => {
    mockSend.mockResolvedValueOnce({ ...okResponse('{"id":1}'), status: 500 });
    const result = await executeRequestWithScripts(createDefaultRequest({ responseSchema: config }), { variables: {}, chainVars: {} }, schemaRuntime);
    expect(result.outcome).toBe('failed');
    expect(result.testResults[0].passed).toBe(true);
  });

  it('retains schema failures when a test script throws', async () => {
    mockSend.mockResolvedValueOnce(okResponse('{}'));
    const result = await executeRequestWithScripts(createDefaultRequest({ responseSchema: config, testScript: 'throw new Error("script error");' }), { variables: {}, chainVars: {} }, schemaRuntime);
    expect(result.outcome).toBe('error');
    expect(result.testResults.map(test => test.name)).toEqual(['Response schema: /id', 'Test script']);
  });

  it('marks invalid enabled schemas as errors but ignores disabled schemas', async () => {
    mockSend.mockResolvedValue(okResponse());
    for (const enabled of [true, false]) {
      const result = await executeRequestWithScripts(createDefaultRequest({ responseSchema: { enabled, schema: '{' } }), { variables: {}, chainVars: {} }, schemaRuntime);
      expect(result.outcome).toBe(enabled ? 'error' : 'passed');
      expect(result.response.status).toBe(200);
      expect(result.testResults).toHaveLength(enabled ? 1 : 0);
    }
  });

  it('turns worker timeouts into errored reportable assertions', async () => {
    mockSend.mockResolvedValueOnce(okResponse());
    const result = await executeRequestWithScripts(createDefaultRequest({ responseSchema: config }), { variables: {}, chainVars: {} }, {
      ...schemaRuntime, validateResponseSchema: async () => { throw new Error('Validation exceeded 2000ms'); },
    });
    expect(result).toMatchObject({ outcome: 'error', error: 'Validation exceeded 2000ms', response: { status: 200 } });
    expect(result.testResults[0].passed).toBe(false);
  });
});

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
  it.each([
    'throw new Error("script failed");',
    'curlit.test("passes", () => {}); throw new Error("script failed");',
  ])('treats an unhandled test-script exception as an error: %s', async testScript => {
    mockSend.mockResolvedValueOnce(okResponse());
    const result = await executeRequestWithScripts(createDefaultRequest({ url: 'https://api.test/x', testScript }), { variables: {}, chainVars: {} });
    expect(result.outcome).toBe('error');
    expect(result.error).toBe('script failed');
    expect(result.response.status).toBe(200);
    expect(result.testResults.at(-1)).toMatchObject({ name: 'Test script', passed: false, error: 'script failed' });
  });

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

  it('flags 5xx as failed when no test script is defined', async () => {
    mockSend.mockResolvedValueOnce({ ...okResponse(), status: 500, statusText: 'Internal Server Error' });
    const result = await executeRequestWithScripts(
      createDefaultRequest({ url: 'https://api.test/x' }),
      { variables: {}, chainVars: {} },
    );
    expect(result.outcome).toBe('failed');
  });

  it('flags 4xx as failed when no test script is defined', async () => {
    mockSend.mockResolvedValueOnce({ ...okResponse(), status: 404, statusText: 'Not Found' });
    const result = await executeRequestWithScripts(
      createDefaultRequest({ url: 'https://api.test/x' }),
      { variables: {}, chainVars: {} },
    );
    expect(result.outcome).toBe('failed');
  });

  it('lets a test script override status-based failure (user expects the 404)', async () => {
    mockSend.mockResolvedValueOnce({ ...okResponse(), status: 404, statusText: 'Not Found' });
    const result = await executeRequestWithScripts(
      createDefaultRequest({
        url: 'https://api.test/x',
        testScript: 'curlit.test("404 is expected", () => { if (curlit.response.status !== 404) throw new Error("nope"); });',
      }),
      { variables: {}, chainVars: {} },
    );
    expect(result.outcome).toBe('passed');
  });

  it('still treats 3xx as passed (not a failure)', async () => {
    mockSend.mockResolvedValueOnce({ ...okResponse(), status: 301, statusText: 'Moved Permanently' });
    const result = await executeRequestWithScripts(
      createDefaultRequest({ url: 'https://api.test/x' }),
      { variables: {}, chainVars: {} },
    );
    expect(result.outcome).toBe('passed');
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

  it('treats a status-0 response from the proxy as an error (e.g. SSL or target-unreachable)', async () => {
    mockSend.mockResolvedValueOnce({
      status: 0,
      statusText: 'Error',
      headers: {},
      body: 'unable to verify the first certificate',
      size: 0,
      time: 14,
      cookies: [],
    });
    const result = await executeRequestWithScripts(
      createDefaultRequest({ url: 'https://untrusted.test/x' }),
      { variables: {}, chainVars: {} },
    );
    expect(result.outcome).toBe('error');
    expect(result.error).toContain('unable to verify');
  });

  it('does NOT run test scripts when status is 0', async () => {
    mockSend.mockResolvedValueOnce({
      status: 0, statusText: 'Error', headers: {}, body: 'boom', size: 0, time: 5, cookies: [],
    });
    const result = await executeRequestWithScripts(
      createDefaultRequest({
        url: 'https://api.test/x',
        testScript: 'curlit.test("should not run", () => {});',
      }),
      { variables: {}, chainVars: {} },
    );
    expect(result.testResults).toEqual([]);
    expect(result.outcome).toBe('error');
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
