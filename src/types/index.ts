export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export interface KeyValuePair {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
  description?: string;
}

export interface FormDataEntry extends KeyValuePair {
  valueType: 'text' | 'file';
  fileName?: string;
  fileSize?: number;
  fileType?: string;
}

export type BodyType = 'none' | 'json' | 'text' | 'xml' | 'form-data' | 'x-www-form-urlencoded' | 'binary' | 'graphql';

export type AuthType = 'none' | 'basic' | 'bearer' | 'api-key' | 'oauth2';

export type OAuth2GrantType = 'authorization_code' | 'client_credentials';

export interface OAuth2Token {
  accessToken: string;
  tokenType?: string;
  expiresIn?: number;
  refreshToken?: string;
  scope?: string;
  obtainedAt?: number;
}

export interface OAuth2Config {
  grantType: OAuth2GrantType;
  authUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  scope: string;
  callbackUrl: string;
  state?: string;
  token?: OAuth2Token;
}

export interface AuthConfig {
  type: AuthType;
  basic?: { username: string; password: string };
  bearer?: { token: string };
  apiKey?: { key: string; value: string; addTo: 'header' | 'query' };
  oauth2?: OAuth2Config;
}

export interface RequestConfig {
  id: string;
  name: string;
  method: HttpMethod;
  url: string;
  params: KeyValuePair[];
  headers: KeyValuePair[];
  body: {
    type: BodyType;
    raw: string;
    formData: FormDataEntry[];
    urlencoded: KeyValuePair[];
    binaryFile?: {
      fileName: string;
      fileSize: number;
      fileType: string;
    };
    graphql?: {
      query: string;
      variables: string;
      operationName?: string;
      extensions?: string;
    };
  };
  auth: AuthConfig;
}

export interface ResponseData {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  size: number;
  time: number;
  cookies: { name: string; value: string; domain?: string; path?: string }[];
}

export interface Collection {
  id: string;
  name: string;
  description?: string;
  requests: RequestConfig[];
  createdAt: number;
  updatedAt: number;
}

export interface HistoryEntry {
  id: string;
  request: RequestConfig;
  response: ResponseData | null;
  timestamp: number;
}

export interface Environment {
  id: string;
  name: string;
  variables: KeyValuePair[];
  isActive: boolean;
}

export interface Tab {
  id: string;
  requestId: string;
  name: string;
  method: HttpMethod;
  isModified: boolean;
  collectionId?: string;
  sourceRequestId?: string;
}

export function createDefaultRequest(overrides?: Partial<RequestConfig>): RequestConfig {
  return {
    id: crypto.randomUUID(),
    name: 'New Request',
    method: 'GET',
    url: '',
    params: [],
    headers: [],
    body: {
      type: 'none',
      raw: '',
      formData: [],
      urlencoded: [],
    },
    auth: { type: 'none' },
    ...overrides,
  };
}

export function createKeyValuePair(overrides?: Partial<KeyValuePair>): KeyValuePair {
  return {
    id: crypto.randomUUID(),
    key: '',
    value: '',
    enabled: true,
    ...overrides,
  };
}

export function createFormDataEntry(overrides?: Partial<FormDataEntry>): FormDataEntry {
  return {
    id: crypto.randomUUID(),
    key: '',
    value: '',
    enabled: true,
    valueType: 'text',
    ...overrides,
  };
}
