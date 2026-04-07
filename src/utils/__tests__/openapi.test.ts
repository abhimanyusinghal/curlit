import { describe, it, expect } from 'vitest';
import { parseOpenApiInput, isOpenApiSpec, parseOpenApiSpec } from '../openapi';

// ─── isOpenApiSpec ──────────────────────────────────────────────────────────

describe('isOpenApiSpec', () => {
  it('detects OpenAPI 3.0 spec', () => {
    expect(isOpenApiSpec({
      openapi: '3.0.0',
      info: { title: 'Test', version: '1.0' },
      paths: {},
    })).toBe(true);
  });

  it('detects OpenAPI 3.1 spec', () => {
    expect(isOpenApiSpec({
      openapi: '3.1.0',
      info: { title: 'Test', version: '1.0' },
      paths: {},
    })).toBe(true);
  });

  it('detects Swagger 2.0 spec', () => {
    expect(isOpenApiSpec({
      swagger: '2.0',
      info: { title: 'Test', version: '1.0' },
      paths: {},
    })).toBe(true);
  });

  it('detects webhooks-only spec (3.1)', () => {
    expect(isOpenApiSpec({
      openapi: '3.1.0',
      info: { title: 'Test', version: '1.0' },
      webhooks: { onEvent: { post: {} } },
    })).toBe(true);
  });

  it('rejects missing version', () => {
    expect(isOpenApiSpec({
      info: { title: 'Test' },
      paths: {},
    })).toBe(false);
  });

  it('rejects missing info', () => {
    expect(isOpenApiSpec({
      openapi: '3.0.0',
      paths: {},
    })).toBe(false);
  });

  it('rejects missing both paths and webhooks', () => {
    expect(isOpenApiSpec({
      openapi: '3.0.0',
      info: { title: 'Test', version: '1.0' },
    })).toBe(false);
  });

  it('rejects non-objects', () => {
    expect(isOpenApiSpec(null)).toBe(false);
    expect(isOpenApiSpec('string')).toBe(false);
    expect(isOpenApiSpec(42)).toBe(false);
  });
});

// ─── parseOpenApiInput ──────────────────────────────────────────────────────

describe('parseOpenApiInput', () => {
  it('parses JSON input', () => {
    const result = parseOpenApiInput('{"openapi":"3.0.0","info":{"title":"T","version":"1"},"paths":{}}');
    expect(result.openapi).toBe('3.0.0');
  });

  it('parses YAML input', () => {
    const yaml = `openapi: "3.0.0"\ninfo:\n  title: Test\n  version: "1"\npaths: {}`;
    const result = parseOpenApiInput(yaml);
    expect(result.openapi).toBe('3.0.0');
    expect(result.info.title).toBe('Test');
  });
});

// ─── Basic path operations ──────────────────────────────────────────────────

describe('parseOpenApiSpec - basic operations', () => {
  it('extracts GET request from path', () => {
    const result = parseOpenApiSpec({
      openapi: '3.0.0',
      info: { title: 'My API', version: '1.0' },
      servers: [{ url: 'https://api.example.com' }],
      paths: {
        '/users': {
          get: {
            summary: 'List users',
            operationId: 'listUsers',
          },
        },
      },
    });

    expect(result.name).toBe('My API');
    expect(result.requests).toHaveLength(1);
    expect(result.requests[0].method).toBe('GET');
    expect(result.requests[0].url).toBe('https://api.example.com/users');
    expect(result.requests[0].name).toBe('List users');
  });

  it('extracts multiple methods from same path', () => {
    const result = parseOpenApiSpec({
      openapi: '3.0.0',
      info: { title: 'API', version: '1.0' },
      paths: {
        '/items': {
          get: { summary: 'List items' },
          post: { summary: 'Create item' },
          delete: { summary: 'Delete items' },
        },
      },
    });

    expect(result.requests).toHaveLength(3);
    expect(result.requests.map(r => r.method)).toEqual(['GET', 'POST', 'DELETE']);
  });

  it('falls back to operationId for name', () => {
    const result = parseOpenApiSpec({
      openapi: '3.0.0',
      info: { title: 'API', version: '1.0' },
      paths: { '/x': { get: { operationId: 'getX' } } },
    });
    expect(result.requests[0].name).toBe('getX');
  });

  it('falls back to METHOD /path for name', () => {
    const result = parseOpenApiSpec({
      openapi: '3.0.0',
      info: { title: 'API', version: '1.0' },
      paths: { '/x': { get: {} } },
    });
    expect(result.requests[0].name).toBe('GET /x');
  });

  it('marks deprecated operations', () => {
    const result = parseOpenApiSpec({
      openapi: '3.0.0',
      info: { title: 'API', version: '1.0' },
      paths: { '/old': { get: { summary: 'Old endpoint', deprecated: true } } },
    });
    expect(result.requests[0].name).toBe('[Deprecated] Old endpoint');
  });
});

// ─── Base URL resolution ────────────────────────────────────────────────────

describe('parseOpenApiSpec - base URL', () => {
  it('uses first server URL for OpenAPI 3.x', () => {
    const result = parseOpenApiSpec({
      openapi: '3.0.0',
      info: { title: 'API', version: '1.0' },
      servers: [
        { url: 'https://prod.example.com/v1' },
        { url: 'https://staging.example.com/v1' },
      ],
      paths: { '/users': { get: {} } },
    });
    expect(result.requests[0].url).toBe('https://prod.example.com/v1/users');
  });

  it('resolves server variables with defaults', () => {
    const result = parseOpenApiSpec({
      openapi: '3.0.0',
      info: { title: 'API', version: '1.0' },
      servers: [{
        url: 'https://{env}.example.com:{port}/v1',
        variables: {
          env: { default: 'prod' },
          port: { default: '443' },
        },
      }],
      paths: { '/users': { get: {} } },
    });
    expect(result.requests[0].url).toBe('https://prod.example.com:443/v1/users');
  });

  it('uses host/basePath/schemes for Swagger 2.0', () => {
    const result = parseOpenApiSpec({
      swagger: '2.0',
      info: { title: 'API', version: '1.0' },
      host: 'api.example.com',
      basePath: '/v1',
      schemes: ['https'],
      paths: { '/users': { get: {} } },
    });
    expect(result.requests[0].url).toBe('https://api.example.com/v1/users');
  });

  it('uses {{baseUrl}} placeholder when no server info', () => {
    const result = parseOpenApiSpec({
      openapi: '3.0.0',
      info: { title: 'API', version: '1.0' },
      paths: { '/users': { get: {} } },
    });
    expect(result.requests[0].url).toBe('{{baseUrl}}/users');
  });

  it('uses operation-level servers override', () => {
    const result = parseOpenApiSpec({
      openapi: '3.0.0',
      info: { title: 'API', version: '1.0' },
      servers: [{ url: 'https://global.example.com' }],
      paths: {
        '/data': {
          get: {
            summary: 'Get data',
            servers: [{ url: 'https://data-specific.example.com' }],
          },
        },
      },
    });
    expect(result.requests[0].url).toBe('https://data-specific.example.com/data');
  });
});

// ─── Parameters ─────────────────────────────────────────────────────────────

