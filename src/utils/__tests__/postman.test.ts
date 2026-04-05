import { describe, it, expect } from 'vitest';
import { isPostmanCollection, parsePostmanCollection } from '../postman';

// ─── Helper: minimal valid Postman collection ────────────────────────────────

function postmanCollection(overrides: Record<string, unknown> = {}) {
  return {
    info: { name: 'Test Collection', schema: 'https://schema.postman.com/json/collection/v2.1.0/collection.json' },
    item: [],
    ...overrides,
  };
}

// ─── isPostmanCollection ─────────────────────────────────────────────────────

describe('isPostmanCollection', () => {
  it('returns true for valid Postman collection', () => {
    expect(isPostmanCollection(postmanCollection())).toBe(true);
  });

  it('returns true even without schema field', () => {
    expect(isPostmanCollection({ info: { name: 'Test' }, item: [] })).toBe(true);
  });

  it('returns false for CurlIt native format', () => {
    expect(isPostmanCollection({ collections: [{ name: 'Test', requests: [] }] })).toBe(false);
  });

  it('returns false for null/undefined/primitives', () => {
    expect(isPostmanCollection(null)).toBe(false);
    expect(isPostmanCollection(undefined)).toBe(false);
    expect(isPostmanCollection('string')).toBe(false);
    expect(isPostmanCollection(42)).toBe(false);
  });

  it('returns false when info.name is missing', () => {
    expect(isPostmanCollection({ info: {}, item: [] })).toBe(false);
  });

  it('returns false when item is not an array', () => {
    expect(isPostmanCollection({ info: { name: 'Test' }, item: 'not array' })).toBe(false);
  });
});

// ─── parsePostmanCollection: basics ──────────────────────────────────────────

describe('parsePostmanCollection', () => {
  it('returns collection name from info', () => {
    const result = parsePostmanCollection(postmanCollection({ info: { name: 'My API' } }) as any);
    expect(result.name).toBe('My API');
  });

  it('returns empty requests for empty item array', () => {
    const result = parsePostmanCollection(postmanCollection() as any);
    expect(result.requests).toEqual([]);
  });
});

// ─── Simple GET request ──────────────────────────────────────────────────────

describe('parsePostmanCollection: simple requests', () => {
  it('converts a simple GET request with string URL', () => {
    const col = postmanCollection({
      item: [{
        name: 'Get Users',
        request: {
          method: 'GET',
          url: 'https://api.example.com/users',
        },
      }],
    });
    const { requests } = parsePostmanCollection(col as any);
    expect(requests).toHaveLength(1);
    expect(requests[0].name).toBe('Get Users');
    expect(requests[0].method).toBe('GET');
    expect(requests[0].url).toBe('https://api.example.com/users');
  });

  it('converts method to uppercase', () => {
    const col = postmanCollection({
      item: [{ name: 'Test', request: { method: 'post', url: 'https://example.com' } }],
    });
    const { requests } = parsePostmanCollection(col as any);
    expect(requests[0].method).toBe('POST');
  });

  it('defaults method to GET when missing', () => {
    const col = postmanCollection({
      item: [{ name: 'Test', request: { url: 'https://example.com' } }],
    });
    const { requests } = parsePostmanCollection(col as any);
    expect(requests[0].method).toBe('GET');
  });
});

// ─── URL parsing ─────────────────────────────────────────────────────────────

