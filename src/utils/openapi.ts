import yaml from 'js-yaml';
import type { RequestConfig, KeyValuePair, AuthConfig, BodyType, HttpMethod, FormDataEntry } from '../types';
import { createDefaultRequest, createKeyValuePair, createFormDataEntry } from '../types';

// ─── OpenAPI / Swagger Types ────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */

interface OpenApiSpec {
  openapi?: string;   // 3.x
  swagger?: string;   // 2.0
  info: { title: string; version?: string; description?: string };
  host?: string;      // Swagger 2.0
  basePath?: string;  // Swagger 2.0
  schemes?: string[]; // Swagger 2.0
  consumes?: string[]; // Swagger 2.0 global
  produces?: string[]; // Swagger 2.0 global
  servers?: OpenApiServer[];  // OpenAPI 3.x
  paths?: Record<string, PathItemOrRef>;
  webhooks?: Record<string, PathItemOrRef>;  // OpenAPI 3.1
  components?: {
    securitySchemes?: Record<string, SecuritySchemeOrRef>;
    schemas?: Record<string, SchemaObject>;
    parameters?: Record<string, ParameterOrRef>;
    requestBodies?: Record<string, RequestBodyOrRef>;
    responses?: Record<string, ResponseOrRef>;
    pathItems?: Record<string, PathItemOrRef>;     // OpenAPI 3.1
    headers?: Record<string, HeaderOrRef>;
    callbacks?: Record<string, CallbackOrRef>;
  };
  definitions?: Record<string, SchemaObject>;       // Swagger 2.0
  parameters?: Record<string, ParameterOrRef>;      // Swagger 2.0 global
  securityDefinitions?: Record<string, SecurityScheme>; // Swagger 2.0
  security?: SecurityRequirement[];
}

interface OpenApiServer {
  url: string;
  description?: string;
  variables?: Record<string, { default?: string; enum?: string[] }>;
}

type PathItemOrRef = PathItem & { $ref?: string };

interface PathItem {
  summary?: string;
  description?: string;
  servers?: OpenApiServer[];
  parameters?: ParameterOrRef[];
  get?: OperationOrRef;
  put?: OperationOrRef;
  post?: OperationOrRef;
  delete?: OperationOrRef;
  options?: OperationOrRef;
  head?: OperationOrRef;
  patch?: OperationOrRef;
  trace?: OperationOrRef;
  [key: string]: any;
}

type OperationOrRef = Operation & { $ref?: string };

interface Operation {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  deprecated?: boolean;
  parameters?: ParameterOrRef[];
  requestBody?: RequestBodyOrRef;   // OpenAPI 3.x
  consumes?: string[];              // Swagger 2.0
  produces?: string[];              // Swagger 2.0
  security?: SecurityRequirement[];
  servers?: OpenApiServer[];        // Operation-level server override
  responses?: Record<string, ResponseOrRef>;
  callbacks?: Record<string, CallbackOrRef>;
}

type ParameterOrRef = Parameter & { $ref?: string };

interface Parameter {
  name: string;
  in: 'query' | 'header' | 'path' | 'cookie' | 'body' | 'formData';
  required?: boolean;
  description?: string;
  deprecated?: boolean;
  allowEmptyValue?: boolean;
  schema?: SchemaObject;
  type?: string;       // Swagger 2.0
  format?: string;     // Swagger 2.0
  items?: SchemaObject; // Swagger 2.0 array items
  default?: any;
  example?: any;
  examples?: Record<string, ExampleOrRef>;
  enum?: any[];
  // Serialization
  style?: string;
  explode?: boolean;
  allowReserved?: boolean;
  // OpenAPI 3.0: content as alternative to schema
  content?: Record<string, MediaType>;
  // Swagger 2.0
  collectionFormat?: string;
}

type RequestBodyOrRef = RequestBody & { $ref?: string };

interface RequestBody {
  description?: string;
  required?: boolean;
  content: Record<string, MediaType>;
}

interface MediaType {
  schema?: SchemaObject;
  example?: any;
  examples?: Record<string, ExampleOrRef>;
  encoding?: Record<string, EncodingObject>;
}

interface EncodingObject {
  contentType?: string;
  headers?: Record<string, HeaderOrRef>;
  style?: string;
  explode?: boolean;
  allowReserved?: boolean;
}

type HeaderOrRef = HeaderObject & { $ref?: string };

interface HeaderObject {
  description?: string;
  required?: boolean;
  deprecated?: boolean;
  schema?: SchemaObject;
  example?: any;
  examples?: Record<string, ExampleOrRef>;
  style?: string;
  explode?: boolean;
  content?: Record<string, MediaType>;
}

type ExampleOrRef = ExampleObject & { $ref?: string };

interface ExampleObject {
  summary?: string;
  description?: string;
  value?: any;
  externalValue?: string;
}

type ResponseOrRef = ResponseObject & { $ref?: string };

interface ResponseObject {
  description?: string;
  headers?: Record<string, HeaderOrRef>;
  content?: Record<string, MediaType>;
  links?: Record<string, LinkOrRef>;
}

type LinkOrRef = LinkObject & { $ref?: string };

interface LinkObject {
  operationRef?: string;
  operationId?: string;
  parameters?: Record<string, any>;
  requestBody?: any;
  description?: string;
  server?: OpenApiServer;
}

