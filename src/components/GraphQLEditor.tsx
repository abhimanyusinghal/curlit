import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { json } from '@codemirror/lang-json';
import { oneDark } from '@codemirror/theme-one-dark';
import { graphql as graphqlLang } from 'cm6-graphql';
import {
  buildClientSchema,
  getIntrospectionQuery,
  type GraphQLSchema,
  type IntrospectionQuery,
} from 'graphql';
import { useAppStore } from '../store';
import type { Theme } from '../store';
import { buildUrl, buildHeaders, resolveVariables } from '../utils/http';
import { proxyUrl } from '../utils/proxyConfig';

/** Build a cache key from the fully resolved endpoint URL + auth headers.
 *  Returns null when the URL is empty or unresolvable. */
function buildSchemaCacheKey(
  request: {
    url: string;
    params: import('../types').KeyValuePair[];
    headers: import('../types').KeyValuePair[];
    auth: import('../types').AuthConfig;
  },
  envVars: Record<string, string>,
): string | null {
  const resolvedUrl = resolveVariables(request.url, envVars).trim();
  if (!resolvedUrl) return null;
  const resolvedParams = request.params.map(p => ({
    ...p,
    key: resolveVariables(p.key, envVars),
    value: resolveVariables(p.value, envVars),
  }));
  try {
    let url = buildUrl(resolvedUrl, resolvedParams);
    if (request.auth.type === 'api-key' && request.auth.apiKey?.addTo === 'query') {
      const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
      urlObj.searchParams.append(
        resolveVariables(request.auth.apiKey.key, envVars),
        resolveVariables(request.auth.apiKey.value, envVars),
      );
      url = urlObj.toString();
    }
    // Include header-based auth in the key so changing a token/credential
    // invalidates the cached schema for the same URL
    const resolvedHeaders = buildHeaders(
      request.headers.map(h => ({
        ...h,
        key: resolveVariables(h.key, envVars),
        value: resolveVariables(h.value, envVars),
      })),
      {
        ...request.auth,
        basic: request.auth.basic ? {
          username: resolveVariables(request.auth.basic.username, envVars),
          password: resolveVariables(request.auth.basic.password, envVars),
        } : undefined,
        bearer: request.auth.bearer ? {
          token: resolveVariables(request.auth.bearer.token, envVars),
        } : undefined,
        apiKey: request.auth.apiKey ? {
          ...request.auth.apiKey,
          key: resolveVariables(request.auth.apiKey.key, envVars),
          value: resolveVariables(request.auth.apiKey.value, envVars),
        } : undefined,
      },
    );
    // Deterministic serialisation of auth-relevant headers
    const authPart = Object.entries(resolvedHeaders)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('&');
    return authPart ? `${url}\0${authPart}` : url;
  } catch {
    return null;
  }
}
import { RefreshCw, ChevronDown, ChevronRight, BookOpen } from 'lucide-react';

interface Props {
  requestId: string;
  query: string;
  variables: string;
  onQueryChange: (query: string) => void;
  onVariablesChange: (variables: string) => void;
}

// Schema cache keyed by endpoint URL
const schemaCache = new Map<string, GraphQLSchema>();

