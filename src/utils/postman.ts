import type { RequestConfig, KeyValuePair, AuthConfig, BodyType, HttpMethod } from '../types';
import { createDefaultRequest, createKeyValuePair } from '../types';

// ─── Postman v2.1 Types ─────────────────────────────────────────────────────

interface PostmanCollection {
  info: {
    name: string;
    schema?: string;
  };
  item: PostmanItem[];
  variable?: PostmanVariable[];
}

interface PostmanItem {
  name: string;
  request?: PostmanRequest;
  item?: PostmanItem[]; // folders contain nested items
}

interface PostmanRequest {
  method: string;
  url: string | PostmanUrl;
  header?: PostmanHeader[];
  body?: PostmanBody;
  auth?: PostmanAuth;
}

interface PostmanUrl {
  raw?: string;
  protocol?: string;
  host?: string[] | string;
  port?: string;
  path?: string[] | string;
  query?: PostmanQueryParam[];
}

interface PostmanQueryParam {
  key: string;
  value: string;
  disabled?: boolean;
  description?: string;
}

interface PostmanHeader {
  key: string;
  value: string;
  disabled?: boolean;
  description?: string;
}

interface PostmanBody {
  mode?: string;
  raw?: string;
  urlencoded?: PostmanKV[];
  formdata?: PostmanKV[];
  options?: {
    raw?: {
      language?: string;
    };
  };
}

interface PostmanKV {
  key: string;
  value?: string;
  disabled?: boolean;
  description?: string;
  type?: string;
}

interface PostmanAuth {
  type: string;
  basic?: PostmanAuthAttr[];
  bearer?: PostmanAuthAttr[];
  apikey?: PostmanAuthAttr[];
}

interface PostmanAuthAttr {
  key: string;
  value: string;
  type?: string;
}

interface PostmanVariable {
  key: string;
  value: string;
  type?: string;
}

// ─── Detection ───────────────────────────────────────────────────────────────

export function isPostmanCollection(data: unknown): data is PostmanCollection {
  if (typeof data !== 'object' || data === null) return false;
  const obj = data as Record<string, unknown>;
  return (
    typeof obj.info === 'object' &&
    obj.info !== null &&
    typeof (obj.info as Record<string, unknown>).name === 'string' &&
    Array.isArray(obj.item)
  );
}

// ─── Conversion ──────────────────────────────────────────────────────────────

export function parsePostmanCollection(data: PostmanCollection): {
  name: string;
  requests: RequestConfig[];
} {
  const name = data.info.name || 'Imported Collection';
  const requests = flattenItems(data.item);
  return { name, requests };
}

function flattenItems(items: PostmanItem[], prefix = ''): RequestConfig[] {
  const results: RequestConfig[] = [];

  for (const item of items) {
    const itemName = prefix ? `${prefix}/${item.name}` : item.name;

    if (item.item && item.item.length > 0) {
      // Folder — recurse, preserving folder path as name prefix
      results.push(...flattenItems(item.item, itemName));
    } else if (item.request) {
      results.push(convertRequest(item.name, itemName, item.request));
    }
  }

  return results;
}

function convertRequest(name: string, _fullPath: string, req: PostmanRequest): RequestConfig {
  const url = extractUrl(req.url);
  const params = extractQueryParams(req.url);
  const headers = convertHeaders(req.header);
  const body = convertBody(req.body);
  const auth = convertAuth(req.auth);
  const method = (req.method?.toUpperCase() || 'GET') as HttpMethod;

  return createDefaultRequest({
    name,
    method,
    url,
    params,
    headers,
    body,
    auth,
  });
}

// ─── URL ─────────────────────────────────────────────────────────────────────

function extractUrl(url: string | PostmanUrl | undefined): string {
  if (!url) return '';
  if (typeof url === 'string') {
    // Strip query params — they'll be extracted separately
    try {
      const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
      return `${parsed.origin}${parsed.pathname}`;
    } catch {
      return url.split('?')[0];
    }
  }
  if (url.raw) {
    // Use raw but strip query string
    try {
      const parsed = new URL(url.raw.startsWith('http') ? url.raw : `https://${url.raw}`);
      return `${parsed.origin}${parsed.pathname}`;
    } catch {
      return url.raw.split('?')[0];
    }
  }
  // Build from parts
  const protocol = url.protocol || 'https';
  const host = Array.isArray(url.host) ? url.host.join('.') : (url.host || '');
  const port = url.port ? `:${url.port}` : '';
  const path = Array.isArray(url.path) ? '/' + url.path.join('/') : (url.path || '');
  return `${protocol}://${host}${port}${path}`;
}

