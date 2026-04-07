import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildAuthorizationUrl, isTokenExpired, fetchOAuth2Token } from '../oauth';
import type { OAuth2Config, OAuth2Token } from '../../types';

function makeConfig(overrides?: Partial<OAuth2Config>): OAuth2Config {
  return {
    grantType: 'client_credentials',
    authUrl: 'https://auth.example.com/authorize',
    tokenUrl: 'https://auth.example.com/token',
    clientId: 'my-client',
    clientSecret: 'my-secret',
    scope: 'read write',
    callbackUrl: 'https://localhost/callback',
    ...overrides,
  };
}

// ─── buildAuthorizationUrl ──────────────────────────────────────────────────

describe('buildAuthorizationUrl', () => {
  it('builds a URL with required parameters', () => {
    const config = makeConfig({ grantType: 'authorization_code' });
    const url = buildAuthorizationUrl(config);
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe('https://auth.example.com/authorize');
    expect(parsed.searchParams.get('response_type')).toBe('code');
    expect(parsed.searchParams.get('client_id')).toBe('my-client');
    expect(parsed.searchParams.get('redirect_uri')).toBe('https://localhost/callback');
    expect(parsed.searchParams.get('scope')).toBe('read write');
  });

  it('includes state when provided', () => {
    const config = makeConfig({ state: 'xyz123' });
    const url = buildAuthorizationUrl(config);
    const parsed = new URL(url);
    expect(parsed.searchParams.get('state')).toBe('xyz123');
  });

  it('omits scope when empty', () => {
    const config = makeConfig({ scope: '' });
    const url = buildAuthorizationUrl(config);
    const parsed = new URL(url);
    expect(parsed.searchParams.has('scope')).toBe(false);
  });

  it('omits redirect_uri when callbackUrl is empty', () => {
    const config = makeConfig({ callbackUrl: '' });
    const url = buildAuthorizationUrl(config);
    const parsed = new URL(url);
    expect(parsed.searchParams.has('redirect_uri')).toBe(false);
  });

  it('appends with & when authUrl already has query params', () => {
    const config = makeConfig({ authUrl: 'https://auth.example.com/authorize?existing=1' });
    const url = buildAuthorizationUrl(config);
    expect(url).toContain('?existing=1&');
    expect(url).toContain('response_type=code');
  });
});

// ─── isTokenExpired ─────────────────────────────────────────────────────────

describe('isTokenExpired', () => {
  it('returns false when expiresIn is not set', () => {
    const token: OAuth2Token = { accessToken: 'abc' };
    expect(isTokenExpired(token)).toBe(false);
  });

  it('returns false when obtainedAt is not set', () => {
    const token: OAuth2Token = { accessToken: 'abc', expiresIn: 3600 };
    expect(isTokenExpired(token)).toBe(false);
  });

  it('returns false for a fresh token', () => {
    const token: OAuth2Token = {
      accessToken: 'abc',
      expiresIn: 3600,
      obtainedAt: Date.now(),
    };
    expect(isTokenExpired(token)).toBe(false);
  });

  it('returns true for an expired token', () => {
    const token: OAuth2Token = {
      accessToken: 'abc',
      expiresIn: 3600,
      obtainedAt: Date.now() - 4000 * 1000,
    };
    expect(isTokenExpired(token)).toBe(true);
  });

  it('returns true within the 30-second buffer before expiry', () => {
    const token: OAuth2Token = {
      accessToken: 'abc',
      expiresIn: 60,
      obtainedAt: Date.now() - 40 * 1000,
    };
    // 60s - 40s = 20s remaining, which is within the 30s buffer
    expect(isTokenExpired(token)).toBe(true);
  });
});

// ─── fetchOAuth2Token ───────────────────────────────────────────────────────

describe('fetchOAuth2Token', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('sends client_credentials request and parses token', async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          access_token: 'tok_123',
          token_type: 'Bearer',
          expires_in: 3600,
          scope: 'read',
        }),
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as Response);

    const config = makeConfig();
    const token = await fetchOAuth2Token(config);

    expect(token.accessToken).toBe('tok_123');
    expect(token.tokenType).toBe('Bearer');
    expect(token.expiresIn).toBe(3600);
    expect(token.obtainedAt).toBeDefined();

    const call = vi.mocked(fetch).mock.calls[0];
    expect(call[0]).toBe('/api/oauth/token');
    const body = JSON.parse((call[1] as RequestInit).body as string);
    expect(body.grantType).toBe('client_credentials');
    expect(body.clientId).toBe('my-client');
  });

  it('sends authorization_code request with auth code', async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          access_token: 'tok_456',
          token_type: 'bearer',
          refresh_token: 'ref_789',
        }),
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as Response);

    const config = makeConfig({ grantType: 'authorization_code' });
    const token = await fetchOAuth2Token(config, 'code_abc');

    expect(token.accessToken).toBe('tok_456');
    expect(token.refreshToken).toBe('ref_789');

    const body = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string);
    expect(body.grantType).toBe('authorization_code');
    expect(body.code).toBe('code_abc');
  });

  it('throws on error response', async () => {
    const mockResponse = {
      ok: false,
      status: 400,
      json: () =>
        Promise.resolve({
          error: 'invalid_grant',
          error_description: 'The code has expired',
        }),
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as Response);

    const config = makeConfig();
    await expect(fetchOAuth2Token(config)).rejects.toThrow('OAuth error: The code has expired');
  });

  it('throws when response is missing access_token', async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      json: () => Promise.resolve({ token_type: 'Bearer', expires_in: 3600 }),
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as Response);

    await expect(fetchOAuth2Token(makeConfig())).rejects.toThrow('OAuth error: response missing access_token');
  });

  it('only sends code and redirectUri for authorization_code grant', async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      json: () => Promise.resolve({ access_token: 'tok' }),
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as Response);

    // client_credentials should NOT include code or redirectUri
    await fetchOAuth2Token(makeConfig({ grantType: 'client_credentials' }));
    const ccBody = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string);
    expect(ccBody.code).toBeUndefined();
    expect(ccBody.redirectUri).toBeUndefined();

    // authorization_code should include them
    await fetchOAuth2Token(makeConfig({ grantType: 'authorization_code' }), 'my-code');
    const acBody = JSON.parse((vi.mocked(fetch).mock.calls[1][1] as RequestInit).body as string);
    expect(acBody.code).toBe('my-code');
    expect(acBody.redirectUri).toBe('https://localhost/callback');
  });

  it('defaults tokenType to Bearer when not provided', async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      json: () => Promise.resolve({ access_token: 'tok' }),
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as Response);

    const token = await fetchOAuth2Token(makeConfig());
    expect(token.tokenType).toBe('Bearer');
  });
});
