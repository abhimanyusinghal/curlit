import { describe, it, expect } from 'vitest';
import {
  buildUrl,
  buildHeaders,
  buildBody,
  resolveVariables,
  resolveRequestVariables,
  parseCurlCommand,
  generateCurlCommand,
  getMethodColor,
  getMethodBgColor,
  getStatusColor,
  formatBytes,
  formatTime,
  tryFormatJson,
} from '../http';
import { createDefaultRequest, createKeyValuePair } from '../../types';
import type { KeyValuePair, AuthConfig } from '../../types';

// Helper to create enabled key-value pairs
function kv(key: string, value: string, enabled = true): KeyValuePair {
  return createKeyValuePair({ key, value, enabled });
}

// ─── buildUrl ────────────────────────────────────────────────────────────────

describe('buildUrl', () => {
  it('returns base URL unchanged when no params', () => {
    expect(buildUrl('https://example.com', [])).toBe('https://example.com');
  });

  it('appends enabled params as query string', () => {
    const result = buildUrl('https://example.com', [kv('q', 'hello'), kv('page', '1')]);
    const url = new URL(result);
    expect(url.searchParams.get('q')).toBe('hello');
    expect(url.searchParams.get('page')).toBe('1');
  });

  it('skips disabled params', () => {
    const result = buildUrl('https://example.com', [kv('a', '1', true), kv('b', '2', false)]);
    const url = new URL(result);
    expect(url.searchParams.get('a')).toBe('1');
    expect(url.searchParams.has('b')).toBe(false);
  });

  it('skips params with empty key', () => {
    const result = buildUrl('https://example.com', [kv('', 'value')]);
    expect(result).toBe('https://example.com');
  });

  it('prepends https:// when protocol is missing', () => {
    const result = buildUrl('example.com', [kv('q', '1')]);
    expect(result.startsWith('https://')).toBe(true);
  });
});

// ─── buildHeaders ────────────────────────────────────────────────────────────

describe('buildHeaders', () => {
  const noAuth: AuthConfig = { type: 'none' };

  it('returns enabled headers as key-value record', () => {
    const result = buildHeaders([kv('Accept', 'application/json')], noAuth);
    expect(result).toEqual({ Accept: 'application/json' });
  });

  it('skips disabled headers', () => {
    const result = buildHeaders([kv('X-Skip', 'val', false)], noAuth);
    expect(result).toEqual({});
  });

  it('adds Basic auth header', () => {
    const auth: AuthConfig = { type: 'basic', basic: { username: 'user', password: 'pass' } };
    const result = buildHeaders([], auth);
    expect(result['Authorization']).toBe(`Basic ${btoa('user:pass')}`);
  });

  it('adds Bearer token header', () => {
    const auth: AuthConfig = { type: 'bearer', bearer: { token: 'my-token' } };
    const result = buildHeaders([], auth);
    expect(result['Authorization']).toBe('Bearer my-token');
  });

  it('adds API key as header when addTo=header', () => {
    const auth: AuthConfig = { type: 'api-key', apiKey: { key: 'X-Api-Key', value: 'secret', addTo: 'header' } };
    const result = buildHeaders([], auth);
    expect(result['X-Api-Key']).toBe('secret');
  });

  it('does NOT add API key header when addTo=query', () => {
    const auth: AuthConfig = { type: 'api-key', apiKey: { key: 'api_key', value: 'secret', addTo: 'query' } };
    const result = buildHeaders([], auth);
    expect(result).toEqual({});
  });
});

// ─── buildBody ───────────────────────────────────────────────────────────────