type CallbackOrRef = Record<string, PathItemOrRef> & { $ref?: string };

interface SchemaObject {
  type?: string | string[];        // 3.1 allows array of types
  properties?: Record<string, SchemaObject>;
  additionalProperties?: boolean | SchemaObject;
  items?: SchemaObject;
  example?: any;
  default?: any;
  enum?: any[];
  const?: any;                     // 3.1
  required?: string[];
  format?: string;
  $ref?: string;
  allOf?: SchemaObject[];
  oneOf?: SchemaObject[];
  anyOf?: SchemaObject[];
  not?: SchemaObject;
  discriminator?: { propertyName: string; mapping?: Record<string, string> };
  nullable?: boolean;              // 3.0 (in 3.1, use type: ['string', 'null'])
  readOnly?: boolean;
  writeOnly?: boolean;
  deprecated?: boolean;
  description?: string;
  title?: string;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number | boolean;
  exclusiveMaximum?: number | boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
  minProperties?: number;
  maxProperties?: number;
  multipleOf?: number;
  prefixItems?: SchemaObject[];    // 3.1
  xml?: { name?: string; namespace?: string; prefix?: string; attribute?: boolean; wrapped?: boolean };
  externalDocs?: { url: string; description?: string };
}

type SecuritySchemeOrRef = SecurityScheme & { $ref?: string };

interface SecurityScheme {
  type: string;
  description?: string;
  scheme?: string;
  in?: string;
  name?: string;
  bearerFormat?: string;
  flow?: string;                   // Swagger 2.0
  flows?: OAuthFlows;              // OpenAPI 3.x
  openIdConnectUrl?: string;
}

interface OAuthFlows {
  implicit?: OAuthFlow;
  password?: OAuthFlow;
  clientCredentials?: OAuthFlow;
  authorizationCode?: OAuthFlow;
}

interface OAuthFlow {
  authorizationUrl?: string;
  tokenUrl?: string;
  refreshUrl?: string;
  scopes?: Record<string, string>;
}

type SecurityRequirement = Record<string, string[]>;

// ─── $ref Resolution ────────────────────────────────────────────────────────

// Track visited refs to prevent infinite circular reference loops
function resolveRef<T>(spec: OpenApiSpec, obj: T & { $ref?: string }, visited?: Set<string>): T {
  if (!obj || typeof obj !== 'object' || !('$ref' in obj) || !obj.$ref) return obj;

  const ref = obj.$ref;
  const seen = visited ?? new Set<string>();
  if (seen.has(ref)) return {} as T; // circular ref — return empty
  seen.add(ref);

  // Only handle local JSON Pointer refs (#/...)
  if (!ref.startsWith('#/')) return obj;

  const parts = ref.replace(/^#\//, '').split('/').map(p =>
    decodeURIComponent(p.replace(/~1/g, '/').replace(/~0/g, '~'))
  );

  let current: any = spec;
  for (const part of parts) {
    if (typeof current !== 'object' || current === null) return obj;
    current = current[part];
  }

  if (current && typeof current === 'object') {
    return resolveRef(spec, current as T & { $ref?: string }, seen);
  }
  return (current ?? obj) as T;
}

function resolveParamRef(spec: OpenApiSpec, p: ParameterOrRef): Parameter {
  return resolveRef(spec, p) as Parameter;
}

function resolveRequestBodyRef(spec: OpenApiSpec, rb: RequestBodyOrRef): RequestBody {
  return resolveRef(spec, rb) as RequestBody;
}

function resolvePathItemRef(spec: OpenApiSpec, pi: PathItemOrRef): PathItem {
  return resolveRef(spec, pi) as PathItem;
}

function resolveSecuritySchemeRef(spec: OpenApiSpec, ss: SecuritySchemeOrRef): SecurityScheme {
  return resolveRef(spec, ss) as SecurityScheme;
}

function resolveSchemaRef(spec: OpenApiSpec, schema: SchemaObject): SchemaObject {
  return resolveRef(spec, schema);
}

// ─── Detection ──────────────────────────────────────────────────────────────

export function parseOpenApiInput(text: string): OpenApiSpec {
  const trimmed = text.trim();
  if (trimmed.startsWith('{')) {
    return JSON.parse(trimmed);
  }
  return yaml.load(trimmed) as OpenApiSpec;
}

export function isOpenApiSpec(data: unknown): data is OpenApiSpec {
  if (typeof data !== 'object' || data === null) return false;
  const obj = data as Record<string, any>;
  const hasInfo = typeof obj.info === 'object' && obj.info !== null;
  const hasPaths = typeof obj.paths === 'object' && obj.paths !== null;
  const hasWebhooks = typeof obj.webhooks === 'object' && obj.webhooks !== null;
  const hasVersion = typeof obj.openapi === 'string' || typeof obj.swagger === 'string';
  return hasInfo && (hasPaths || hasWebhooks) && hasVersion;
}

// ─── Conversion ─────────────────────────────────────────────────────────────

export interface OpenApiImportResult {
  name: string;
  description?: string;
  requests: RequestConfig[];
}

