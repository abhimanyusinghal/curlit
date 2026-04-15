import { useState, useRef, useCallback } from 'react';
import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { json } from '@codemirror/lang-json';
import { xml } from '@codemirror/lang-xml';
import { html } from '@codemirror/lang-html';
import { oneDark } from '@codemirror/theme-one-dark';
import { search, openSearchPanel } from '@codemirror/search';
import { Copy, Check, FileDown, Search, CircleCheck, CircleX, Terminal } from 'lucide-react';
import type { ResponseData, RequestProtocol } from '../types';
import { getStatusColor, formatBytes, formatTime, tryFormatJson } from '../utils/http';
import { useAppStore } from '../store';
import { WebSocketMessageLog } from './WebSocketMessageLog';

interface Props {
  response: ResponseData | null;
  loading: boolean;
  requestId: string;
  protocol?: RequestProtocol;
}

type ResponseTab = 'body' | 'headers' | 'cookies' | 'tests' | 'console';

export function ResponsePanel({ response, loading, requestId, protocol }: Props) {
  if (protocol === 'websocket') {
    return <WebSocketMessageLog requestId={requestId} />;
  }
  const [activeTab, setActiveTab] = useState<ResponseTab>('body');
  const [copied, setCopied] = useState(false);
  const [bodyFormat, setBodyFormat] = useState<'pretty' | 'raw'>('pretty');
  const theme = useAppStore(s => s.theme);
  const editorRef = useRef<ReactCodeMirrorRef>(null);
  const testResults = useAppStore(s => s.testResults[requestId]);
  const scriptLogs = useAppStore(s => s.scriptLogs[requestId]);

  // Derive effective tab: fall back to 'body' if selected tab's data is gone.
  // The parent component uses key={requestId} to remount this component when
  // the request changes, which resets activeTab to 'body' automatically.
  const testsAvailable = (testResults ?? []).length > 0;
  const logsAvailable = (scriptLogs ?? []).length > 0;
  const effectiveTab =
    (activeTab === 'tests' && !testsAvailable) ? 'body' :
    (activeTab === 'console' && !logsAvailable) ? 'body' :
    activeTab;

  const handleSearch = useCallback(() => {
    const view = editorRef.current?.view;
    if (view) {
      view.focus();
      openSearchPanel(view);
    }
  }, []);

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
    const exts = [search()];
    if (isJson) exts.push(json());
    else if (isXml || isHtml) exts.push(isHtml ? html() : xml());
    return exts;
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

  const tests = testResults ?? [];
  const logs = scriptLogs ?? [];
  const passedTests = tests.filter(t => t.passed).length;
  const failedTests = tests.filter(t => !t.passed).length;

  const tabs: { id: ResponseTab; label: string; count?: number; color?: string }[] = [
    { id: 'body', label: 'Body' },
    { id: 'headers', label: 'Headers', count: Object.keys(response.headers).length },
    { id: 'cookies', label: 'Cookies', count: response.cookies.length },
    ...(tests.length > 0 ? [{
      id: 'tests' as const,
      label: 'Tests',
      count: tests.length,
      color: failedTests > 0 ? 'text-accent-red' : 'text-accent-green',
    }] : []),
    ...(logs.length > 0 ? [{
      id: 'console' as const,
      label: 'Console',
      count: logs.length,
    }] : []),
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
                effectiveTab === tab.id
                  ? 'text-dark-100 border-b-2 border-accent-blue pb-1'
                  : 'text-dark-300 hover:text-dark-200'
              }`}
            >
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span className={`ml-1 text-[10px] ${tab.color || 'text-dark-400'}`}>({tab.count})</span>
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
        {effectiveTab === 'body' && (
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
                {response.status !== 0 && (
                  <button
                    onClick={handleSearch}
                    className="p-1.5 text-dark-400 hover:text-dark-200 rounded transition-colors cursor-pointer"
                    title="Search response (Ctrl+F)"
                  >
                    <Search size={14} />
                  </button>
                )}
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
            <div className="flex-1 overflow-auto" onKeyDown={response.status !== 0 ? e => {
              if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
                e.preventDefault();
                handleSearch();
              }
            } : undefined}>
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
                  ref={editorRef}
                  value={displayBody}
                  extensions={getExtensions()}
                  theme={theme === 'dark' ? oneDark : 'light'}
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

        {effectiveTab === 'headers' && (
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

        {effectiveTab === 'cookies' && (
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

        {effectiveTab === 'tests' && (
          <div className="overflow-auto p-3">
            {/* Summary bar */}
            <div className="flex items-center gap-4 mb-3 px-2 py-2 bg-dark-800 rounded-lg">
              <span className="text-xs font-medium text-dark-300">
                {tests.length} test{tests.length !== 1 ? 's' : ''}
              </span>
              {passedTests > 0 && (
                <span className="flex items-center gap-1 text-xs text-accent-green">
                  <CircleCheck size={12} /> {passedTests} passed
                </span>
              )}
              {failedTests > 0 && (
                <span className="flex items-center gap-1 text-xs text-accent-red">
                  <CircleX size={12} /> {failedTests} failed
                </span>
              )}
            </div>

            {/* Test list */}
            <div className="flex flex-col gap-1">
              {tests.map((t, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-2 px-3 py-2 rounded-lg border ${
                    t.passed
                      ? 'bg-accent-green/5 border-accent-green/20'
                      : 'bg-accent-red/5 border-accent-red/20'
                  }`}
                >
                  {t.passed ? (
                    <CircleCheck size={14} className="text-accent-green mt-0.5 shrink-0" />
                  ) : (
                    <CircleX size={14} className="text-accent-red mt-0.5 shrink-0" />
                  )}
                  <div className="flex flex-col gap-0.5">
                    <span className={`text-xs font-medium ${t.passed ? 'text-accent-green' : 'text-accent-red'}`}>
                      {t.name}
                    </span>
                    {t.error && (
                      <span className="text-[11px] text-dark-300 font-mono">{t.error}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {effectiveTab === 'console' && (
          <div className="overflow-auto p-3">
            <div className="flex flex-col gap-0.5 font-mono text-xs">
              {logs.map((entry, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-2 px-2 py-1 rounded ${
                    entry.type === 'error' ? 'bg-accent-red/10 text-accent-red' :
                    entry.type === 'warn' ? 'bg-accent-yellow/10 text-accent-yellow' :
                    entry.type === 'info' ? 'text-accent-blue' :
                    'text-dark-200'
                  }`}
                >
                  <Terminal size={12} className="mt-0.5 shrink-0 opacity-50" />
                  <span className="whitespace-pre-wrap break-all">
                    {entry.args.map(a => typeof a === 'string' ? a : JSON.stringify(a, null, 2)).join(' ')}
                  </span>
                </div>
              ))}
            </div>
            {logs.length === 0 && (
              <div className="text-dark-400 text-sm text-center py-8">No console output</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
