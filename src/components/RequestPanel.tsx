import { useState, useEffect } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { json } from '@codemirror/lang-json';
import { xml } from '@codemirror/lang-xml';
import { html } from '@codemirror/lang-html';
import { oneDark } from '@codemirror/theme-one-dark';
import type { RequestConfig, BodyType, AuthType, OAuth2GrantType } from '../types';
import { useAppStore } from '../store';
import type { Theme } from '../store';
import { KeyValueEditor } from './KeyValueEditor';
import { FormDataEditor } from './FormDataEditor';
import { BinaryBodyEditor } from './BinaryBodyEditor';
import { GraphQLEditor } from './GraphQLEditor';
import { fetchOAuth2Token, buildAuthorizationUrl, isTokenExpired } from '../utils/oauth';
import { resolveOAuth2Variables } from '../utils/http';

type RequestTabType = 'params' | 'headers' | 'body' | 'auth';

interface Props {
  request: RequestConfig;
}

export function RequestPanel({ request }: Props) {
  const [activeTab, setActiveTab] = useState<RequestTabType>('params');
  const updateRequest = useAppStore(s => s.updateRequest);

  const tabs: { id: RequestTabType; label: string; count?: number }[] = [
    { id: 'params', label: 'Params', count: request.params.filter(p => p.enabled && p.key).length },
    { id: 'headers', label: 'Headers', count: request.headers.filter(h => h.enabled && h.key).length },
    { id: 'body', label: 'Body' },
    { id: 'auth', label: 'Auth' },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex items-center border-b border-dark-600 bg-dark-800/50">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors cursor-pointer ${
              activeTab === tab.id
                ? 'text-dark-100 border-b-2 border-accent-blue'
                : 'text-dark-300 hover:text-dark-200'
            }`}
          >
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 text-[10px] bg-accent-blue/20 text-accent-blue rounded-full">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto p-2">
        {activeTab === 'params' && (
          <KeyValueEditor
            pairs={request.params}
            onChange={params => updateRequest(request.id, { params })}
            keyPlaceholder="Parameter"
            valuePlaceholder="Value"
            showDescription
          />
        )}

        {activeTab === 'headers' && (
          <KeyValueEditor
            pairs={request.headers}
            onChange={headers => updateRequest(request.id, { headers })}
            keyPlaceholder="Header"
            valuePlaceholder="Value"
          />
        )}

        {activeTab === 'body' && (
          <BodyEditor request={request} />
        )}

        {activeTab === 'auth' && (
          <AuthEditor request={request} />
        )}
      </div>
    </div>
  );
}

function BodyEditor({ request }: { request: RequestConfig }) {
  const updateRequest = useAppStore(s => s.updateRequest);
  const theme = useAppStore(s => s.theme) as Theme;

  const bodyTypes: { id: BodyType; label: string }[] = [
    { id: 'none', label: 'None' },
    { id: 'json', label: 'JSON' },
    { id: 'text', label: 'Text' },
    { id: 'xml', label: 'XML' },
    { id: 'form-data', label: 'Form Data' },
    { id: 'x-www-form-urlencoded', label: 'URL Encoded' },
    { id: 'binary', label: 'Binary' },
    { id: 'graphql', label: 'GraphQL' },
  ];

  const updateBody = (updates: Partial<RequestConfig['body']>) => {
    const reqUpdates: Partial<RequestConfig> = {
      body: { ...request.body, ...updates },
    };
    // Auto-switch to POST when selecting GraphQL
    if (updates.type === 'graphql' && ['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      reqUpdates.method = 'POST';
    }
    updateRequest(request.id, reqUpdates);
  };

  const getExtension = () => {
    switch (request.body.type) {
      case 'json': return [json()];
      case 'xml': return [xml()];
      case 'text': return [html()];
      default: return [];
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Body type selector */}
      <div className="flex items-center gap-1 flex-wrap">
        {bodyTypes.map(bt => (
          <button
            key={bt.id}
            onClick={() => updateBody({ type: bt.id })}
            className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors cursor-pointer ${
              request.body.type === bt.id
                ? 'bg-accent-blue text-white'
                : 'bg-dark-700 text-dark-300 hover:text-dark-100'
            }`}
          >
            {bt.label}
          </button>
        ))}
      </div>

      {/* Body content */}
      {request.body.type === 'none' && (
        <div className="text-dark-400 text-sm py-8 text-center">
          This request does not have a body
        </div>
      )}

      {['json', 'text', 'xml'].includes(request.body.type) && (
        <div className="border border-dark-600 rounded-lg overflow-hidden h-[250px]">
          <CodeMirror
            value={request.body.raw}
            onChange={val => updateBody({ raw: val })}
            extensions={getExtension()}
            theme={theme === 'dark' ? oneDark : 'light'}
            height="250px"
            basicSetup={{
              lineNumbers: true,
              foldGutter: true,
              bracketMatching: true,
              closeBrackets: true,
            }}
          />
        </div>
      )}

      {request.body.type === 'form-data' && (
        <FormDataEditor
          requestId={request.id}
          entries={request.body.formData}
          onChange={formData => updateBody({ formData })}
        />
      )}

      {request.body.type === 'x-www-form-urlencoded' && (
        <KeyValueEditor
          pairs={request.body.urlencoded}
          onChange={urlencoded => updateBody({ urlencoded })}
          keyPlaceholder="Key"
          valuePlaceholder="Value"
        />
      )}

      {request.body.type === 'binary' && (
        <BinaryBodyEditor
          requestId={request.id}
          binaryFile={request.body.binaryFile}
          onChange={binaryFile => updateBody({ binaryFile })}
        />
      )}

      {request.body.type === 'graphql' && (
        <GraphQLEditor
          requestId={request.id}
          query={request.body.graphql?.query ?? ''}
          variables={request.body.graphql?.variables ?? ''}
          onQueryChange={query =>
            updateBody({ graphql: { ...request.body.graphql, query, variables: request.body.graphql?.variables ?? '' } })
          }
          onVariablesChange={variables =>
            updateBody({ graphql: { ...request.body.graphql, query: request.body.graphql?.query ?? '', variables } })
          }
        />
      )}
    </div>
  );
}

