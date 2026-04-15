import { useState, useEffect, useRef } from 'react';
import { ArrowUp, ArrowDown, Trash2, Search, Clock } from 'lucide-react';
import { useAppStore } from '../store';
import { formatBytes } from '../utils/http';
import type { WebSocketMessage } from '../types';

interface Props {
  requestId: string;
}

type FilterMode = 'all' | 'sent' | 'received';

export function WebSocketMessageLog({ requestId }: Props) {
  const wsSession = useAppStore(s => s.webSocketSessions[requestId]);
  const clearMessages = useAppStore(s => s.clearWebSocketMessages);
  const [filter, setFilter] = useState<FilterMode>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const messages = wsSession?.messages ?? [];
  const status = wsSession?.status ?? 'disconnected';
  const connectedAt = wsSession?.connectedAt;
  const error = wsSession?.error;

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const filteredMessages = messages.filter(msg => {
    if (filter !== 'all' && msg.direction !== filter) return false;
    if (searchQuery && !msg.data.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const sentCount = messages.filter(m => m.direction === 'sent').length;
  const receivedCount = messages.filter(m => m.direction === 'received').length;

  return (
    <div className="flex flex-col h-full">
      {/* Status bar */}
      <div className="flex items-center justify-between px-3 py-2 bg-dark-800/50 border-b border-dark-600">
        <div className="flex items-center gap-3">
          {/* Filter buttons */}
          {(['all', 'sent', 'received'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => setFilter(mode)}
              className={`text-xs font-medium transition-colors cursor-pointer ${
                filter === mode
                  ? 'text-dark-100 border-b-2 border-accent-blue pb-0.5'
                  : 'text-dark-300 hover:text-dark-200'
              }`}
            >
              {mode === 'all' ? `All (${messages.length})` :
               mode === 'sent' ? `Sent (${sentCount})` :
               `Received (${receivedCount})`}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 text-xs">
          {/* Connection info */}
          <span className={`flex items-center gap-1.5 font-medium ${
            status === 'connected' ? 'text-accent-green' :
            status === 'error' ? 'text-accent-red' :
            'text-dark-400'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${
              status === 'connected' ? 'bg-accent-green' :
              status === 'error' ? 'bg-accent-red' :
              'bg-dark-400'
            }`} />
            {status === 'connected' ? 'Connected' :
             status === 'connecting' ? 'Connecting...' :
             status === 'error' ? 'Error' :
             'Disconnected'}
          </span>
          {connectedAt && status === 'connected' && (
            <ConnectionTimer connectedAt={connectedAt} />
          )}
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-dark-700">
        <div className="flex-1 relative">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-dark-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Filter messages..."
            className="w-full bg-dark-700 border border-dark-600 rounded px-2 py-1 pl-7 text-xs text-dark-100 placeholder:text-dark-400"
          />
        </div>
        <button
          onClick={() => clearMessages(requestId)}
          disabled={messages.length === 0}
          className="p-1.5 text-dark-400 hover:text-accent-red disabled:opacity-30 disabled:cursor-not-allowed rounded transition-colors cursor-pointer"
          title="Clear messages"
        >
          <Trash2 size={13} />
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="px-3 py-2 bg-accent-red/10 border-b border-accent-red/30">
          <p className="text-xs text-accent-red">{error}</p>
        </div>
      )}

      {/* Messages list */}
      <div className="flex-1 overflow-auto">
        {filteredMessages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-dark-400">
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="text-3xl opacity-30">{ status === 'disconnected' ? '~' : '...' }</div>
              <p className="text-xs">
                {status === 'disconnected'
                  ? 'Connect to a WebSocket server to see messages here'
                  : messages.length === 0
                    ? 'Waiting for messages...'
                    : 'No messages match filter'}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col">
            {filteredMessages.map(msg => (
              <MessageRow key={msg.id} message={msg} />
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>
    </div>
  );
}

function MessageRow({ message }: { message: WebSocketMessage }) {
  const [expanded, setExpanded] = useState(false);
  const isSent = message.direction === 'sent';
  const isJson = (() => { try { JSON.parse(message.data); return true; } catch { return false; } })();
  const displayData = expanded && isJson
    ? JSON.stringify(JSON.parse(message.data), null, 2)
    : message.data;
  const isLong = message.data.length > 200;

  return (
    <div
      className={`flex gap-2 px-3 py-2 border-b border-dark-700/50 hover:bg-dark-800/30 ${
        isSent ? 'bg-accent-blue/3' : 'bg-accent-green/3'
      }`}
    >
      {/* Direction icon */}
      <div className="flex-shrink-0 mt-0.5">
        {isSent ? (
          <ArrowUp size={13} className="text-accent-orange" />
        ) : (
          <ArrowDown size={13} className="text-accent-green" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {message.isBinary && (
          <span className="inline-block px-1.5 py-0.5 text-[9px] bg-accent-purple/15 text-accent-purple rounded font-medium mb-1">
            BINARY
          </span>
        )}
        <pre
          className={`text-xs font-mono text-dark-200 whitespace-pre-wrap break-all ${
            !expanded && isLong ? 'line-clamp-3' : ''
          }`}
          onClick={() => isLong || isJson ? setExpanded(!expanded) : undefined}
          style={isLong || isJson ? { cursor: 'pointer' } : undefined}
        >
          {displayData}
        </pre>
        {(isLong || isJson) && !expanded && (
          <button
            onClick={() => setExpanded(true)}
            className="text-[10px] text-accent-blue hover:underline mt-0.5 cursor-pointer"
          >
            {isJson ? 'Expand JSON' : 'Show more'}
          </button>
        )}
      </div>

      {/* Meta */}
      <div className="flex flex-col items-end gap-0.5 flex-shrink-0 text-[10px] text-dark-400">
        <span>{formatTimestamp(message.timestamp)}</span>
        <span>{formatBytes(message.size)}</span>
      </div>
    </div>
  );
}

function ConnectionTimer({ connectedAt }: { connectedAt: number }) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const elapsed = Math.floor((Date.now() - connectedAt) / 1000);
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  const display = mins > 0
    ? `${mins}m ${secs.toString().padStart(2, '0')}s`
    : `${secs}s`;

  return (
    <span className="flex items-center gap-1 text-dark-400">
      <Clock size={10} />
      {display}
    </span>
  );
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}.${d.getMilliseconds().toString().padStart(3, '0')}`;
}