describe('parseOpenApiSpec - parameters', () => {
  it('extracts query parameters', () => {
    const result = parseOpenApiSpec({
      openapi: '3.0.0',
      info: { title: 'API', version: '1.0' },
      paths: {
        '/search': {
          get: {
            parameters: [
              { name: 'q', in: 'query', required: true, schema: { type: 'string' }, example: 'test' },
              { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
            ],
          },
        },
      },
    });

    expect(result.requests[0].params).toHaveLength(2);
    expect(result.requests[0].params[0].key).toBe('q');
    expect(result.requests[0].params[0].value).toBe('test');
    expect(result.requests[0].params[0].enabled).toBe(true);
    expect(result.requests[0].params[1].key).toBe('limit');
    expect(result.requests[0].params[1].value).toBe('10');
    expect(result.requests[0].params[1].enabled).toBe(false);
  });

  it('extracts header parameters', () => {
    const result = parseOpenApiSpec({
      openapi: '3.0.0',
      info: { title: 'API', version: '1.0' },
      paths: {
        '/data': {
          get: {
            parameters: [
              { name: 'X-Request-ID', in: 'header', schema: { type: 'string', format: 'uuid' }, example: 'abc-123' },
            ],
          },
        },
      },
    });

    expect(result.requests[0].headers).toHaveLength(1);
    expect(result.requests[0].headers[0].key).toBe('X-Request-ID');
    expect(result.requests[0].headers[0].value).toBe('abc-123');
  });

  it('replaces path parameters in URL', () => {
    const result = parseOpenApiSpec({
      openapi: '3.0.0',
      info: { title: 'API', version: '1.0' },
      servers: [{ url: 'https://api.example.com' }],
      paths: {
        '/users/{userId}/posts/{postId}': {
          get: {
            parameters: [
              { name: 'userId', in: 'path', required: true, schema: { type: 'integer' }, example: 42 },
              { name: 'postId', in: 'path', required: true, schema: { type: 'string' } },
            ],
          },
        },
      },
    });

    expect(result.requests[0].url).toBe('https://api.example.com/users/42/posts/string');
  });

  it('converts cookie parameters to Cookie header', () => {
    const result = parseOpenApiSpec({
      openapi: '3.0.0',
      info: { title: 'API', version: '1.0' },
      paths: {
        '/data': {
          get: {
            parameters: [
              { name: 'session', in: 'cookie', schema: { type: 'string' }, example: 'abc123' },
              { name: 'debug', in: 'cookie', schema: { type: 'boolean' }, example: true },
            ],
          },
        },
      },
    });

    const cookieHeader = result.requests[0].headers.find(h => h.key === 'Cookie');
    expect(cookieHeader).toBeDefined();
    expect(cookieHeader!.value).toBe('session=abc123; debug=true');
  });

  it('merges path-level and operation-level parameters', () => {
    const result = parseOpenApiSpec({
      openapi: '3.0.0',
      info: { title: 'API', version: '1.0' },
      paths: {
        '/items': {
          parameters: [
            { name: 'X-Tenant', in: 'header', schema: { type: 'string' }, example: 'acme' },
          ],
          get: {
            parameters: [
              { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
            ],
          },
        },
      },
    });

    expect(result.requests[0].headers).toHaveLength(1);
    expect(result.requests[0].headers[0].key).toBe('X-Tenant');
    expect(result.requests[0].params).toHaveLength(1);
    expect(result.requests[0].params[0].key).toBe('limit');
  });

  it('operation params override path-level params with same name+in', () => {
    const result = parseOpenApiSpec({
      openapi: '3.0.0',
      info: { title: 'API', version: '1.0' },
      paths: {
        '/items': {
          parameters: [
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
          ],
          get: {
            parameters: [
              { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } },
            ],
          },
        },
      },
    });

    expect(result.requests[0].params).toHaveLength(1);
    expect(result.requests[0].params[0].value).toBe('50');
  });

  it('handles parameter with content instead of schema', () => {
    const result = parseOpenApiSpec({
      openapi: '3.0.0',
      info: { title: 'API', version: '1.0' },
      paths: {
        '/filter': {
          get: {
            parameters: [{
              name: 'filter',
              in: 'query',
              content: {
                'application/json': {
                  schema: { type: 'object', properties: { status: { type: 'string' } } },
                  example: { status: 'active' },
                },
              },
            }],
          },
        },
      },
    });

    expect(result.requests[0].params[0].key).toBe('filter');
    expect(result.requests[0].params[0].value).toBe('{"status":"active"}');
  });
});

// ─── $ref resolution ────────────────────────────────────────────────────────

describe('parseOpenApiSpec - $ref resolution', () => {
  it('resolves $ref in parameters', () => {
    const result = parseOpenApiSpec({
      openapi: '3.0.0',
      info: { title: 'API', version: '1.0' },
      paths: {
        '/items': {
          get: {
            parameters: [{ $ref: '#/components/parameters/LimitParam' } as any],
          },
        },
      },
      components: {
        parameters: {
          LimitParam: { name: 'limit', in: 'query', schema: { type: 'integer', default: 25 } },
        },
      },
    });

    expect(result.requests[0].params).toHaveLength(1);
    expect(result.requests[0].params[0].key).toBe('limit');
    expect(result.requests[0].params[0].value).toBe('25');
  });

  it('resolves $ref in requestBody', () => {
    const result = parseOpenApiSpec({
      openapi: '3.0.0',
      info: { title: 'API', version: '1.0' },
      paths: {
        '/users': {
          post: {
            requestBody: { $ref: '#/components/requestBodies/UserBody' } as any,
          },
        },
      },
      components: {
        requestBodies: {
          UserBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { name: { type: 'string', example: 'John' } },
                },
              },
            },
          },
        },
      },
    });

    expect(result.requests[0].body.type).toBe('json');
    expect(JSON.parse(result.requests[0].body.raw)).toEqual({ name: 'John' });
  });

  it('resolves $ref in schemas', () => {
    const result = parseOpenApiSpec({
      openapi: '3.0.0',
      info: { title: 'API', version: '1.0' },
      paths: {
        '/pets': {
          post: {
            requestBody: {
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/Pet' } },
              },
            },
          },
        },
      },
      components: {
        schemas: {
          Pet: {
            type: 'object',
            properties: {
              id: { type: 'integer' },
              name: { type: 'string' },
            },
          },
        },
      },
    });

    expect(JSON.parse(result.requests[0].body.raw)).toEqual({ id: 0, name: 'string' });
  });

  it('resolves Swagger 2.0 #/definitions/ refs', () => {
    const result = parseOpenApiSpec({
      swagger: '2.0',
      info: { title: 'API', version: '1.0' },
      paths: {
        '/pets': {
          post: {
            parameters: [{
              name: 'body',
              in: 'body',
              schema: { $ref: '#/definitions/Pet' },
            }],
          },
        },
      },
      definitions: {
        Pet: {
          type: 'object',
          properties: {
            name: { type: 'string', example: 'Buddy' },
          },
        },
      },
    } as any);

    expect(JSON.parse(result.requests[0].body.raw)).toEqual({ name: 'Buddy' });
  });

  it('handles circular $ref without infinite loop', () => {
    const result = parseOpenApiSpec({
      openapi: '3.0.0',
      info: { title: 'API', version: '1.0' },
      paths: {
        '/tree': {
          post: {
            requestBody: {
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/Node' } },
              },
            },
          },
        },
      },
      components: {
        schemas: {
          Node: {
            type: 'object',
            properties: {
              value: { type: 'string' },
              children: { type: 'array', items: { $ref: '#/components/schemas/Node' } },
            },
          },
        },
      },
    });

    // Should not throw or hang
    const body = JSON.parse(result.requests[0].body.raw);
    expect(body.value).toBe('string');
    expect(Array.isArray(body.children)).toBe(true);
  });

  it('resolves $ref in path items (OpenAPI 3.1)', () => {
    const result = parseOpenApiSpec({
      openapi: '3.1.0',
      info: { title: 'API', version: '1.0' },
      paths: {
        '/shared': { $ref: '#/components/pathItems/SharedItem' } as any,
      },
      components: {
        pathItems: {
          SharedItem: {
            get: { summary: 'Shared GET' },
          },
        },
      },
    });

    expect(result.requests).toHaveLength(1);
    expect(result.requests[0].name).toBe('Shared GET');
  });
});

// ─── Schema composition: allOf, oneOf, anyOf ────────────────────────────────

