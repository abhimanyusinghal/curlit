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
import { createDefaultRequest, createKeyValuePair, createFormDataEntry } from '../../types';
import type { KeyValuePair, FormDataEntry, AuthConfig } from '../../types';

// Helper to create enabled key-value pairs
function kv(key: string, value: string, enabled = true): KeyValuePair {
  return createKeyValuePair({ key, value, enabled });
}

// Helper to create form-data entries (text type by default)
function fd(key: string, value: string, enabled = true): FormDataEntry {
  return createFormDataEntry({ key, value, enabled, valueType: 'text' });
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

  it('adds OAuth 2.0 Bearer header from stored token', () => {
    const auth: AuthConfig = {
      type: 'oauth2',
      oauth2: {
        grantType: 'client_credentials',
        authUrl: '',
        tokenUrl: 'https://auth.example.com/token',
        clientId: 'id',
        clientSecret: 'secret',
        scope: '',
        callbackUrl: '',
        token: { accessToken: 'oauth-tok-123', tokenType: 'Bearer', obtainedAt: Date.now() },
      },
    };
    const result = buildHeaders([], auth);
    expect(result['Authorization']).toBe('Bearer oauth-tok-123');
  });

  it('capitalizes token type for OAuth 2.0 header', () => {
    const auth: AuthConfig = {
      type: 'oauth2',
      oauth2: {
        grantType: 'client_credentials',
        authUrl: '',
        tokenUrl: '',
        clientId: '',
        clientSecret: '',
        scope: '',
        callbackUrl: '',
        token: { accessToken: 'tok', tokenType: 'mac' },
      },
    };
    const result = buildHeaders([], auth);
    expect(result['Authorization']).toBe('Mac tok');
  });

  it('does not add Authorization when oauth2 has no token', () => {
    const auth: AuthConfig = {
      type: 'oauth2',
      oauth2: {
        grantType: 'client_credentials',
        authUrl: '',
        tokenUrl: 'https://auth.example.com/token',
        clientId: 'id',
        clientSecret: 'secret',
        scope: '',
        callbackUrl: '',
      },
    };
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
      body: { type: 'form-data', raw: '', formData: [fd('file', 'data'), fd('skip', 'no', false)], urlencoded: [] },
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

  it('returns JSON string with query for graphql body', () => {
    const req = createDefaultRequest({
      method: 'POST',
      body: { type: 'graphql', raw: '', formData: [], urlencoded: [], graphql: { query: '{ users { id } }', variables: '' } },
    });
    const result = buildBody(req);
    expect(typeof result).toBe('string');
    const parsed = JSON.parse(result as string);
    expect(parsed.query).toBe('{ users { id } }');
    expect(parsed.variables).toBeUndefined();
  });

  it('includes parsed variables in graphql body when provided', () => {
    const req = createDefaultRequest({
      method: 'POST',
      body: { type: 'graphql', raw: '', formData: [], urlencoded: [], graphql: { query: 'query ($id: ID!) { user(id: $id) { name } }', variables: '{"id": "123"}' } },
    });
    const result = buildBody(req);
    const parsed = JSON.parse(result as string);
    expect(parsed.query).toContain('query ($id: ID!)');
    expect(parsed.variables).toEqual({ id: '123' });
  });

  it('falls back to empty variables object for invalid JSON in graphql variables', () => {
    const req = createDefaultRequest({
      method: 'POST',
      body: { type: 'graphql', raw: '', formData: [], urlencoded: [], graphql: { query: '{ users { id } }', variables: 'not json' } },
    });
    const result = buildBody(req);
    const parsed = JSON.parse(result as string);
    expect(parsed.variables).toEqual({});
  });

  it('returns null for graphql body on GET method', () => {
    const req = createDefaultRequest({
      method: 'GET',
      body: { type: 'graphql', raw: '', formData: [], urlencoded: [], graphql: { query: '{ users { id } }', variables: '' } },
    });
    expect(buildBody(req)).toBeNull();
  });

  it('includes operationName in graphql body when set', () => {
    const req = createDefaultRequest({
      method: 'POST',
      body: { type: 'graphql', raw: '', formData: [], urlencoded: [], graphql: { query: 'query GetUser { user { id } }', variables: '', operationName: 'GetUser' } },
    });
    const result = buildBody(req);
    const parsed = JSON.parse(result as string);
    expect(parsed.operationName).toBe('GetUser');
  });

  it('includes extensions in graphql body when set', () => {
    const req = createDefaultRequest({
      method: 'POST',
      body: { type: 'graphql', raw: '', formData: [], urlencoded: [], graphql: { query: '{ user { id } }', variables: '', extensions: '{"persistedQuery":{"sha256Hash":"abc"}}' } },
    });
    const result = buildBody(req);
    const parsed = JSON.parse(result as string);
    expect(parsed.extensions).toEqual({ persistedQuery: { sha256Hash: 'abc' } });
  });

  it('omits query field from graphql body when query is empty (persisted queries)', () => {
    const req = createDefaultRequest({
      method: 'POST',
      body: { type: 'graphql', raw: '', formData: [], urlencoded: [], graphql: { query: '', variables: '', operationName: 'GetUser', extensions: '{"persistedQuery":{"sha256Hash":"abc"}}' } },
    });
    const result = buildBody(req);
    const parsed = JSON.parse(result as string);
    expect(parsed).not.toHaveProperty('query');
    expect(parsed.operationName).toBe('GetUser');
    expect(parsed.extensions).toEqual({ persistedQuery: { sha256Hash: 'abc' } });
  });

  it('omits operationName and extensions when not set', () => {
    const req = createDefaultRequest({
      method: 'POST',
      body: { type: 'graphql', raw: '', formData: [], urlencoded: [], graphql: { query: '{ users { id } }', variables: '' } },
    });
    const result = buildBody(req);
    const parsed = JSON.parse(result as string);
    expect(parsed).not.toHaveProperty('operationName');
    expect(parsed).not.toHaveProperty('extensions');
  });

  it('handles deeply nested variables in graphql body', () => {
    const vars = '{"input":{"user":{"address":{"city":"NYC","zip":"10001"},"tags":["admin","active"]}}}';
    const req = createDefaultRequest({
      method: 'POST',
      body: { type: 'graphql', raw: '', formData: [], urlencoded: [], graphql: { query: 'mutation ($input: CreateUserInput!) { createUser(input: $input) { id } }', variables: vars } },
    });
    const result = buildBody(req);
    const parsed = JSON.parse(result as string);
    expect(parsed.variables.input.user.address.city).toBe('NYC');
    expect(parsed.variables.input.user.tags).toEqual(['admin', 'active']);
  });

  it('handles array variables in graphql body', () => {
    const req = createDefaultRequest({
      method: 'POST',
      body: { type: 'graphql', raw: '', formData: [], urlencoded: [], graphql: { query: 'query ($ids: [ID!]!) { users(ids: $ids) { name } }', variables: '{"ids":["1","2","3"]}' } },
    });
    const result = buildBody(req);
    const parsed = JSON.parse(result as string);
    expect(parsed.variables.ids).toEqual(['1', '2', '3']);
  });

  it('handles empty variables object string', () => {
    const req = createDefaultRequest({
      method: 'POST',
      body: { type: 'graphql', raw: '', formData: [], urlencoded: [], graphql: { query: '{ users { id } }', variables: '{}' } },
    });
    const result = buildBody(req);
    const parsed = JSON.parse(result as string);
    expect(parsed.variables).toEqual({});
  });

  it('handles variables with unicode and special characters', () => {
    const req = createDefaultRequest({
      method: 'POST',
      body: { type: 'graphql', raw: '', formData: [], urlencoded: [], graphql: { query: 'query ($name: String!) { user(name: $name) { id } }', variables: '{"name":"José García 日本語"}' } },
    });
    const result = buildBody(req);
    const parsed = JSON.parse(result as string);
    expect(parsed.variables.name).toBe('José García 日本語');
  });

  it('handles query with directives', () => {
    const req = createDefaultRequest({
      method: 'POST',
      body: { type: 'graphql', raw: '', formData: [], urlencoded: [], graphql: { query: 'query ($withEmail: Boolean!) { users { id name email @include(if: $withEmail) } }', variables: '{"withEmail":true}' } },
    });
    const result = buildBody(req);
    const parsed = JSON.parse(result as string);
    expect(parsed.query).toContain('@include(if: $withEmail)');
    expect(parsed.variables.withEmail).toBe(true);
  });

  it('handles multi-operation document with operationName', () => {
    const query = 'query GetUser { user { id } } query GetUsers { users { id } }';
    const req = createDefaultRequest({
      method: 'POST',
      body: { type: 'graphql', raw: '', formData: [], urlencoded: [], graphql: { query, variables: '', operationName: 'GetUsers' } },
    });
    const result = buildBody(req);
    const parsed = JSON.parse(result as string);
    expect(parsed.query).toContain('GetUser');
    expect(parsed.query).toContain('GetUsers');
    expect(parsed.operationName).toBe('GetUsers');
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
        formData: [fd('field', '{{token}}')],
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

  it('resolves variables in graphql query and variables fields', () => {
    const req = createDefaultRequest({
      url: 'https://{{host}}/graphql',
      body: {
        type: 'graphql',
        raw: '',
        formData: [],
        urlencoded: [],
        graphql: {
          query: '{ user(token: "{{token}}") { name } }',
          variables: '{"host": "{{host}}"}',
        },
      },
    });
    const resolved = resolveRequestVariables(req, vars);
    expect(resolved.body.graphql!.query).toBe('{ user(token: "abc123") { name } }');
    expect(resolved.body.graphql!.variables).toBe('{"host": "api.test"}');
  });

  it('resolves variables in graphql operationName and extensions', () => {
    const req = createDefaultRequest({
      url: 'https://{{host}}/graphql',
      body: {
        type: 'graphql',
        raw: '',
        formData: [],
        urlencoded: [],
        graphql: {
          query: 'query {{user}} { user { id } }',
          variables: '{"token": "{{token}}"}',
          operationName: '{{user}}',
          extensions: '{"key": "{{apikey}}"}',
        },
      },
    });
    const resolved = resolveRequestVariables(req, vars);
    expect(resolved.body.graphql!.operationName).toBe('admin');
    expect(resolved.body.graphql!.extensions).toBe('{"key": "key1"}');
  });

  it('resolves variables inside nested graphql variable JSON strings', () => {
    const req = createDefaultRequest({
      url: 'https://{{host}}/graphql',
      body: {
        type: 'graphql',
        raw: '',
        formData: [],
        urlencoded: [],
        graphql: {
          query: 'mutation { create(input: $input) { id } }',
          variables: '{"input":{"endpoint":"https://{{host}}/callback","token":"{{token}}"}}',
        },
      },
    });
    const resolved = resolveRequestVariables(req, vars);
    const parsedVars = JSON.parse(resolved.body.graphql!.variables);
    expect(parsedVars.input.endpoint).toBe('https://api.test/callback');
    expect(parsedVars.input.token).toBe('abc123');
  });

  it('preserves undefined graphql field when not set', () => {
    const req = createDefaultRequest({ url: '{{host}}' });
    const resolved = resolveRequestVariables(req, vars);
    expect(resolved.body.graphql).toBeUndefined();
  });

  it('does not mutate original request', () => {
    const req = createDefaultRequest({ url: '{{host}}' });
    const original = req.url;
    resolveRequestVariables(req, vars);
    expect(req.url).toBe(original);
  });

  it('resolves variables in OAuth 2.0 config', () => {
    const req = createDefaultRequest({
      url: 'https://api.example.com',
      auth: {
        type: 'oauth2',
        oauth2: {
          grantType: 'client_credentials',
          authUrl: '{{host}}/authorize',
          tokenUrl: '{{host}}/token',
          clientId: '{{clientId}}',
          clientSecret: '{{secret}}',
          scope: '{{scope}}',
          callbackUrl: '{{callback}}',
        },
      },
    });
    const resolved = resolveRequestVariables(req, {
      ...vars,
      clientId: 'my-id',
      secret: 'my-secret',
      scope: 'read',
      callback: 'https://localhost/cb',
    });
    expect(resolved.auth.oauth2?.tokenUrl).toBe('api.test/token');
    expect(resolved.auth.oauth2?.authUrl).toBe('api.test/authorize');
    expect(resolved.auth.oauth2?.clientId).toBe('my-id');
    expect(resolved.auth.oauth2?.clientSecret).toBe('my-secret');
    expect(resolved.auth.oauth2?.scope).toBe('read');
    expect(resolved.auth.oauth2?.callbackUrl).toBe('https://localhost/cb');
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
    const curl = `curl 'https://example.com' \\\n  -X PUT`;
    const result = parseCurlCommand(curl);
    expect(result.method).toBe('PUT');
    expect(result.url).toBe('https://example.com');
  });

  it('extracts URL when flags precede the URL', () => {
    const result = parseCurlCommand("curl -X POST 'https://api.example.com/graphql' -H 'Content-Type: application/json'");
    expect(result.url).toBe('https://api.example.com/graphql');
    expect(result.method).toBe('POST');
  });

  it('extracts URL without quotes when flags precede it', () => {
    const result = parseCurlCommand('curl -X DELETE https://api.example.com/resource/123');
    expect(result.url).toBe('https://api.example.com/resource/123');
    expect(result.method).toBe('DELETE');
  });

  it('parses JSON body with inner quotes correctly', () => {
    const result = parseCurlCommand(`curl -X POST 'https://api.example.com' -d '{"key":"value","num":42}'`);
    expect(result.body!.type).toBe('json');
    expect(result.body!.raw).toBe('{"key":"value","num":42}');
  });

  it('detects GraphQL body from -d with query field', () => {
    const result = parseCurlCommand(
      `curl -X POST 'https://api.example.com/graphql' -H 'Content-Type: application/json' -d '{"query":"{ users { id name } }"}'`
    );
    expect(result.body!.type).toBe('graphql');
    expect(result.body!.graphql!.query).toBe('{ users { id name } }');
    expect(result.body!.graphql!.variables).toBe('');
  });

  it('detects GraphQL body with variables', () => {
    const result = parseCurlCommand(
      `curl -X POST 'https://api.example.com/graphql' -d '{"query":"query GetUser($id: ID!) { user(id: $id) { name } }","variables":{"id":"123"}}'`
    );
    expect(result.body!.type).toBe('graphql');
    expect(result.body!.graphql!.query).toContain('query GetUser');
    expect(JSON.parse(result.body!.graphql!.variables)).toEqual({ id: '123' });
  });

  it('detects GraphQL mutation body type', () => {
    const result = parseCurlCommand(
      `curl -X POST 'https://api.example.com/graphql' -d '{"query":"mutation { createUser(name: \\"Alice\\") { id } }"}'`
    );
    expect(result.body!.type).toBe('graphql');
    expect(result.body!.graphql!.query).toContain('mutation');
  });

  it('does not detect regular JSON with "query" string as GraphQL', () => {
    // "query" value doesn't start with a GraphQL keyword
    const result = parseCurlCommand(
      `curl -X POST 'https://api.example.com/search' -d '{"query":"search term","page":1}'`
    );
    expect(result.body!.type).toBe('json');
  });

  it('extracts scheme-less URL like localhost:4000/graphql', () => {
    const result = parseCurlCommand("curl localhost:4000/graphql -d '{\"query\":\"{ hello }\"}'");
    expect(result.url).toBe('localhost:4000/graphql');
  });

  it('extracts scheme-less URL with domain like api.local:3000', () => {
    const result = parseCurlCommand("curl api.local:3000/v1 -X GET");
    expect(result.url).toBe('api.local:3000/v1');
  });

  it('preserves operationName from GraphQL cURL import', () => {
    const result = parseCurlCommand(
      `curl -X POST 'https://api.example.com/graphql' -d '{"query":"query GetUser { user { id } }","operationName":"GetUser"}'`
    );
    expect(result.body!.type).toBe('graphql');
    expect(result.body!.graphql!.operationName).toBe('GetUser');
  });

  it('preserves extensions from GraphQL cURL import', () => {
    const result = parseCurlCommand(
      `curl -X POST 'https://api.example.com/graphql' -d '{"query":"{ user { id } }","extensions":{"persistedQuery":{"sha256Hash":"abc123"}}}'`
    );
    expect(result.body!.type).toBe('graphql');
    expect(JSON.parse(result.body!.graphql!.extensions!)).toEqual({ persistedQuery: { sha256Hash: 'abc123' } });
  });

  it('detects persisted-query cURL with operationName but no query field', () => {
    const result = parseCurlCommand(
      `curl -X POST 'https://api.example.com/graphql' -d '{"operationName":"GetUser","variables":{"id":"1"},"extensions":{"persistedQuery":{"sha256Hash":"abc"}}}'`
    );
    expect(result.body!.type).toBe('graphql');
    expect(result.body!.graphql!.query).toBe('');
    expect(result.body!.graphql!.operationName).toBe('GetUser');
    expect(JSON.parse(result.body!.graphql!.variables)).toEqual({ id: '1' });
    expect(JSON.parse(result.body!.graphql!.extensions!)).toEqual({ persistedQuery: { sha256Hash: 'abc' } });
  });

  it('detects persisted-query cURL with only extensions', () => {
    const result = parseCurlCommand(
      `curl -X POST 'https://api.example.com/graphql' -d '{"extensions":{"persistedQuery":{"sha256Hash":"def456"}}}'`
    );
    expect(result.body!.type).toBe('graphql');
    expect(result.body!.graphql!.query).toBe('');
  });

  it('extracts single-label host with port like graphql:4000', () => {
    const result = parseCurlCommand("curl graphql:4000 -d '{\"query\":\"{ hello }\"}'");
    expect(result.url).toBe('graphql:4000');
  });

  it('extracts single-label host with port and path like api:8080/graphql', () => {
    const result = parseCurlCommand("curl api:8080/graphql -X POST");
    expect(result.url).toBe('api:8080/graphql');
  });

  it('extracts scheme-less path-only URL like api/graphql', () => {
    const result = parseCurlCommand("curl api/graphql -d '{\"query\":\"{ hello }\"}'");
    expect(result.url).toBe('api/graphql');
  });

  it('extracts single-label host without port like myservice', () => {
    const result = parseCurlCommand("curl myservice -X GET");
    expect(result.url).toBe('myservice');
  });

  it('handles --request long flag without treating its arg as URL', () => {
    const result = parseCurlCommand("curl --request POST https://api.example.com/graphql");
    expect(result.url).toBe('https://api.example.com/graphql');
    expect(result.method).toBe('POST');
  });

  it('handles --request with scheme-less URL', () => {
    const result = parseCurlCommand("curl --request POST api/graphql -d '{\"query\":\"{ hello }\"}'");
    expect(result.url).toBe('api/graphql');
    expect(result.method).toBe('POST');
  });

  it('ignores URL inside -d payload when extracting target', () => {
    const result = parseCurlCommand(`curl api/graphql -d '{"callback":"https://example.com"}'`);
    expect(result.url).toBe('api/graphql');
  });

  it('ignores URL inside -d payload when real URL comes after', () => {
    const result = parseCurlCommand(`curl -d '{"url":"https://nested.example.com"}' https://api.example.com/graphql`);
    expect(result.url).toBe('https://api.example.com/graphql');
  });

  it('ignores URL inside -H header value', () => {
    const result = parseCurlCommand(`curl -H 'Referer: https://other.com' https://api.example.com/data`);
    expect(result.url).toBe('https://api.example.com/data');
  });

  it('detects GraphQL query starting with fragment keyword', () => {
    const result = parseCurlCommand(
      `curl -X POST 'https://api.example.com/graphql' -d '{"query":"fragment UserFields on User { id name }\\nquery GetUser { user { ...UserFields } }"}'`
    );
    expect(result.body!.type).toBe('graphql');
    expect(result.body!.graphql!.query).toContain('fragment UserFields');
  });

  it('does not treat hashtag search payloads as GraphQL', () => {
    const result = parseCurlCommand(
      `curl -X POST 'https://api.example.com/search' -d '{"query":"#graphql","page":1}'`
    );
    expect(result.body!.type).toBe('json');
  });

  it('detects GraphQL query with leading comment lines', () => {
    const result = parseCurlCommand(
      `curl -X POST 'https://api.example.com/graphql' -d '{"query":"# fetch users\\nquery { users { id } }"}'`
    );
    expect(result.body!.type).toBe('graphql');
    expect(result.body!.graphql!.query).toContain('# fetch users');
  });

  it('does not detect comment-only query as GraphQL', () => {
    const result = parseCurlCommand(
      `curl -X POST 'https://api.example.com/search' -d '{"query":"# just a comment"}'`
    );
    expect(result.body!.type).toBe('json');
  });

  it('honors --url flag for the target URL', () => {
    const result = parseCurlCommand(`curl --url https://api.example.com/graphql -d '{"query":"{ hello }"}'`);
    expect(result.url).toBe('https://api.example.com/graphql');
  });

  it('honors --url flag with quoted value', () => {
    const result = parseCurlCommand(`curl -X POST --url 'https://api.example.com/graphql' -d '{"query":"{ hello }"}'`);
    expect(result.url).toBe('https://api.example.com/graphql');
    expect(result.method).toBe('POST');
  });

  it('parses multi-line GraphQL cURL with line continuations', () => {
    const curl = `curl -X POST \\\n  'https://api.example.com/graphql' \\\n  -H 'Content-Type: application/json' \\\n  -d '{"query":"query GetUser($id: ID!) { user(id: $id) { name email } }","variables":{"id":"42"}}'`;
    const result = parseCurlCommand(curl);
    expect(result.url).toBe('https://api.example.com/graphql');
    expect(result.method).toBe('POST');
    expect(result.body!.type).toBe('graphql');
    expect(result.body!.graphql!.query).toContain('GetUser');
    expect(JSON.parse(result.body!.graphql!.variables)).toEqual({ id: '42' });
  });

  it('detects subscription keyword as GraphQL', () => {
    const result = parseCurlCommand(
      `curl -X POST 'https://api.example.com/graphql' -d '{"query":"subscription { onMessageAdded { id text sender } }"}'`
    );
    expect(result.body!.type).toBe('graphql');
    expect(result.body!.graphql!.query).toContain('subscription');
  });

  it('handles --data-raw with GraphQL body', () => {
    const result = parseCurlCommand(
      `curl -X POST 'https://api.example.com/graphql' --data-raw '{"query":"{ users { id } }"}'`
    );
    expect(result.body!.type).toBe('graphql');
  });

  it('handles double-quoted -d with GraphQL body', () => {
    const result = parseCurlCommand(
      `curl -X POST "https://api.example.com/graphql" -d "{\\"query\\":\\"{ users { id } }\\"}" `
    );
    // double-quoted JSON with escaped inner quotes
    expect(result.url).toBe('https://api.example.com/graphql');
  });

  it('parses complex nested variables in cURL import', () => {
    const curl = `curl -X POST 'https://api.example.com/graphql' -d '{"query":"mutation ($input: CreateInput!) { create(input: $input) { id } }","variables":{"input":{"name":"Alice","roles":["admin","user"],"profile":{"age":30,"address":{"city":"NYC"}}}}}'`;
    const result = parseCurlCommand(curl);
    expect(result.body!.type).toBe('graphql');
    const vars = JSON.parse(result.body!.graphql!.variables);
    expect(vars.input.name).toBe('Alice');
    expect(vars.input.roles).toEqual(['admin', 'user']);
    expect(vars.input.profile.address.city).toBe('NYC');
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

  it('generates curl with GraphQL body as JSON', () => {
    const req = createDefaultRequest({
      method: 'POST',
      url: 'https://api.example.com/graphql',
      body: { type: 'graphql', raw: '', formData: [], urlencoded: [], graphql: { query: '{ users { id } }', variables: '' } },
    });
    const result = generateCurlCommand(req);
    expect(result).toContain('-X POST');
    expect(result).toContain('-d');
    // The body should be valid JSON containing the query
    const dMatch = result.match(/-d '([^']*)'/);
    expect(dMatch).toBeTruthy();
    const parsed = JSON.parse(dMatch![1]);
    expect(parsed.query).toBe('{ users { id } }');
  });

  it('generates curl with GraphQL body including variables', () => {
    const req = createDefaultRequest({
      method: 'POST',
      url: 'https://api.example.com/graphql',
      body: { type: 'graphql', raw: '', formData: [], urlencoded: [], graphql: { query: 'query ($id: ID!) { user(id: $id) { name } }', variables: '{"id":"42"}' } },
    });
    const result = generateCurlCommand(req);
    const dMatch = result.match(/-d '([^']*)'/);
    const parsed = JSON.parse(dMatch![1]);
    expect(parsed.query).toContain('query ($id: ID!)');
    expect(parsed.variables).toEqual({ id: '42' });
  });

  it('auto-adds Content-Type: application/json for GraphQL export', () => {
    const req = createDefaultRequest({
      method: 'POST',
      url: 'https://api.example.com/graphql',
      body: { type: 'graphql', raw: '', formData: [], urlencoded: [], graphql: { query: '{ users { id } }', variables: '' } },
    });
    const result = generateCurlCommand(req);
    expect(result).toContain("-H 'Content-Type: application/json'");
  });

  it('auto-adds Content-Type: application/json for JSON export', () => {
    const req = createDefaultRequest({
      method: 'POST',
      url: 'https://example.com',
      body: { type: 'json', raw: '{"a":1}', formData: [], urlencoded: [] },
    });
    const result = generateCurlCommand(req);
    expect(result).toContain("-H 'Content-Type: application/json'");
  });

  it('does not override user-specified Content-Type in export', () => {
    const req = createDefaultRequest({
      method: 'POST',
      url: 'https://api.example.com/graphql',
      headers: [kv('Content-Type', 'application/graphql+json')],
      body: { type: 'graphql', raw: '', formData: [], urlencoded: [], graphql: { query: '{ users { id } }', variables: '' } },
    });
    const result = generateCurlCommand(req);
    expect(result).toContain("-H 'Content-Type: application/graphql+json'");
    expect(result).not.toContain("application/json");
  });

  it('exports persisted query without query field', () => {
    const req = createDefaultRequest({
      method: 'POST',
      url: 'https://api.example.com/graphql',
      body: { type: 'graphql', raw: '', formData: [], urlencoded: [], graphql: { query: '', variables: '', operationName: 'GetUser', extensions: '{"persistedQuery":{"sha256Hash":"abc"}}' } },
    });
    const result = generateCurlCommand(req);
    const dMatch = result.match(/-d '([^']*)'/);
    expect(dMatch).toBeTruthy();
    const parsed = JSON.parse(dMatch![1]);
    expect(parsed).not.toHaveProperty('query');
    expect(parsed.operationName).toBe('GetUser');
    expect(parsed.extensions).toEqual({ persistedQuery: { sha256Hash: 'abc' } });
  });

  it('round-trips GraphQL cURL: import → export preserves query and variables', () => {
    const originalCurl = `curl -X POST 'https://api.example.com/graphql' -H 'Content-Type: application/json' -d '{"query":"query GetUser($id: ID!) { user(id: $id) { name } }","variables":{"id":"42"}}'`;
    const imported = parseCurlCommand(originalCurl);
    const fullRequest = createDefaultRequest({
      ...imported,
      name: 'test',
    });
    const exported = generateCurlCommand(fullRequest);
    // Re-import the exported cURL and verify the GraphQL payload survived
    const reimported = parseCurlCommand(exported);
    expect(reimported.body!.type).toBe('graphql');
    expect(reimported.body!.graphql!.query).toContain('query GetUser');
    expect(JSON.parse(reimported.body!.graphql!.variables)).toEqual({ id: '42' });
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