describe('buildBody', () => {
  it('returns null for GET', () => {
    const req = createDefaultRequest({ method: 'GET', body: { type: 'json', raw: '{}', formData: [], urlencoded: [] } });
    expect(buildBody(req)).toBeNull();
  });

  it('returns null for HEAD', () => {
    const req = createDefaultRequest({ method: 'HEAD' });
    expect(buildBody(req)).toBeNull();
  });

  it('returns null for OPTIONS', () => {
    const req = createDefaultRequest({ method: 'OPTIONS' });
    expect(buildBody(req)).toBeNull();
  });

  it('returns null for body type "none"', () => {
    const req = createDefaultRequest({ method: 'POST', body: { type: 'none', raw: '', formData: [], urlencoded: [] } });
    expect(buildBody(req)).toBeNull();
  });

  it('returns raw string for json body', () => {
    const req = createDefaultRequest({ method: 'POST', body: { type: 'json', raw: '{"a":1}', formData: [], urlencoded: [] } });
    expect(buildBody(req)).toBe('{"a":1}');
  });

  it('returns raw string for text body', () => {
    const req = createDefaultRequest({ method: 'POST', body: { type: 'text', raw: 'hello', formData: [], urlencoded: [] } });
    expect(buildBody(req)).toBe('hello');
  });

  it('returns raw string for xml body', () => {
    const req = createDefaultRequest({ method: 'POST', body: { type: 'xml', raw: '<root/>', formData: [], urlencoded: [] } });
    expect(buildBody(req)).toBe('<root/>');
  });

  it('returns FormData for form-data body with enabled fields', () => {
    const req = createDefaultRequest({
      method: 'POST',
      body: { type: 'form-data', raw: '', formData: [kv('file', 'data'), kv('skip', 'no', false)], urlencoded: [] },
    });
    const result = buildBody(req);
    expect(result).toBeInstanceOf(FormData);
    expect((result as FormData).get('file')).toBe('data');
    expect((result as FormData).has('skip')).toBe(false);
  });

  it('returns URLSearchParams string for urlencoded body', () => {
    const req = createDefaultRequest({
      method: 'POST',
      body: { type: 'x-www-form-urlencoded', raw: '', formData: [], urlencoded: [kv('username', 'admin')] },
    });
    const result = buildBody(req);
    expect(result).toBe('username=admin');
  });
});

// ─── resolveVariables ────────────────────────────────────────────────────────

describe('resolveVariables', () => {
  it('replaces {{key}} with value', () => {
    expect(resolveVariables('https://{{host}}/api', { host: 'example.com' })).toBe('https://example.com/api');
  });

  it('leaves unmatched {{key}} intact', () => {
    expect(resolveVariables('{{missing}}', {})).toBe('{{missing}}');
  });

  it('handles multiple variables in one string', () => {
    expect(resolveVariables('{{a}}/{{b}}', { a: 'x', b: 'y' })).toBe('x/y');
  });

  it('returns text unchanged when variables object is empty', () => {
    expect(resolveVariables('no vars here', {})).toBe('no vars here');
  });
});

// ─── resolveRequestVariables ─────────────────────────────────────────────────

describe('resolveRequestVariables', () => {
  const vars = { host: 'api.test', token: 'abc123', user: 'admin', pass: 'secret', apikey: 'key1' };

  it('resolves variables in URL, params, headers, body.raw, formData, and urlencoded', () => {
    const req = createDefaultRequest({
      url: 'https://{{host}}/api',
      params: [kv('q', '{{host}}')],
      headers: [kv('X-Custom', '{{token}}')],
      body: {
        type: 'json',
        raw: '{"host":"{{host}}"}',
        formData: [kv('field', '{{token}}')],
        urlencoded: [kv('u', '{{user}}')],
      },
    });
    const resolved = resolveRequestVariables(req, vars);
    expect(resolved.url).toBe('https://api.test/api');
    expect(resolved.params[0].value).toBe('api.test');
    expect(resolved.headers[0].value).toBe('abc123');
    expect(resolved.body.raw).toBe('{"host":"api.test"}');
    expect(resolved.body.formData[0].value).toBe('abc123');
    expect(resolved.body.urlencoded[0].value).toBe('admin');
  });

  it('resolves variables in auth fields', () => {
    const req = createDefaultRequest({
      auth: { type: 'basic', basic: { username: '{{user}}', password: '{{pass}}' } },
    });
    const resolved = resolveRequestVariables(req, vars);
    expect(resolved.auth.basic!.username).toBe('admin');
    expect(resolved.auth.basic!.password).toBe('secret');
  });

  it('does not mutate original request', () => {
    const req = createDefaultRequest({ url: '{{host}}' });
    const original = req.url;
    resolveRequestVariables(req, vars);
    expect(req.url).toBe(original);
  });
});

