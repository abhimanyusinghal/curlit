import { useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { json } from '@codemirror/lang-json';
import { oneDark } from '@codemirror/theme-one-dark';
import { Send } from 'lucide-react';
import { useAppStore } from '../store';
import type { Theme } from '../store';
import { sendWebSocketMessage } from '../utils/websocket';

type MessageFormat = 'text' | 'json';

interface Props {
  requestId: string;
}

export function WebSocketMessageComposer({ requestId }: Props) {
  const [message, setMessage] = useState('');
  const [format, setFormat] = useState<MessageFormat>('text');
  const theme = useAppStore(s => s.theme) as Theme;
  const wsSession = useAppStore(s => s.webSocketSessions[requestId]);
  const isConnected = wsSession?.status === 'connected';

  const handleSend = () => {
    const trimmed = message.trim();
    if (!trimmed || !isConnected) return;
    sendWebSocketMessage(requestId, trimmed);
    setMessage('');
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Format selector */}
      <div className="flex items-center gap-1">
        {(['text', 'json'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFormat(f)}
            className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors cursor-pointer ${
              format === f
                ? 'bg-accent-blue text-white'
                : 'bg-dark-700 text-dark-300 hover:text-dark-100'
            }`}
          >
            {f === 'text' ? 'Text' : 'JSON'}
          </button>
        ))}
      </div>

      {/* Message editor */}
      <div
        className="border border-dark-600 rounded-lg overflow-hidden h-[200px]"
        onKeyDown={(e) => {
          if (e.ctrlKey && e.key === 'Enter') {
            e.preventDefault();
            handleSend();
          }
        }}
      >
        <CodeMirror
          value={message}
          onChange={setMessage}
          extensions={format === 'json' ? [json()] : []}
          theme={theme === 'dark' ? oneDark : 'light'}
          height="200px"
          placeholder={format === 'json' ? '{\n  "type": "hello",\n  "data": "world"\n}' : 'Type a message to send...'}
          basicSetup={{
            lineNumbers: true,
            foldGutter: true,
            bracketMatching: true,
            closeBrackets: true,
          }}
        />
      </div>

      {/* Send button */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-dark-400">Ctrl+Enter to send</span>
        <button
          onClick={handleSend}
          disabled={!isConnected || !message.trim()}
          className="flex items-center gap-2 bg-accent-blue hover:bg-accent-blue/80 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
        >
          <Send size={14} />
          Send Message
        </button>
      </div>

      {!isConnected && (
        <div className="text-dark-400 text-xs text-center py-2">
          Connect to a WebSocket server to send messages
        </div>
      )}
    </div>
  );
}
