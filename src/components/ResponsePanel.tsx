import { useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { json } from '@codemirror/lang-json';
import { xml } from '@codemirror/lang-xml';
import { html } from '@codemirror/lang-html';
import { oneDark } from '@codemirror/theme-one-dark';
import { Copy, Check, FileDown } from 'lucide-react';
import type { ResponseData } from '../types';
import { getStatusColor, formatBytes, formatTime, tryFormatJson } from '../utils/http';

interface Props {
  response: ResponseData | null;
  loading: boolean;
}

type ResponseTab = 'body' | 'headers' | 'cookies';

export function ResponsePanel({ response, loading }: Props) {
  const [activeTab, setActiveTab] = useState<ResponseTab>('body');
  const [copied, setCopied] = useState(false);
  const [bodyFormat, setBodyFormat] = useState<'pretty' | 'raw'>('pretty');

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-3 border-accent-blue border-t-transparent rounded-full animate-spin" />
          <span className="text-dark-300 text-sm">Sending request...</span>
        </div>
      </div>
    );
  }

  if (!response) {
    return (
      <div className="flex items-center justify-center h-full text-dark-400">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="text-4xl opacity-30">{"{ }"}</div>
          <p className="text-sm">Enter a URL and click Send to get a response</p>
          <p className="text-xs text-dark-500">Or press Enter in the URL bar</p>
        </div>
      </div>
    );
  }

  const isJson = (() => {
    try {
      JSON.parse(response.body);
      return true;
    } catch {
      return false;
    }
  })();

  const isXml = response.body.trim().startsWith('<');
  const isHtml = response.body.trim().toLowerCase().startsWith('<!doctype') ||
    response.body.trim().toLowerCase().startsWith('<html');

  const getExtensions = () => {
    if (isJson) return [json()];
    if (isXml || isHtml) return [isHtml ? html() : xml()];
    return [];
  };

  const displayBody = bodyFormat === 'pretty' && isJson
    ? tryFormatJson(response.body)
    : response.body;

  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(displayBody);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadResponse = () => {
    const ext = isJson ? 'json' : isXml ? 'xml' : isHtml ? 'html' : 'txt';
    const blob = new Blob([displayBody], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `response.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const tabs: { id: ResponseTab; label: string; count?: number }[] = [
    { id: 'body', label: 'Body' },
    { id: 'headers', label: 'Headers', count: Object.keys(response.headers).length },
    { id: 'cookies', label: 'Cookies', count: response.cookies.length },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Status bar */}
      <div className="flex items-center justify-between px-3 py-2 bg-dark-800/50 border-b border-dark-600">
        <div className="flex items-center gap-4">
          {/* Tabs */}
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`text-sm font-medium transition-colors cursor-pointer ${
                activeTab === tab.id
                  ? 'text-dark-100 border-b-2 border-accent-blue pb-1'
                  : 'text-dark-300 hover:text-dark-200'
              }`}
            >
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span className="ml-1 text-[10px] text-dark-400">({tab.count})</span>
              )}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 text-xs">
          <span className={`font-bold ${getStatusColor(response.status)}`}>
            {response.status === 0 ? 'Error' : `${response.status} ${response.statusText}`}
          </span>
          <span className="text-dark-400">|</span>
          <span className="text-dark-300">{formatTime(response.time)}</span>
          <span className="text-dark-400">|</span>
          <span className="text-dark-300">{formatBytes(response.size)}</span>
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'body' && (
          <div className="flex flex-col h-full">
            {/* Body toolbar */}
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-dark-700">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setBodyFormat('pretty')}
                  className={`px-2 py-1 text-xs rounded cursor-pointer ${
                    bodyFormat === 'pretty'
                      ? 'bg-dark-600 text-dark-100'
                      : 'text-dark-400 hover:text-dark-200'
                  }`}
                >
                  Pretty
                </button>
                <button
                  onClick={() => setBodyFormat('raw')}
                  className={`px-2 py-1 text-xs rounded cursor-pointer ${
                    bodyFormat === 'raw'
                      ? 'bg-dark-600 text-dark-100'
                      : 'text-dark-400 hover:text-dark-200'
                  }`}
                >
                  Raw
                </button>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={copyToClipboard}
                  className="p-1.5 text-dark-400 hover:text-dark-200 rounded transition-colors cursor-pointer"
                  title="Copy response"
                >
                  {copied ? <Check size={14} className="text-accent-green" /> : <Copy size={14} />}
                </button>
                <button
                  onClick={downloadResponse}
                  className="p-1.5 text-dark-400 hover:text-dark-200 rounded transition-colors cursor-pointer"
                  title="Download response"
                >
                  <FileDown size={14} />
                </button>
              </div>
            </div>

            {/* Body content */}
            <div className="flex-1 overflow-auto">
              {response.status === 0 ? (
                <div className="p-4">
                  <div className="bg-accent-red/10 border border-accent-red/30 rounded-lg p-4">
                    <div className="flex items-center gap-2 text-accent-red font-semibold text-sm mb-2">
                      <span>Request Failed</span>
                    </div>
                    <p className="text-dark-200 text-sm whitespace-pre-wrap">{response.body}</p>
                  </div>
                </div>
              ) : (
                <CodeMirror
                  value={displayBody}
                  extensions={getExtensions()}
                  theme={oneDark}
                  readOnly
                  height="100%"
                  basicSetup={{
                    lineNumbers: true,
                    foldGutter: true,
                    highlightActiveLine: false,
                  }}
                />
              )}
            </div>
          </div>
        )}

        {activeTab === 'headers' && (
          <div className="overflow-auto p-3">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-dark-300 text-left text-xs">
                  <th className="pb-2 pr-4 font-medium">Header</th>
                  <th className="pb-2 font-medium">Value</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(response.headers).map(([key, value]) => (
                  <tr key={key} className="border-t border-dark-700">
                    <td className="py-2 pr-4 text-accent-blue font-mono text-xs">{key}</td>
                    <td className="py-2 text-dark-200 font-mono text-xs break-all">{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {Object.keys(response.headers).length === 0 && (
              <div className="text-dark-400 text-sm text-center py-8">No headers in response</div>
            )}
          </div>
        )}

        {activeTab === 'cookies' && (
          <div className="overflow-auto p-3">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-dark-300 text-left text-xs">
                  <th className="pb-2 pr-4 font-medium">Name</th>
                  <th className="pb-2 pr-4 font-medium">Value</th>
                  <th className="pb-2 pr-4 font-medium">Domain</th>
                  <th className="pb-2 font-medium">Path</th>
                </tr>
              </thead>
              <tbody>
                {response.cookies.map((cookie, i) => (
                  <tr key={i} className="border-t border-dark-700">
                    <td className="py-2 pr-4 text-accent-blue font-mono text-xs">{cookie.name}</td>
                    <td className="py-2 pr-4 text-dark-200 font-mono text-xs break-all">{cookie.value}</td>
                    <td className="py-2 pr-4 text-dark-300 text-xs">{cookie.domain || '-'}</td>
                    <td className="py-2 text-dark-300 text-xs">{cookie.path || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {response.cookies.length === 0 && (
              <div className="text-dark-400 text-sm text-center py-8">No cookies in response</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