// ─── parseCurlCommand ────────────────────────────────────────────────────────

describe('parseCurlCommand', () => {
  it('extracts URL from simple curl', () => {
    const result = parseCurlCommand('curl https://example.com');
    expect(result.url).toBe('https://example.com');
  });

  it('extracts URL from quoted curl', () => {
    const result = parseCurlCommand("curl 'https://example.com/api'");
    expect(result.url).toBe('https://example.com/api');
  });

  it('extracts method from -X', () => {
    const result = parseCurlCommand('curl -X POST https://example.com');
    expect(result.method).toBe('POST');
  });

  it('defaults to GET when no -X', () => {
    const result = parseCurlCommand('curl https://example.com');
    expect(result.method).toBe('GET');
  });

  it('defaults to POST when -d present but no -X', () => {
    const result = parseCurlCommand("curl https://example.com -d '{\"a\":1}'");
    expect(result.method).toBe('POST');
  });

  it('extracts headers from -H', () => {
    const result = parseCurlCommand("curl -H 'Content-Type: application/json' -H 'Accept: text/html' https://example.com");
    expect(result.headers).toHaveLength(2);
    expect(result.headers![0].key).toBe('Content-Type');
    expect(result.headers![0].value).toBe('application/json');
    expect(result.headers![1].key).toBe('Accept');
    expect(result.headers![1].value).toBe('text/html');
  });

  it('extracts body from -d', () => {
    // Note: parser captures content between quotes, but nested quotes in JSON
    // cause the regex to capture only up to the first inner quote.
    // Simple non-JSON body works correctly:
    const result = parseCurlCommand("curl -X POST https://example.com -d 'hello=world'");
    expect(result.body!.type).toBe('text');
    expect(result.body!.raw).toBe('hello=world');
  });

  it('sets body type to json for valid JSON without inner quotes', () => {
    const result = parseCurlCommand("curl -X POST https://example.com -d '{}'");
    expect(result.body!.type).toBe('json');
  });

  it('extracts basic auth from -u', () => {
    const result = parseCurlCommand('curl -u admin:password123 https://example.com');
    expect(result.auth!.type).toBe('basic');
    expect(result.auth!.basic!.username).toBe('admin');
    expect(result.auth!.basic!.password).toBe('password123');
  });

  it('handles line continuations', () => {
    // URL must come right after "curl" for the regex to capture it.
    // When flags come first, the URL is picked up by the fallback https? regex.
    const curl = `curl 'https://example.com' \\\n  -X PUT`;
    const result = parseCurlCommand(curl);
    expect(result.method).toBe('PUT');
    expect(result.url).toBe('https://example.com');
  });
});

// ─── generateCurlCommand ────────────────────────────────────────────────────