export function parseOpenApiSpec(spec: OpenApiSpec): OpenApiImportResult {
  const name = spec.info.title || 'Imported API';
  const description = spec.info.description;
  const globalBaseUrl = resolveBaseUrl(spec);
  const requests: RequestConfig[] = [];

  const httpMethods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace'];

  // Process paths
  if (spec.paths) {
    for (const [path, rawPathItem] of Object.entries(spec.paths)) {
      if (!rawPathItem) continue;
      const pathItem = resolvePathItemRef(spec, rawPathItem);
      const pathParams = (pathItem.parameters || []).map(p => resolveParamRef(spec, p));

      // Path-level server override
      const pathBaseUrl = pathItem.servers?.[0]
        ? resolveServerUrl(pathItem.servers[0])
        : globalBaseUrl;

      for (const method of httpMethods) {
        const operation = pathItem[method] as Operation | undefined;
        if (!operation) continue;

        // Operation-level server override
        const opBaseUrl = operation.servers?.[0]
          ? resolveServerUrl(operation.servers[0])
          : pathBaseUrl;

        const request = convertOperation(spec, method.toUpperCase() as HttpMethod, path, opBaseUrl, operation, pathParams);
        requests.push(request);
      }
    }
  }

  // Process webhooks (OpenAPI 3.1+)
  if (spec.webhooks) {
    for (const [webhookName, rawPathItem] of Object.entries(spec.webhooks)) {
      if (!rawPathItem) continue;
      const pathItem = resolvePathItemRef(spec, rawPathItem);
      const pathParams = (pathItem.parameters || []).map(p => resolveParamRef(spec, p));

      for (const method of httpMethods) {
        const operation = pathItem[method] as Operation | undefined;
        if (!operation) continue;

        const opBaseUrl = operation.servers?.[0]
          ? resolveServerUrl(operation.servers[0])
          : globalBaseUrl;

        const request = convertOperation(spec, method.toUpperCase() as HttpMethod, `/${webhookName}`, opBaseUrl, operation, pathParams);
        const baseName = operation.summary || operation.operationId || webhookName;
        request.name = `[Webhook] ${baseName}`;
        requests.push(request);
      }
    }
  }

  // Process callbacks (from all operations)
  if (spec.paths) {
    for (const [path, rawPathItem] of Object.entries(spec.paths)) {
      if (!rawPathItem) continue;
      const pathItem = resolvePathItemRef(spec, rawPathItem);

      for (const method of httpMethods) {
        const operation = pathItem[method] as Operation | undefined;
        if (!operation?.callbacks) continue;

        for (const [callbackName, rawCallback] of Object.entries(operation.callbacks)) {
          const callback = resolveRef(spec, rawCallback as CallbackOrRef);
          for (const [callbackExpr, rawCbPathItem] of Object.entries(callback)) {
            if (callbackExpr === '$ref') continue;
            const cbPathItem = resolvePathItemRef(spec, rawCbPathItem as PathItemOrRef);

            for (const cbMethod of httpMethods) {
              const cbOp = cbPathItem[cbMethod] as Operation | undefined;
              if (!cbOp) continue;

              // Callbacks use runtime expressions as URLs — don't prepend the API base URL
              const cbReq = convertOperation(spec, cbMethod.toUpperCase() as HttpMethod, callbackExpr, '', cbOp, []);
              const baseName = cbOp.summary || cbOp.operationId || callbackName;
              cbReq.name = `[Callback: ${path} ${method.toUpperCase()}] ${baseName}`;
              // Replace runtime expressions in the URL with placeholders
              cbReq.url = cbReq.url.replace(/\{(\$[^}]+)\}/g, '{{$1}}');
              requests.push(cbReq);
            }
          }
        }
      }
    }
  }

  return { name, description, requests };
}

// ─── Base URL ───────────────────────────────────────────────────────────────

function resolveServerUrl(server: OpenApiServer): string {
  let url = server.url;
  if (server.variables) {
    for (const [key, variable] of Object.entries(server.variables)) {
      url = url.replace(`{${key}}`, variable.default || key);
    }
  }
  return url;
}

function resolveBaseUrl(spec: OpenApiSpec): string {
  if (spec.servers && spec.servers.length > 0) {
    return resolveServerUrl(spec.servers[0]);
  }
  if (spec.host) {
    const scheme = spec.schemes?.[0] || 'https';
    const basePath = spec.basePath || '';
    return `${scheme}://${spec.host}${basePath}`;
  }
  return '{{baseUrl}}';
}

// ─── Operation → RequestConfig ──────────────────────────────────────────────

