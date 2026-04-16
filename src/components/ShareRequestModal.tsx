import { useMemo, useState } from 'react';
import { X, Share2, Copy, Check, AlertTriangle } from 'lucide-react';
import type { RequestConfig } from '../types';
import { buildShareUrl, encodeRequest } from '../utils/share';

interface Props {
  open: boolean;
  onClose: () => void;
  request: RequestConfig | null;
}

const LONG_URL_THRESHOLD = 2000;

export function ShareRequestModal({ open, onClose, request }: Props) {
  const [includeSecrets, setIncludeSecrets] = useState(false);
  const [copied, setCopied] = useState(false);

  const shareUrl = useMemo(() => {
    if (!request) return '';
    const encoded = encodeRequest(request, { includeSecrets });
    return buildShareUrl(window.location.origin, encoded);
  }, [request, includeSecrets]);

  if (!open || !request) return null;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClose = () => {
    setIncludeSecrets(false);
    setCopied(false);
    onClose();
  };

  const urlSize = shareUrl.length;
  const isLong = urlSize > LONG_URL_THRESHOLD;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-dark-800 border border-dark-600 rounded-xl shadow-2xl w-full max-w-lg mx-4">
        <div className="flex items-center justify-between px-4 py-3 border-b border-dark-600">
          <div className="flex items-center gap-2">
            <Share2 size={16} className="text-accent-blue" />
            <h3 className="text-sm font-semibold text-dark-100">Share Request</h3>
          </div>
          <button
            onClick={handleClose}
            className="p-1 text-dark-400 hover:text-dark-200 rounded cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-4">
          <p className="text-xs text-dark-300 mb-3">
            Anyone with this link can open the request in their CurlIt tab.
          </p>

          <label className="flex items-start gap-2 p-3 bg-dark-900 border border-dark-600 rounded-lg cursor-pointer">
            <input
              type="checkbox"
              checked={includeSecrets}
              onChange={e => setIncludeSecrets(e.target.checked)}
              className="mt-0.5 cursor-pointer accent-accent-blue"
            />
            <div>
              <div className="text-xs font-medium text-dark-100">Include secrets</div>
              <div className="text-[11px] text-dark-400 mt-0.5">
                Auth credentials and pre-request / test scripts. Off by default.
              </div>
            </div>
          </label>

          {includeSecrets && (
            <div className="mt-2 flex items-start gap-2 px-3 py-2 bg-accent-red/10 border border-accent-red/30 rounded text-xs text-accent-red">
              <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
              <span>
                This link contains credentials and executable scripts. Share only with people
                you trust, and don't paste it where it could be logged (chat, email, screenshots).
              </span>
            </div>
          )}

          <div className="mt-3">
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] text-dark-400 uppercase tracking-wider">Link</label>
              <span className={`text-[11px] ${isLong ? 'text-accent-red' : 'text-dark-500'}`}>
                {urlSize.toLocaleString()} chars
              </span>
            </div>
            <textarea
              readOnly
              value={shareUrl}
              onClick={e => (e.currentTarget as HTMLTextAreaElement).select()}
              className="w-full h-24 bg-dark-700 border border-dark-600 rounded-lg p-3 text-[11px] text-dark-200 font-mono resize-none break-all"
            />
            {isLong && (
              <div className="mt-1 text-[11px] text-accent-red">
                This link is very long and may be truncated by some chat apps. Consider sharing
                a backup file instead for large requests.
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 mt-4">
            <button
              onClick={handleClose}
              className="px-4 py-2 text-sm text-dark-300 hover:text-dark-100 bg-dark-700 rounded-lg cursor-pointer"
            >
              Close
            </button>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-4 py-2 text-sm text-white bg-accent-blue hover:bg-accent-blue/80 rounded-lg cursor-pointer"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? 'Copied!' : 'Copy Link'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
