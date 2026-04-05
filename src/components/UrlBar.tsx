import { Send, Loader2 } from 'lucide-react';
import type { HttpMethod, RequestConfig } from '../types';
import { useAppStore } from '../store';
import { sendRequest, resolveRequestVariables } from '../utils/http';
import { getMethodColor } from '../utils/http';

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
  const loading = useAppStore(s => s.loadingRequests[request.id]);

  const handleSend = async () => {
    if (!request.url.trim() || loading) return;

    setLoading(request.id, true);
    setResponse(request.id, null);

    try {
      const variables = getActiveVariables();
      const resolved = resolveRequestVariables(request, variables);
      const response = await sendRequest(resolved);
      setResponse(request.id, response);
      addToHistory(request, response);
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
      handleSend();
    }
  };

  return (
    <div className="flex items-center gap-2 p-3 bg-dark-800 border-b border-dark-600">
      {/* Method Selector */}
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

      {/* URL Input */}
      <input
        type="text"
        value={request.url}
        onChange={e => updateRequest(request.id, { url: e.target.value })}
        onKeyDown={handleKeyDown}
        placeholder="Enter URL or paste cURL command..."
        className="flex-1 bg-dark-700 border border-dark-500 rounded-lg px-4 py-2.5 text-sm text-dark-100 placeholder:text-dark-400 font-mono"
      />

      {/* Send Button */}
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
    </div>
  );
}