function convertOperation(
  spec: OpenApiSpec,
  method: HttpMethod,
  path: string,
  baseUrl: string,
  operation: Operation,
  pathLevelParams: Parameter[],
): RequestConfig {
  // Resolve and merge parameters (operation overrides path-level by name+in)
  const opParams = (operation.parameters || []).map(p => resolveParamRef(spec, p));
  const allParams = mergeParameters(pathLevelParams, opParams);

  const queryParams = extractQueryParams(spec, allParams);
  const headers = extractHeaders(spec, allParams);
  const cookieHeaders = extractCookieParams(spec, allParams);
  const { body, contentType } = extractBody(spec, method, operation, allParams);
  const auth = extractAuth(spec, operation);

  // Add Content-Type header when the spec uses a non-default media type
  if (contentType) {
    const defaultForType: Record<string, string> = {
      json: 'application/json',
      xml: 'application/xml',
      text: 'text/plain',
      'form-data': 'multipart/form-data',
      'x-www-form-urlencoded': 'application/x-www-form-urlencoded',
    };
    if (contentType !== defaultForType[body.type]) {
      headers.push(createKeyValuePair({
        key: 'Content-Type',
        value: contentType,
        enabled: true,
      }));
    }
  }

  // Merge cookie params into headers
  if (cookieHeaders.length > 0) {
    const cookieValue = cookieHeaders
      .map(c => `${c.key}=${c.value}`)
      .join('; ');
    headers.push(createKeyValuePair({
      key: 'Cookie',
      value: cookieValue,
      enabled: true,
      description: 'Cookie parameters from spec',
    }));
  }

  // Build URL: replace path params with example values or env-var placeholders
  let url = baseUrl + path;
  for (const p of allParams.filter(p => p.in === 'path')) {
    const example = getParamExample(spec, p);
    url = url.replace(`{${p.name}}`, example || `{{${p.name}}}`);
  }

  const requestName = buildRequestName(operation, method, path);

  return createDefaultRequest({
    name: requestName,
    method,
    url,
    params: queryParams,
    headers,
    body,
    auth,
  });
}

function buildRequestName(operation: Operation, method: string, path: string): string {
  const base = operation.summary || operation.operationId || `${method} ${path}`;
  return operation.deprecated ? `[Deprecated] ${base}` : base;
}

// ─── Parameters ─────────────────────────────────────────────────────────────

function mergeParameters(pathLevel: Parameter[], opLevel: Parameter[]): Parameter[] {
  const merged = [...opLevel];
  for (const pp of pathLevel) {
    if (!merged.some(op => op.name === pp.name && op.in === pp.in)) {
      merged.push(pp);
    }
  }
  return merged;
}

function getParamExample(spec: OpenApiSpec, param: Parameter): string {
  // Direct example
  if (param.example !== undefined) return String(param.example);
  if (param.default !== undefined) return String(param.default);

  // examples map
  if (param.examples) {
    const firstExample = Object.values(param.examples)[0];
    if (firstExample) {
      const resolved = resolveRef(spec, firstExample);
      if (resolved.value !== undefined) return String(resolved.value);
    }
  }

  // content-based parameter (OpenAPI 3.0)
  if (param.content) {
    const firstMedia = Object.values(param.content)[0];
    if (firstMedia) {
      const example = getMediaExample(spec, firstMedia);
      if (example !== undefined && example !== '') {
        return typeof example === 'string' ? example : JSON.stringify(example);
      }
    }
  }

  // schema — full example generation (handles format, type, composition)
  if (param.schema) {
    const example = generateSchemaExample(spec, param.schema, new Set());
    if (example !== undefined) {
      return typeof example === 'object' ? JSON.stringify(example) : String(example);
    }
  }

  // Swagger 2.0 param-level enum
  if (param.enum && param.enum.length > 0) return String(param.enum[0]);

  return '';
}

/**
 * Serialize a parameter value according to its style and explode settings.
 * https://spec.openapis.org/oas/v3.0.3#style-values
 */
/**
 * Serialize a parameter value according to its style and explode settings.
 * https://spec.openapis.org/oas/v3.0.3#style-values
 *
 * For array examples we generate multiple items to show the serialization pattern.
 */
function serializeParamValue(spec: OpenApiSpec, param: Parameter, value: string): { key: string; value: string }[] {
  if (!param.schema) return [{ key: param.name, value }];

  const resolved = resolveSchemaRef(spec, param.schema);
  const style = param.style || getDefaultStyle(param.in);
  const explode = param.explode ?? (style === 'form');

  // Array parameters need special serialization
  if (resolved.type === 'array') {
    // Generate example items from the items schema
    const items: string[] = [];
    if (resolved.items) {
      const itemExample = generateSchemaExample(spec, resolved.items, new Set());
      if (itemExample !== undefined) {
        const itemStr = typeof itemExample === 'object' ? JSON.stringify(itemExample) : String(itemExample);
        // Use two items to demonstrate the pattern
        items.push(itemStr, itemStr);
      }
    }
    if (items.length === 0) return [{ key: param.name, value }];

    switch (style) {
      case 'form':
        // explode: ?id=1&id=2  /  no-explode: ?id=1,2
        return explode
          ? items.map(v => ({ key: param.name, value: v }))
          : [{ key: param.name, value: items.join(',') }];
      case 'spaceDelimited':
        // explode: ?id=1&id=2  /  no-explode: ?id=1%202
        return explode
          ? items.map(v => ({ key: param.name, value: v }))
          : [{ key: param.name, value: items.join(' ') }];
      case 'pipeDelimited':
        // explode: ?id=1&id=2  /  no-explode: ?id=1|2
        return explode
          ? items.map(v => ({ key: param.name, value: v }))
          : [{ key: param.name, value: items.join('|') }];
      case 'simple':
        // Used in path/header: 1,2
        return [{ key: param.name, value: items.join(',') }];
      default:
        return [{ key: param.name, value: items.join(',') }];
    }
  }

  // Object parameters with explode
  if (resolved.type === 'object' && resolved.properties && explode && (style === 'form' || style === 'deepObject')) {
    const pairs: { key: string; value: string }[] = [];
    for (const [propKey, propSchema] of Object.entries(resolved.properties)) {
      const propResolved = resolveSchemaRef(spec, propSchema);
      const propExample = generateSchemaExample(spec, propResolved, new Set());
      const propValue = propExample !== undefined
        ? (typeof propExample === 'object' ? JSON.stringify(propExample) : String(propExample))
        : '';
      if (style === 'deepObject') {
        pairs.push({ key: `${param.name}[${propKey}]`, value: propValue });
      } else {
        pairs.push({ key: propKey, value: propValue });
      }
    }
    return pairs.length > 0 ? pairs : [{ key: param.name, value }];
  }

  return [{ key: param.name, value }];
}

