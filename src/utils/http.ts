import type { RequestConfig, ResponseData, KeyValuePair, AuthConfig } from '../types';

const DEFAULT_PROXY_PATH = '/api/proxy';
const PROXY_URL_KEY = 'curlit_proxy_url';

export function getProxyUrl(): string {
  return localStorage.getItem(PROXY_URL_KEY) || DEFAULT_PROXY_PATH;
}

export function setProxyUrl(url: string): void {
  if (url && url !== DEFAULT_PROXY_PATH) {
    localStorage.setItem(PROXY_URL_KEY, url);
  } else {
    localStorage.removeItem(PROXY_URL_KEY);
  }
}

export function buildUrl(baseUrl: string, params: KeyValuePair[]): string {
  const enabledParams = params.filter(p => p.enabled && p.key);
  if (enabledParams.length === 0) return baseUrl;

  const url = new URL(baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`);
  enabledParams.forEach(p => url.searchParams.append(p.key, p.value));
  return url.toString();
}

export function buildHeaders(headers: KeyValuePair[], auth: AuthConfig): Record<string, string> {
  const result: Record<string, string> = {};

  headers.filter(h => h.enabled && h.key).forEach(h => {
    result[h.key] = h.value;
  });

  switch (auth.type) {
    case 'basic':
      if (auth.basic) {
        result['Authorization'] = `Basic ${btoa(`${auth.basic.username}:${auth.basic.password}`)}`;
      }
      break;
    case 'bearer':
      if (auth.bearer) {
        result['Authorization'] = `Bearer ${auth.bearer.token}`;
      }
      break;
    case 'api-key':
      if (auth.apiKey && auth.apiKey.addTo === 'header') {
        result[auth.apiKey.key] = auth.apiKey.value;
      }
      break;
  }

  return result;
}

export function buildBody(request: RequestConfig): string | FormData | null {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return null;

  switch (request.body.type) {
    case 'none':
      return null;
    case 'json':
    case 'text':
    case 'xml':
      return request.body.raw;
    case 'form-data': {
      const formData = new FormData();
      request.body.formData.filter(f => f.enabled && f.key).forEach(f => {
        formData.append(f.key, f.value);
      });
      return formData;
    }
    case 'x-www-form-urlencoded': {
      const params = new URLSearchParams();
      request.body.urlencoded.filter(f => f.enabled && f.key).forEach(f => {
        params.append(f.key, f.value);
      });
      return params.toString();
    }
    default:
      return null;
  }
}

export function resolveVariables(text: string, variables: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return variables[key] ?? match;
  });
}

export function resolveRequestVariables(request: RequestConfig, variables: Record<string, string>): RequestConfig {
  return {
    ...request,
    url: resolveVariables(request.url, variables),
    params: request.params.map(p => ({
      ...p,
      key: resolveVariables(p.key, variables),
      value: resolveVariables(p.value, variables),
    })),
    headers: request.headers.map(h => ({
      ...h,
      key: resolveVariables(h.key, variables),
      value: resolveVariables(h.value, variables),
    })),
    body: {
      ...request.body,
      raw: resolveVariables(request.body.raw, variables),
      formData: request.body.formData.map(f => ({
        ...f,
        key: resolveVariables(f.key, variables),
        value: resolveVariables(f.value, variables),
      })),
      urlencoded: request.body.urlencoded.map(f => ({
        ...f,
        key: resolveVariables(f.key, variables),
        value: resolveVariables(f.value, variables),
      })),
    },
    auth: resolveAuthVariables(request.auth, variables),
  };
}

function resolveAuthVariables(auth: AuthConfig, variables: Record<string, string>): AuthConfig {
  const resolved = { ...auth };
  if (resolved.basic) {
    resolved.basic = {
      username: resolveVariables(resolved.basic.username, variables),
      password: resolveVariables(resolved.basic.password, variables),
    };
  }
  if (resolved.bearer) {
    resolved.bearer = { token: resolveVariables(resolved.bearer.token, variables) };
  }
  if (resolved.apiKey) {
    resolved.apiKey = {
      ...resolved.apiKey,
      key: resolveVariables(resolved.apiKey.key, variables),
      value: resolveVariables(resolved.apiKey.value, variables),
    };
  }
  return resolved;
}

export async function sendRequest(request: RequestConfig): Promise<ResponseData> {
  const url = buildUrl(request.url, request.params);
  const headers = buildHeaders(request.headers, request.auth);
  const body = buildBody(request);

  if (request.body.type === 'json' && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  } else if (request.body.type === 'xml' && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/xml';
  } else if (request.body.type === 'x-www-form-urlencoded' && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
  }

  // Add api-key to query params if configured
  let finalUrl = url;
  if (request.auth.type === 'api-key' && request.auth.apiKey?.addTo === 'query') {
    const urlObj = new URL(finalUrl.startsWith('http') ? finalUrl : `https://${finalUrl}`);
    urlObj.searchParams.append(request.auth.apiKey.key, request.auth.apiKey.value);
    finalUrl = urlObj.toString();
  }

  // Use proxy server to avoid CORS
  const proxyUrl = getProxyUrl();
  const startTime = performance.now();

  let response: Response;
  try {
    response = await fetch(proxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: request.method,
        url: finalUrl,
        headers,
        body: body instanceof FormData ? Object.fromEntries(body) : body,
        bodyType: request.body.type,
      }),
    });
  } catch {
    const isCustomProxy = proxyUrl !== DEFAULT_PROXY_PATH;
    const hint = isCustomProxy
      ? `Could not reach the proxy server at ${proxyUrl}.\nCheck that your proxy is running and the URL is correct.`
      : `Could not reach the proxy server.\n\nCurlIt needs a proxy server to make HTTP requests and bypass CORS.\n\nTo set up the proxy:\n  1. Clone the repo: git clone https://github.com/abhimanyusinghal/curlit.git\n  2. Install deps: npm install\n  3. Start proxy: npm run dev:server\n\nOr set a custom proxy URL in Settings.`;
    return {
      status: 0,
      statusText: 'Error',
      headers: {},
      body: hint,
      size: 0,
      time: Math.round(performance.now() - startTime),
      cookies: [],
    };
  }

  const elapsed = performance.now() - startTime;
  const data = await response.json();

  return {
    status: data.status,
    statusText: data.statusText,
    headers: data.headers || {},
    body: typeof data.body === 'string' ? data.body : JSON.stringify(data.body, null, 2),
    size: new Blob([typeof data.body === 'string' ? data.body : JSON.stringify(data.body)]).size,
    time: Math.round(elapsed),
    cookies: data.cookies || [],
  };
}

