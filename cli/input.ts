import { readFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { createDefaultRequest } from '../src/types';
import type { AuthConfig, Collection, FormDataEntry, KeyValuePair, RequestConfig } from '../src/types';
import { setFile } from '../src/utils/fileStore';
import { resolveVariables } from '../src/utils/http';

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function string(value: unknown, label: string, fallback?: string): string {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== 'string') throw new Error(`${label} must be a string`);
  return value;
}

function boolean(value: unknown, label: string, fallback = true): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') throw new Error(`${label} must be a boolean`);
  return value;
}

function choice<T extends string>(value: unknown, choices: readonly T[], label: string): T {
  if (!choices.includes(value as T)) throw new Error(`${label} must be one of: ${choices.join(', ')}`);
  return value as T;
}

function pairs(value: unknown, label: string): KeyValuePair[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value.map((item, index) => {
    const row = record(item, `${label}[${index}]`);
    return {
      id: string(row.id, `${label}.id`, crypto.randomUUID()),
      key: string(row.key, `${label}.key`),
      value: string(row.value, `${label}.value`, ''),
      enabled: boolean(row.enabled, `${label}.enabled`),
    };
  });
}

function parseAuth(value: unknown): AuthConfig {
  const auth = record(value ?? { type: 'none' }, 'auth');
  const type = choice(auth.type, ['none', 'basic', 'bearer', 'api-key', 'oauth2'] as const, 'auth.type');
  if (type === 'none') return { type };
  if (type === 'basic') {
    const data = record(auth.basic, 'auth.basic');
    return { type, basic: { username: string(data.username, 'username'), password: string(data.password, 'password') } };
  }
  if (type === 'bearer') {
    const data = record(auth.bearer, 'auth.bearer');
    return { type, bearer: { token: string(data.token, 'token') } };
  }
  if (type === 'api-key') {
    const data = record(auth.apiKey, 'auth.apiKey');
    return { type, apiKey: { key: string(data.key, 'apiKey.key'), value: string(data.value, 'apiKey.value'), addTo: choice(data.addTo, ['header', 'query'] as const, 'apiKey.addTo') } };
  }
  const data = record(auth.oauth2, 'auth.oauth2');
  const token = data.token === undefined ? undefined : record(data.token, 'oauth2.token');
  return {
    type,
    oauth2: {
      grantType: choice(data.grantType, ['authorization_code', 'client_credentials'] as const, 'oauth2.grantType'),
      authUrl: string(data.authUrl, 'oauth2.authUrl', ''), tokenUrl: string(data.tokenUrl, 'oauth2.tokenUrl', ''),
      clientId: string(data.clientId, 'oauth2.clientId', ''), clientSecret: string(data.clientSecret, 'oauth2.clientSecret', ''),
      scope: string(data.scope, 'oauth2.scope', ''), callbackUrl: string(data.callbackUrl, 'oauth2.callbackUrl', ''),
      ...(token ? { token: { accessToken: string(token.accessToken, 'oauth2.token.accessToken'), tokenType: string(token.tokenType, 'oauth2.token.tokenType', 'Bearer') } } : {}),
    },
  };
}