function getDefaultStyle(location: string): string {
  switch (location) {
    case 'query': return 'form';
    case 'cookie': return 'form';
    case 'path': return 'simple';
    case 'header': return 'simple';
    default: return 'form';
  }
}

function extractQueryParams(spec: OpenApiSpec, params: Parameter[]): KeyValuePair[] {
  const result: KeyValuePair[] = [];
  for (const p of params.filter(p => p.in === 'query')) {
    const value = getParamExample(spec, p);
    const serialized = serializeParamValue(spec, p, value);
    for (const s of serialized) {
      result.push(createKeyValuePair({
        key: s.key,
        value: s.value,
        enabled: !!p.required,
        description: buildParamDescription(p),
      }));
    }
  }
  return result;
}

function extractHeaders(spec: OpenApiSpec, params: Parameter[]): KeyValuePair[] {
  return params
    .filter(p => p.in === 'header')
    .map(p =>
      createKeyValuePair({
        key: p.name,
        value: getParamExample(spec, p),
        enabled: true,
        description: buildParamDescription(p),
      })
    );
}

function extractCookieParams(spec: OpenApiSpec, params: Parameter[]): { key: string; value: string }[] {
  return params
    .filter(p => p.in === 'cookie')
    .map(p => ({
      key: p.name,
      value: getParamExample(spec, p),
    }));
}

function buildParamDescription(p: Parameter): string {
  const parts: string[] = [];
  if (p.description) parts.push(p.description);
  if (p.deprecated) parts.push('[deprecated]');
  return parts.join(' ') || undefined as unknown as string;
}

// ─── Request Body ───────────────────────────────────────────────────────────

interface BodyResult {
  body: RequestConfig['body'];
  contentType?: string;
}

function extractBody(
  spec: OpenApiSpec,
  method: HttpMethod,
  operation: Operation,
  params: Parameter[],
): BodyResult {
  const empty: RequestConfig['body'] = { type: 'none', raw: '', formData: [], urlencoded: [] };

  // OpenAPI 3.x requestBody (could be a $ref)
  if (operation.requestBody) {
    const resolved = resolveRequestBodyRef(spec, operation.requestBody as RequestBodyOrRef);
    return convertRequestBody(spec, resolved);
  }

  // Swagger 2.0: body parameter
  const bodyParam = params.find(p => p.in === 'body');
  if (bodyParam) {
    const example = generateSchemaExample(spec, bodyParam.schema, new Set());
    const globalConsumes = (spec as any).consumes;
    const consumes = operation.consumes?.[0] || globalConsumes?.[0] || 'application/json';
    const bodyType = contentTypeToBodyType(consumes);
    return {
      body: {
        type: bodyType,
        raw: typeof example === 'string' ? example : JSON.stringify(example, null, 2),
        formData: [],
        urlencoded: [],
      },
      contentType: consumes,
    };
  }

  // Swagger 2.0: formData parameters
  const formParams = params.filter(p => p.in === 'formData');
  if (formParams.length > 0) {
    const globalConsumes = (spec as any).consumes;
    const consumes = operation.consumes?.[0] || globalConsumes?.[0] || 'application/x-www-form-urlencoded';
    if (consumes.includes('multipart')) {
      return {
        body: {
          type: 'form-data',
          raw: '',
          formData: formParams.map(p =>
              createFormDataEntry({
                key: p.name,
                value: p.type === 'file' ? '' : getParamExample(spec, p),
                enabled: true,
                description: p.description,
                valueType: p.type === 'file' ? 'file' : 'text',
              })
            ),
          urlencoded: [],
        },
        contentType: consumes,
      };
    }
    return {
      body: {
        type: 'x-www-form-urlencoded',
        raw: '',
        formData: [],
        urlencoded: formParams.map(p =>
          createKeyValuePair({
            key: p.name,
            value: getParamExample(spec, p),
            enabled: true,
            description: p.description,
          })
        ),
      },
      contentType: consumes,
    };
  }

  return { body: empty };
}

