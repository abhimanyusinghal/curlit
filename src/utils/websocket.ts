import { useAppStore } from '../store';
import { buildHeaders, buildUrl, resolveRequestVariables } from './http';
import type { RequestConfig, WebSocketMessage } from '../types';

const activeConnections = new Map<string, WebSocket>();

function buildProxyUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/api/ws-proxy`;
}

export function isWebSocketUrl(url: string): boolean {
  const trimmed = url.trim().toLowerCase();
  return trimmed.startsWith('ws://') || trimmed.startsWith('wss://');
}

export function connectWebSocket(request: RequestConfig, envVars: Record<string, string>, chainVars: Record<string, string>): void {
  const { id: requestId } = request;
  const store = useAppStore.getState();

  // Close existing connection if any
  disconnectWebSocket(requestId);

  store.setWebSocketStatus(requestId, 'connecting');

  const resolved = resolveRequestVariables(request, envVars, chainVars);
  const headers = buildHeaders(resolved.headers, resolved.auth);

  // Build URL with query params (same as HTTP path)
  let targetUrl = buildUrl(resolved.url, resolved.params);

  // Append API key as query param if configured
  if (resolved.auth.type === 'api-key' && resolved.auth.apiKey?.addTo === 'query') {
    const urlObj = new URL(targetUrl.startsWith('ws') ? targetUrl : `wss://${targetUrl}`);
    urlObj.searchParams.append(resolved.auth.apiKey.key, resolved.auth.apiKey.value);
    targetUrl = urlObj.toString();
  }

  const proxyUrl = buildProxyUrl();
  let ws: WebSocket;
  try {
    ws = new WebSocket(proxyUrl);
  } catch (err) {
    store.setWebSocketStatus(requestId, 'error', err instanceof Error ? err.message : 'Failed to create WebSocket');
    return;
  }

  activeConnections.set(requestId, ws);

  ws.onopen = () => {
    // Send connect control frame to proxy
    ws.send(JSON.stringify({
      type: 'connect',
      url: targetUrl,
      headers,
      sslVerification: request.sslVerification !== false,
    }));
  };

  ws.onmessage = (event) => {
    let msg: { type: string; data?: string; message?: string; code?: number; reason?: string; isBinary?: boolean; size?: number };
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }

    const store = useAppStore.getState();

    switch (msg.type) {
      case 'connected':
        store.setWebSocketStatus(requestId, 'connected');
        break;

      case 'message': {
        const isBinary = msg.isBinary === true;
        const displayData = isBinary
          ? `[Binary frame, ${msg.size ?? 0} bytes]\n${msg.data ?? ''}`
          : (msg.data ?? '');
        const wsMsg: WebSocketMessage = {
          id: crypto.randomUUID(),
          direction: 'received',
          data: displayData,
          timestamp: Date.now(),
          size: isBinary ? (msg.size ?? 0) : new Blob([msg.data ?? '']).size,
          isBinary,
        };
        store.addWebSocketMessage(requestId, wsMsg);
        break;
      }

      case 'error':
        store.setWebSocketStatus(requestId, 'error', msg.message ?? 'Unknown error');
        activeConnections.delete(requestId);
        ws.close();
        break;

      case 'closed':
        store.setWebSocketStatus(requestId, 'disconnected');
        activeConnections.delete(requestId);
        ws.close();
        break;
    }
  };

  ws.onerror = () => {
    const store = useAppStore.getState();
    store.setWebSocketStatus(requestId, 'error', 'Connection failed. Is the proxy server running?');
    activeConnections.delete(requestId);
  };

  ws.onclose = () => {
    const store = useAppStore.getState();
    const session = store.webSocketSessions[requestId];
    // Only set disconnected if not already in error state
    if (session?.status !== 'error' && session?.status !== 'disconnected') {
      store.setWebSocketStatus(requestId, 'disconnected');
    }
    activeConnections.delete(requestId);
  };
}

export function sendWebSocketMessage(requestId: string, data: string): void {
  const ws = activeConnections.get(requestId);
  if (!ws || ws.readyState !== WebSocket.OPEN) return;

  ws.send(JSON.stringify({ type: 'message', data }));

  const msg: WebSocketMessage = {
    id: crypto.randomUUID(),
    direction: 'sent',
    data,
    timestamp: Date.now(),
    size: new Blob([data]).size,
  };
  useAppStore.getState().addWebSocketMessage(requestId, msg);
}

export function disconnectWebSocket(requestId: string): void {
  const ws = activeConnections.get(requestId);
  if (ws) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'close' }));
    }
    ws.close();
    activeConnections.delete(requestId);
  }
}

export function isWebSocketConnected(requestId: string): boolean {
  const ws = activeConnections.get(requestId);
  return !!ws && ws.readyState === WebSocket.OPEN;
}
