import { useCallback, useEffect, useRef, useState } from 'react';
import {
  X,
  Cloud,
  CloudUpload,
  CloudDownload,
  LogOut,
  AlertTriangle,
  ExternalLink,
  Check,
  Loader2,
} from 'lucide-react';
import { useAppStore } from '../store';
import {
  fetchSyncStatus,
  getAuthenticatedUser,
  pollDeviceToken,
  requestDeviceCode,
  type DeviceCode,
} from '../utils/github';
import {
  applySyncPayload,
  ensureGist,
  pullFromCloud,
  pushToCloud,
  type SyncPayload,
} from '../utils/sync';
import type { ImportMode } from '../utils/backup';

interface Props {
  open: boolean;
  onClose: () => void;
}

type Phase =
  | { kind: 'loading' }
  | { kind: 'unconfigured' }
  | { kind: 'signed-out' }
  | { kind: 'device-code'; code: DeviceCode }
  | { kind: 'signed-in'; login: string | null }
  | { kind: 'pull-preview'; payload: SyncPayload };

export function SyncModal({ open, onClose }: Props) {
  const syncToken = useAppStore(s => s.syncToken);
  const syncGistId = useAppStore(s => s.syncGistId);
  const syncLastSyncedAt = useAppStore(s => s.syncLastSyncedAt);
  const collections = useAppStore(s => s.collections);
  const environments = useAppStore(s => s.environments);

  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [busy, setBusy] = useState<null | 'push' | 'pull' | 'signin'>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<ImportMode>('merge');
  const pollCancelRef = useRef<{ cancelled: boolean }>({ cancelled: false });

  // ─── Initial phase detection ───────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    setPhase({ kind: 'loading' });

    (async () => {
      const status = await fetchSyncStatus();
      if (cancelled) return;
      if (!status.configured) {
        setPhase({ kind: 'unconfigured' });
        return;
      }
      if (!syncToken) {
        setPhase({ kind: 'signed-out' });
        return;
      }
      try {
        const user = await getAuthenticatedUser(syncToken);
        if (!cancelled) setPhase({ kind: 'signed-in', login: user.login });
      } catch {
        // token rejected; treat as signed-out but keep the stale token cleanup to the user
        if (!cancelled) setPhase({ kind: 'signed-out' });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, syncToken]);

  // ─── Cancel any in-flight polling when modal closes ────────────────────────
  useEffect(() => {
    if (!open) {
      pollCancelRef.current.cancelled = true;
    }
  }, [open]);

  const startSignIn = useCallback(async () => {
    setError(null);
    setBusy('signin');
    try {
      const code = await requestDeviceCode();
      setPhase({ kind: 'device-code', code });
      pollCancelRef.current = { cancelled: false };
      const cancelToken = pollCancelRef.current;

      const expiresAt = Date.now() + code.expiresIn * 1000;
      let interval = code.interval;
      const poll = async () => {
        if (cancelToken.cancelled) return;
        if (Date.now() > expiresAt) {
          setError('Sign-in timed out. Try again.');
          setPhase({ kind: 'signed-out' });
          setBusy(null);
          return;
        }
        const result = await pollDeviceToken(code.deviceCode);
        if (cancelToken.cancelled) return;
        switch (result.status) {
          case 'ok':
            useAppStore.getState().setSyncToken(result.accessToken);
            setBusy(null);
            return;
          case 'pending':
            setTimeout(poll, interval * 1000);
            return;
          case 'slow_down':
            interval = result.intervalHint ?? interval + 5;
            setTimeout(poll, interval * 1000);
            return;
          case 'expired':
            setError('Sign-in expired before you authorized. Try again.');
            setPhase({ kind: 'signed-out' });
            setBusy(null);
            return;
          case 'denied':
            setError('Sign-in was denied.');
            setPhase({ kind: 'signed-out' });
            setBusy(null);
            return;
          case 'error':
            setError(result.message);
            setPhase({ kind: 'signed-out' });
            setBusy(null);
            return;
        }
      };
      void poll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed');
      setBusy(null);
    }
  }, []);

  const cancelSignIn = useCallback(() => {
    pollCancelRef.current.cancelled = true;
    setPhase({ kind: 'signed-out' });
    setBusy(null);
  }, []);

  const signOut = useCallback(() => {
    useAppStore.getState().clearSyncToken();
    setPhase({ kind: 'signed-out' });
  }, []);

  const handlePush = useCallback(async () => {
    if (!syncToken) return;
    setError(null);
    setBusy('push');
    try {
      let gistId = syncGistId;
      if (!gistId) {
        gistId = await ensureGist(syncToken);
        useAppStore.getState().setSyncGistId(gistId);
      }
      await pushToCloud(syncToken, gistId, useAppStore.getState().getSyncSnapshot());
      useAppStore.getState().setSyncLastSyncedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setBusy(null);
    }
  }, [syncToken, syncGistId]);

  const handlePullRequest = useCallback(async () => {
    if (!syncToken) return;
    setError(null);
    setBusy('pull');
    try {
      let gistId = syncGistId;
      if (!gistId) {
        gistId = await ensureGist(syncToken);
        useAppStore.getState().setSyncGistId(gistId);
      }
      const payload = await pullFromCloud(syncToken, gistId);
      setPhase({ kind: 'pull-preview', payload });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Pull failed');
    } finally {
      setBusy(null);
    }
  }, [syncToken, syncGistId]);

  const confirmPull = useCallback(() => {
    if (phase.kind !== 'pull-preview') return;
    if (mode === 'replace') {
      const ok = confirm('Replace all collections and environments with the cloud copy?');
      if (!ok) return;
    }
    const current = useAppStore.getState().getSyncSnapshot();
    const next = applySyncPayload(current, phase.payload, mode);
    useAppStore.getState().applySyncSnapshot(next);
    useAppStore.getState().setSyncLastSyncedAt(Date.now());
    // Flip back to signed-in view
    getAuthenticatedUser(syncToken!)
      .then(u => setPhase({ kind: 'signed-in', login: u.login }))
      .catch(() => setPhase({ kind: 'signed-in', login: null }));
  }, [phase, mode, syncToken]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-dark-800 border border-dark-600 rounded-xl shadow-2xl w-full max-w-lg mx-4">
        <div className="flex items-center justify-between px-4 py-3 border-b border-dark-600">
          <div className="flex items-center gap-2">
            <Cloud size={16} className="text-accent-blue" />
            <h3 className="text-sm font-semibold text-dark-100">Cloud Sync</h3>
          </div>
          <button onClick={onClose} className="p-1 text-dark-400 hover:text-dark-200 rounded cursor-pointer">
            <X size={16} />
          </button>
        </div>

        <div className="p-4">
          {error && (
            <div className="mb-3 flex items-start gap-2 px-3 py-2 bg-accent-red/10 border border-accent-red/30 rounded text-xs text-accent-red">
              <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {phase.kind === 'loading' && (
            <div className="flex items-center justify-center py-8 text-dark-400 text-xs">
              <Loader2 size={14} className="animate-spin mr-2" />
              Checking sync status...
            </div>
          )}

          {phase.kind === 'unconfigured' && (
            <div className="py-4 text-xs text-dark-300">
              Cloud sync is not configured on this CurlIt instance. The maintainer needs to register a
              GitHub OAuth app (with Device Flow enabled) and set <code className="text-accent-yellow">GITHUB_CLIENT_ID</code>
              {' '}in the proxy server environment. See the User Guide for setup instructions.
            </div>
          )}

          {phase.kind === 'signed-out' && (
            <div className="py-2">
              <p className="text-xs text-dark-300 mb-3">
                Sign in with GitHub to sync your collections and environments across devices via a
                private Gist. Only collections and environments are synced -- history, chain variables,
                and theme stay local.
              </p>
              <button
                onClick={startSignIn}
                disabled={busy === 'signin'}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm text-white bg-accent-blue hover:bg-accent-blue/80 disabled:opacity-50 rounded-lg cursor-pointer"
              >
                {busy === 'signin' ? <Loader2 size={14} className="animate-spin" /> : <Cloud size={14} />}
                Sign in with GitHub
              </button>
            </div>
          )}

          {phase.kind === 'device-code' && (
            <div className="py-2">
              <p className="text-xs text-dark-300 mb-3">
                1. Open GitHub: <a
                  href={phase.code.verificationUri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent-blue underline inline-flex items-center gap-1"
                >
                  {phase.code.verificationUri}
                  <ExternalLink size={10} />
                </a>
                <br />
                2. Enter this code and authorize CurlIt.
              </p>
              <div className="bg-dark-900 border border-dark-600 rounded-lg p-4 text-center mb-3">
                <div className="text-2xl font-mono font-bold tracking-widest text-dark-100">
                  {phase.code.userCode}
                </div>
              </div>
              <div className="flex items-center justify-center gap-2 text-[11px] text-dark-400 mb-3">
                <Loader2 size={10} className="animate-spin" />
                Waiting for you to authorize in GitHub...
              </div>
              <button
                onClick={cancelSignIn}
                className="w-full px-4 py-2 text-sm text-dark-300 hover:text-dark-100 bg-dark-700 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
            </div>
          )}

          {phase.kind === 'signed-in' && (
            <div className="py-2">
              <div className="flex items-center justify-between mb-3 px-3 py-2 bg-dark-900 border border-dark-600 rounded-lg">
                <div className="flex items-center gap-2">
                  <Check size={14} className="text-accent-green" />
                  <span className="text-xs text-dark-200">
                    Connected{phase.login && (
                      <>
                        {' as '}<span className="font-medium text-dark-100">@{phase.login}</span>
                      </>
                    )}
                  </span>
                </div>
                <button
                  onClick={signOut}
                  className="flex items-center gap-1 text-[11px] text-dark-400 hover:text-accent-red cursor-pointer"
                >
                  <LogOut size={11} />
                  Sign out
                </button>
              </div>

              <div className="bg-dark-900 border border-dark-600 rounded-lg p-3 mb-3">
                <div className="grid grid-cols-2 gap-3 text-center">
                  <Stat label="Collections" value={collections.length} />
                  <Stat label="Environments" value={environments.length} />
                </div>
                <div className="mt-3 pt-3 border-t border-dark-700 text-[11px] text-dark-400 text-center">
                  {syncLastSyncedAt
                    ? `Last synced ${formatRelative(syncLastSyncedAt)}`
                    : 'Not synced yet'}
                </div>
              </div>

              <div className="flex gap-2 mb-3">
                <button
                  onClick={handlePush}
                  disabled={busy !== null}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm text-white bg-accent-blue hover:bg-accent-blue/80 disabled:opacity-50 rounded-lg cursor-pointer"
                >
                  {busy === 'push' ? <Loader2 size={14} className="animate-spin" /> : <CloudUpload size={14} />}
                  Sync Now
                </button>
                <button
                  onClick={handlePullRequest}
                  disabled={busy !== null}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm text-dark-200 bg-dark-700 hover:bg-dark-600 disabled:opacity-50 rounded-lg cursor-pointer"
                >
                  {busy === 'pull' ? <Loader2 size={14} className="animate-spin" /> : <CloudDownload size={14} />}
                  Pull from Cloud
                </button>
              </div>

              <div className="flex items-start gap-2 px-3 py-2 bg-accent-yellow/10 border border-accent-yellow/30 rounded text-[11px] text-accent-yellow">
                <AlertTriangle size={11} className="mt-0.5 flex-shrink-0" />
                <span>
                  Environment values are stored as plaintext in your private Gist. Avoid syncing
                  production secrets until client-side encryption ships.
                </span>
              </div>
            </div>
          )}

          {phase.kind === 'pull-preview' && (
            <div className="py-2">
              <p className="text-xs text-dark-300 mb-3">Found in cloud:</p>
              <div className="bg-dark-900 border border-dark-600 rounded-lg p-3 mb-3">
                <div className="grid grid-cols-2 gap-3 text-center">
                  <Stat label="Collections" value={phase.payload.data.collections.length} />
                  <Stat label="Environments" value={phase.payload.data.environments.length} />
                </div>
              </div>
              <div className="mb-3">
                <div className="text-[11px] text-dark-400 mb-1.5">Import mode:</div>
                <div className="flex gap-2">
                  <ModeButton
                    selected={mode === 'merge'}
                    onClick={() => setMode('merge')}
                    label="Merge"
                    description="Add to existing data"
                  />
                  <ModeButton
                    selected={mode === 'replace'}
                    onClick={() => setMode('replace')}
                    label="Replace"
                    description="Overwrite local"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setPhase({ kind: 'signed-in', login: null })}
                  className="flex-1 px-4 py-2 text-sm text-dark-300 hover:text-dark-100 bg-dark-700 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmPull}
                  className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 text-sm text-white bg-accent-blue hover:bg-accent-blue/80 rounded-lg cursor-pointer"
                >
                  <CloudDownload size={14} />
                  {mode === 'replace' ? 'Replace Local' : 'Merge In'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-lg font-semibold text-dark-100">{value}</div>
      <div className="text-[10px] text-dark-400 uppercase tracking-wider">{label}</div>
    </div>
  );
}

function ModeButton({
  selected,
  onClick,
  label,
  description,
}: {
  selected: boolean;
  onClick: () => void;
  label: string;
  description: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 text-left px-3 py-2 rounded-lg cursor-pointer transition-colors border ${
        selected
          ? 'bg-accent-blue/20 border-accent-blue/40 text-dark-100'
          : 'bg-dark-700 border-transparent text-dark-300 hover:bg-dark-600'
      }`}
    >
      <div className="text-xs font-medium">{label}</div>
      <div className="text-[10px] text-dark-400">{description}</div>
    </button>
  );
}

function formatRelative(timestamp: number): string {
  const diff = Date.now() - timestamp;
  if (diff < 60_000) return 'just now';
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