function convertRequestBody(spec: OpenApiSpec, requestBody: RequestBody): BodyResult {
  const empty: RequestConfig['body'] = { type: 'none', raw: '', formData: [], urlencoded: [] };
  const content = requestBody.content;
  if (!content) return { body: empty };

  // Match content types with priority
  const contentTypePriority: [string | RegExp, BodyType][] = [
    ['application/json', 'json'],
    [/application\/.*\+json/, 'json'],       // e.g. application/vnd.api+json
    ['multipart/form-data', 'form-data'],
    ['application/x-www-form-urlencoded', 'x-www-form-urlencoded'],
    ['application/xml', 'xml'],
    ['text/xml', 'xml'],
    [/application\/.*\+xml/, 'xml'],
    ['text/plain', 'text'],
    ['text/html', 'text'],
  ];

  for (const [pattern, bodyType] of contentTypePriority) {
    const matchedKey = Object.keys(content).find(ct =>
      typeof pattern === 'string' ? ct === pattern : pattern.test(ct)
    );
    if (!matchedKey) continue;
    const media = content[matchedKey];

    if (bodyType === 'form-data') {
      const pairs = schemaToKeyValuePairs(spec, media.schema);
      return { body: { type: 'form-data', raw: '', formData: pairsToFormDataEntries(pairs), urlencoded: [] }, contentType: matchedKey };
    }
    if (bodyType === 'x-www-form-urlencoded') {
      const pairs = schemaToKeyValuePairs(spec, media.schema);
      return { body: { type: 'x-www-form-urlencoded', raw: '', formData: [], urlencoded: pairs }, contentType: matchedKey };
    }

    const example = getMediaExample(spec, media);
    return {
      body: {
        type: bodyType,
        raw: typeof example === 'string' ? example : JSON.stringify(example, null, 2),
        formData: [],
        urlencoded: [],
      },
      contentType: matchedKey,
    };
  }

  // Fallback: first content type
  const firstKey = Object.keys(content)[0];
  if (firstKey) {
    const bodyType = contentTypeToBodyType(firstKey);
    const media = content[firstKey];
    if (bodyType === 'form-data') {
      return { body: { type: 'form-data', raw: '', formData: pairsToFormDataEntries(schemaToKeyValuePairs(spec, media.schema)), urlencoded: [] }, contentType: firstKey };
    }
    if (bodyType === 'x-www-form-urlencoded') {
      return { body: { type: 'x-www-form-urlencoded', raw: '', formData: [], urlencoded: schemaToKeyValuePairs(spec, media.schema) }, contentType: firstKey };
    }
    const example = getMediaExample(spec, media);
    return {
      body: {
        type: bodyType,
        raw: typeof example === 'string' ? example : JSON.stringify(example, null, 2),
        formData: [],
        urlencoded: [],
      },
      contentType: firstKey,
    };
  }

  return { body: empty };
}

function contentTypeToBodyType(contentType: string): BodyType {
  if (contentType.includes('json')) return 'json';
  if (contentType.includes('xml')) return 'xml';
  if (contentType.includes('form-data') || contentType.includes('multipart')) return 'form-data';
  if (contentType.includes('urlencoded')) return 'x-www-form-urlencoded';
  return 'text';
}

function getMediaExample(spec: OpenApiSpec, media: MediaType): unknown {
  if (media.example !== undefined) return media.example;
  if (media.examples) {
    const firstExample = Object.values(media.examples)[0];
    if (firstExample) {
      const resolved = resolveRef(spec, firstExample);
      if (resolved.value !== undefined) return resolved.value;
    }
  }
  if (media.schema) {
    return generateSchemaExample(spec, media.schema, new Set());
  }
  return '';
}

function pairsToFormDataEntries(pairs: KeyValuePair[]): FormDataEntry[] {
  return pairs.map(p => ({ ...p, valueType: 'text' as const }));
}

function schemaToKeyValuePairs(spec: OpenApiSpec, schema?: SchemaObject): KeyValuePair[] {
  if (!schema) return [];
  const resolved = resolveSchemaRef(spec, schema);

  // Handle composition in form schemas
  const merged = mergeAllOfSchema(spec, resolved);
  if (!merged.properties) return [];

  const required = merged.required || [];
  return Object.entries(merged.properties)
    .filter(([, prop]) => {
      const rp = resolveSchemaRef(spec, prop);
      return !rp.readOnly; // Skip readOnly fields in request bodies
    })
    .map(([key, prop]) => {
      const resolvedProp = resolveSchemaRef(spec, prop);
      const example = generateSchemaExample(spec, resolvedProp, new Set());
      return createKeyValuePair({
        key,
        value: example !== undefined ? String(example) : '',
        enabled: required.includes(key),
      });
    });
}

// ─── Schema → Example (with allOf/oneOf/anyOf/not, nullable, readOnly/writeOnly) ─

/**
 * Merge allOf schemas into a single combined schema.
 * This is the core of schema composition support.
 */
function mergeAllOfSchema(spec: OpenApiSpec, schema: SchemaObject): SchemaObject {
  if (!schema.allOf || schema.allOf.length === 0) return schema;

  const merged: SchemaObject = { ...schema };
  delete merged.allOf;

  const mergedProperties: Record<string, SchemaObject> = { ...(merged.properties || {}) };
  const mergedRequired: string[] = [...(merged.required || [])];

  for (const subSchema of schema.allOf) {
    const resolved = resolveSchemaRef(spec, subSchema);
    // Recursively merge nested allOf
    const sub = mergeAllOfSchema(spec, resolved);

    if (sub.properties) {
      Object.assign(mergedProperties, sub.properties);
    }
    if (sub.required) {
      for (const r of sub.required) {
        if (!mergedRequired.includes(r)) mergedRequired.push(r);
      }
    }
    // Inherit type if not set
    if (sub.type && !merged.type) merged.type = sub.type;
    // Inherit additionalProperties
    if (sub.additionalProperties !== undefined && merged.additionalProperties === undefined) {
      merged.additionalProperties = sub.additionalProperties;
    }
  }

  if (Object.keys(mergedProperties).length > 0) merged.properties = mergedProperties;
  if (mergedRequired.length > 0) merged.required = mergedRequired;

  return merged;
}

