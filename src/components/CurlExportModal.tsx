import { useState } from 'react';
import { X, Terminal, Copy, Check } from 'lucide-react';
import { generateCurlCommand } from '../utils/http';
import type { RequestConfig } from '../types';

interface Props {
  open: boolean;
  onClose: () => void;
  request: RequestConfig | null;
}

export function CurlExportModal({ open, onClose, request }: Props) {
  const [copied, setCopied] = useState(false);

  if (!open || !request) return null;

  const curlCommand = generateCurlCommand(request);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(curlCommand);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-dark-800 border border-dark-600 rounded-xl shadow-2xl w-full max-w-lg mx-4">
        <div className="flex items-center justify-between px-4 py-3 border-b border-dark-600">
          <div className="flex items-center gap-2">
            <Terminal size={16} className="text-accent-green" />
            <h3 className="text-sm font-semibold text-dark-100">cURL Export</h3>
          </div>
          <button onClick={onClose} className="p-1 text-dark-400 hover:text-dark-200 rounded cursor-pointer">
            <X size={16} />
          </button>
        </div>
        <div className="p-4">
          <pre className="bg-dark-900 border border-dark-600 rounded-lg p-3 text-sm text-dark-200 font-mono overflow-x-auto whitespace-pre-wrap">
            {curlCommand}
          </pre>
          <div className="flex justify-end gap-2 mt-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-dark-300 hover:text-dark-100 bg-dark-700 rounded-lg cursor-pointer"
            >
              Close
            </button>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-4 py-2 text-sm text-white bg-accent-blue hover:bg-accent-blue/80 rounded-lg cursor-pointer"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