export function parseCurlCommand(curlStr: string): Partial<RequestConfig> {
  const result: Partial<RequestConfig> = {
    method: 'GET',
    url: '',
    headers: [],
    params: [],
    body: { type: 'none', raw: '', formData: [], urlencoded: [] },
    auth: { type: 'none' },
  };

  const cleaned = curlStr.replace(/\\\n/g, ' ').replace(/\s+/g, ' ').trim();

  // Extract URL
  const urlMatch = cleaned.match(/curl\s+(?:['"]([^'"]+)['"]|(\S+))/i);
  if (!urlMatch) {
    const genericUrl = cleaned.match(/(?:https?:\/\/\S+)/);
    if (genericUrl) result.url = genericUrl[0];
  } else {
    result.url = urlMatch[1] || urlMatch[2];
  }

  // Extract method
  const methodMatch = cleaned.match(/-X\s+(\w+)/i);
  if (methodMatch) {
    result.method = methodMatch[1].toUpperCase() as RequestConfig['method'];
  }

  // Extract headers
  const headerRegex = /-H\s+['"]([^'"]+)['"]/gi;
  let headerMatch;
  while ((headerMatch = headerRegex.exec(cleaned)) !== null) {
    const colonIdx = headerMatch[1].indexOf(':');
    if (colonIdx > 0) {
      result.headers!.push({
        id: crypto.randomUUID(),
        key: headerMatch[1].substring(0, colonIdx).trim(),
        value: headerMatch[1].substring(colonIdx + 1).trim(),
        enabled: true,
      });
    }
  }

  // Extract data/body
  const dataMatch = cleaned.match(/(?:-d|--data|--data-raw|--data-binary)\s+['"]([^'"]*)['"]/i);
  if (dataMatch) {
    if (!methodMatch) result.method = 'POST';
    try {
      JSON.parse(dataMatch[1]);
      result.body = { type: 'json', raw: dataMatch[1], formData: [], urlencoded: [] };
    } catch {
      result.body = { type: 'text', raw: dataMatch[1], formData: [], urlencoded: [] };
    }
  }

  // Extract basic auth
  const authMatch = cleaned.match(/-u\s+['"]?([^'":\s]+):([^'":\s]+)['"]?/);
  if (authMatch) {
    result.auth = {
      type: 'basic',
      basic: { username: authMatch[1], password: authMatch[2] },
    };
  }

  return result;
}

export function generateCurlCommand(request: RequestConfig): string {
  const parts: string[] = ['curl'];

  if (request.method !== 'GET') {
    parts.push(`-X ${request.method}`);
  }

  const url = buildUrl(request.url, request.params);
  parts.push(`'${url}'`);

  const headers = buildHeaders(request.headers, request.auth);
  Object.entries(headers).forEach(([key, value]) => {
    parts.push(`-H '${key}: ${value}'`);
  });

  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && request.body.type !== 'none') {
    const body = buildBody(request);
    if (body && typeof body === 'string') {
      parts.push(`-d '${body}'`);
    }
  }

  return parts.join(' \\\n  ');
}

export function getMethodColor(method: string): string {
  const colors: Record<string, string> = {
    GET: 'text-method-get',
    POST: 'text-method-post',
    PUT: 'text-method-put',
    PATCH: 'text-method-patch',
    DELETE: 'text-method-delete',
    HEAD: 'text-method-head',
    OPTIONS: 'text-method-options',
  };
  return colors[method] || 'text-dark-300';
}

export function getMethodBgColor(method: string): string {
  const colors: Record<string, string> = {
    GET: 'bg-method-get/10 border-method-get/30',
    POST: 'bg-method-post/10 border-method-post/30',
    PUT: 'bg-method-put/10 border-method-put/30',
    PATCH: 'bg-method-patch/10 border-method-patch/30',
    DELETE: 'bg-method-delete/10 border-method-delete/30',
    HEAD: 'bg-method-head/10 border-method-head/30',
    OPTIONS: 'bg-method-options/10 border-method-options/30',
  };
  return colors[method] || '';
}

export function getStatusColor(status: number): string {
  if (status >= 200 && status < 300) return 'text-accent-green';
  if (status >= 300 && status < 400) return 'text-accent-blue';
  if (status >= 400 && status < 500) return 'text-accent-yellow';
  return 'text-accent-red';
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function formatTime(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

export function tryFormatJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}