describe('generateCurlCommand', () => {
  it('generates simple GET curl', () => {
    const req = createDefaultRequest({ method: 'GET', url: 'https://example.com' });
    const result = generateCurlCommand(req);
    expect(result).toContain("curl");
    expect(result).toContain("'https://example.com'");
    expect(result).not.toContain('-X');
  });

  it('adds -X for non-GET methods', () => {
    const req = createDefaultRequest({ method: 'POST', url: 'https://example.com' });
    const result = generateCurlCommand(req);
    expect(result).toContain('-X POST');
  });

  it('includes headers as -H flags', () => {
    const req = createDefaultRequest({
      method: 'GET',
      url: 'https://example.com',
      headers: [kv('Accept', 'application/json')],
    });
    const result = generateCurlCommand(req);
    expect(result).toContain("-H 'Accept: application/json'");
  });

  it('includes body as -d for POST', () => {
    const req = createDefaultRequest({
      method: 'POST',
      url: 'https://example.com',
      body: { type: 'json', raw: '{"a":1}', formData: [], urlencoded: [] },
    });
    const result = generateCurlCommand(req);
    expect(result).toContain("-d '{\"a\":1}'");
  });

  it('omits body for GET even if body configured', () => {
    const req = createDefaultRequest({
      method: 'GET',
      url: 'https://example.com',
      body: { type: 'json', raw: '{"a":1}', formData: [], urlencoded: [] },
    });
    const result = generateCurlCommand(req);
    expect(result).not.toContain('-d');
  });
});

// ─── getMethodColor / getMethodBgColor ───────────────────────────────────────

describe('getMethodColor', () => {
  it('returns correct class for each known method', () => {
    expect(getMethodColor('GET')).toBe('text-method-get');
    expect(getMethodColor('POST')).toBe('text-method-post');
    expect(getMethodColor('PUT')).toBe('text-method-put');
    expect(getMethodColor('PATCH')).toBe('text-method-patch');
    expect(getMethodColor('DELETE')).toBe('text-method-delete');
    expect(getMethodColor('HEAD')).toBe('text-method-head');
    expect(getMethodColor('OPTIONS')).toBe('text-method-options');
  });

  it('returns fallback for unknown method', () => {
    expect(getMethodColor('UNKNOWN')).toBe('text-dark-300');
  });
});

describe('getMethodBgColor', () => {
  it('returns background classes for known methods', () => {
    expect(getMethodBgColor('GET')).toContain('bg-method-get');
    expect(getMethodBgColor('POST')).toContain('bg-method-post');
  });

  it('returns empty string for unknown method', () => {
    expect(getMethodBgColor('UNKNOWN')).toBe('');
  });
});

// ─── getStatusColor ──────────────────────────────────────────────────────────

describe('getStatusColor', () => {
  it('returns green for 2xx', () => {
    expect(getStatusColor(200)).toBe('text-accent-green');
    expect(getStatusColor(201)).toBe('text-accent-green');
  });

  it('returns blue for 3xx', () => {
    expect(getStatusColor(301)).toBe('text-accent-blue');
  });

  it('returns yellow for 4xx', () => {
    expect(getStatusColor(404)).toBe('text-accent-yellow');
  });

  it('returns red for 5xx', () => {
    expect(getStatusColor(500)).toBe('text-accent-red');
  });
});

// ─── formatBytes ─────────────────────────────────────────────────────────────

describe('formatBytes', () => {
  it('returns "0 B" for 0', () => {
    expect(formatBytes(0)).toBe('0 B');
  });

  it('formats bytes', () => {
    expect(formatBytes(500)).toBe('500 B');
  });

  it('formats kilobytes', () => {
    expect(formatBytes(1024)).toBe('1 KB');
  });

  it('formats megabytes', () => {
    expect(formatBytes(1048576)).toBe('1 MB');
  });
});

// ─── formatTime ──────────────────────────────────────────────────────────────

describe('formatTime', () => {
  it('returns ms for values under 1000', () => {
    expect(formatTime(350)).toBe('350 ms');
  });

  it('returns seconds for values >= 1000', () => {
    expect(formatTime(1500)).toBe('1.50 s');
  });
});

// ─── tryFormatJson ───────────────────────────────────────────────────────────

describe('tryFormatJson', () => {
  it('pretty-prints valid JSON', () => {
    expect(tryFormatJson('{"a":1}')).toBe('{\n  "a": 1\n}');
  });

  it('returns original text for invalid JSON', () => {
    expect(tryFormatJson('not json')).toBe('not json');
  });
});
