import { useState } from 'react';
import { X, Server } from 'lucide-react';
import { getProxyUrl, setProxyUrl } from '../utils/http';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ProxySettingsModal({ open, onClose }: Props) {
  const [url, setUrl] = useState(() => getProxyUrl());

  if (!open) return null;

  const handleSave = () => {
    setProxyUrl(url.trim());
    onClose();
  };

  const handleReset = () => {
    setUrl('/api/proxy');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-dark-800 border border-dark-600 rounded-xl shadow-2xl w-full max-w-lg mx-4">
        <div className="flex items-center justify-between px-4 py-3 border-b border-dark-600">
          <div className="flex items-center gap-2">
            <Server size={16} className="text-accent-blue" />
            <h3 className="text-sm font-semibold text-dark-100">Proxy Settings</h3>
          </div>
          <button onClick={onClose} className="p-1 text-dark-400 hover:text-dark-200 rounded cursor-pointer">
            <X size={16} />
          </button>
        </div>

        <div className="p-4">
          <p className="text-xs text-dark-300 mb-3">
            CurlIt routes requests through a proxy server to bypass CORS restrictions.
            You can run the built-in proxy locally or deploy your own.
          </p>

          <label className="block text-xs text-dark-200 mb-1.5 font-medium">Proxy URL</label>
          <input
            type="text"
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="/api/proxy"
            className="w-full px-3 py-2 bg-dark-900 border border-dark-600 rounded-lg text-sm text-dark-100 placeholder-dark-500 focus:border-accent-blue"
          />

          <div className="mt-3 p-3 bg-dark-900/50 border border-dark-700 rounded-lg">
            <p className="text-[11px] text-dark-400 leading-relaxed">
              <span className="text-dark-300 font-medium">Run locally:</span>{' '}
              Clone the repo and run <code className="text-accent-blue">npm run dev:server</code> to start the proxy on port 3001.
            </p>
            <p className="text-[11px] text-dark-400 leading-relaxed mt-1.5">
              <span className="text-dark-300 font-medium">Deploy your own:</span>{' '}
              The proxy is a standalone Express server in <code className="text-accent-blue">server/proxy.js</code> that can be deployed to any Node.js host.
            </p>
          </div>

          <div className="flex justify-between mt-4">
            <button
              onClick={handleReset}
              className="px-3 py-1.5 text-xs text-dark-400 hover:text-dark-200 rounded-md transition-colors cursor-pointer"
            >
              Reset to default
            </button>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="px-3 py-1.5 text-xs text-dark-300 bg-dark-700 hover:bg-dark-600 rounded-md cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="px-3 py-1.5 text-xs text-white bg-accent-blue hover:bg-accent-blue/80 rounded-md cursor-pointer"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