describe('parsePostmanCollection: URL handling', () => {
  it('extracts URL from Postman URL object with raw field', () => {
    const col = postmanCollection({
      item: [{
        name: 'Test',
        request: {
          method: 'GET',
          url: {
            raw: 'https://api.example.com/users?page=1',
            host: ['api', 'example', 'com'],
            path: ['users'],
            query: [{ key: 'page', value: '1' }],
          },
        },
      }],
    });
    const { requests } = parsePostmanCollection(col as any);
    expect(requests[0].url).toBe('https://api.example.com/users');
  });

  it('extracts query params from URL object query array', () => {
    const col = postmanCollection({
      item: [{
        name: 'Test',
        request: {
          method: 'GET',
          url: {
            raw: 'https://example.com/api?sort=name&limit=10',
            query: [
              { key: 'sort', value: 'name' },
              { key: 'limit', value: '10', disabled: true },
            ],
          },
        },
      }],
    });
    const { requests } = parsePostmanCollection(col as any);
    expect(requests[0].params).toHaveLength(2);
    expect(requests[0].params[0].key).toBe('sort');
    expect(requests[0].params[0].value).toBe('name');
    expect(requests[0].params[0].enabled).toBe(true);
    expect(requests[0].params[1].key).toBe('limit');
    expect(requests[0].params[1].enabled).toBe(false);
  });

  it('extracts query params from string URL', () => {
    const col = postmanCollection({
      item: [{
        name: 'Test',
        request: { method: 'GET', url: 'https://example.com/api?q=hello&page=2' },
      }],
    });
    const { requests } = parsePostmanCollection(col as any);
    expect(requests[0].params).toHaveLength(2);
    expect(requests[0].params[0].key).toBe('q');
    expect(requests[0].params[0].value).toBe('hello');
  });

  it('builds URL from parts when raw is missing', () => {
    const col = postmanCollection({
      item: [{
        name: 'Test',
        request: {
          method: 'GET',
          url: {
            protocol: 'https',
            host: ['api', 'example', 'com'],
            port: '8080',
            path: ['v2', 'users'],
          },
        },
      }],
    });
    const { requests } = parsePostmanCollection(col as any);
    expect(requests[0].url).toBe('https://api.example.com:8080/v2/users');
  });
});

// ─── Headers ─────────────────────────────────────────────────────────────────

describe('parsePostmanCollection: headers', () => {
  it('converts headers with enabled/disabled state', () => {
    const col = postmanCollection({
      item: [{
        name: 'Test',
        request: {
          method: 'GET',
          url: 'https://example.com',
          header: [
            { key: 'Accept', value: 'application/json' },
            { key: 'X-Debug', value: 'true', disabled: true },
          ],
        },
      }],
    });
    const { requests } = parsePostmanCollection(col as any);
    expect(requests[0].headers).toHaveLength(2);
    expect(requests[0].headers[0].key).toBe('Accept');
    expect(requests[0].headers[0].enabled).toBe(true);
    expect(requests[0].headers[1].key).toBe('X-Debug');
    expect(requests[0].headers[1].enabled).toBe(false);
  });
});

// ─── Body ────────────────────────────────────────────────────────────────────

describe('parsePostmanCollection: body', () => {
  it('converts raw JSON body', () => {
    const col = postmanCollection({
      item: [{
        name: 'Test',
        request: {
          method: 'POST',
          url: 'https://example.com',
          body: {
            mode: 'raw',
            raw: '{"name":"John"}',
            options: { raw: { language: 'json' } },
          },
        },
      }],
    });
    const { requests } = parsePostmanCollection(col as any);
    expect(requests[0].body.type).toBe('json');
    expect(requests[0].body.raw).toBe('{"name":"John"}');
  });

  it('converts raw XML body', () => {
    const col = postmanCollection({
      item: [{
        name: 'Test',
        request: {
          method: 'POST',
          url: 'https://example.com',
          body: { mode: 'raw', raw: '<root/>', options: { raw: { language: 'xml' } } },
        },
      }],
    });
    const { requests } = parsePostmanCollection(col as any);
    expect(requests[0].body.type).toBe('xml');
  });

  it('defaults raw body to text when no language specified', () => {
    const col = postmanCollection({
      item: [{
        name: 'Test',
        request: {
          method: 'POST',
          url: 'https://example.com',
          body: { mode: 'raw', raw: 'plain text' },
        },
      }],
    });
    const { requests } = parsePostmanCollection(col as any);
    expect(requests[0].body.type).toBe('text');
    expect(requests[0].body.raw).toBe('plain text');
  });

  it('converts urlencoded body', () => {
    const col = postmanCollection({
      item: [{
        name: 'Test',
        request: {
          method: 'POST',
          url: 'https://example.com',
          body: {
            mode: 'urlencoded',
            urlencoded: [
              { key: 'username', value: 'admin' },
              { key: 'password', value: 'secret', disabled: true },
            ],
          },
        },
      }],
    });
    const { requests } = parsePostmanCollection(col as any);
    expect(requests[0].body.type).toBe('x-www-form-urlencoded');
    expect(requests[0].body.urlencoded).toHaveLength(2);
    expect(requests[0].body.urlencoded[0].key).toBe('username');
    expect(requests[0].body.urlencoded[1].enabled).toBe(false);
  });

  it('converts formdata body and skips file entries', () => {
    const col = postmanCollection({
      item: [{
        name: 'Test',
        request: {
          method: 'POST',
          url: 'https://example.com',
          body: {
            mode: 'formdata',
            formdata: [
              { key: 'name', value: 'John', type: 'text' },
              { key: 'avatar', src: '/path/to/file', type: 'file' },
            ],
          },
        },
      }],
    });
    const { requests } = parsePostmanCollection(col as any);
    expect(requests[0].body.type).toBe('form-data');
    expect(requests[0].body.formData).toHaveLength(1); // file entry skipped
    expect(requests[0].body.formData[0].key).toBe('name');
  });

  it('returns none body when body is missing', () => {
    const col = postmanCollection({
      item: [{ name: 'Test', request: { method: 'GET', url: 'https://example.com' } }],
    });
    const { requests } = parsePostmanCollection(col as any);
    expect(requests[0].body.type).toBe('none');
  });
});

