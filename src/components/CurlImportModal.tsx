import { useState } from 'react';
import { X, Terminal } from 'lucide-react';
import { parseCurlCommand } from '../utils/http';
import { useAppStore } from '../store';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function CurlImportModal({ open, onClose }: Props) {
  const [curlText, setCurlText] = useState('');
  const addTab = useAppStore(s => s.addTab);

  if (!open) return null;

  const handleImport = () => {
    if (!curlText.trim()) return;
    const parsed = parseCurlCommand(curlText);
    addTab({
      ...parsed,
      name: parsed.url ? new URL(parsed.url.startsWith('http') ? parsed.url : `https://${parsed.url}`).pathname : 'Imported Request',
    });
    setCurlText('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-dark-800 border border-dark-600 rounded-xl shadow-2xl w-full max-w-lg mx-4">
        <div className="flex items-center justify-between px-4 py-3 border-b border-dark-600">
          <div className="flex items-center gap-2">
            <Terminal size={16} className="text-accent-blue" />
            <h3 className="text-sm font-semibold text-dark-100">Import cURL</h3>
          </div>
          <button onClick={onClose} className="p-1 text-dark-400 hover:text-dark-200 rounded cursor-pointer">
            <X size={16} />
          </button>
        </div>
        <div className="p-4">
          <textarea
            value={curlText}
            onChange={e => setCurlText(e.target.value)}
            placeholder={`Paste your cURL command here...\n\ne.g. curl -X POST 'https://api.example.com/data' \\\n  -H 'Content-Type: application/json' \\\n  -d '{"key": "value"}'`}
            className="w-full h-40 bg-dark-700 border border-dark-600 rounded-lg p-3 text-sm text-dark-200 font-mono placeholder:text-dark-500 resize-none"
            autoFocus
          />
          <div className="flex justify-end gap-2 mt-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-dark-300 hover:text-dark-100 bg-dark-700 rounded-lg cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleImport}
              disabled={!curlText.trim()}
              className="px-4 py-2 text-sm text-white bg-accent-blue hover:bg-accent-blue/80 disabled:opacity-50 rounded-lg cursor-pointer"
            >
              Import
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