export function GraphQLEditor({ requestId, query, variables, onQueryChange, onVariablesChange }: Props) {
  const theme = useAppStore(s => s.theme) as Theme;
  const request = useAppStore(s => s.requests[requestId]);
  const getActiveVariables = useAppStore(s => s.getActiveVariables);
  const [schema, setSchema] = useState<GraphQLSchema | null>(null);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [showSchema, setShowSchema] = useState(false);
  const [variablesHeight, setVariablesHeight] = useState(100);
  const prevResolvedRef = useRef<string | null>(null);
  const activeEnvironmentId = useAppStore(s => s.activeEnvironmentId);
  // Subscribe to the environments array so edits to variable values trigger re-evaluation
  const environments = useAppStore(s => s.environments);

  // Sync schema from cache when the resolved endpoint changes
  // (covers URL edits, param changes, auth changes, env switches, AND env value edits)
  useEffect(() => {
    if (!request) return;
    const envVars = getActiveVariables();
    const resolved = buildSchemaCacheKey(request, envVars);
    if (resolved !== prevResolvedRef.current) {
      prevResolvedRef.current = resolved;
      const cached = resolved ? schemaCache.get(resolved) ?? null : null;
      setSchema(cached);
      if (!cached) setShowSchema(false);
    }
  }, [request?.url, request?.params, request?.auth, activeEnvironmentId, environments, getActiveVariables, request]);

  const graphqlExtension = useMemo(() => {
    return schema ? graphqlLang(schema) : graphqlLang();
  }, [schema]);

  const fetchSchema = useCallback(async () => {
    if (!request) return;
    const rawUrl = request.url?.trim();
    if (!rawUrl) {
      setSchemaError('Enter a GraphQL endpoint URL first');
      return;
    }

    setSchemaLoading(true);
    setSchemaError(null);

    try {
      // Resolve environment variables, params, and auth — same as sendRequest
      const envVars = getActiveVariables();
      const resolvedAuth = {
        ...request.auth,
        basic: request.auth.basic ? {
          username: resolveVariables(request.auth.basic.username, envVars),
          password: resolveVariables(request.auth.basic.password, envVars),
        } : undefined,
        bearer: request.auth.bearer ? {
          token: resolveVariables(request.auth.bearer.token, envVars),
        } : undefined,
        apiKey: request.auth.apiKey ? {
          ...request.auth.apiKey,
          key: resolveVariables(request.auth.apiKey.key, envVars),
          value: resolveVariables(request.auth.apiKey.value, envVars),
        } : undefined,
      };

      const cacheKey = buildSchemaCacheKey(request, envVars);
      if (!cacheKey) throw new Error('Could not resolve endpoint URL');

      // Build the actual endpoint URL for the proxy (without the auth fingerprint)
      const resolvedUrl = resolveVariables(rawUrl, envVars);
      const resolvedParams = request.params.map(p => ({
        ...p,
        key: resolveVariables(p.key, envVars),
        value: resolveVariables(p.value, envVars),
      }));
      let endpointUrl = buildUrl(resolvedUrl, resolvedParams);
      if (resolvedAuth.type === 'api-key' && resolvedAuth.apiKey?.addTo === 'query') {
        const urlObj = new URL(endpointUrl.startsWith('http') ? endpointUrl : `https://${endpointUrl}`);
        urlObj.searchParams.append(resolvedAuth.apiKey.key, resolvedAuth.apiKey.value);
        endpointUrl = urlObj.toString();
      }

      const headers = buildHeaders(
        request.headers.map(h => ({
          ...h,
          key: resolveVariables(h.key, envVars),
          value: resolveVariables(h.value, envVars),
        })),
        resolvedAuth,
      );
      headers['Content-Type'] = 'application/json';

      const targetUrl = endpointUrl.startsWith('http') ? endpointUrl : `https://${endpointUrl}`;

      const response = await fetch(proxyUrl('/api/proxy'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: 'POST',
          url: targetUrl,
          headers,
          body: JSON.stringify({ query: getIntrospectionQuery() }),
          bodyType: 'json',
        }),
      });

      const data = await response.json();

      if (data.status >= 400) {
        throw new Error(`Server returned ${data.status}: ${data.body?.substring(0, 200)}`);
      }

      const body = typeof data.body === 'string' ? JSON.parse(data.body) : data.body;

      if (body.errors && !body.data) {
        throw new Error(body.errors[0]?.message || 'Introspection query failed');
      }

      const introspectionResult: IntrospectionQuery = body.data;
      const clientSchema = buildClientSchema(introspectionResult);
      schemaCache.set(cacheKey, clientSchema);
      setSchema(clientSchema);
      setShowSchema(true);
    } catch (err) {
      setSchemaError(err instanceof Error ? err.message : 'Failed to fetch schema');
    } finally {
      setSchemaLoading(false);
    }
  }, [request, getActiveVariables]);

  return (
    <div className="flex flex-col gap-2">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-dark-400 font-medium">QUERY</span>
        <div className="flex items-center gap-2">
          {schema && (
            <button
              onClick={() => setShowSchema(s => !s)}
              className={`flex items-center gap-1 px-2 py-1 text-xs rounded-md transition-colors cursor-pointer ${
                showSchema
                  ? 'bg-accent-blue/20 text-accent-blue'
                  : 'bg-dark-700 text-dark-300 hover:text-dark-100'
              }`}
            >
              <BookOpen size={12} />
              Schema
            </button>
          )}
          <button
            onClick={fetchSchema}
            disabled={schemaLoading}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-dark-700 text-dark-300 hover:text-dark-100 rounded-md transition-colors cursor-pointer disabled:opacity-50"
            title="Fetch schema via introspection"
          >
            <RefreshCw size={12} className={schemaLoading ? 'animate-spin' : ''} />
            {schema ? 'Refresh Schema' : 'Fetch Schema'}
          </button>
        </div>
      </div>

      {schemaError && (
        <div className="text-xs text-accent-red bg-accent-red/10 border border-accent-red/30 rounded-md px-3 py-2">
          {schemaError}
        </div>
      )}

      {/* Main content area */}
      <div className="flex gap-2">
        {/* Query + Variables column */}
        <div className={`flex flex-col gap-2 ${showSchema ? 'w-2/3' : 'w-full'}`}>
          {/* Query editor */}
          <div className="border border-dark-600 rounded-lg overflow-hidden h-[200px]">
            <CodeMirror
              value={query}
              onChange={onQueryChange}
              extensions={[graphqlExtension]}
              theme={theme === 'dark' ? oneDark : 'light'}
              height="200px"
              basicSetup={{
                lineNumbers: true,
                foldGutter: true,
                bracketMatching: true,
                closeBrackets: true,
                autocompletion: true,
              }}
              placeholder={`# Write your GraphQL query here\nquery {\n  \n}`}
            />
          </div>

          {/* Variables editor */}
          <div className="flex flex-col gap-1">
            <span className="text-xs text-dark-400 font-medium">VARIABLES (JSON)</span>
            <div className="border border-dark-600 rounded-lg overflow-hidden" style={{ height: variablesHeight }}>
              <CodeMirror
                value={variables}
                onChange={onVariablesChange}
                extensions={[json()]}
                theme={theme === 'dark' ? oneDark : 'light'}
                height={`${variablesHeight}px`}
                basicSetup={{
                  lineNumbers: true,
                  bracketMatching: true,
                  closeBrackets: true,
                }}
                placeholder='{ "key": "value" }'
              />
            </div>
            {/* Resize handle */}
            <div
              className="h-1.5 cursor-row-resize flex items-center justify-center hover:bg-dark-600 rounded transition-colors"
              onMouseDown={e => {
                const startY = e.clientY;
                const startH = variablesHeight;
                const onMove = (ev: MouseEvent) => {
                  setVariablesHeight(Math.max(50, Math.min(300, startH + ev.clientY - startY)));
                };
                const onUp = () => {
                  document.removeEventListener('mousemove', onMove);
                  document.removeEventListener('mouseup', onUp);
                };
                document.addEventListener('mousemove', onMove);
                document.addEventListener('mouseup', onUp);
              }}
            >
              <div className="w-8 h-0.5 bg-dark-500 rounded-full" />
            </div>
          </div>
        </div>

        {/* Schema explorer */}
        {showSchema && schema && (
          <div className="w-1/3 border border-dark-600 rounded-lg overflow-hidden max-h-[350px] flex flex-col">
            <SchemaExplorer schema={schema} />
          </div>
        )}
      </div>
    </div>
  );
}