// ─── Auth ────────────────────────────────────────────────────────────────────

describe('parsePostmanCollection: auth', () => {
  it('converts basic auth', () => {
    const col = postmanCollection({
      item: [{
        name: 'Test',
        request: {
          method: 'GET',
          url: 'https://example.com',
          auth: {
            type: 'basic',
            basic: [
              { key: 'username', value: 'admin', type: 'string' },
              { key: 'password', value: 'secret', type: 'string' },
            ],
          },
        },
      }],
    });
    const { requests } = parsePostmanCollection(col as any);
    expect(requests[0].auth.type).toBe('basic');
    expect(requests[0].auth.basic!.username).toBe('admin');
    expect(requests[0].auth.basic!.password).toBe('secret');
  });

  it('converts bearer auth', () => {
    const col = postmanCollection({
      item: [{
        name: 'Test',
        request: {
          method: 'GET',
          url: 'https://example.com',
          auth: {
            type: 'bearer',
            bearer: [{ key: 'token', value: 'my-jwt-token', type: 'string' }],
          },
        },
      }],
    });
    const { requests } = parsePostmanCollection(col as any);
    expect(requests[0].auth.type).toBe('bearer');
    expect(requests[0].auth.bearer!.token).toBe('my-jwt-token');
  });

  it('converts apikey auth with header placement', () => {
    const col = postmanCollection({
      item: [{
        name: 'Test',
        request: {
          method: 'GET',
          url: 'https://example.com',
          auth: {
            type: 'apikey',
            apikey: [
              { key: 'key', value: 'X-API-Key', type: 'string' },
              { key: 'value', value: 'secret123', type: 'string' },
              { key: 'in', value: 'header', type: 'string' },
            ],
          },
        },
      }],
    });
    const { requests } = parsePostmanCollection(col as any);
    expect(requests[0].auth.type).toBe('api-key');
    expect(requests[0].auth.apiKey!.key).toBe('X-API-Key');
    expect(requests[0].auth.apiKey!.value).toBe('secret123');
    expect(requests[0].auth.apiKey!.addTo).toBe('header');
  });

  it('converts apikey auth with query placement', () => {
    const col = postmanCollection({
      item: [{
        name: 'Test',
        request: {
          method: 'GET',
          url: 'https://example.com',
          auth: {
            type: 'apikey',
            apikey: [
              { key: 'key', value: 'api_key', type: 'string' },
              { key: 'value', value: 'abc', type: 'string' },
              { key: 'in', value: 'query', type: 'string' },
            ],
          },
        },
      }],
    });
    const { requests } = parsePostmanCollection(col as any);
    expect(requests[0].auth.apiKey!.addTo).toBe('query');
  });

  it('returns no auth for noauth type', () => {
    const col = postmanCollection({
      item: [{
        name: 'Test',
        request: {
          method: 'GET',
          url: 'https://example.com',
          auth: { type: 'noauth' },
        },
      }],
    });
    const { requests } = parsePostmanCollection(col as any);
    expect(requests[0].auth.type).toBe('none');
  });

  it('returns no auth for unsupported auth types', () => {
    const col = postmanCollection({
      item: [{
        name: 'Test',
        request: {
          method: 'GET',
          url: 'https://example.com',
          auth: { type: 'oauth2', oauth2: [] },
        },
      }],
    });
    const { requests } = parsePostmanCollection(col as any);
    expect(requests[0].auth.type).toBe('none');
  });

  it('returns no auth when auth is missing', () => {
    const col = postmanCollection({
      item: [{ name: 'Test', request: { method: 'GET', url: 'https://example.com' } }],
    });
    const { requests } = parsePostmanCollection(col as any);
    expect(requests[0].auth.type).toBe('none');
  });
});

