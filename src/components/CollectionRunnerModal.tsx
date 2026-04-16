import { useEffect, useMemo, useRef, useState } from 'react';
import {
  X,
  Play,
  Square,
  Check,
  AlertTriangle,
  XCircle,
  MinusCircle,
  Loader2,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { useAppStore } from '../store';
import { MethodBadge } from './MethodBadge';
import type { Collection } from '../types';
import { runCollection, type RunnerEvent, type RunnerSummary } from '../utils/collectionRunner';
import type { ExecuteResult } from '../utils/requestExecutor';

interface Props {
  open: boolean;
  onClose: () => void;
  collection: Collection | null;
}

type RowState =
  | { status: 'pending' }
  | { status: 'running' }
  | { status: 'done'; result: ExecuteResult; durationMs: number }
  | { status: 'skipped'; reason: 'aborted' | 'stop-on-failure' };

type Phase = 'idle' | 'running' | 'finished';

export function CollectionRunnerModal({ open, onClose, collection }: Props) {
  const environments = useAppStore(s => s.environments);
  const activeEnvironmentId = useAppStore(s => s.activeEnvironmentId);

  const [envId, setEnvId] = useState<string | null>(activeEnvironmentId);
  const [stopOnFailure, setStopOnFailure] = useState(false);
  const [delayMs, setDelayMs] = useState(0);
  const [phase, setPhase] = useState<Phase>('idle');
  const [rows, setRows] = useState<RowState[]>([]);
  const [summary, setSummary] = useState<RunnerSummary | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const abortRef = useRef<AbortController | null>(null);

  // Reset when opened for a different collection
  useEffect(() => {
    if (!open) return;
    setEnvId(activeEnvironmentId);
    setPhase('idle');
    setRows(collection ? collection.requests.map(() => ({ status: 'pending' })) : []);
    setSummary(null);
    setExpanded(new Set());
  }, [open, collection, activeEnvironmentId]);

  // Abort any in-flight run when the modal closes
  useEffect(() => {
    if (!open) abortRef.current?.abort();
  }, [open]);

  const resolvedEnv = useMemo(() => environments.find(e => e.id === envId) ?? null, [environments, envId]);

  const toggleRow = (i: number) =>
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  const handleStart = async () => {
    if (!collection || collection.requests.length === 0) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase('running');
    setSummary(null);
    setRows(collection.requests.map(() => ({ status: 'pending' })));

    const envVars: Record<string, string> = {};
    resolvedEnv?.variables
      .filter(v => v.enabled && v.key)
      .forEach(v => {
        envVars[v.key] = v.value;
      });

    await runCollection({
      requests: collection.requests,
      variables: envVars,
      getChainVars: () => useAppStore.getState().chainVariables,
      onChainVars: updates => useAppStore.getState().updateChainVariables(updates),
      stopOnFailure,
      delayMs,
      signal: controller.signal,
      onEvent: (event: RunnerEvent) => {
        if (event.type === 'request-start') {
          setRows(prev => {
            const next = [...prev];
            next[event.index] = { status: 'running' };
            return next;
          });
        } else if (event.type === 'request-complete') {
          setRows(prev => {
            const next = [...prev];
            next[event.index] = { status: 'done', result: event.result, durationMs: event.durationMs };
            return next;
          });
        } else if (event.type === 'request-skipped') {
          setRows(prev => {
            const next = [...prev];
            next[event.index] = { status: 'skipped', reason: event.reason };
            return next;
          });
        } else if (event.type === 'done') {
          setSummary(event.summary);
          setPhase('finished');
        }
      },
    });
  };

  const handleStop = () => {
    abortRef.current?.abort();
  };

  if (!open || !collection) return null;

  const total = collection.requests.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-dark-800 border border-dark-600 rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-dark-600">
          <div className="flex items-center gap-2">
            <Play size={16} className="text-accent-blue" />
            <h3 className="text-sm font-semibold text-dark-100">Run Collection — {collection.name}</h3>
          </div>
          <button onClick={onClose} className="p-1 text-dark-400 hover:text-dark-200 rounded cursor-pointer">
            <X size={16} />
          </button>
        </div>

        <div className="p-4 overflow-auto flex-1">
          {/* Options */}
          <div className="flex flex-wrap items-end gap-3 mb-4">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-dark-400 uppercase tracking-wider">Environment</span>
              <select
                value={envId ?? ''}
                onChange={e => setEnvId(e.target.value || null)}
                disabled={phase === 'running'}
                className="bg-dark-700 border border-dark-600 rounded px-2 py-1.5 text-xs text-dark-100 disabled:opacity-50"
              >
                <option value="">No environment</option>
                {environments.map(env => (
                  <option key={env.id} value={env.id}>{env.name}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-dark-400 uppercase tracking-wider">Delay (ms)</span>
              <input
                type="number"
                min={0}
                max={60_000}
                value={delayMs}
                onChange={e => setDelayMs(Math.max(0, Number(e.target.value) || 0))}
                disabled={phase === 'running'}
                className="w-24 bg-dark-700 border border-dark-600 rounded px-2 py-1.5 text-xs text-dark-100 disabled:opacity-50"
              />
            </label>
            <label className="flex items-center gap-2 text-xs text-dark-200 cursor-pointer">
              <input
                type="checkbox"
                checked={stopOnFailure}
                onChange={e => setStopOnFailure(e.target.checked)}
                disabled={phase === 'running'}
                className="accent-accent-blue"
              />
              Stop on first failure
            </label>
            <div className="flex-1" />
            {phase !== 'running' ? (
              <button
                onClick={handleStart}
                disabled={total === 0}
                className="flex items-center gap-1.5 px-4 py-2 text-sm text-white bg-accent-blue hover:bg-accent-blue/80 disabled:opacity-50 rounded-lg cursor-pointer"
              >
                <Play size={14} />
                {phase === 'finished' ? 'Run Again' : 'Start Run'}
              </button>
            ) : (
              <button
                onClick={handleStop}
                className="flex items-center gap-1.5 px-4 py-2 text-sm text-white bg-accent-red hover:bg-accent-red/80 rounded-lg cursor-pointer"
              >
                <Square size={14} />
                Stop
              </button>
            )}
          </div>

          {/* Summary */}
          <div className="bg-dark-900 border border-dark-600 rounded-lg p-3 mb-3">
            <div className="grid grid-cols-4 gap-3 text-center">
              <Stat label="Total" value={total} />
              <Stat label="Passed" value={summary?.passed ?? rowCount(rows, r => r.status === 'done' && r.result.outcome === 'passed')} className="text-accent-green" />
              <Stat label="Failed" value={summary?.failed ?? rowCount(rows, r => r.status === 'done' && r.result.outcome === 'failed')} className="text-accent-yellow" />
              <Stat label="Errored" value={summary?.errored ?? rowCount(rows, r => r.status === 'done' && r.result.outcome === 'error')} className="text-accent-red" />
            </div>
            {summary && (
              <div className="mt-3 pt-3 border-t border-dark-700 text-[11px] text-dark-400 text-center">
                Completed {summary.completed}/{summary.total} in {(summary.durationMs / 1000).toFixed(2)}s
              </div>
            )}
          </div>

          {/* Rows */}
          {total === 0 ? (
            <div className="text-dark-500 text-xs text-center py-8">This collection has no requests.</div>
          ) : (
            <div className="flex flex-col border border-dark-600 rounded-lg overflow-hidden">
              {collection.requests.map((req, i) => {
                const row = rows[i] ?? { status: 'pending' };
                const isExpanded = expanded.has(i);
                const canExpand = row.status === 'done';
                return (
                  <div key={req.id} className="border-b border-dark-700 last:border-b-0">
                    <button
                      type="button"
                      onClick={() => canExpand && toggleRow(i)}
                      disabled={!canExpand}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-left ${canExpand ? 'hover:bg-dark-800/50 cursor-pointer' : 'cursor-default'}`}
                    >
                      <StatusIcon row={row} />
                      <MethodBadge method={req.protocol === 'websocket' ? 'WS' : req.method} size="sm" />
                      <span className="text-xs text-dark-200 truncate flex-1">{req.name || req.url || 'Untitled'}</span>
                      {row.status === 'done' && (
                        <span className="text-[11px] text-dark-400 flex-shrink-0">{row.durationMs}ms</span>
                      )}
                      {canExpand && (isExpanded ? <ChevronDown size={12} className="text-dark-500" /> : <ChevronRight size={12} className="text-dark-500" />)}
                    </button>
                    {isExpanded && row.status === 'done' && <RowDetail result={row.result} />}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusIcon({ row }: { row: RowState }) {
  const size = 14;
  if (row.status === 'pending') return <MinusCircle size={size} className="text-dark-500 flex-shrink-0" />;
  if (row.status === 'running') return <Loader2 size={size} className="text-accent-blue animate-spin flex-shrink-0" />;
  if (row.status === 'skipped') return <MinusCircle size={size} className="text-dark-400 flex-shrink-0" />;
  switch (row.result.outcome) {
    case 'passed':
      return <Check size={size} className="text-accent-green flex-shrink-0" />;
    case 'failed':
      return <AlertTriangle size={size} className="text-accent-yellow flex-shrink-0" />;
    case 'error':
      return <XCircle size={size} className="text-accent-red flex-shrink-0" />;
  }
}

function RowDetail({ result }: { result: ExecuteResult }) {
  return (
    <div className="px-3 pb-3 pt-1 bg-dark-900/60 text-xs space-y-2">
      <div className="flex items-center gap-2 text-[11px] text-dark-400">
        <span>Status: <span className="text-dark-200">{result.response.status} {result.response.statusText}</span></span>
        <span>·</span>
        <span>{result.response.time}ms</span>
      </div>
      {result.error && (
        <div className="px-2 py-1.5 bg-accent-red/10 border border-accent-red/30 rounded text-accent-red text-[11px]">
          {result.error}
        </div>
      )}
      {result.testResults.length > 0 && (
        <div>
          <div className="text-[11px] text-dark-400 mb-1">Tests</div>
          <ul className="space-y-0.5">
            {result.testResults.map((t, j) => (
              <li key={j} className="flex items-start gap-1.5 text-[11px]">
                {t.passed ? (
                  <Check size={11} className="text-accent-green mt-0.5 flex-shrink-0" />
                ) : (
                  <XCircle size={11} className="text-accent-red mt-0.5 flex-shrink-0" />
                )}
                <span className={t.passed ? 'text-dark-300' : 'text-accent-red'}>
                  {t.name}
                  {!t.passed && t.error && <span className="text-dark-400"> — {t.error}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {result.response.body && (
        <div>
          <div className="text-[11px] text-dark-400 mb-1">Response</div>
          <pre className="bg-dark-900 border border-dark-600 rounded p-2 text-[11px] text-dark-200 font-mono max-h-32 overflow-auto whitespace-pre-wrap break-all">
            {result.response.body.slice(0, 2000)}
            {result.response.body.length > 2000 && '…'}
          </pre>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, className }: { label: string; value: number; className?: string }) {
  return (
    <div>
      <div className={`text-lg font-semibold ${className ?? 'text-dark-100'}`}>{value}</div>
      <div className="text-[10px] text-dark-400 uppercase tracking-wider">{label}</div>
    </div>
  );
}

function rowCount(rows: RowState[], pred: (r: RowState) => boolean): number {
  return rows.reduce((n, r) => (pred(r) ? n + 1 : n), 0);
}
