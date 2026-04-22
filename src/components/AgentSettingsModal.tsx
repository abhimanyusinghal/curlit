import { useEffect, useState } from 'react';
import { X, Cpu, CheckCircle2, XCircle, RefreshCw, Download } from 'lucide-react';
import {
  getProxyMode,
  setProxyMode,
  localProxyHealthUrl,
  type ProxyMode,
} from '../utils/proxyConfig';

interface Props {
  open: boolean;
  onClose: () => void;
}

type HealthState =
  | { status: 'unknown' }
  | { status: 'checking' }
  | { status: 'connected'; version: string }
  | { status: 'disconnected' };

const AGENT_RELEASES_BASE = 'https://github.com/abhimanyusinghal/curlit/releases/latest/download';

const DOWNLOADS = [
  { os: 'Windows', file: 'curlit-agent-win-x64.exe', hint: 'Double-click to run. SmartScreen may warn — click "More info" → "Run anyway".' },
  { os: 'macOS', file: 'curlit-agent-macos-x64', hint: 'Run `chmod +x curlit-agent-macos-x64 && ./curlit-agent-macos-x64` in Terminal. Gatekeeper may warn — right-click → Open the first time.' },
  { os: 'Linux', file: 'curlit-agent-linux-x64', hint: 'Run `chmod +x curlit-agent-linux-x64 && ./curlit-agent-linux-x64`.' },
];

export function AgentSettingsModal({ open, onClose }: Props) {
  const [mode, setMode] = useState<ProxyMode>(() => getProxyMode());
  const [health, setHealth] = useState<HealthState>({ status: 'unknown' });

  const checkHealth = async () => {
    setHealth({ status: 'checking' });
    try {
      const res = await fetch(localProxyHealthUrl(), { signal: AbortSignal.timeout(3000) });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      setHealth({ status: 'connected', version: data.version ?? 'unknown' });
    } catch {
      setHealth({ status: 'disconnected' });
    }
  };

  useEffect(() => {
    if (!open) return;
    checkHealth();
    const id = window.setInterval(checkHealth, 5000);
    return () => window.clearInterval(id);
  }, [open]);

  if (!open) return null;

  const handleModeChange = (next: ProxyMode) => {
    setMode(next);
    setProxyMode(next);
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-dark-800 border border-dark-600 rounded-lg shadow-xl w-full max-w-xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-dark-600">
          <div className="flex items-center gap-2">
            <Cpu size={16} className="text-accent-orange" />
            <h2 className="text-sm font-semibold text-dark-100">Local Agent</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-dark-400 hover:text-dark-100 rounded cursor-pointer"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-5 overflow-y-auto">
          <section className="space-y-2">
            <h3 className="text-xs font-semibold text-dark-200 uppercase tracking-wide">Why an agent?</h3>
            <p className="text-xs text-dark-300 leading-relaxed">
              When you run CurlIt from the cloud, its proxy runs in Azure and cannot reach{' '}
              <code className="text-accent-orange">localhost</code>, intranet hosts, or servers behind your VPN.
              Install the agent on your machine to route those requests locally.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-semibold text-dark-200 uppercase tracking-wide">Proxy mode</h3>
            <div className="grid grid-cols-2 gap-2">
              <label
                className={`flex flex-col gap-1 p-3 border rounded-md cursor-pointer transition-colors ${
                  mode === 'cloud' ? 'border-accent-orange bg-accent-orange/5' : 'border-dark-600 hover:border-dark-500'
                }`}
              >
                <input
                  type="radio"
                  name="proxy-mode"
                  value="cloud"
                  checked={mode === 'cloud'}
                  onChange={() => handleModeChange('cloud')}
                  className="sr-only"
                />
                <span className="text-xs font-semibold text-dark-100">Cloud</span>
                <span className="text-[11px] text-dark-400">Route through the Azure backend. Works for any public URL.</span>
              </label>
              <label
                className={`flex flex-col gap-1 p-3 border rounded-md cursor-pointer transition-colors ${
                  mode === 'local' ? 'border-accent-orange bg-accent-orange/5' : 'border-dark-600 hover:border-dark-500'
                }`}
              >
                <input
                  type="radio"
                  name="proxy-mode"
                  value="local"
                  checked={mode === 'local'}
                  onChange={() => handleModeChange('local')}
                  className="sr-only"
                />
                <span className="text-xs font-semibold text-dark-100">Local agent</span>
                <span className="text-[11px] text-dark-400">Route through the agent on your machine. Required for localhost / intranet.</span>
              </label>
            </div>
          </section>

          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-dark-200 uppercase tracking-wide">Agent status</h3>
              <button
                onClick={checkHealth}
                className="flex items-center gap-1 text-[11px] text-dark-300 hover:text-dark-100 cursor-pointer"
                title="Recheck"
              >
                <RefreshCw size={11} className={health.status === 'checking' ? 'animate-spin' : ''} />
                Recheck
              </button>
            </div>
            <div className="flex items-center gap-2 p-2.5 bg-dark-900 border border-dark-600 rounded-md">
              {health.status === 'connected' ? (
                <>
                  <CheckCircle2 size={14} className="text-accent-green flex-shrink-0" />
                  <span className="text-xs text-dark-100">Connected</span>
                  <span className="text-[11px] text-dark-400 ml-auto">v{health.version}</span>
                </>
              ) : health.status === 'checking' ? (
                <>
                  <RefreshCw size={14} className="text-dark-400 animate-spin flex-shrink-0" />
                  <span className="text-xs text-dark-300">Checking…</span>
                </>
              ) : (
                <>
                  <XCircle size={14} className="text-dark-400 flex-shrink-0" />
                  <span className="text-xs text-dark-300">Not running on localhost:3001</span>
                </>
              )}
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-semibold text-dark-200 uppercase tracking-wide">Download</h3>
            <div className="space-y-2">
              {DOWNLOADS.map(d => (
                <a
                  key={d.os}
                  href={`${AGENT_RELEASES_BASE}/${d.file}`}
                  className="flex items-start gap-3 p-3 bg-dark-900 border border-dark-600 hover:border-accent-orange rounded-md transition-colors group"
                >
                  <Download size={14} className="text-accent-orange mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-dark-100">{d.os}</span>
                      <span className="text-[11px] text-dark-500 truncate">{d.file}</span>
                    </div>
                    <p className="text-[11px] text-dark-400 mt-0.5 leading-relaxed">{d.hint}</p>
                  </div>
                </a>
              ))}
            </div>
            <p className="text-[11px] text-dark-500 leading-relaxed mt-2">
              Releases are at{' '}
              <a
                href="https://github.com/abhimanyusinghal/curlit/releases"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent-orange hover:underline"
              >
                github.com/abhimanyusinghal/curlit/releases
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