// ─── Folders (nested items) ──────────────────────────────────────────────────

describe('parsePostmanCollection: folders', () => {
  it('flattens requests from nested folders', () => {
    const col = postmanCollection({
      item: [
        {
          name: 'Users',
          item: [
            { name: 'Get Users', request: { method: 'GET', url: 'https://example.com/users' } },
            { name: 'Create User', request: { method: 'POST', url: 'https://example.com/users' } },
          ],
        },
        { name: 'Health Check', request: { method: 'GET', url: 'https://example.com/health' } },
      ],
    });
    const { requests } = parsePostmanCollection(col as any);
    expect(requests).toHaveLength(3);
    expect(requests[0].name).toBe('Get Users');
    expect(requests[1].name).toBe('Create User');
    expect(requests[2].name).toBe('Health Check');
  });

  it('handles deeply nested folders', () => {
    const col = postmanCollection({
      item: [{
        name: 'API',
        item: [{
          name: 'v2',
          item: [
            { name: 'Get Data', request: { method: 'GET', url: 'https://example.com/v2/data' } },
          ],
        }],
      }],
    });
    const { requests } = parsePostmanCollection(col as any);
    expect(requests).toHaveLength(1);
    expect(requests[0].name).toBe('Get Data');
  });

  it('skips empty folders', () => {
    const col = postmanCollection({
      item: [
        { name: 'Empty Folder', item: [] },
        { name: 'Request', request: { method: 'GET', url: 'https://example.com' } },
      ],
    });
    const { requests } = parsePostmanCollection(col as any);
    expect(requests).toHaveLength(1);
  });
});

// ─── Templated URL preservation ─────────────────────────────────────────────

describe('parsePostmanCollection: templated URLs', () => {
  it('preserves {{variable}} placeholders in string URLs', () => {
    const col = postmanCollection({
      item: [{
        name: 'Test',
        request: { method: 'GET', url: 'https://{{host}}/api/{{userId}}/profile' },
      }],
    });
    const { requests } = parsePostmanCollection(col as any);
    expect(requests[0].url).toBe('https://{{host}}/api/{{userId}}/profile');
  });

  it('preserves {{variable}} placeholders in URL object raw field', () => {
    const col = postmanCollection({
      item: [{
        name: 'Test',
        request: {
          method: 'GET',
          url: {
            raw: '{{baseUrl}}/users/{{userId}}?page=1',
            query: [{ key: 'page', value: '1' }],
          },
        },
      }],
    });
    const { requests } = parsePostmanCollection(col as any);
    expect(requests[0].url).toBe('{{baseUrl}}/users/{{userId}}');
  });
});

// ─── Inherited auth ─────────────────────────────────────────────────────────

