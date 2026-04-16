import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createGist,
  fetchSyncStatus,
  getAuthenticatedUser,
  getGist,
  listGists,
  pollDeviceToken,
  readGistFile,
  requestDeviceCode,
  updateGist,
} from '../github';

const originalFetch = global.fetch;

function mockFetchOnce(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  const { ok = true, status = 200 } = init;
  global.fetch = vi.fn().mockResolvedValueOnce({
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  } as unknown as Response);
}

beforeEach(() => {
  global.fetch = originalFetch;
});

afterEach(() => {
  global.fetch = originalFetch;
});

// ─── fetchSyncStatus ─────────────────────────────────────────────────────────

describe('fetchSyncStatus', () => {
  it('returns configured true when the proxy reports so', async () => {
    mockFetchOnce({ configured: true });
    const result = await fetchSyncStatus();
    expect(result.configured).toBe(true);
  });

  it('returns configured false on network failure', async () => {
    mockFetchOnce({ configured: false }, { ok: false, status: 500 });
    const result = await fetchSyncStatus();
    expect(result.configured).toBe(false);
  });
});

// ─── requestDeviceCode ───────────────────────────────────────────────────────

describe('requestDeviceCode', () => {
  it('normalizes GitHub snake_case fields to camelCase', async () => {
    mockFetchOnce({
      device_code: 'abc',
      user_code: 'WXYZ-1234',
      verification_uri: 'https://github.com/login/device',
      expires_in: 900,
      interval: 5,
    });
    const code = await requestDeviceCode();
    expect(code.deviceCode).toBe('abc');
    expect(code.userCode).toBe('WXYZ-1234');
    expect(code.verificationUri).toBe('https://github.com/login/device');
    expect(code.expiresIn).toBe(900);
    expect(code.interval).toBe(5);
  });

  it('defaults interval to 5 and expiresIn to 900 when missing', async () => {
    mockFetchOnce({
      device_code: 'abc',
      user_code: 'WXYZ',
      verification_uri: 'https://github.com/login/device',
    });
    const code = await requestDeviceCode();
    expect(code.interval).toBe(5);
    expect(code.expiresIn).toBe(900);
  });

  it('throws when the server signals not-configured', async () => {
    mockFetchOnce({ error: 'GITHUB_CLIENT_ID not configured on server' }, { ok: false, status: 501 });
    await expect(requestDeviceCode()).rejects.toThrow(/not configured/);
  });
});

// ─── pollDeviceToken ─────────────────────────────────────────────────────────

describe('pollDeviceToken', () => {
  it('returns ok with access token on success', async () => {
    mockFetchOnce({ access_token: 'ghs_xyz', token_type: 'bearer', scope: 'gist' });
    const result = await pollDeviceToken('dc');
    expect(result.status).toBe('ok');
    if (result.status === 'ok') expect(result.accessToken).toBe('ghs_xyz');
  });

  it('maps authorization_pending to pending', async () => {
    mockFetchOnce({ error: 'authorization_pending' });
    expect((await pollDeviceToken('dc')).status).toBe('pending');
  });

  it('maps slow_down with interval hint', async () => {
    mockFetchOnce({ error: 'slow_down', interval: 10 });
    const result = await pollDeviceToken('dc');
    expect(result.status).toBe('slow_down');
    if (result.status === 'slow_down') expect(result.intervalHint).toBe(10);
  });

  it('maps expired_token to expired', async () => {
    mockFetchOnce({ error: 'expired_token' });
    expect((await pollDeviceToken('dc')).status).toBe('expired');
  });

  it('maps access_denied to denied', async () => {
    mockFetchOnce({ error: 'access_denied' });
    expect((await pollDeviceToken('dc')).status).toBe('denied');
  });

  it('maps unknown error with description to error', async () => {
    mockFetchOnce({ error: 'server_error', error_description: 'Something broke' });
    const result = await pollDeviceToken('dc');
    expect(result.status).toBe('error');
    if (result.status === 'error') expect(result.message).toBe('Something broke');
  });
});

// ─── Gist API ────────────────────────────────────────────────────────────────

describe('Gist API', () => {
  it('getAuthenticatedUser returns login', async () => {
    mockFetchOnce({ login: 'octocat', id: 1 });
    expect(await getAuthenticatedUser('t')).toEqual({ login: 'octocat', id: 1 });
  });

  it('listGists returns array', async () => {
    mockFetchOnce([
      { id: 'g1', description: 'x', files: {}, updated_at: '2025-01-01T00:00:00Z' },
    ]);
    const gists = await listGists('t');
    expect(gists).toHaveLength(1);
    expect(gists[0].id).toBe('g1');
  });

  it('getGist sends Authorization header with Bearer token', async () => {
    let captured: RequestInit | undefined;
    global.fetch = vi.fn().mockImplementationOnce(async (_url, init?: RequestInit) => {
      captured = init;
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: 'g1', description: null, files: {}, updated_at: '' }),
        text: async () => '',
      } as unknown as Response;
    });
    await getGist('my-token', 'g1');
    const headers = captured?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer my-token');
    expect(headers.Accept).toContain('application/vnd.github');
  });

  it('createGist POSTs with expected body shape', async () => {
    let captured: RequestInit | undefined;
    global.fetch = vi.fn().mockImplementationOnce(async (_url, init?: RequestInit) => {
      captured = init;
      return {
        ok: true,
        status: 201,
        json: async () => ({ id: 'new', description: 'desc', files: {}, updated_at: '' }),
        text: async () => '',
      } as unknown as Response;
    });
    await createGist('t', 'curlit-sync.json', '{"hello":1}', 'CurlIt sync', false);
    expect(captured?.method).toBe('POST');
    const body = JSON.parse(captured?.body as string);
    expect(body.description).toBe('CurlIt sync');
    expect(body.public).toBe(false);
    expect(body.files['curlit-sync.json'].content).toBe('{"hello":1}');
  });

  it('updateGist PATCHes with file contents only', async () => {
    let captured: RequestInit | undefined;
    global.fetch = vi.fn().mockImplementationOnce(async (_url, init?: RequestInit) => {
      captured = init;
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: 'g1', description: null, files: {}, updated_at: '' }),
        text: async () => '',
      } as unknown as Response;
    });
    await updateGist('t', 'g1', 'curlit-sync.json', '{"updated":true}');
    expect(captured?.method).toBe('PATCH');
    const body = JSON.parse(captured?.body as string);
    expect(body.files['curlit-sync.json'].content).toBe('{"updated":true}');
  });

  it('throws a descriptive error on non-2xx response', async () => {
    mockFetchOnce('Bad credentials', { ok: false, status: 401 });
    await expect(getAuthenticatedUser('bad')).rejects.toThrow(/401/);
  });
});

// ─── readGistFile ────────────────────────────────────────────────────────────

describe('readGistFile', () => {
  it('returns content when the file exists', () => {
    const gist = {
      id: 'g1',
      description: null,
      updated_at: '',
      files: { 'curlit-sync.json': { filename: 'curlit-sync.json', content: '{}' } },
    };
    expect(readGistFile(gist, 'curlit-sync.json')).toBe('{}');
  });

  it('returns null when the file is missing', () => {
    const gist = { id: 'g1', description: null, updated_at: '', files: {} };
    expect(readGistFile(gist, 'curlit-sync.json')).toBeNull();
  });
});