function AuthEditor({ request }: { request: RequestConfig }) {
  const updateRequest = useAppStore(s => s.updateRequest);
  const getActiveVariables = useAppStore(s => s.getActiveVariables);

  const [tokenLoading, setTokenLoading] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [authCode, setAuthCode] = useState('');

  // Reset transient OAuth state when switching between requests
  useEffect(() => {
    setTokenError(null);
    setAuthCode('');
    setTokenLoading(false);
  }, [request.id]);

  const authTypes: { id: AuthType; label: string }[] = [
    { id: 'none', label: 'No Auth' },
    { id: 'basic', label: 'Basic Auth' },
    { id: 'bearer', label: 'Bearer Token' },
    { id: 'api-key', label: 'API Key' },
    { id: 'oauth2', label: 'OAuth 2.0' },
  ];

  const updateAuth = (updates: Partial<RequestConfig['auth']>) => {
    if (updates.type && updates.type !== request.auth.type) {
      setTokenError(null);
      setAuthCode('');
    }
    updateRequest(request.id, {
      auth: { ...request.auth, ...updates },
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Auth type selector */}
      <div className="flex items-center gap-1">
        {authTypes.map(at => (
          <button
            key={at.id}
            onClick={() => updateAuth({ type: at.id })}
            className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors cursor-pointer ${
              request.auth.type === at.id
                ? 'bg-accent-blue text-white'
                : 'bg-dark-700 text-dark-300 hover:text-dark-100'
            }`}
          >
            {at.label}
          </button>
        ))}
      </div>

      {/* Auth content */}
      {request.auth.type === 'none' && (
        <div className="text-dark-400 text-sm py-8 text-center">
          This request does not use any authorization
        </div>
      )}

      {request.auth.type === 'basic' && (
        <div className="flex flex-col gap-3 max-w-md">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-dark-300 font-medium">Username</span>
            <input
              type="text"
              value={request.auth.basic?.username || ''}
              onChange={e =>
                updateAuth({
                  basic: { username: e.target.value, password: request.auth.basic?.password || '' },
                })
              }
              className="bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-sm text-dark-100"
              placeholder="Username"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-dark-300 font-medium">Password</span>
            <input
              type="password"
              value={request.auth.basic?.password || ''}
              onChange={e =>
                updateAuth({
                  basic: { username: request.auth.basic?.username || '', password: e.target.value },
                })
              }
              className="bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-sm text-dark-100"
              placeholder="Password"
            />
          </label>
        </div>
      )}

      {request.auth.type === 'bearer' && (
        <div className="flex flex-col gap-1 max-w-lg">
          <span className="text-xs text-dark-300 font-medium">Token</span>
          <input
            type="text"
            value={request.auth.bearer?.token || ''}
            onChange={e => updateAuth({ bearer: { token: e.target.value } })}
            className="bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-sm text-dark-100 font-mono"
            placeholder="Enter bearer token"
          />
        </div>
      )}

      {request.auth.type === 'api-key' && (
        <div className="flex flex-col gap-3 max-w-md">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-dark-300 font-medium">Key</span>
            <input
              type="text"
              value={request.auth.apiKey?.key || ''}
              onChange={e =>
                updateAuth({
                  apiKey: {
                    key: e.target.value,
                    value: request.auth.apiKey?.value || '',
                    addTo: request.auth.apiKey?.addTo || 'header',
                  },
                })
              }
              className="bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-sm text-dark-100"
              placeholder="e.g. X-API-Key"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-dark-300 font-medium">Value</span>
            <input
              type="text"
              value={request.auth.apiKey?.value || ''}
              onChange={e =>
                updateAuth({
                  apiKey: {
                    key: request.auth.apiKey?.key || '',
                    value: e.target.value,
                    addTo: request.auth.apiKey?.addTo || 'header',
                  },
                })
              }
              className="bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-sm text-dark-100 font-mono"
              placeholder="API key value"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-dark-300 font-medium">Add to</span>
            <select
              value={request.auth.apiKey?.addTo || 'header'}
              onChange={e =>
                updateAuth({
                  apiKey: {
                    key: request.auth.apiKey?.key || '',
                    value: request.auth.apiKey?.value || '',
                    addTo: e.target.value as 'header' | 'query',
                  },
                })
              }
              className="bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-sm text-dark-100 cursor-pointer"
            >
              <option value="header">Header</option>
              <option value="query">Query Params</option>
            </select>
          </label>
        </div>
      )}

      {request.auth.type === 'oauth2' && (
        <div className="flex flex-col gap-3 max-w-lg">
          {/* Grant type selector */}
          <label className="flex flex-col gap-1">
            <span className="text-xs text-dark-300 font-medium">Grant Type</span>
            <select
              value={request.auth.oauth2?.grantType || 'client_credentials'}
              onChange={e =>
                updateAuth({
                  oauth2: {
                    ...defaultOAuth2Config(),
                    ...request.auth.oauth2,
                    grantType: e.target.value as OAuth2GrantType,
                  },
                })
              }
              className="bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-sm text-dark-100 cursor-pointer"
            >
              <option value="client_credentials">Client Credentials</option>
              <option value="authorization_code">Authorization Code</option>
            </select>
          </label>

          {/* Authorization URL (only for auth code flow) */}
          {request.auth.oauth2?.grantType === 'authorization_code' && (
            <label className="flex flex-col gap-1">
              <span className="text-xs text-dark-300 font-medium">Authorization URL</span>
              <input
                type="text"
                value={request.auth.oauth2?.authUrl || ''}
                onChange={e =>
                  updateAuth({
                    oauth2: { ...defaultOAuth2Config(), ...request.auth.oauth2, authUrl: e.target.value },
                  })
                }
                className="bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-sm text-dark-100 font-mono"
                placeholder="https://provider.com/oauth/authorize"
              />
            </label>
          )}

          {/* Token URL */}
          <label className="flex flex-col gap-1">
            <span className="text-xs text-dark-300 font-medium">Token URL</span>
            <input
              type="text"
              value={request.auth.oauth2?.tokenUrl || ''}
              onChange={e =>
                updateAuth({
                  oauth2: { ...defaultOAuth2Config(), ...request.auth.oauth2, tokenUrl: e.target.value },
                })
              }
              className="bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-sm text-dark-100 font-mono"
              placeholder="https://provider.com/oauth/token"
            />
          </label>

          {/* Client ID */}
          <label className="flex flex-col gap-1">
            <span className="text-xs text-dark-300 font-medium">Client ID</span>
            <input
              type="text"
              value={request.auth.oauth2?.clientId || ''}
              onChange={e =>
                updateAuth({
                  oauth2: { ...defaultOAuth2Config(), ...request.auth.oauth2, clientId: e.target.value },
                })
              }
              className="bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-sm text-dark-100 font-mono"
              placeholder="your-client-id"
            />
          </label>

          {/* Client Secret */}
          <label className="flex flex-col gap-1">
            <span className="text-xs text-dark-300 font-medium">Client Secret</span>
            <input
              type="password"
              value={request.auth.oauth2?.clientSecret || ''}
              onChange={e =>
                updateAuth({
                  oauth2: { ...defaultOAuth2Config(), ...request.auth.oauth2, clientSecret: e.target.value },
                })
              }
              className="bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-sm text-dark-100 font-mono"
              placeholder="your-client-secret"
            />
          </label>

          {/* Client Auth Method */}
          <label className="flex flex-col gap-1">
            <span className="text-xs text-dark-300 font-medium">Client Authentication</span>
            <select
              value={request.auth.oauth2?.clientAuthMethod || 'post'}
              onChange={e =>
                updateAuth({
                  oauth2: { ...defaultOAuth2Config(), ...request.auth.oauth2, clientAuthMethod: e.target.value as 'post' | 'basic' },
                })
              }
              className="bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-sm text-dark-100 cursor-pointer"
            >
              <option value="post">Send in body (client_secret_post)</option>
              <option value="basic">Send as Basic Auth header (client_secret_basic)</option>
            </select>
          </label>

          {/* Scope */}
          <label className="flex flex-col gap-1">
            <span className="text-xs text-dark-300 font-medium">Scope</span>
            <input
              type="text"
              value={request.auth.oauth2?.scope || ''}
              onChange={e =>
                updateAuth({
                  oauth2: { ...defaultOAuth2Config(), ...request.auth.oauth2, scope: e.target.value },
                })
              }
              className="bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-sm text-dark-100 font-mono"
              placeholder="read write (space-separated)"
            />
          </label>

          {/* Callback URL (only for auth code flow) */}
          {request.auth.oauth2?.grantType === 'authorization_code' && (
            <>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-dark-300 font-medium">Callback URL</span>
                <input
                  type="text"
                  value={request.auth.oauth2?.callbackUrl || ''}
                  onChange={e =>
                    updateAuth({
                      oauth2: { ...defaultOAuth2Config(), ...request.auth.oauth2, callbackUrl: e.target.value },
                    })
                  }
                  className="bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-sm text-dark-100 font-mono"
                  placeholder="https://localhost/callback"
                />
              </label>

              {/* Get Authorization Code button */}
              <button
                onClick={() => {
                  const cfg = resolveOAuth2Variables(
                    { ...defaultOAuth2Config(), ...request.auth.oauth2 },
                    getActiveVariables(),
                  );
                  const url = buildAuthorizationUrl(cfg);
                  window.open(url, '_blank', 'width=600,height=700,noopener,noreferrer');
                }}
                disabled={!request.auth.oauth2?.authUrl || !request.auth.oauth2?.clientId}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-dark-600 text-dark-200 hover:bg-dark-500 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
              >
                Get Authorization Code
              </button>

              {/* Authorization code input */}
              <label className="flex flex-col gap-1">
                <span className="text-xs text-dark-300 font-medium">Authorization Code</span>
                <input
                  type="text"
                  value={authCode}
                  onChange={e => setAuthCode(e.target.value)}
                  className="bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-sm text-dark-100 font-mono"
                  placeholder="Paste the authorization code here"
                />
              </label>
            </>
          )}

          {/* Token status */}
          {request.auth.oauth2?.token?.accessToken && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-dark-700 border border-dark-600">
              <div
                className={`w-2 h-2 rounded-full ${
                  request.auth.oauth2.token && isTokenExpired(request.auth.oauth2.token)
                    ? 'bg-accent-red'
                    : 'bg-accent-green'
                }`}
              />
              <span className="text-xs text-dark-300">
                {request.auth.oauth2.token && isTokenExpired(request.auth.oauth2.token)
                  ? 'Token expired'
                  : 'Token active'}
              </span>
              <span className="text-xs text-dark-400 font-mono ml-auto truncate max-w-[200px]">
                {request.auth.oauth2.token.accessToken.length > 20
                  ? `${request.auth.oauth2.token.accessToken.substring(0, 20)}...`
                  : request.auth.oauth2.token.accessToken}
              </span>
            </div>
          )}

          {/* Error display */}
          {tokenError && (
            <div className="px-3 py-2 rounded-lg bg-accent-red/10 border border-accent-red/30 text-accent-red text-xs">
              {tokenError}
            </div>
          )}

          {/* Get Token / Refresh Token button */}
          <div className="flex gap-2">
            <button
              onClick={async () => {
                setTokenError(null);
                setTokenLoading(true);
                try {
                  const raw = { ...defaultOAuth2Config(), ...request.auth.oauth2 };
                  const cfg = resolveOAuth2Variables(raw, getActiveVariables());
                  const token = await fetchOAuth2Token(
                    cfg,
                    cfg.grantType === 'authorization_code' ? authCode : undefined,
                    request.sslVerification,
                  );
                  updateAuth({ oauth2: { ...raw, token } });
                  setAuthCode('');
                } catch (err) {
                  setTokenError(err instanceof Error ? err.message : 'Failed to fetch token');
                } finally {
                  setTokenLoading(false);
                }
              }}
              disabled={
                tokenLoading ||
                !request.auth.oauth2?.tokenUrl ||
                !request.auth.oauth2?.clientId ||
                (request.auth.oauth2?.grantType === 'authorization_code' && !authCode)
              }
              className="flex-1 px-4 py-2 text-sm font-medium rounded-lg bg-accent-blue text-white hover:bg-accent-blue/80 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
            >
              {tokenLoading
                ? 'Requesting...'
                : request.auth.oauth2?.token?.accessToken
                  ? 'Get New Token'
                  : 'Get Token'}
            </button>
            {request.auth.oauth2?.token?.accessToken && (
              <button
                onClick={() =>
                  updateAuth({
                    oauth2: { ...defaultOAuth2Config(), ...request.auth.oauth2, token: undefined },
                  })
                }
                className="px-4 py-2 text-sm font-medium rounded-lg bg-dark-600 text-dark-200 hover:bg-dark-500 cursor-pointer transition-colors"
              >
                Clear Token
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function defaultOAuth2Config(): import('../types').OAuth2Config {
  return {
    grantType: 'client_credentials',
    authUrl: '',
    tokenUrl: '',
    clientId: '',
    clientSecret: '',
    scope: '',
    callbackUrl: '',
  };
}