describe('parsePostmanCollection: inherited auth', () => {
  it('inherits collection-level auth when request has no auth', () => {
    const col = postmanCollection({
      auth: {
        type: 'bearer',
        bearer: [{ key: 'token', value: 'collection-token', type: 'string' }],
      },
      item: [{
        name: 'Test',
        request: { method: 'GET', url: 'https://example.com' },
      }],
    });
    const { requests } = parsePostmanCollection(col as any);
    expect(requests[0].auth.type).toBe('bearer');
    expect(requests[0].auth.bearer!.token).toBe('collection-token');
  });

  it('inherits folder-level auth when request has no auth', () => {
    const col = postmanCollection({
      item: [{
        name: 'Folder',
        auth: {
          type: 'basic',
          basic: [
            { key: 'username', value: 'folderUser', type: 'string' },
            { key: 'password', value: 'folderPass', type: 'string' },
          ],
        },
        item: [{
          name: 'Test',
          request: { method: 'GET', url: 'https://example.com' },
        }],
      }],
    });
    const { requests } = parsePostmanCollection(col as any);
    expect(requests[0].auth.type).toBe('basic');
    expect(requests[0].auth.basic!.username).toBe('folderUser');
  });

  it('request-level auth overrides inherited auth', () => {
    const col = postmanCollection({
      auth: {
        type: 'bearer',
        bearer: [{ key: 'token', value: 'collection-token', type: 'string' }],
      },
      item: [{
        name: 'Test',
        request: {
          method: 'GET',
          url: 'https://example.com',
          auth: {
            type: 'basic',
            basic: [
              { key: 'username', value: 'reqUser', type: 'string' },
              { key: 'password', value: 'reqPass', type: 'string' },
            ],
          },
        },
      }],
    });
    const { requests } = parsePostmanCollection(col as any);
    expect(requests[0].auth.type).toBe('basic');
    expect(requests[0].auth.basic!.username).toBe('reqUser');
  });

  it('folder auth overrides collection auth for nested requests', () => {
    const col = postmanCollection({
      auth: {
        type: 'bearer',
        bearer: [{ key: 'token', value: 'collection-token', type: 'string' }],
      },
      item: [{
        name: 'Folder',
        auth: {
          type: 'basic',
          basic: [
            { key: 'username', value: 'folderUser', type: 'string' },
            { key: 'password', value: 'folderPass', type: 'string' },
          ],
        },
        item: [{
          name: 'Test',
          request: { method: 'GET', url: 'https://example.com' },
        }],
      }],
    });
    const { requests } = parsePostmanCollection(col as any);
    expect(requests[0].auth.type).toBe('basic');
    expect(requests[0].auth.basic!.username).toBe('folderUser');
  });
});

// ─── Full realistic Postman collection ───────────────────────────────────────

describe('parsePostmanCollection: full collection', () => {
  it('parses a realistic Postman v2.1 collection', () => {
    const col = {
      info: {
        _postman_id: '12345',
        name: 'Sample API',
        schema: 'https://schema.postman.com/json/collection/v2.1.0/collection.json',
      },
      variable: [{ key: 'baseUrl', value: 'https://api.example.com', type: 'string' }],
      item: [
        {
          name: 'Get Users',
          request: {
            method: 'GET',
            url: {
              raw: '{{baseUrl}}/users?page=1',
              query: [{ key: 'page', value: '1' }],
            },
            header: [{ key: 'Accept', value: 'application/json' }],
            auth: {
              type: 'bearer',
              bearer: [{ key: 'token', value: '{{auth_token}}', type: 'string' }],
            },
          },
        },
        {
          name: 'Create User',
          request: {
            method: 'POST',
            url: '{{baseUrl}}/users',
            header: [{ key: 'Content-Type', value: 'application/json' }],
            body: {
              mode: 'raw',
              raw: '{"name":"John","email":"john@example.com"}',
              options: { raw: { language: 'json' } },
            },
            auth: {
              type: 'basic',
              basic: [
                { key: 'username', value: 'admin', type: 'string' },
                { key: 'password', value: 'password123', type: 'string' },
              ],
            },
          },
        },
      ],
    };

    const result = parsePostmanCollection(col as any);
    expect(result.name).toBe('Sample API');
    expect(result.requests).toHaveLength(2);

    // First request
    const get = result.requests[0];
    expect(get.name).toBe('Get Users');
    expect(get.method).toBe('GET');
    expect(get.params).toHaveLength(1);
    expect(get.params[0].key).toBe('page');
    expect(get.headers[0].key).toBe('Accept');
    expect(get.auth.type).toBe('bearer');
    expect(get.auth.bearer!.token).toBe('{{auth_token}}');

    // Second request
    const post = result.requests[1];
    expect(post.name).toBe('Create User');
    expect(post.method).toBe('POST');
    expect(post.body.type).toBe('json');
    expect(post.body.raw).toContain('John');
    expect(post.auth.type).toBe('basic');
    expect(post.auth.basic!.username).toBe('admin');
  });
});
