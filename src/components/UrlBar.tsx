import { Send, Loader2, ShieldCheck, ShieldOff, Plug, Unplug } from 'lucide-react';
import type { HttpMethod, RequestConfig } from '../types';
import { useAppStore } from '../store';
import { getMethodColor } from '../utils/http';
import { executeRequestWithScripts } from '../utils/requestExecutor';
import { isWebSocketUrl, connectWebSocket, disconnectWebSocket } from '../utils/websocket';

const METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

interface Props {
  request: RequestConfig;
}

export function UrlBar({ request }: Props) {
  const updateRequest = useAppStore(s => s.updateRequest);
  const setResponse = useAppStore(s => s.setResponse);
  const setLoading = useAppStore(s => s.setLoading);
  const addToHistory = useAppStore(s => s.addToHistory);
  const getActiveVariables = useAppStore(s => s.getActiveVariables);
  const getChainVariables = useAppStore(s => s.getChainVariables);
  const updateChainVariables = useAppStore(s => s.updateChainVariables);
  const setTestResults = useAppStore(s => s.setTestResults);
  const setScriptLogs = useAppStore(s => s.setScriptLogs);
  const loading = useAppStore(s => s.loadingRequests[request.id]);
  const wsSession = useAppStore(s => s.webSocketSessions[request.id]);

  const isWs = request.protocol === 'websocket';
  const wsStatus = wsSession?.status ?? 'disconnected';

  const handleUrlChange = (url: string) => {
    const updates: Partial<RequestConfig> = { url };
    if (isWebSocketUrl(url) && request.protocol !== 'websocket') {
      updates.protocol = 'websocket';
    } else if (!isWebSocketUrl(url) && request.protocol === 'websocket') {
      // Switching away from WS -- tear down any active connection
      disconnectWebSocket(request.id);
      useAppStore.getState().setWebSocketStatus(request.id, 'disconnected');
      updates.protocol = 'http';
    }
    updateRequest(request.id, updates);
  };

  const handleConnect = () => {
    if (!request.url.trim()) return;
    const variables = getActiveVariables();
    const chainVars = getChainVariables();
    connectWebSocket(request, variables, chainVars);
  };

  const handleDisconnect = () => {
    disconnectWebSocket(request.id);
    useAppStore.getState().setWebSocketStatus(request.id, 'disconnected');
  };

  const handleSend = async () => {
    if (!request.url.trim() || loading) return;

    setLoading(request.id, true);
    setResponse(request.id, null);
    setTestResults(request.id, []);
    setScriptLogs(request.id, []);

    try {
      const result = await executeRequestWithScripts(request, {
        variables: getActiveVariables(),
        chainVars: getChainVariables(),
      });

      setResponse(request.id, result.response);
      setScriptLogs(request.id, result.logs);
      setTestResults(request.id, result.testResults);
      if (Object.keys(result.chainVarUpdates).length > 0) {
        updateChainVariables(result.chainVarUpdates);
      }
      // Only record a real network round-trip in history (skip script / network errors).
      if (result.error === null) {
        addToHistory(request, result.response);
      }
    } finally {
      setLoading(request.id, false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (isWs) {
        if (wsStatus === 'disconnected' || wsStatus === 'error') handleConnect();
      } else {
        handleSend();
      }
    }
  };

  return (
    <div className="flex items-center gap-2 p-3 bg-dark-800 border-b border-dark-600">
      {/* Method Selector / WS badge */}
      {isWs ? (
        <span className={`${getMethodColor('WS')} bg-dark-700 border border-dark-500 rounded-lg px-3 py-2.5 text-sm font-bold`}>
          WS
        </span>
      ) : (
        <select
          value={request.method}
          onChange={e => updateRequest(request.id, { method: e.target.value as HttpMethod })}
          className={`bg-dark-700 border border-dark-500 rounded-lg px-3 py-2.5 text-sm font-bold cursor-pointer ${getMethodColor(request.method)}`}
        >
          {METHODS.map(m => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      )}

      {/* URL Input */}
      <div className="flex-1 relative flex items-center">
        <input
          type="text"
          value={request.url}
          onChange={e => handleUrlChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isWs ? 'Enter WebSocket URL (ws:// or wss://)...' : 'Enter URL or paste cURL command...'}
          className="w-full bg-dark-700 border border-dark-500 rounded-lg px-4 py-2.5 text-sm text-dark-100 placeholder:text-dark-400 font-mono"
        />
        {/* Connection status indicator for WS */}
        {isWs && wsStatus !== 'disconnected' && (
          <span className="absolute right-3 flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${
              wsStatus === 'connected' ? 'bg-accent-green' :
              wsStatus === 'connecting' ? 'bg-accent-yellow animate-pulse' :
              'bg-accent-red'
            }`} />
            <span className={`text-[10px] font-medium ${
              wsStatus === 'connected' ? 'text-accent-green' :
              wsStatus === 'connecting' ? 'text-accent-yellow' :
              'text-accent-red'
            }`}>
              {wsStatus === 'connected' ? 'Connected' :
               wsStatus === 'connecting' ? 'Connecting...' :
               'Error'}
            </span>
          </span>
        )}
      </div>

      {/* SSL Verification Toggle */}
      <button
        onClick={() => updateRequest(request.id, { sslVerification: request.sslVerification === false ? true : false })}
        title={request.sslVerification === false ? 'SSL verification disabled — click to enable' : 'SSL verification enabled — click to disable'}
        className={`p-2.5 rounded-lg border transition-colors cursor-pointer ${
          request.sslVerification === false
            ? 'bg-yellow-900/30 border-yellow-600/50 text-yellow-400 hover:bg-yellow-900/50'
            : 'bg-dark-700 border-dark-500 text-dark-400 hover:text-dark-200'
        }`}
      >
        {request.sslVerification === false ? <ShieldOff size={16} /> : <ShieldCheck size={16} />}
      </button>

      {/* Send / Connect / Disconnect Button */}
      {isWs ? (
        wsStatus === 'connected' ? (
          <button
            onClick={handleDisconnect}
            className="flex items-center gap-2 bg-accent-red hover:bg-accent-red/80 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors cursor-pointer"
          >
            <Unplug size={16} />
            Disconnect
          </button>
        ) : (
          <button
            onClick={handleConnect}
            disabled={wsStatus === 'connecting' || !request.url.trim()}
            className="flex items-center gap-2 bg-accent-green hover:bg-accent-green/80 disabled:opacity-50 disabled:cursor-not-allowed text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors cursor-pointer"
          >
            {wsStatus === 'connecting' ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Plug size={16} />
            )}
            {wsStatus === 'connecting' ? 'Connecting...' : 'Connect'}
          </button>
        )
      ) : (
        <button
          onClick={handleSend}
          disabled={loading || !request.url.trim()}
          className="flex items-center gap-2 bg-accent-blue hover:bg-accent-blue/80 disabled:opacity-50 disabled:cursor-not-allowed text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors cursor-pointer"
        >
          {loading ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Send size={16} />
          )}
          Send
        </button>
      )}
    </div>
  );
}