/**
 * For oneOf/anyOf, pick the first option and generate an example from it.
 */
function pickCompositionBranch(spec: OpenApiSpec, branches: SchemaObject[], visited: Set<string>): unknown {
  if (branches.length === 0) return undefined;
  // Use the first branch
  const resolved = resolveSchemaRef(spec, branches[0]);
  return generateSchemaExample(spec, resolved, visited);
}

function resolveSchemaType(schema: SchemaObject): string | undefined {
  if (!schema.type) return undefined;
  // OpenAPI 3.1 allows type to be an array like ["string", "null"]
  if (Array.isArray(schema.type)) {
    return schema.type.find(t => t !== 'null') || schema.type[0];
  }
  return schema.type;
}

function generateSchemaExample(spec: OpenApiSpec, schema?: SchemaObject, visited?: Set<string>): unknown {
  if (!schema) return undefined;
  const seen = visited ?? new Set<string>();

  // Resolve $ref
  let resolved: SchemaObject;
  if (schema.$ref) {
    if (seen.has(schema.$ref)) return undefined; // circular ref
    seen.add(schema.$ref);
    resolved = resolveSchemaRef(spec, schema);
  } else {
    resolved = schema;
  }

  // Direct example or default takes priority
  if (resolved.example !== undefined) return resolved.example;
  if (resolved.default !== undefined) return resolved.default;
  if (resolved.const !== undefined) return resolved.const;
  if (resolved.enum && resolved.enum.length > 0) return resolved.enum[0];

  // Handle allOf — merge all schemas and generate from the merged result
  if (resolved.allOf && resolved.allOf.length > 0) {
    const merged = mergeAllOfSchema(spec, resolved);
    return generateSchemaExample(spec, merged, seen);
  }

  // Handle oneOf — pick the first branch
  if (resolved.oneOf && resolved.oneOf.length > 0) {
    // If discriminator is set, still just pick the first
    return pickCompositionBranch(spec, resolved.oneOf, seen);
  }

  // Handle anyOf — pick the first branch
  if (resolved.anyOf && resolved.anyOf.length > 0) {
    return pickCompositionBranch(spec, resolved.anyOf, seen);
  }

  // Handle `not` — we can't meaningfully generate an example that does NOT match,
  // so skip it (return a generic example based on other available info)

  const type = resolveSchemaType(resolved);

  switch (type) {
    case 'object': {
      const obj: Record<string, unknown> = {};
      if (resolved.properties) {
        for (const [key, prop] of Object.entries(resolved.properties)) {
          const rp = resolveSchemaRef(spec, prop);
          if (rp.readOnly) continue; // Skip readOnly in request examples
          const val = generateSchemaExample(spec, prop, new Set(seen));
          if (val !== undefined) obj[key] = val;
        }
      }
      // additionalProperties: generate one example entry if it's a schema
      if (resolved.additionalProperties && typeof resolved.additionalProperties === 'object') {
        if (!resolved.properties || Object.keys(resolved.properties).length === 0) {
          const val = generateSchemaExample(spec, resolved.additionalProperties as SchemaObject, new Set(seen));
          if (val !== undefined) obj['additionalProp'] = val;
        }
      }
      return obj;
    }
    case 'array': {
      // OpenAPI 3.1 prefixItems (tuple validation)
      if (resolved.prefixItems && resolved.prefixItems.length > 0) {
        return resolved.prefixItems.map(item =>
          generateSchemaExample(spec, item, new Set(seen))
        ).filter(v => v !== undefined);
      }
      const itemExample = generateSchemaExample(spec, resolved.items, new Set(seen));
      return itemExample !== undefined ? [itemExample] : [];
    }
    case 'string':
      return generateStringExample(resolved);
    case 'integer':
      return generateNumberExample(resolved, true);
    case 'number':
      return generateNumberExample(resolved, false);
    case 'boolean':
      return false;
    case 'null':
      return null;
    default: {
      // No type but has properties — treat as object
      if (resolved.properties) {
        const obj: Record<string, unknown> = {};
        for (const [key, prop] of Object.entries(resolved.properties)) {
          const rp = resolveSchemaRef(spec, prop);
          if (rp.readOnly) continue;
          const val = generateSchemaExample(spec, prop, new Set(seen));
          if (val !== undefined) obj[key] = val;
        }
        return obj;
      }
      // No type but has items — treat as array
      if (resolved.items) {
        const itemExample = generateSchemaExample(spec, resolved.items, new Set(seen));
        return itemExample !== undefined ? [itemExample] : [];
      }
      // No type, no properties, no items, but has additionalProperties
      if (resolved.additionalProperties && typeof resolved.additionalProperties === 'object') {
        const val = generateSchemaExample(spec, resolved.additionalProperties as SchemaObject, new Set(seen));
        return val !== undefined ? { additionalProp: val } : {};
      }
      return undefined;
    }
  }
}