function extractQueryParams(url: string | PostmanUrl | undefined): KeyValuePair[] {
  if (!url) return [];

  // Postman URL object with explicit query array
  if (typeof url === 'object' && url.query) {
    return url.query.map(q =>
      createKeyValuePair({
        key: q.key,
        value: q.value || '',
        enabled: !q.disabled,
        description: q.description,
      })
    );
  }

  // String URL — parse query params from the string
  const raw = typeof url === 'string' ? url : url.raw;
  if (!raw) return [];

  try {
    const parsed = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    const params: KeyValuePair[] = [];
    parsed.searchParams.forEach((value, key) => {
      params.push(createKeyValuePair({ key, value, enabled: true }));
    });
    return params;
  } catch {
    return [];
  }
}

// ─── Headers ─────────────────────────────────────────────────────────────────

function convertHeaders(headers?: PostmanHeader[]): KeyValuePair[] {
  if (!headers) return [];
  return headers.map(h =>
    createKeyValuePair({
      key: h.key,
      value: h.value,
      enabled: !h.disabled,
      description: h.description,
    })
  );
}

// ─── Body ────────────────────────────────────────────────────────────────────

function convertBody(body?: PostmanBody): RequestConfig['body'] {
  const empty = { type: 'none' as BodyType, raw: '', formData: [], urlencoded: [] };
  if (!body || !body.mode) return empty;

  switch (body.mode) {
    case 'raw': {
      const language = body.options?.raw?.language || '';
      let type: BodyType = 'text';
      if (language === 'json') type = 'json';
      else if (language === 'xml') type = 'xml';
      else if (language === 'html') type = 'text';
      return { type, raw: body.raw || '', formData: [], urlencoded: [] };
    }
    case 'formdata':
      return {
        type: 'form-data',
        raw: '',
        formData: (body.formdata || [])
          .filter(f => f.type !== 'file') // skip file entries — not supported yet
          .map(f =>
            createKeyValuePair({
              key: f.key,
              value: f.value || '',
              enabled: !f.disabled,
              description: f.description,
            })
          ),
        urlencoded: [],
      };
    case 'urlencoded':
      return {
        type: 'x-www-form-urlencoded',
        raw: '',
        formData: [],
        urlencoded: (body.urlencoded || []).map(f =>
          createKeyValuePair({
            key: f.key,
            value: f.value || '',
            enabled: !f.disabled,
            description: f.description,
          })
        ),
      };
    default:
      return empty;
  }
}

// ─── Auth ────────────────────────────────────────────────────────────────────

function getAuthAttr(attrs: PostmanAuthAttr[] | undefined, key: string): string {
  if (!attrs) return '';
  const attr = attrs.find(a => a.key === key);
  return attr?.value || '';
}

function convertAuth(auth?: PostmanAuth): AuthConfig {
  if (!auth || auth.type === 'noauth') return { type: 'none' };

  switch (auth.type) {
    case 'basic':
      return {
        type: 'basic',
        basic: {
          username: getAuthAttr(auth.basic, 'username'),
          password: getAuthAttr(auth.basic, 'password'),
        },
      };
    case 'bearer':
      return {
        type: 'bearer',
        bearer: {
          token: getAuthAttr(auth.bearer, 'token'),
        },
      };
    case 'apikey':
      return {
        type: 'api-key',
        apiKey: {
          key: getAuthAttr(auth.apikey, 'key'),
          value: getAuthAttr(auth.apikey, 'value'),
          addTo: getAuthAttr(auth.apikey, 'in') === 'query' ? 'query' : 'header',
        },
      };
    default:
      // Unsupported auth types (oauth1, oauth2, digest, etc.) — import as no auth
      return { type: 'none' };
  }
}
