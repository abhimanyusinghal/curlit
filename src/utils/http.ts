import type { RequestConfig, ResponseData, KeyValuePair, AuthConfig, FormDataEntry } from '../types';
import { getFile, fileToBase64 } from './fileStore';

export function buildUrl(baseUrl: string, params: KeyValuePair[]): string {
  const enabledParams = params.filter(p => p.enabled && p.key);
  if (enabledParams.length === 0) return baseUrl;

  const url = new URL(/^(https?|wss?):\/\//.test(baseUrl) ? baseUrl : `https://${baseUrl}`);
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
    case 'oauth2':
      if (auth.oauth2?.token?.accessToken) {
        const tokenType = auth.oauth2.token.tokenType || 'Bearer';
        // Normalize common "bearer" casing; preserve everything else (e.g. "MAC", "DPoP")
        const prefix = tokenType.toLowerCase() === 'bearer' ? 'Bearer' : tokenType;
        result['Authorization'] = `${prefix} ${auth.oauth2.token.accessToken}`;
      }
      break;
  }

  return result;
}

const BINARY_ENTRY_ID = '__binary__';

export function buildBody(request: RequestConfig): string | FormData | File | null {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return null;

  switch (request.body.type) {
    case 'none':
      return null;
    case 'graphql': {
      const queryStr = request.body.graphql?.query ?? '';
      const gql: Record<string, unknown> = {};
      // Only include query when non-empty — persisted-query payloads omit it
      if (queryStr) gql.query = queryStr;
      const varsStr = request.body.graphql?.variables?.trim();
      if (varsStr) {
        try {
          gql.variables = JSON.parse(varsStr);
        } catch {
          gql.variables = {};
        }
      }
      if (request.body.graphql?.operationName) {
        gql.operationName = request.body.graphql.operationName;
      }
      if (request.body.graphql?.extensions?.trim()) {
        try {
          gql.extensions = JSON.parse(request.body.graphql.extensions);
        } catch {
          // skip malformed extensions
        }
      }
      return JSON.stringify(gql);
    }
    case 'json':
    case 'text':
    case 'xml':
      return request.body.raw;
    case 'form-data': {
      const formData = new FormData();
      request.body.formData.filter(f => f.enabled && f.key).forEach(f => {
        if (f.valueType === 'file') {
          const file = getFile(request.id, f.id);
          if (file) formData.append(f.key, file, file.name);
        } else {
          formData.append(f.key, f.value);
        }
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
    case 'binary': {
      const file = getFile(request.id, BINARY_ENTRY_ID);
      return file ?? null;
    }
    default:
      return null;
  }
}

export function resolveVariables(text: string, variables: Record<string, string>, chainVars?: Record<string, string>): string {
  return text.replace(/\{\{([\w.]+)\}\}/g, (match, key: string) => {
    // Support {{chain.varName}} for request chaining
    if (key.startsWith('chain.') && chainVars) {
      const chainKey = key.slice(6);
      return chainVars[chainKey] ?? match;
    }
    return variables[key] ?? match;
  });
}

export function resolveRequestVariables(request: RequestConfig, variables: Record<string, string>, chainVars?: Record<string, string>): RequestConfig {
  const rv = (text: string) => resolveVariables(text, variables, chainVars);
  return {
    ...request,
    url: rv(request.url),
    params: request.params.map(p => ({
      ...p,
      key: rv(p.key),
      value: rv(p.value),
    })),
    headers: request.headers.map(h => ({
      ...h,
      key: rv(h.key),
      value: rv(h.value),
    })),
    body: {
      ...request.body,
      raw: rv(request.body.raw),
      formData: request.body.formData.map(f => ({
        ...f,
        key: rv(f.key),
        value: f.valueType === 'file' ? f.value : rv(f.value),
      })),
      urlencoded: request.body.urlencoded.map(f => ({
        ...f,
        key: rv(f.key),
        value: rv(f.value),
      })),
      graphql: request.body.graphql ? {
        query: rv(request.body.graphql.query),
        variables: rv(request.body.graphql.variables),
        operationName: request.body.graphql.operationName
          ? rv(request.body.graphql.operationName) : undefined,
        extensions: request.body.graphql.extensions
          ? rv(request.body.graphql.extensions) : undefined,
      } : undefined,
    },
    auth: resolveAuthVariables(request.auth, variables, chainVars),
  };
}

export function resolveOAuth2Variables(
  oauth2: import('../types').OAuth2Config,
  variables: Record<string, string>,
): import('../types').OAuth2Config {
  return {
    ...oauth2,
    authUrl: resolveVariables(oauth2.authUrl, variables),
    tokenUrl: resolveVariables(oauth2.tokenUrl, variables),
    clientId: resolveVariables(oauth2.clientId, variables),
    clientSecret: resolveVariables(oauth2.clientSecret, variables),
    scope: resolveVariables(oauth2.scope, variables),
    callbackUrl: resolveVariables(oauth2.callbackUrl, variables),
    state: oauth2.state ? resolveVariables(oauth2.state, variables) : undefined,
  };
}

function resolveAuthVariables(auth: AuthConfig, variables: Record<string, string>, chainVars?: Record<string, string>): AuthConfig {
  const rv = (text: string) => resolveVariables(text, variables, chainVars);
  const resolved = { ...auth };
  if (resolved.basic) {
    resolved.basic = {
      username: rv(resolved.basic.username),
      password: rv(resolved.basic.password),
    };
  }
  if (resolved.bearer) {
    resolved.bearer = { token: rv(resolved.bearer.token) };
  }
  if (resolved.apiKey) {
    resolved.apiKey = {
      ...resolved.apiKey,
      key: rv(resolved.apiKey.key),
      value: rv(resolved.apiKey.value),
    };
  }
  if (resolved.oauth2) {
    resolved.oauth2 = resolveOAuth2Variables(resolved.oauth2, variables);
  }
  return resolved;
}

async function serializeFormDataEntries(
  requestId: string,
  entries: FormDataEntry[],
): Promise<{ key: string; value: string; type: 'text' | 'file'; fileName?: string; contentType?: string; base64?: string }[]> {
  const result: { key: string; value: string; type: 'text' | 'file'; fileName?: string; contentType?: string; base64?: string }[] = [];
  for (const entry of entries.filter(e => e.enabled && e.key)) {
    if (entry.valueType === 'file') {
      const file = getFile(requestId, entry.id);
      if (file) {
        const base64 = await fileToBase64(file);
        result.push({
          key: entry.key,
          value: '',
          type: 'file',
          fileName: file.name,
          contentType: file.type || 'application/octet-stream',
          base64,
        });
      }
    } else {
      result.push({ key: entry.key, value: entry.value, type: 'text' });
    }
  }
  return result;
}

export async function sendRequest(request: RequestConfig): Promise<ResponseData> {
  const url = buildUrl(request.url, request.params);
  const headers = buildHeaders(request.headers, request.auth);
  const body = buildBody(request);

  if (request.body.type === 'graphql' && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  } else if (request.body.type === 'json' && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  } else if (request.body.type === 'xml' && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/xml';
  } else if (request.body.type === 'x-www-form-urlencoded' && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
  } else if (request.body.type === 'binary' && !headers['Content-Type']) {
    const file = getFile(request.id, BINARY_ENTRY_ID);
    headers['Content-Type'] = file?.type || 'application/octet-stream';
  }

  // Add api-key to query params if configured
  let finalUrl = url;
  if (request.auth.type === 'api-key' && request.auth.apiKey?.addTo === 'query') {
    const urlObj = new URL(finalUrl.startsWith('http') ? finalUrl : `https://${finalUrl}`);
    urlObj.searchParams.append(request.auth.apiKey.key, request.auth.apiKey.value);
    finalUrl = urlObj.toString();
  }

  // Use proxy server to avoid CORS
  const proxyUrl = '/api/proxy';
  const startTime = performance.now();

  let proxyBody: string;
  if (body instanceof FormData && request.body.type === 'form-data') {
    // Serialize form-data entries (including files as base64) for the proxy
    const formDataEntries = await serializeFormDataEntries(request.id, request.body.formData);
    proxyBody = JSON.stringify({
      method: request.method,
      url: finalUrl,
      headers,
      bodyType: 'form-data',
      formDataEntries,
      sslVerification: request.sslVerification !== false,
    });
  } else if (request.body.type === 'binary') {
    const file = getFile(request.id, BINARY_ENTRY_ID);
    if (!file) {
      throw new Error(
        request.body.binaryFile
          ? `Binary file "${request.body.binaryFile.fileName}" is no longer in memory. Please re-select the file.`
          : 'No binary file selected.',
      );
    }
    const base64 = await fileToBase64(file);
    proxyBody = JSON.stringify({
      method: request.method,
      url: finalUrl,
      headers,
      bodyType: 'binary',
      binary: { base64, fileName: file.name, fileType: file.type || 'application/octet-stream' },
      sslVerification: request.sslVerification !== false,
    });
  } else {
    proxyBody = JSON.stringify({
      method: request.method,
      url: finalUrl,
      headers,
      body: body instanceof FormData ? Object.fromEntries(body) : body,
      bodyType: request.body.type,
      sslVerification: request.sslVerification !== false,
    });
  }

  const response = await fetch(proxyUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: proxyBody,
  });

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

  // Extract URL — tokenise the command and grab the first non-flag argument.
  // This avoids picking up http(s) literals buried inside -d/-H values.
  {
    const flagsWithArg = new Set(['-X', '-H', '-d', '-u', '-o', '-A', '-e', '-b', '-c', '--request', '--data', '--data-raw', '--data-binary', '--data-urlencode', '--header', '--user', '--output', '--user-agent', '--referer', '--cookie', '--cookie-jar', '--max-time', '--connect-timeout', '--retry', '--proxy', '--cert', '--key', '--cacert']);
    const args = cleaned.replace(/^curl\s+/i, '');
    const tokens: string[] = [];
    const tokenRegex = /'([^']*)'|"([^"]*)"|(\S+)/g;
    let m;
    while ((m = tokenRegex.exec(args)) !== null) {
      tokens.push(m[1] ?? m[2] ?? m[3]);
    }
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      // --url explicitly provides the target URL
      if (t === '--url' && i + 1 < tokens.length) {
        result.url = tokens[++i];
        break;
      }
      if (t.startsWith('-')) {
        if (flagsWithArg.has(t)) i++;
        continue;
      }
      result.url = t;
      break;
    }
  }

  // Extract method (-X or --request)
  const methodMatch = cleaned.match(/(?:-X|--request)\s+(\w+)/i);
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

  // Extract data/body — check --data-binary '@file' first
  const binaryFileMatch = cleaned.match(/--data-binary\s+['"]@([^'"]+)['"]/i);
  if (binaryFileMatch) {
    if (!methodMatch) result.method = 'POST';
    const filePath = binaryFileMatch[1];
    const fileName = filePath.split('/').pop() || filePath;
    result.body = {
      type: 'binary',
      raw: '',
      formData: [],
      urlencoded: [],
      binaryFile: { fileName, fileSize: 0, fileType: 'application/octet-stream' },
    };
  } else {
    const dataMatch = cleaned.match(/(?:-d|--data|--data-raw|--data-binary)\s+(?:'([^']*)'|"([^"]*)")/i);
    if (dataMatch) {
      const dataBody = dataMatch[1] ?? dataMatch[2];
      if (!methodMatch) result.method = 'POST';
      try {
        const parsed = JSON.parse(dataBody);
        // Detect GraphQL requests: either a 'query' field with a GraphQL keyword,
        // or a persisted-query shape (operationName/extensions without query)
        // Strip leading # comment lines before testing for GraphQL keywords
        const strippedQuery = typeof parsed.query === 'string' ? parsed.query.replace(/^\s*(#[^\n]*\n\s*)*/,'') : '';
        const hasGraphQLQuery = typeof parsed.query === 'string' && /^\s*(query[\s({]|mutation[\s({]|subscription[\s({]|fragment\s|\{)/.test(strippedQuery);
        const hasPersistedQuery = !parsed.query && (typeof parsed.operationName === 'string' || parsed.extensions);
        if (hasGraphQLQuery || hasPersistedQuery) {
          result.body = {
            type: 'graphql',
            raw: '',
            formData: [],
            urlencoded: [],
            graphql: {
              query: parsed.query ?? '',
              variables: parsed.variables ? JSON.stringify(parsed.variables, null, 2) : '',
              operationName: parsed.operationName || undefined,
              extensions: parsed.extensions ? JSON.stringify(parsed.extensions, null, 2) : undefined,
            },
          };
        } else {
          result.body = { type: 'json', raw: dataBody, formData: [], urlencoded: [] };
        }
      } catch {
        result.body = { type: 'text', raw: dataBody, formData: [], urlencoded: [] };
      }
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

  // Detect --insecure / -k flag
  if (/(?:^|\s)(?:--insecure|-k)(?:\s|$)/.test(cleaned)) {
    result.sslVerification = false;
  }

  return result;
}

export function generateCurlCommand(request: RequestConfig): string {
  const parts: string[] = ['curl'];

  if (request.sslVerification === false) {
    parts.push('--insecure');
  }

  if (request.method !== 'GET') {
    parts.push(`-X ${request.method}`);
  }

  const url = buildUrl(request.url, request.params);
  parts.push(`'${url}'`);

  const headers = buildHeaders(request.headers, request.auth);
  // Auto-add Content-Type for body types that require it, matching sendRequest
  if (!headers['Content-Type'] && !['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    if (request.body.type === 'graphql' || request.body.type === 'json') {
      headers['Content-Type'] = 'application/json';
    } else if (request.body.type === 'xml') {
      headers['Content-Type'] = 'application/xml';
    } else if (request.body.type === 'x-www-form-urlencoded') {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
    }
  }
  Object.entries(headers).forEach(([key, value]) => {
    parts.push(`-H '${key}: ${value}'`);
  });

  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && request.body.type !== 'none') {
    if (request.body.type === 'binary' && request.body.binaryFile) {
      parts.push(`--data-binary '@/path/to/${request.body.binaryFile.fileName}'`);
    } else {
      const body = buildBody(request);
      if (body && typeof body === 'string') {
        parts.push(`-d '${body}'`);
      }
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
    WS: 'text-method-ws',
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
    WS: 'bg-method-ws/10 border-method-ws/30',
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