function generateStringExample(schema: SchemaObject): string {
  switch (schema.format) {
    case 'date': return '2024-01-01';
    case 'date-time': return '2024-01-01T00:00:00Z';
    case 'email': return 'user@example.com';
    case 'idn-email': return 'user@example.com';
    case 'uri': return 'https://example.com';
    case 'url': return 'https://example.com';
    case 'iri': return 'https://example.com';
    case 'iri-reference': return '/path';
    case 'uri-reference': return '/path';
    case 'uri-template': return '/path/{id}';
    case 'uuid': return '00000000-0000-0000-0000-000000000000';
    case 'hostname': return 'example.com';
    case 'idn-hostname': return 'example.com';
    case 'ipv4': return '192.168.1.1';
    case 'ipv6': return '::1';
    case 'byte': return 'dGVzdA=='; // base64 of "test"
    case 'binary': return '<binary>';
    case 'password': return '********';
    case 'duration': return 'P1D';
    case 'time': return '12:00:00';
    case 'json-pointer': return '/foo/bar';
    case 'relative-json-pointer': return '0/foo';
    case 'regex': return '.*';
    default: {
      // Respect minLength
      const minLen = schema.minLength ?? 0;
      const base = 'string';
      if (minLen > base.length) return base.padEnd(minLen, 'a');
      return base;
    }
  }
}

function generateNumberExample(schema: SchemaObject, isInteger: boolean): number {
  // Try to pick a value that satisfies constraints
  const min = schema.minimum ?? (typeof schema.exclusiveMinimum === 'number' ? schema.exclusiveMinimum + (isInteger ? 1 : 0.1) : undefined);
  const max = schema.maximum ?? (typeof schema.exclusiveMaximum === 'number' ? schema.exclusiveMaximum - (isInteger ? 1 : 0.1) : undefined);

  // Handle boolean exclusive (Swagger 2.0 / OpenAPI 3.0)
  const effectiveMin = min !== undefined ? min
    : (schema.exclusiveMinimum === true && schema.minimum !== undefined) ? schema.minimum + (isInteger ? 1 : 0.1)
    : undefined;
  const effectiveMax = max !== undefined ? max
    : (schema.exclusiveMaximum === true && schema.maximum !== undefined) ? schema.maximum - (isInteger ? 1 : 0.1)
    : undefined;

  if (effectiveMin !== undefined && effectiveMax !== undefined) {
    const mid = (effectiveMin + effectiveMax) / 2;
    return isInteger ? Math.round(mid) : mid;
  }
  if (effectiveMin !== undefined) return isInteger ? Math.ceil(effectiveMin) : effectiveMin;
  if (effectiveMax !== undefined) return isInteger ? Math.floor(effectiveMax) : effectiveMax;

  if (schema.multipleOf) return schema.multipleOf;

  return 0;
}

// ─── Auth ────────────────────────────────────────────────────────────────────

function extractAuth(spec: OpenApiSpec, operation: Operation): AuthConfig {
  // Operation-level security overrides global (even empty array = no auth)
  const securityReqs = operation.security !== undefined ? operation.security : spec.security;
  if (!securityReqs || securityReqs.length === 0) return { type: 'none' };

  // Empty object {} means anonymous is allowed — but we still try the first non-empty
  // Security requirements in the array are OR (any one suffices)
  // Within a single requirement, multiple schemes are AND (all required)
  // We pick the first non-empty requirement and use its first scheme
  for (const req of securityReqs) {
    const schemeNames = Object.keys(req);
    if (schemeNames.length === 0) continue; // anonymous option

    const schemeName = schemeNames[0];
    const schemes = spec.components?.securitySchemes ?? spec.securityDefinitions;
    if (!schemes) continue;

    const rawScheme = schemes[schemeName];
    if (!rawScheme) continue;

    const scheme = resolveSecuritySchemeRef(spec, rawScheme as SecuritySchemeOrRef);
    return convertSecurityScheme(scheme);
  }

  return { type: 'none' };
}

function convertSecurityScheme(scheme: SecurityScheme): AuthConfig {
  // OpenAPI 3.x "http" type
  if (scheme.type === 'http') {
    if (scheme.scheme?.toLowerCase() === 'basic') {
      return { type: 'basic', basic: { username: '', password: '' } };
    }
    if (scheme.scheme?.toLowerCase() === 'bearer') {
      return { type: 'bearer', bearer: { token: '' } };
    }
    // Other http schemes (digest, hoba, etc.) — fall back to bearer-like
    return { type: 'bearer', bearer: { token: '' } };
  }

  // Swagger 2.0 "basic"
  if (scheme.type === 'basic') {
    return { type: 'basic', basic: { username: '', password: '' } };
  }

  // API key
  if (scheme.type === 'apiKey') {
    return {
      type: 'api-key',
      apiKey: {
        key: scheme.name || 'Authorization',
        value: '',
        addTo: scheme.in === 'query' ? 'query' : 'header',
      },
    };
  }

  // OAuth2 — map to bearer since we can't do the flow
  if (scheme.type === 'oauth2') {
    return { type: 'bearer', bearer: { token: '' } };
  }

  // OpenID Connect — map to bearer
  if (scheme.type === 'openIdConnect') {
    return { type: 'bearer', bearer: { token: '' } };
  }

  return { type: 'none' };
}