describe('parseOpenApiSpec - schema composition', () => {
  it('merges allOf schemas', () => {
    const result = parseOpenApiSpec({
      openapi: '3.0.0',
      info: { title: 'API', version: '1.0' },
      paths: {
        '/pets': {
          post: {
            requestBody: {
              content: {
                'application/json': {
                  schema: {
                    allOf: [
                      { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
                      { type: 'object', properties: { breed: { type: 'string' } } },
                    ],
                  },
                },
              },
            },
          },
        },
      },
    });

    const body = JSON.parse(result.requests[0].body.raw);
    expect(body).toEqual({ name: 'string', breed: 'string' });
  });

  it('merges allOf with $ref', () => {
    const result = parseOpenApiSpec({
      openapi: '3.0.0',
      info: { title: 'API', version: '1.0' },
      paths: {
        '/dogs': {
          post: {
            requestBody: {
              content: {
                'application/json': {
                  schema: {
                    allOf: [
                      { $ref: '#/components/schemas/Animal' },
                      { type: 'object', properties: { breed: { type: 'string' } } },
                    ],
                  },
                },
              },
            },
          },
        },
      },
      components: {
        schemas: {
          Animal: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              age: { type: 'integer' },
            },
            required: ['name'],
          },
        },
      },
    });

    const body = JSON.parse(result.requests[0].body.raw);
    expect(body).toEqual({ name: 'string', age: 0, breed: 'string' });
  });

  it('picks first oneOf branch', () => {
    const result = parseOpenApiSpec({
      openapi: '3.0.0',
      info: { title: 'API', version: '1.0' },
      paths: {
        '/payment': {
          post: {
            requestBody: {
              content: {
                'application/json': {
                  schema: {
                    oneOf: [
                      { type: 'object', properties: { card: { type: 'string' } } },
                      { type: 'object', properties: { bank: { type: 'string' } } },
                    ],
                  },
                },
              },
            },
          },
        },
      },
    });

    const body = JSON.parse(result.requests[0].body.raw);
    expect(body).toEqual({ card: 'string' });
  });

  it('picks first anyOf branch', () => {
    const result = parseOpenApiSpec({
      openapi: '3.0.0',
      info: { title: 'API', version: '1.0' },
      paths: {
        '/data': {
          post: {
            requestBody: {
              content: {
                'application/json': {
                  schema: {
                    anyOf: [
                      { type: 'string' },
                      { type: 'integer' },
                    ],
                  },
                },
              },
            },
          },
        },
      },
    });

    expect(result.requests[0].body.raw).toBe('string');
  });
});

// ─── Request body ───────────────────────────────────────────────────────────

