import { Send, Loader2, ShieldCheck, ShieldOff, Plug, Unplug } from 'lucide-react';
import type { HttpMethod, RequestConfig } from '../types';
import { useAppStore } from '../store';
import { sendRequest, resolveRequestVariables, buildHeaders, buildBody } from '../utils/http';
import { getMethodColor } from '../utils/http';
import { runPreRequestScript, runTestScript } from '../utils/scriptEngine';
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
      const variables = getActiveVariables();
      const chainVars = getChainVariables();
      let resolved = resolveRequestVariables(request, variables, chainVars);
      let allLogs: import('../types').ScriptConsoleEntry[] = [];

      // --- Pre-request script ---
      if (request.preRequestScript?.trim()) {
        const headers = buildHeaders(resolved.headers, resolved.auth);
        const body = buildBody(resolved);
        const bodyStr = body === null ? null : typeof body === 'string' ? body : null;

        const preResult = runPreRequestScript(
          request.preRequestScript,
          resolved,
          headers,
          bodyStr,
          variables,
          chainVars,
        );
        allLogs = [...allLogs, ...preResult.logs];

        if (preResult.error) {
          setScriptLogs(request.id, allLogs);
          setResponse(request.id, {
            status: 0,
            statusText: 'Script Error',
            headers: {},
            body: `Pre-request script error: ${preResult.error}`,
            size: 0,
            time: 0,
            cookies: [],
          });
          setLoading(request.id, false);
          return;
        }

        // Apply mutations from pre-request script.
        // The script received fully-built headers (auth already baked in),
        // so we neutralize header-based auth to prevent sendRequest from
        // re-applying auth headers on top of whatever the script set.
        // We preserve query-style API-key auth because sendRequest appends
        // those to the URL — they aren't in the headers the script saw.
        updateChainVariables(preResult.chain);
        const isQueryApiKey = resolved.auth.type === 'api-key'
          && resolved.auth.apiKey?.addTo === 'query';
        resolved = {
          ...resolved,
          method: (preResult.request.method as RequestConfig['method']) || resolved.method,
          url: preResult.request.url || resolved.url,
          headers: Object.entries(preResult.request.headers).map(([key, value]) => ({
            id: crypto.randomUUID(),
            key,
            value,
            enabled: true,
          })),
          auth: isQueryApiKey ? resolved.auth : { type: 'none' },
        };

        // If the script changed the body, override with the raw string.
        // Switch to body type 'text' so buildBody() reads .raw instead of
        // rebuilding from structured fields (graphql, form-data, etc.).
        // Also ensure Content-Type is preserved: the auto-header logic in
        // sendRequest only fires for specific body types, so we inject the
        // correct content-type into the resolved headers if the script
        // didn't already set one.
        if (preResult.request.body !== null && preResult.request.body !== bodyStr) {
          const originalType = resolved.body.type;
          resolved = {
            ...resolved,
            body: { ...resolved.body, type: 'text', raw: preResult.request.body },
          };

          // If the script's headers don't include Content-Type, carry over
          // what sendRequest would have auto-set for the original body type.
          const hasContentType = resolved.headers.some(
            h => h.enabled && h.key.toLowerCase() === 'content-type',
          );
          if (!hasContentType) {
            const autoType: Record<string, string> = {
              json: 'application/json',
              graphql: 'application/json',
              xml: 'application/xml',
              'x-www-form-urlencoded': 'application/x-www-form-urlencoded',
            };
            const ct = autoType[originalType];
            if (ct) {
              resolved = {
                ...resolved,
                headers: [
                  ...resolved.headers,
                  { id: crypto.randomUUID(), key: 'Content-Type', value: ct, enabled: true },
                ],
              };
            }
          }
        }
      }

      const response = await sendRequest(resolved);
      setResponse(request.id, response);
      addToHistory(request, response);

      // --- Post-response test script ---
      if (request.testScript?.trim() && response.status !== 0) {
        const latestChain = useAppStore.getState().chainVariables;
        const testResult = runTestScript(request.testScript, resolved, response, latestChain);
        allLogs = [...allLogs, ...testResult.logs];
        setTestResults(request.id, testResult.tests);
        updateChainVariables(testResult.chain);

        if (testResult.error) {
          allLogs.push({
            type: 'error',
            args: [`Test script error: ${testResult.error}`],
            timestamp: Date.now(),
          });
        }
      }

      setScriptLogs(request.id, allLogs);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to send request';
      const isProxyDown = message === 'Failed to fetch' || message.includes('NetworkError');
      setResponse(request.id, {
        status: 0,
        statusText: 'Error',
        headers: {},
        body: isProxyDown
          ? 'Could not reach the proxy server. Make sure it is running (npm run dev:server on port 3001).'
          : message,
        size: 0,
        time: 0,
        cookies: [],
      });
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
