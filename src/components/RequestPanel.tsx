import { useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { json } from '@codemirror/lang-json';
import { xml } from '@codemirror/lang-xml';
import { html } from '@codemirror/lang-html';
import { oneDark } from '@codemirror/theme-one-dark';
import type { RequestConfig, BodyType, AuthType } from '../types';
import { useAppStore } from '../store';
import type { Theme } from '../store';
import { KeyValueEditor } from './KeyValueEditor';
import { FormDataEditor } from './FormDataEditor';
import { BinaryBodyEditor } from './BinaryBodyEditor';

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
  ];

  const updateBody = (updates: Partial<RequestConfig['body']>) => {
    updateRequest(request.id, {
      body: { ...request.body, ...updates },
    });
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
    </div>
  );
}

function AuthEditor({ request }: { request: RequestConfig }) {
  const updateRequest = useAppStore(s => s.updateRequest);

  const authTypes: { id: AuthType; label: string }[] = [
    { id: 'none', label: 'No Auth' },
    { id: 'basic', label: 'Basic Auth' },
    { id: 'bearer', label: 'Bearer Token' },
    { id: 'api-key', label: 'API Key' },
  ];

  const updateAuth = (updates: Partial<RequestConfig['auth']>) => {
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
    </div>
  );
}