// --- Schema Explorer ---

function SchemaExplorer({ schema }: { schema: GraphQLSchema }) {
  const queryType = schema.getQueryType();
  const mutationType = schema.getMutationType();
  const subscriptionType = schema.getSubscriptionType();

  return (
    <div className="text-xs flex flex-col h-full">
      <div className="px-3 py-2 bg-dark-700/50 border-b border-dark-600 text-dark-200 font-medium shrink-0">
        Schema Explorer
      </div>
      <div className="p-2 overflow-auto flex-1">
        {queryType && (
          <TypeSection name="Query" fields={queryType.getFields()} />
        )}
        {mutationType && (
          <TypeSection name="Mutation" fields={mutationType.getFields()} />
        )}
        {subscriptionType && (
          <TypeSection name="Subscription" fields={subscriptionType.getFields()} />
        )}
        {!queryType && !mutationType && !subscriptionType && (
          <div className="text-dark-400 text-center py-4">No root types found</div>
        )}
      </div>
    </div>
  );
}

function TypeSection({ name, fields }: { name: string; fields: Record<string, { type: { toString(): string }; args?: readonly { name: string; type: { toString(): string } }[]; description?: string | null }> }) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="mb-2">
      <button
        onClick={() => setExpanded(e => !e)}
        className="flex items-center gap-1 w-full text-left py-1 px-1 text-dark-200 font-medium hover:bg-dark-700 rounded cursor-pointer"
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <span className="text-accent-blue">{name}</span>
      </button>
      {expanded && (
        <div className="ml-4 border-l border-dark-600 pl-2">
          {Object.entries(fields).map(([fieldName, field]) => (
            <FieldItem key={fieldName} name={fieldName} field={field} />
          ))}
        </div>
      )}
    </div>
  );
}

function FieldItem({ name, field }: { name: string; field: { type: { toString(): string }; args?: readonly { name: string; type: { toString(): string } }[]; description?: string | null } }) {
  const [expanded, setExpanded] = useState(false);
  const hasArgs = field.args && field.args.length > 0;

  return (
    <div className="py-0.5">
      <div
        className={`flex items-start gap-1 py-0.5 px-1 rounded ${hasArgs ? 'hover:bg-dark-700 cursor-pointer' : ''}`}
        onClick={hasArgs ? () => setExpanded(e => !e) : undefined}
      >
        {hasArgs && (
          <span className="mt-0.5 shrink-0">
            {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
          </span>
        )}
        <span className="text-dark-100">{name}</span>
        <span className="text-dark-500">:</span>
        <span className="text-accent-green">{field.type.toString()}</span>
      </div>
      {field.description && (
        <div className="ml-4 text-dark-400 text-[10px] italic">{field.description}</div>
      )}
      {expanded && hasArgs && (
        <div className="ml-5 border-l border-dark-700 pl-2 py-0.5">
          <span className="text-dark-500 text-[10px]">Arguments:</span>
          {field.args!.map(arg => (
            <div key={arg.name} className="flex items-center gap-1 py-0.5">
              <span className="text-accent-yellow">{arg.name}</span>
              <span className="text-dark-500">:</span>
              <span className="text-accent-green">{arg.type.toString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