function parseRequest(value: unknown, index: number): RequestConfig {
  const request = record(value, `requests[${index}]`);
  const body = record(request.body ?? { type: 'none' }, 'body');
  const type = choice(body.type, ['none', 'json', 'text', 'xml', 'form-data', 'x-www-form-urlencoded', 'binary', 'graphql'] as const, 'body.type');
  const formData: FormDataEntry[] = pairs(body.formData, 'body.formData').map((row, i) => {
    const raw = (body.formData as Record<string, unknown>[])[i];
    return {
      ...row,
      valueType: choice(raw.valueType ?? 'text', ['text', 'file'] as const, 'formData.valueType'),
      ...(raw.filePath !== undefined ? { filePath: string(raw.filePath, 'formData.filePath') } : {}),
      ...(raw.fileName !== undefined ? { fileName: string(raw.fileName, 'formData.fileName') } : {}),
      ...(raw.fileType !== undefined ? { fileType: string(raw.fileType, 'formData.fileType') } : {}),
    };
  });
  const binary = body.binaryFile === undefined ? undefined : record(body.binaryFile, 'body.binaryFile');
  const graphql = body.graphql === undefined ? undefined : record(body.graphql, 'body.graphql');
  const url = string(request.url, 'url');
  if (!url.trim()) throw new Error('url must not be empty');
  return createDefaultRequest({
    // A distinct ID per request also isolates file attachments in hand-written collections.
    id: crypto.randomUUID(),
    name: string(request.name, 'name', `Request ${index + 1}`),
    method: choice(request.method ?? 'GET', ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const, 'method'),
    protocol: choice(request.protocol ?? 'http', ['http'] as const, 'protocol (CLI runs support HTTP/GraphQL)'),
    url,
    params: pairs(request.params, 'params'), headers: pairs(request.headers, 'headers'),
    auth: parseAuth(request.auth),
    sslVerification: boolean(request.sslVerification, 'sslVerification'),
    preRequestScript: string(request.preRequestScript, 'preRequestScript', ''),
    testScript: string(request.testScript, 'testScript', ''),
    body: {
      type, raw: string(body.raw, 'body.raw', ''), formData, urlencoded: pairs(body.urlencoded, 'body.urlencoded'),
      ...(binary ? { binaryFile: {
        fileName: string(binary.fileName, 'binaryFile.fileName', ''), fileSize: 0,
        fileType: string(binary.fileType, 'binaryFile.fileType', 'application/octet-stream'),
        ...(binary.filePath !== undefined ? { filePath: string(binary.filePath, 'binaryFile.filePath') } : {}),
      } } : {}),
      ...(graphql ? { graphql: {
        query: string(graphql.query, 'graphql.query', ''), variables: string(graphql.variables, 'graphql.variables', ''),
        operationName: string(graphql.operationName, 'graphql.operationName', ''), extensions: string(graphql.extensions, 'graphql.extensions', ''),
      } } : {}),
    },
  });
}

export function parseCollection(value: unknown, selector?: string): Collection {
  const root = record(value, 'Collection JSON');
  const candidates = root.collections === undefined ? [root] : root.collections;
  if (!Array.isArray(candidates) || candidates.length === 0) throw new Error('Collection file contains no collections');
  const collections = candidates.map(item => record(item, 'Collection'));
  const matches = selector ? collections.filter(item => item.name === selector || item.id === selector) : collections;
  if (matches.length !== 1) throw new Error(selector
    ? `--collection must identify exactly one collection; found ${matches.length} matches`
    : 'File contains multiple collections; select one with --collection NAME_OR_ID');
  const source = matches[0];
  if (!Array.isArray(source.requests) || source.requests.length === 0) throw new Error('Collection must contain at least one request');
  return {
    id: string(source.id, 'collection.id', crypto.randomUUID()),
    name: string(source.name, 'collection.name', 'Collection'), createdAt: 0, updatedAt: 0,
    requests: source.requests.map((item, index) => {
      try { return parseRequest(item, index); }
      catch (error) { throw new Error(`Request ${index + 1}: ${(error as Error).message}`); }
    }),
  };
}

export function parseEnvironment(value: unknown): Record<string, string> {
  const source = record(value, 'Environment');
  const variables: Record<string, string> = Object.create(null);
  if (Array.isArray(source.variables)) {
    for (const pair of pairs(source.variables, 'variables')) if (pair.enabled && pair.key) variables[pair.key] = pair.value;
  } else {
    for (const [key, value] of Object.entries(source)) variables[key] = string(value, `Environment variable "${key}"`);
  }
  return variables;
}

export async function readJson(file: string): Promise<unknown> {
  const text = await readFile(file, 'utf8');
  try { return JSON.parse(text.replace(/^\uFEFF/, '')); }
  catch { throw new Error(`Invalid JSON in ${file}`); }
}

/** Exported collections contain file metadata, so CLI attachments use explicit paths. */
export async function attachFiles(request: RequestConfig, collectionFile: string, variables: Record<string, string>, chain: Record<string, string>) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return;
  const files = request.body.type === 'binary'
    ? [{ id: '__binary__', ...request.body.binaryFile }]
    : request.body.type === 'form-data' ? request.body.formData.filter(row => row.enabled && row.key && row.valueType === 'file') : [];
  for (const file of files) {
    if (!file.filePath) throw new Error('CLI file uploads require filePath on each file entry (relative to the collection JSON)');
    const path = resolve(dirname(collectionFile), resolveVariables(file.filePath, variables, chain));
    const contents = await readFile(path);
    setFile(request.id, file.id, new File([contents], file.fileName || basename(path), { type: file.fileType || 'application/octet-stream' }));
  }
}