describe('parseOpenApiSpec - request body', () => {
  it('generates JSON body from schema', () => {
    const result = parseOpenApiSpec({
      openapi: '3.0.0',
      info: { title: 'API', version: '1.0' },
      paths: {
        '/users': {
          post: {
            requestBody: {
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      name: { type: 'string', example: 'Jane' },
                      age: { type: 'integer', example: 30 },
                      active: { type: 'boolean' },
                      tags: { type: 'array', items: { type: 'string' } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    expect(result.requests[0].body.type).toBe('json');
    const body = JSON.parse(result.requests[0].body.raw);
    expect(body).toEqual({ name: 'Jane', age: 30, active: false, tags: ['string'] });
  });

  it('uses media-level example over schema', () => {
    const result = parseOpenApiSpec({
      openapi: '3.0.0',
      info: { title: 'API', version: '1.0' },
      paths: {
        '/data': {
          post: {
            requestBody: {
              content: {
                'application/json': {
                  example: { custom: 'example' },
                  schema: { type: 'object', properties: { other: { type: 'string' } } },
                },
              },
            },
          },
        },
      },
    });

    const body = JSON.parse(result.requests[0].body.raw);
    expect(body).toEqual({ custom: 'example' });
  });

  it('handles form-data body', () => {
    const result = parseOpenApiSpec({
      openapi: '3.0.0',
      info: { title: 'API', version: '1.0' },
      paths: {
        '/upload': {
          post: {
            requestBody: {
              content: {
                'multipart/form-data': {
                  schema: {
                    type: 'object',
                    properties: {
                      file: { type: 'string', format: 'binary' },
                      description: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    expect(result.requests[0].body.type).toBe('form-data');
    expect(result.requests[0].body.formData.length).toBeGreaterThan(0);
  });

  it('handles url-encoded body', () => {
    const result = parseOpenApiSpec({
      openapi: '3.0.0',
      info: { title: 'API', version: '1.0' },
      paths: {
        '/login': {
          post: {
            requestBody: {
              content: {
                'application/x-www-form-urlencoded': {
                  schema: {
                    type: 'object',
                    required: ['username', 'password'],
                    properties: {
                      username: { type: 'string' },
                      password: { type: 'string', format: 'password' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    expect(result.requests[0].body.type).toBe('x-www-form-urlencoded');
    expect(result.requests[0].body.urlencoded).toHaveLength(2);
  });

  it('handles Swagger 2.0 body parameter', () => {
    const result = parseOpenApiSpec({
      swagger: '2.0',
      info: { title: 'API', version: '1.0' },
      paths: {
        '/users': {
          post: {
            consumes: ['application/json'],
            parameters: [{
              name: 'body',
              in: 'body',
              schema: {
                type: 'object',
                properties: { name: { type: 'string' } },
              },
            }],
          },
        },
      },
    });

    expect(result.requests[0].body.type).toBe('json');
    expect(JSON.parse(result.requests[0].body.raw)).toEqual({ name: 'string' });
  });

  it('handles Swagger 2.0 formData parameters', () => {
    const result = parseOpenApiSpec({
      swagger: '2.0',
      info: { title: 'API', version: '1.0' },
      paths: {
        '/upload': {
          post: {
            consumes: ['multipart/form-data'],
            parameters: [
              { name: 'file', in: 'formData', type: 'file' },
              { name: 'name', in: 'formData', type: 'string', default: 'doc.pdf' },
            ],
          },
        },
      },
    });

    expect(result.requests[0].body.type).toBe('form-data');
    expect(result.requests[0].body.formData).toHaveLength(2);
    expect(result.requests[0].body.formData[0].key).toBe('file');
    expect(result.requests[0].body.formData[0].valueType).toBe('file');
    expect(result.requests[0].body.formData[1].key).toBe('name');
    expect(result.requests[0].body.formData[1].valueType).toBe('text');
  });

  it('detects binary fields in OAS3 multipart/form-data as file entries', () => {
    const result = parseOpenApiSpec({
      openapi: '3.0.0',
      info: { title: 'API', version: '1.0' },
      paths: {
        '/upload': {
          post: {
            requestBody: {
              content: {
                'multipart/form-data': {
                  schema: {
                    type: 'object',
                    required: ['file'],
                    properties: {
                      file: { type: 'string', format: 'binary' },
                      thumbnail: { type: 'string', format: 'byte' },
                      description: { type: 'string', example: 'My file' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    expect(result.requests[0].body.type).toBe('form-data');
    expect(result.requests[0].body.formData).toHaveLength(3);
    expect(result.requests[0].body.formData[0].key).toBe('file');
    expect(result.requests[0].body.formData[0].valueType).toBe('file');
    expect(result.requests[0].body.formData[0].value).toBe('');
    // format: byte is base64-encoded text, not a file upload
    expect(result.requests[0].body.formData[1].key).toBe('thumbnail');
    expect(result.requests[0].body.formData[1].valueType).toBe('text');
    expect(result.requests[0].body.formData[2].key).toBe('description');
    expect(result.requests[0].body.formData[2].valueType).toBe('text');
    expect(result.requests[0].body.formData[2].value).toBe('My file');
  });

  it('detects OAS 3.1 nullable binary fields (type array) as file entries', () => {
    const result = parseOpenApiSpec({
      openapi: '3.1.0',
      info: { title: 'API', version: '1.0' },
      paths: {
        '/upload': {
          post: {
            requestBody: {
              content: {
                'multipart/form-data': {
                  schema: {
                    type: 'object',
                    properties: {
                      avatar: { type: ['string', 'null'], format: 'binary' },
                      name: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    expect(result.requests[0].body.formData).toHaveLength(2);
    expect(result.requests[0].body.formData[0].key).toBe('avatar');
    expect(result.requests[0].body.formData[0].valueType).toBe('file');
    expect(result.requests[0].body.formData[1].key).toBe('name');
    expect(result.requests[0].body.formData[1].valueType).toBe('text');
  });

  it('skips readOnly properties in body', () => {
    const result = parseOpenApiSpec({
      openapi: '3.0.0',
      info: { title: 'API', version: '1.0' },
      paths: {
        '/users': {
          post: {
            requestBody: {
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      id: { type: 'integer', readOnly: true },
                      name: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    const body = JSON.parse(result.requests[0].body.raw);
    expect(body).toEqual({ name: 'string' });
    expect(body.id).toBeUndefined();
  });

  it('handles additionalProperties schema', () => {
    const result = parseOpenApiSpec({
      openapi: '3.0.0',
      info: { title: 'API', version: '1.0' },
      paths: {
        '/meta': {
          post: {
            requestBody: {
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    additionalProperties: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    });

    const body = JSON.parse(result.requests[0].body.raw);
    expect(body).toEqual({ additionalProp: 'string' });
  });

  it('matches vendor content types like application/vnd.api+json', () => {
    const result = parseOpenApiSpec({
      openapi: '3.0.0',
      info: { title: 'API', version: '1.0' },
      paths: {
        '/data': {
          post: {
            requestBody: {
              content: {
                'application/vnd.api+json': {
                  schema: { type: 'object', properties: { data: { type: 'string' } } },
                },
              },
            },
          },
        },
      },
    });

    expect(result.requests[0].body.type).toBe('json');
    expect(JSON.parse(result.requests[0].body.raw)).toEqual({ data: 'string' });
  });
});

// ─── Schema example generation ──────────────────────────────────────────────

describe('parseOpenApiSpec - schema examples', () => {
  it('generates examples for all string formats', () => {
    const result = parseOpenApiSpec({
      openapi: '3.0.0',
      info: { title: 'API', version: '1.0' },
      paths: {
        '/test': {
          post: {
            requestBody: {
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      date: { type: 'string', format: 'date' },
                      datetime: { type: 'string', format: 'date-time' },
                      email: { type: 'string', format: 'email' },
                      uri: { type: 'string', format: 'uri' },
                      uuid: { type: 'string', format: 'uuid' },
                      ip4: { type: 'string', format: 'ipv4' },
                      ip6: { type: 'string', format: 'ipv6' },
                      host: { type: 'string', format: 'hostname' },
                      b64: { type: 'string', format: 'byte' },
                      pwd: { type: 'string', format: 'password' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    const body = JSON.parse(result.requests[0].body.raw);
    expect(body.date).toBe('2024-01-01');
    expect(body.datetime).toBe('2024-01-01T00:00:00Z');
    expect(body.email).toBe('user@example.com');
    expect(body.uri).toBe('https://example.com');
    expect(body.uuid).toBe('00000000-0000-0000-0000-000000000000');
    expect(body.ip4).toBe('192.168.1.1');
    expect(body.ip6).toBe('::1');
    expect(body.host).toBe('example.com');
    expect(body.b64).toBe('dGVzdA==');
    expect(body.pwd).toBe('********');
  });

  it('handles number constraints', () => {
    const result = parseOpenApiSpec({
      openapi: '3.0.0',
      info: { title: 'API', version: '1.0' },
      paths: {
        '/test': {
          post: {
            requestBody: {
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      bounded: { type: 'integer', minimum: 10, maximum: 20 },
                      minOnly: { type: 'integer', minimum: 5 },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    const body = JSON.parse(result.requests[0].body.raw);
    expect(body.bounded).toBe(15);
    expect(body.minOnly).toBe(5);
  });

  it('handles enum and const', () => {
    const result = parseOpenApiSpec({
      openapi: '3.1.0',
      info: { title: 'API', version: '1.0' },
      paths: {
        '/test': {
          post: {
            requestBody: {
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      status: { type: 'string', enum: ['active', 'inactive'] },
                      fixed: { const: 'always_this' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    const body = JSON.parse(result.requests[0].body.raw);
    expect(body.status).toBe('active');
    expect(body.fixed).toBe('always_this');
  });

  it('handles OpenAPI 3.1 type arrays (nullable)', () => {
    const result = parseOpenApiSpec({
      openapi: '3.1.0',
      info: { title: 'API', version: '1.0' },
      paths: {
        '/test': {
          post: {
            requestBody: {
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      name: { type: ['string', 'null'] },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    const body = JSON.parse(result.requests[0].body.raw);
    expect(body.name).toBe('string');
  });
});

// ─── Auth ────────────────────────────────────────────────────────────────────

describe('parseOpenApiSpec - authentication', () => {
  it('detects bearer auth', () => {
    const result = parseOpenApiSpec({
      openapi: '3.0.0',
      info: { title: 'API', version: '1.0' },
      paths: { '/secure': { get: {} } },
      components: {
        securitySchemes: {
          BearerAuth: { type: 'http', scheme: 'bearer' },
        },
      },
      security: [{ BearerAuth: [] }],
    });

    expect(result.requests[0].auth.type).toBe('bearer');
  });

  it('detects basic auth', () => {
    const result = parseOpenApiSpec({
      openapi: '3.0.0',
      info: { title: 'API', version: '1.0' },
      paths: { '/secure': { get: {} } },
      components: {
        securitySchemes: {
          BasicAuth: { type: 'http', scheme: 'basic' },
        },
      },
      security: [{ BasicAuth: [] }],
    });

    expect(result.requests[0].auth.type).toBe('basic');
  });

  it('detects API key auth', () => {
    const result = parseOpenApiSpec({
      openapi: '3.0.0',
      info: { title: 'API', version: '1.0' },
      paths: { '/secure': { get: {} } },
      components: {
        securitySchemes: {
          ApiKey: { type: 'apiKey', name: 'X-API-Key', in: 'header' },
        },
      },
      security: [{ ApiKey: [] }],
    });

    expect(result.requests[0].auth.type).toBe('api-key');
    expect(result.requests[0].auth.apiKey?.key).toBe('X-API-Key');
    expect(result.requests[0].auth.apiKey?.addTo).toBe('header');
  });

  it('detects API key in query', () => {
    const result = parseOpenApiSpec({
      openapi: '3.0.0',
      info: { title: 'API', version: '1.0' },
      paths: { '/secure': { get: {} } },
      components: {
        securitySchemes: {
          ApiKey: { type: 'apiKey', name: 'api_key', in: 'query' },
        },
      },
      security: [{ ApiKey: [] }],
    });

    expect(result.requests[0].auth.apiKey?.addTo).toBe('query');
  });

  it('maps OAuth2 to bearer', () => {
    const result = parseOpenApiSpec({
      openapi: '3.0.0',
      info: { title: 'API', version: '1.0' },
      paths: { '/secure': { get: {} } },
      components: {
        securitySchemes: {
          OAuth: {
            type: 'oauth2',
            flows: {
              authorizationCode: {
                authorizationUrl: 'https://auth.example.com/authorize',
                tokenUrl: 'https://auth.example.com/token',
                scopes: { read: 'Read access' },
              },
            },
          },
        },
      },
      security: [{ OAuth: ['read'] }],
    });

    expect(result.requests[0].auth.type).toBe('bearer');
  });

  it('operation-level security overrides global', () => {
    const result = parseOpenApiSpec({
      openapi: '3.0.0',
      info: { title: 'API', version: '1.0' },
      paths: {
        '/public': {
          get: { security: [] }, // explicitly no auth
        },
      },
      components: {
        securitySchemes: {
          BearerAuth: { type: 'http', scheme: 'bearer' },
        },
      },
      security: [{ BearerAuth: [] }],
    });

    expect(result.requests[0].auth.type).toBe('none');
  });

  it('skips anonymous {} and uses next requirement', () => {
    const result = parseOpenApiSpec({
      openapi: '3.0.0',
      info: { title: 'API', version: '1.0' },
      paths: { '/mixed': { get: {} } },
      components: {
        securitySchemes: {
          BearerAuth: { type: 'http', scheme: 'bearer' },
        },
      },
      security: [{}, { BearerAuth: [] }],
    });

    expect(result.requests[0].auth.type).toBe('bearer');
  });

  it('handles Swagger 2.0 securityDefinitions', () => {
    const result = parseOpenApiSpec({
      swagger: '2.0',
      info: { title: 'API', version: '1.0' },
      paths: { '/secure': { get: {} } },
      securityDefinitions: {
        BasicAuth: { type: 'basic' },
      },
      security: [{ BasicAuth: [] }],
    } as any);

    expect(result.requests[0].auth.type).toBe('basic');
  });

  it('resolves $ref in security schemes', () => {
    const result = parseOpenApiSpec({
      openapi: '3.0.0',
      info: { title: 'API', version: '1.0' },
      paths: { '/secure': { get: {} } },
      components: {
        securitySchemes: {
          MyAuth: { $ref: '#/components/securitySchemes/ActualAuth' } as any,
          ActualAuth: { type: 'http', scheme: 'bearer' },
        },
      },
      // Note: in real specs, security references the scheme name, not a $ref.
      // But if the scheme itself is a $ref, we should resolve it.
      security: [{ MyAuth: [] }],
    });

    expect(result.requests[0].auth.type).toBe('bearer');
  });
});

// ─── Webhooks ───────────────────────────────────────────────────────────────

describe('parseOpenApiSpec - webhooks', () => {
  it('imports webhooks with [Webhook] prefix', () => {
    const result = parseOpenApiSpec({
      openapi: '3.1.0',
      info: { title: 'Webhook API', version: '1.0' },
      webhooks: {
        newPet: {
          post: {
            summary: 'New pet notification',
            requestBody: {
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: { name: { type: 'string' } },
                  },
                },
              },
            },
          },
        },
      },
    });

    expect(result.requests).toHaveLength(1);
    expect(result.requests[0].name).toBe('[Webhook] New pet notification');
    expect(result.requests[0].method).toBe('POST');
    expect(result.requests[0].body.type).toBe('json');
  });

  it('handles spec with both paths and webhooks', () => {
    const result = parseOpenApiSpec({
      openapi: '3.1.0',
      info: { title: 'API', version: '1.0' },
      paths: { '/pets': { get: { summary: 'List pets' } } },
      webhooks: { newPet: { post: { summary: 'Pet created' } } },
    });

    expect(result.requests).toHaveLength(2);
    expect(result.requests[0].name).toBe('List pets');
    expect(result.requests[1].name).toBe('[Webhook] Pet created');
  });
});

// ─── Callbacks ──────────────────────────────────────────────────────────────

describe('parseOpenApiSpec - callbacks', () => {
  it('imports callback operations', () => {
    const result = parseOpenApiSpec({
      openapi: '3.0.0',
      info: { title: 'API', version: '1.0' },
      servers: [{ url: 'https://api.example.com' }],
      paths: {
        '/subscribe': {
          post: {
            summary: 'Subscribe',
            callbacks: {
              onEvent: {
                '{$request.body#/callbackUrl}': {
                  post: {
                    summary: 'Event notification',
                    requestBody: {
                      content: {
                        'application/json': {
                          schema: { type: 'object', properties: { event: { type: 'string' } } },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    // Should have the main request + the callback
    expect(result.requests).toHaveLength(2);
    const callback = result.requests.find(r => r.name.includes('[Callback'));
    expect(callback).toBeDefined();
    expect(callback!.name).toContain('Event notification');
    expect(callback!.method).toBe('POST');
  });
});

// ─── Swagger 2.0 specific ───────────────────────────────────────────────────

describe('parseOpenApiSpec - Swagger 2.0 specifics', () => {
  it('uses global consumes when operation has none', () => {
    const result = parseOpenApiSpec({
      swagger: '2.0',
      info: { title: 'API', version: '1.0' },
      consumes: ['application/json'],
      paths: {
        '/data': {
          post: {
            parameters: [{
              name: 'body',
              in: 'body',
              schema: { type: 'object', properties: { x: { type: 'string' } } },
            }],
          },
        },
      },
    } as any);

    expect(result.requests[0].body.type).toBe('json');
  });
});

// ─── Callback URL handling ──────────────────────────────────────────────────

describe('parseOpenApiSpec - callback URLs', () => {
  it('does not prepend API base URL to callback runtime expressions', () => {
    const result = parseOpenApiSpec({
      openapi: '3.0.0',
      info: { title: 'API', version: '1.0' },
      servers: [{ url: 'https://api.example.com' }],
      paths: {
        '/subscribe': {
          post: {
            summary: 'Subscribe',
            callbacks: {
              onEvent: {
                '{$request.body#/callbackUrl}/data': {
                  post: { summary: 'Event callback' },
                },
              },
            },
          },
        },
      },
    });

    const callback = result.requests.find(r => r.name.includes('[Callback'));
    expect(callback).toBeDefined();
    // URL should NOT start with https://api.example.com
    expect(callback!.url).not.toContain('https://api.example.com');
    expect(callback!.url).toContain('callbackUrl');
    expect(callback!.url).toContain('/data');
  });
});

// ─── Content-Type header for vendor media types ─────────────────────────────

describe('parseOpenApiSpec - Content-Type headers', () => {
  it('adds Content-Type header for vendor +json types', () => {
    const result = parseOpenApiSpec({
      openapi: '3.0.0',
      info: { title: 'API', version: '1.0' },
      paths: {
        '/data': {
          post: {
            requestBody: {
              content: {
                'application/vnd.api+json': {
                  schema: { type: 'object', properties: { x: { type: 'string' } } },
                },
              },
            },
          },
        },
      },
    });

    const ctHeader = result.requests[0].headers.find(h => h.key === 'Content-Type');
    expect(ctHeader).toBeDefined();
    expect(ctHeader!.value).toBe('application/vnd.api+json');
  });

  it('does not add Content-Type header for standard application/json', () => {
    const result = parseOpenApiSpec({
      openapi: '3.0.0',
      info: { title: 'API', version: '1.0' },
      paths: {
        '/data': {
          post: {
            requestBody: {
              content: {
                'application/json': {
                  schema: { type: 'object', properties: { x: { type: 'string' } } },
                },
              },
            },
          },
        },
      },
    });

    const ctHeader = result.requests[0].headers.find(h => h.key === 'Content-Type');
    expect(ctHeader).toBeUndefined();
  });

  it('adds Content-Type header for vendor +xml types', () => {
    const result = parseOpenApiSpec({
      openapi: '3.0.0',
      info: { title: 'API', version: '1.0' },
      paths: {
        '/data': {
          post: {
            requestBody: {
              content: {
                'application/vnd.custom+xml': {
                  schema: { type: 'object', properties: { x: { type: 'string' } } },
                },
              },
            },
          },
        },
      },
    });

    const ctHeader = result.requests[0].headers.find(h => h.key === 'Content-Type');
    expect(ctHeader).toBeDefined();
    expect(ctHeader!.value).toBe('application/vnd.custom+xml');
  });
});

// ─── Array parameter serialization (style/explode) ──────────────────────────

describe('parseOpenApiSpec - array parameter serialization', () => {
  it('serializes form+explode array as repeated params', () => {
    const result = parseOpenApiSpec({
      openapi: '3.0.0',
      info: { title: 'API', version: '1.0' },
      paths: {
        '/items': {
          get: {
            parameters: [{
              name: 'ids',
              in: 'query',
              style: 'form',
              explode: true,
              schema: { type: 'array', items: { type: 'integer' } },
            }],
          },
        },
      },
    });

    // Should produce multiple params with the same key
    const idsParams = result.requests[0].params.filter(p => p.key === 'ids');
    expect(idsParams.length).toBe(2);
    expect(idsParams[0].value).toBe('0');
    expect(idsParams[1].value).toBe('0');
  });

  it('serializes form+no-explode array as comma-separated', () => {
    const result = parseOpenApiSpec({
      openapi: '3.0.0',
      info: { title: 'API', version: '1.0' },
      paths: {
        '/items': {
          get: {
            parameters: [{
              name: 'ids',
              in: 'query',
              style: 'form',
              explode: false,
              schema: { type: 'array', items: { type: 'integer' } },
            }],
          },
        },
      },
    });

    const idsParams = result.requests[0].params.filter(p => p.key === 'ids');
    expect(idsParams).toHaveLength(1);
    expect(idsParams[0].value).toBe('0,0');
  });

  it('serializes pipeDelimited array', () => {
    const result = parseOpenApiSpec({
      openapi: '3.0.0',
      info: { title: 'API', version: '1.0' },
      paths: {
        '/items': {
          get: {
            parameters: [{
              name: 'tags',
              in: 'query',
              style: 'pipeDelimited',
              explode: false,
              schema: { type: 'array', items: { type: 'string' } },
            }],
          },
        },
      },
    });

    const tagParams = result.requests[0].params.filter(p => p.key === 'tags');
    expect(tagParams).toHaveLength(1);
    expect(tagParams[0].value).toBe('string|string');
  });

  it('serializes spaceDelimited array', () => {
    const result = parseOpenApiSpec({
      openapi: '3.0.0',
      info: { title: 'API', version: '1.0' },
      paths: {
        '/items': {
          get: {
            parameters: [{
              name: 'ids',
              in: 'query',
              style: 'spaceDelimited',
              explode: false,
              schema: { type: 'array', items: { type: 'integer' } },
            }],
          },
        },
      },
    });

    const idsParams = result.requests[0].params.filter(p => p.key === 'ids');
    expect(idsParams).toHaveLength(1);
    expect(idsParams[0].value).toBe('0 0');
  });

  it('serializes deepObject style for objects', () => {
    const result = parseOpenApiSpec({
      openapi: '3.0.0',
      info: { title: 'API', version: '1.0' },
      paths: {
        '/items': {
          get: {
            parameters: [{
              name: 'filter',
              in: 'query',
              style: 'deepObject',
              explode: true,
              schema: {
                type: 'object',
                properties: {
                  status: { type: 'string', enum: ['active'] },
                  limit: { type: 'integer', default: 10 },
                },
              },
            }],
          },
        },
      },
    });

    const filterParams = result.requests[0].params;
    const statusParam = filterParams.find(p => p.key === 'filter[status]');
    const limitParam = filterParams.find(p => p.key === 'filter[limit]');
    expect(statusParam).toBeDefined();
    expect(statusParam!.value).toBe('active');
    expect(limitParam).toBeDefined();
    expect(limitParam!.value).toBe('10');
  });
});

// ─── Official OpenAPI Examples (https://learn.openapis.org/examples/) ────────
// These are the 9 official example specs from the OpenAPI Initiative.
// Each must parse without errors and produce the expected requests.

describe('Official OpenAPI examples from learn.openapis.org', () => {

  // Helper: parse YAML, validate, and return result
  function importYaml(yaml: string) {
    const parsed = parseOpenApiInput(yaml);
    expect(isOpenApiSpec(parsed)).toBe(true);
    return parseOpenApiSpec(parsed as any);
  }

  // ── 1. api-with-examples (OpenAPI 3.0) ──────────────────────────────────
  it('api-with-examples: parses 2 GET endpoints', () => {
    const result = importYaml(`
openapi: "3.0.0"
info:
  title: Simple API overview
  version: 2.0.0
paths:
  /:
    get:
      operationId: listVersionsv2
      summary: List API versions
      responses:
        "200":
          description: 200 response
          content:
            application/json:
              examples:
                foo:
                  value:
                    versions:
                      - status: CURRENT
                        id: v2.0
  /v2:
    get:
      operationId: getVersionDetailsv2
      summary: Show API version details
      responses:
        "200":
          description: 200 response
`);
    expect(result.name).toBe('Simple API overview');
    expect(result.requests).toHaveLength(2);
    expect(result.requests[0].method).toBe('GET');
    expect(result.requests[0].name).toBe('List API versions');
    expect(result.requests[1].method).toBe('GET');
    expect(result.requests[1].name).toBe('Show API version details');
  });

  // ── 2. callback-example (OpenAPI 3.0) ───────────────────────────────────
  it('callback-example: parses subscription endpoint + callback', () => {
    const result = importYaml(`
openapi: 3.0.0
info:
  title: Callback Example
  version: 1.0.0
paths:
  /streams:
    post:
      description: subscribes a client to receive out-of-band data
      parameters:
        - name: callbackUrl
          in: query
          required: true
          description: the location where data will be sent
          schema:
            type: string
            format: uri
            example: https://tonys-server.com
      responses:
        "201":
          description: subscription successfully created
          content:
            application/json:
              schema:
                type: object
                properties:
                  subscriptionId:
                    type: string
                    example: 2531329f-fb09-4ef7-887e-84e648214436
      callbacks:
        onData:
          "{$request.query.callbackUrl}/data":
            post:
              requestBody:
                description: subscription payload
                content:
                  application/json:
                    schema:
                      type: object
                      properties:
                        timestamp:
                          type: string
                          format: date-time
                        userData:
                          type: string
              responses:
                "202":
                  description: Your server returns this if data received
`);
    expect(result.name).toBe('Callback Example');
    // Main POST + callback POST
    expect(result.requests.length).toBeGreaterThanOrEqual(2);

    const mainReq = result.requests.find(r => r.url.includes('/streams'));
    expect(mainReq).toBeDefined();
    expect(mainReq!.method).toBe('POST');
    expect(mainReq!.params[0].key).toBe('callbackUrl');
    expect(mainReq!.params[0].value).toBe('https://tonys-server.com');

    const callbackReq = result.requests.find(r => r.name.includes('[Callback'));
    expect(callbackReq).toBeDefined();
    expect(callbackReq!.method).toBe('POST');
    expect(callbackReq!.body.type).toBe('json');
  });

  // ── 3. link-example (OpenAPI 3.0) ───────────────────────────────────────
  it('link-example: parses 6 endpoints with $ref schemas', () => {
    const result = importYaml(`
openapi: 3.0.0
info:
  title: Link Example
  version: 1.0.0
paths:
  /2.0/users/{username}:
    get:
      operationId: getUserByName
      parameters:
        - name: username
          in: path
          required: true
          schema:
            type: string
      responses:
        "200":
          description: The User
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/user"
  /2.0/repositories/{username}:
    get:
      operationId: getRepositoriesByOwner
      parameters:
        - name: username
          in: path
          required: true
          schema:
            type: string
      responses:
        "200":
          description: repositories owned by the supplied user
  /2.0/repositories/{username}/{slug}:
    get:
      operationId: getRepository
      parameters:
        - name: username
          in: path
          required: true
          schema:
            type: string
        - name: slug
          in: path
          required: true
          schema:
            type: string
      responses:
        "200":
          description: The repository
  /2.0/repositories/{username}/{slug}/pullrequests:
    get:
      operationId: getPullRequestsByRepository
      parameters:
        - name: username
          in: path
          required: true
          schema:
            type: string
        - name: slug
          in: path
          required: true
          schema:
            type: string
        - name: state
          in: query
          schema:
            type: string
            enum:
              - open
              - merged
              - declined
      responses:
        "200":
          description: an array of pull request objects
  /2.0/repositories/{username}/{slug}/pullrequests/{pid}:
    get:
      operationId: getPullRequestsById
      parameters:
        - name: username
          in: path
          required: true
          schema:
            type: string
        - name: slug
          in: path
          required: true
          schema:
            type: string
        - name: pid
          in: path
          required: true
          schema:
            type: string
      responses:
        "200":
          description: a pull request object
  /2.0/repositories/{username}/{slug}/pullrequests/{pid}/merge:
    post:
      operationId: mergePullRequest
      parameters:
        - name: username
          in: path
          required: true
          schema:
            type: string
        - name: slug
          in: path
          required: true
          schema:
            type: string
        - name: pid
          in: path
          required: true
          schema:
            type: string
      responses:
        "204":
          description: the PR was successfully merged
components:
  schemas:
    user:
      type: object
      properties:
        username:
          type: string
        uuid:
          type: string
    repository:
      type: object
      properties:
        slug:
          type: string
        owner:
          $ref: "#/components/schemas/user"
    pullrequest:
      type: object
      properties:
        id:
          type: integer
        title:
          type: string
        repository:
          $ref: "#/components/schemas/repository"
        author:
          $ref: "#/components/schemas/user"
`);
    expect(result.name).toBe('Link Example');
    expect(result.requests).toHaveLength(6);
    expect(result.requests.map(r => r.method)).toEqual(['GET', 'GET', 'GET', 'GET', 'GET', 'POST']);

    // Query param with enum should use first enum value
    const prListReq = result.requests.find(r => r.name === 'getPullRequestsByRepository');
    expect(prListReq).toBeDefined();
    expect(prListReq!.params.find(p => p.key === 'state')?.value).toBe('open');
  });

  // ── 4. non-oauth-scopes (OpenAPI 3.1) ──────────────────────────────────
  it('non-oauth-scopes: parses with bearer auth', () => {
    const result = importYaml(`
openapi: 3.1.0
info:
  title: Non-oAuth Scopes example
  version: 1.0.0
paths:
  /users:
    get:
      security:
        - bearerAuth:
            - "read:users"
            - public
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: jwt
`);
    expect(result.name).toBe('Non-oAuth Scopes example');
    expect(result.requests).toHaveLength(1);
    expect(result.requests[0].method).toBe('GET');
    expect(result.requests[0].auth.type).toBe('bearer');
  });

  // ── 5. petstore (OpenAPI 3.0) ──────────────────────────────────────────
  it('petstore: parses 3 endpoints with $ref schemas and server URL', () => {
    const result = importYaml(`
openapi: 3.0.0
info:
  version: 1.0.0
  title: Swagger Petstore
  license:
    name: MIT
servers:
  - url: http://petstore.swagger.io/v1
paths:
  /pets:
    get:
      summary: List all pets
      operationId: listPets
      tags:
        - pets
      parameters:
        - name: limit
          in: query
          description: How many items to return at one time (max 100)
          required: false
          schema:
            type: integer
            maximum: 100
            format: int32
      responses:
        "200":
          description: A paged array of pets
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/Pets"
    post:
      summary: Create a pet
      operationId: createPets
      tags:
        - pets
      requestBody:
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/Pet"
        required: true
      responses:
        "201":
          description: Null response
  /pets/{petId}:
    get:
      summary: Info for a specific pet
      operationId: showPetById
      tags:
        - pets
      parameters:
        - name: petId
          in: path
          required: true
          description: The id of the pet to retrieve
          schema:
            type: string
      responses:
        "200":
          description: Expected response to a valid request
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/Pet"
components:
  schemas:
    Pet:
      type: object
      required:
        - id
        - name
      properties:
        id:
          type: integer
          format: int64
        name:
          type: string
        tag:
          type: string
    Pets:
      type: array
      maxItems: 100
      items:
        $ref: "#/components/schemas/Pet"
    Error:
      type: object
      required:
        - code
        - message
      properties:
        code:
          type: integer
          format: int32
        message:
          type: string
`);
    expect(result.name).toBe('Swagger Petstore');
    expect(result.requests).toHaveLength(3);
    expect(result.requests[0].url).toBe('http://petstore.swagger.io/v1/pets');
    expect(result.requests[0].method).toBe('GET');
    expect(result.requests[0].name).toBe('List all pets');

    // POST body should have Pet schema
    const createPet = result.requests[1];
    expect(createPet.method).toBe('POST');
    expect(createPet.body.type).toBe('json');
    const body = JSON.parse(createPet.body.raw);
    expect(body).toHaveProperty('id');
    expect(body).toHaveProperty('name');

    // Path param
    expect(result.requests[2].url).toContain('/pets/');
    expect(result.requests[2].name).toBe('Info for a specific pet');
  });

  // ── 6. petstore-expanded (OpenAPI 3.0, uses allOf) ─���───────────────────
  it('petstore-expanded: parses allOf schema composition (Pet = NewPet + id)', () => {
    const result = importYaml(`
openapi: 3.0.0
info:
  version: 1.0.0
  title: Swagger Petstore
  description: A sample API that uses a petstore as an example
servers:
  - url: https://petstore.swagger.io/v2
paths:
  /pets:
    get:
      description: Returns all pets
      operationId: findPets
      parameters:
        - name: tags
          in: query
          description: tags to filter by
          required: false
          style: form
          schema:
            type: array
            items:
              type: string
        - name: limit
          in: query
          description: maximum number of results to return
          required: false
          schema:
            type: integer
            format: int32
      responses:
        "200":
          description: pet response
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: "#/components/schemas/Pet"
    post:
      description: Creates a new pet in the store. Duplicates are allowed
      operationId: addPet
      requestBody:
        description: Pet to add to the store
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/NewPet"
      responses:
        "200":
          description: pet response
  /pets/{id}:
    get:
      description: Returns a user based on a single ID
      operationId: find pet by id
      parameters:
        - name: id
          in: path
          description: ID of pet to fetch
          required: true
          schema:
            type: integer
            format: int64
      responses:
        "200":
          description: pet response
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/Pet"
    delete:
      description: deletes a single pet based on the ID supplied
      operationId: deletePet
      parameters:
        - name: id
          in: path
          description: ID of pet to delete
          required: true
          schema:
            type: integer
            format: int64
      responses:
        "204":
          description: pet deleted
components:
  schemas:
    Pet:
      allOf:
        - $ref: "#/components/schemas/NewPet"
        - type: object
          required:
            - id
          properties:
            id:
              type: integer
              format: int64
    NewPet:
      type: object
      required:
        - name
      properties:
        name:
          type: string
        tag:
          type: string
    Error:
      type: object
      required:
        - code
        - message
      properties:
        code:
          type: integer
          format: int32
        message:
          type: string
`);
    expect(result.name).toBe('Swagger Petstore');
    expect(result.requests).toHaveLength(4);

    // POST /pets creates NewPet (no readOnly id)
    const addPet = result.requests.find(r => r.name === 'addPet');
    expect(addPet).toBeDefined();
    expect(addPet!.body.type).toBe('json');
    const newPetBody = JSON.parse(addPet!.body.raw);
    expect(newPetBody).toHaveProperty('name');
    expect(newPetBody).toHaveProperty('tag');

    // GET /pets/{id} and DELETE /pets/{id} have path param
    const getById = result.requests.find(r => r.name === 'find pet by id');
    expect(getById).toBeDefined();
    expect(getById!.url).toContain('/pets/');

    const deletePet = result.requests.find(r => r.name === 'deletePet');
    expect(deletePet).toBeDefined();
    expect(deletePet!.method).toBe('DELETE');
  });

  // ── 7. tictactoe (OpenAPI 3.1, complex: $ref params, multiple auth, webhooks, callbacks) ──
  it('tictactoe: parses paths + webhooks + callbacks with multiple security schemes', () => {
    const result = importYaml(`
openapi: 3.1.0
info:
  title: Tic Tac Toe
  description: This API allows writing down marks on a Tic Tac Toe board
  version: 1.0.0
paths:
  /board:
    get:
      summary: Get the whole board
      operationId: get-board
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/status"
      security:
        - defaultApiKey: []
        - app2AppOauth:
          - "board:read"
  /board/{row}/{column}:
    parameters:
      - $ref: "#/components/parameters/rowParam"
      - $ref: "#/components/parameters/columnParam"
    get:
      summary: Get a single board square
      operationId: get-square
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/mark"
      security:
        - bearerHttpAuthentication: []
    put:
      summary: Set a single board square
      operationId: put-square
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/mark"
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/status"
      security:
        - bearerHttpAuthentication: []
      callbacks:
        statusCallback:
          "{$request.header.progressUrl}":
            post:
              summary: Status of mark operation
              operationId: markOperationCallback
              requestBody:
                content:
                  application/json:
                    schema:
                      $ref: "#/components/schemas/status"
              responses:
                "200":
                  description: Mark operation status received
webhooks:
  markStatus:
    post:
      summary: Status of mark operation
      operationId: markOperationWebhook
      responses:
        "200":
          description: Mark operation has completed successfully
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/status"
components:
  parameters:
    rowParam:
      description: Board row (vertical coordinate)
      name: row
      in: path
      required: true
      schema:
        $ref: "#/components/schemas/coordinate"
    columnParam:
      description: Board column (horizontal coordinate)
      name: column
      in: path
      required: true
      schema:
        $ref: "#/components/schemas/coordinate"
  schemas:
    coordinate:
      type: integer
      minimum: 1
      maximum: 3
      example: 1
    mark:
      type: string
      enum:
        - "."
        - X
        - O
      example: "."
    board:
      type: array
      maxItems: 3
      minItems: 3
      items:
        type: array
        maxItems: 3
        minItems: 3
        items:
          $ref: "#/components/schemas/mark"
    winner:
      type: string
      enum:
        - "."
        - X
        - O
      example: "."
    status:
      type: object
      properties:
        winner:
          $ref: "#/components/schemas/winner"
        board:
          $ref: "#/components/schemas/board"
  securitySchemes:
    defaultApiKey:
      type: apiKey
      name: api-key
      in: header
    bearerHttpAuthentication:
      type: http
      scheme: Bearer
      bearerFormat: JWT
    app2AppOauth:
      type: oauth2
      flows:
        clientCredentials:
          tokenUrl: https://learn.openapis.org/oauth/2.0/token
          scopes:
            "board:read": Read the board
    user2AppOauth:
      type: oauth2
      flows:
        authorizationCode:
          authorizationUrl: https://learn.openapis.org/oauth/2.0/auth
          tokenUrl: https://learn.openapis.org/oauth/2.0/token
          scopes:
            "board:read": Read the board
            "board:write": Write to the board
`);
    expect(result.name).toBe('Tic Tac Toe');
    // 3 path operations + 1 callback + 1 webhook = 5
    expect(result.requests.length).toBeGreaterThanOrEqual(5);

    // GET /board uses apiKey auth (first in security array)
    const getBoard = result.requests.find(r => r.name === 'Get the whole board');
    expect(getBoard).toBeDefined();
    expect(getBoard!.auth.type).toBe('api-key');
    expect(getBoard!.auth.apiKey?.key).toBe('api-key');

    // GET /board/{row}/{column} uses bearer auth and has $ref params resolved
    const getSquare = result.requests.find(r => r.name === 'Get a single board square');
    expect(getSquare).toBeDefined();
    expect(getSquare!.auth.type).toBe('bearer');
    // $ref params should resolve coordinate schema with example: 1
    expect(getSquare!.url).toContain('/board/1/1');

    // PUT has mark enum body
    const putSquare = result.requests.find(r => r.name === 'Set a single board square');
    expect(putSquare).toBeDefined();
    expect(putSquare!.body.type).toBe('json');

    // Webhook present
    const webhook = result.requests.find(r => r.name.includes('[Webhook]'));
    expect(webhook).toBeDefined();

    // Callback present
    const callback = result.requests.find(r => r.name.includes('[Callback'));
    expect(callback).toBeDefined();
  });

  // ── 8. uspto (OpenAPI 3.0.1, server variables, form-urlencoded) ────────
  it('uspto: parses server variables and url-encoded POST body', () => {
    const result = importYaml(`
openapi: 3.0.1
servers:
  - url: "{scheme}://developer.uspto.gov/ds-api"
    variables:
      scheme:
        description: The Data Set API is accessible via https and http
        enum:
          - https
          - http
        default: https
info:
  description: The Data Set API (DSAPI) allows the public users to discover and search USPTO exported data sets.
  version: 1.0.0
  title: USPTO Data Set API
paths:
  /:
    get:
      operationId: list-data-sets
      summary: List available data sets
      responses:
        "200":
          description: Returns a list of data sets
  /{dataset}/{version}/fields:
    get:
      summary: Provides the general information about the API and the list of fields
      operationId: list-searchable-fields
      parameters:
        - name: dataset
          in: path
          required: true
          example: oa_citations
          schema:
            type: string
        - name: version
          in: path
          required: true
          example: v1
          schema:
            type: string
      responses:
        "200":
          description: The dataset API for the given version is found
  /{dataset}/{version}/records:
    post:
      summary: Provides search capability for the data set
      operationId: perform-search
      parameters:
        - name: version
          in: path
          required: true
          schema:
            type: string
            default: v1
        - name: dataset
          in: path
          required: true
          schema:
            type: string
            default: oa_citations
      requestBody:
        content:
          application/x-www-form-urlencoded:
            schema:
              type: object
              properties:
                criteria:
                  description: Uses Lucene Query Syntax
                  type: string
                  default: "*:*"
                start:
                  description: Starting record number. Default value is 0.
                  type: integer
                  default: 0
                rows:
                  description: Specify number of rows to be returned.
                  type: integer
                  default: 100
              required:
                - criteria
      responses:
        "200":
          description: successful operation
`);
    expect(result.name).toBe('USPTO Data Set API');
    expect(result.requests).toHaveLength(3);

    // Server variable should resolve to https
    expect(result.requests[0].url).toBe('https://developer.uspto.gov/ds-api/');

    // Path params should be resolved
    const fieldsReq = result.requests.find(r => r.name?.includes('general information') || r.name?.includes('searchable'));
    expect(fieldsReq).toBeDefined();
    expect(fieldsReq!.url).toContain('oa_citations');
    expect(fieldsReq!.url).toContain('v1');

    // POST with url-encoded body
    const searchReq = result.requests.find(r => r.name?.includes('search'));
    expect(searchReq).toBeDefined();
    expect(searchReq!.method).toBe('POST');
    expect(searchReq!.body.type).toBe('x-www-form-urlencoded');
    expect(searchReq!.body.urlencoded.length).toBeGreaterThan(0);
    const criteriaField = searchReq!.body.urlencoded.find(p => p.key === 'criteria');
    expect(criteriaField).toBeDefined();
    expect(criteriaField!.value).toBe('*:*');
  });

  // ── 9. webhook-example (OpenAPI 3.1, webhooks-only) ────────────────────
  it('webhook-example: parses webhooks-only spec with $ref schema', () => {
    const result = importYaml(`
openapi: 3.1.0
info:
  title: Webhook Example
  version: 1.0.0
webhooks:
  newPet:
    post:
      requestBody:
        description: Information about a new pet in the system
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/Pet"
      responses:
        "200":
          description: Return a 200 status to indicate that the data was received successfully
components:
  schemas:
    Pet:
      type: object
      required:
        - id
        - name
      properties:
        id:
          type: integer
          format: int64
        name:
          type: string
        tag:
          type: string
`);
    expect(result.name).toBe('Webhook Example');
    expect(result.requests).toHaveLength(1);
    expect(result.requests[0].name).toContain('[Webhook]');
    expect(result.requests[0].method).toBe('POST');
    expect(result.requests[0].body.type).toBe('json');

    // Body should have Pet schema resolved
    const body = JSON.parse(result.requests[0].body.raw);
    expect(body).toHaveProperty('id');
    expect(body).toHaveProperty('name');
    expect(body).toHaveProperty('tag');
    expect(typeof body.id).toBe('number');
    expect(typeof body.name).toBe('string');
  });
});
