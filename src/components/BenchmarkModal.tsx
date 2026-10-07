import { useEffect, useRef, useState } from 'react';
import { Download, Gauge, Play, Square, X } from 'lucide-react';
import type { Collection } from '../types';
import { useAppStore } from '../store';
import { parseBenchmarkThreshold, runBenchmark, type BenchmarkProgress, type BenchmarkReport } from '../utils/benchmark';
import { downloadBenchmarkReport } from '../utils/benchmarkReport';
import { executeRequestWithScripts } from '../utils/requestExecutor';

const inputClass = 'bg-dark-700 border border-dark-500 rounded px-2 py-1.5 text-sm text-dark-100 disabled:opacity-50 w-full';
const milliseconds = (value: number | null) => value === null ? '—' : value.toFixed(2);

export function BenchmarkModal({ target, onClose }: { target: Pick<Collection, 'name' | 'requests'>; onClose: () => void }) {
  const environments = useAppStore(state => state.environments);
  const [envId, setEnvId] = useState(useAppStore.getState().activeEnvironmentId ?? '');
  const [iterations, setIterations] = useState('10');
  const [warmup, setWarmup] = useState('0');
  const [delay, setDelay] = useState('0');
  const [timeout, setTimeout] = useState('30000');
  const [limits, setLimits] = useState('');
  const [bail, setBail] = useState(false);
  const [running, setRunning] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [progress, setProgress] = useState<BenchmarkProgress | null>(null);
  const [report, setReport] = useState<BenchmarkReport | null>(null);
  const [error, setError] = useState('');
  const controllerRef = useRef<AbortController | null>(null);
  useEffect(() => () => { controllerRef.current?.abort(); controllerRef.current = null; }, []);

  const start = async () => {
    const controller = new AbortController();
    controllerRef.current = controller;
    setError(''); setReport(null); setProgress(null); setStopping(false); setRunning(true);
    try {
      const variables: Record<string, string> = Object.create(null);
      environments.find(env => env.id === envId)?.variables.filter(variable => variable.enabled && variable.key)
        .forEach(variable => { variables[variable.key] = variable.value; });
      const result = await runBenchmark({
        name: target.name, requests: target.requests, variables, signal: controller.signal, execute: executeRequestWithScripts,
        config: { iterations: Number(iterations), warmup: Number(warmup), delayMs: Number(delay), timeoutMs: Number(timeout),
          stopOnFailure: bail, thresholds: limits.trim() ? limits.split(',').map(parseBenchmarkThreshold) : [] },
        onProgress: update => { if (controllerRef.current === controller) setProgress(update); },
      });
      if (controllerRef.current === controller) setReport(result);
    } catch (err) {
      if (controllerRef.current === controller) setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (controllerRef.current === controller) { setRunning(false); setStopping(false); }
    }
  };

  const numberFields = [
    { label: 'Iterations', value: iterations, change: setIterations, min: 1, max: 10_000 },
    { label: 'Warm-up iterations', value: warmup, change: setWarmup, min: 0, max: 1_000 },
    { label: 'Delay (ms)', value: delay, change: setDelay, min: 0, max: 60_000 },
    { label: 'Request timeout (ms)', value: timeout, change: setTimeout, min: 1, max: 2_147_483_647 },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <section role="dialog" aria-modal="true" aria-labelledby="benchmark-title" className="bg-dark-800 border border-dark-600 rounded-xl shadow-2xl w-full max-w-4xl mx-4 max-h-[90vh] flex flex-col">
        <header className="flex items-center justify-between px-4 py-3 border-b border-dark-600">
          <h2 id="benchmark-title" className="flex items-center gap-2 text-sm font-semibold text-dark-100"><Gauge size={16} />Benchmark — {target.name}</h2>
          <button aria-label="Close benchmark" onClick={onClose} className="text-dark-300 hover:text-dark-100 cursor-pointer"><X size={18} /></button>
        </header>
        <div className="p-4 overflow-auto space-y-4">
          <p className="text-xs text-dark-300">Runs {target.requests.length} request{target.requests.length === 1 ? '' : 's'} in order each iteration. Warm-up runs are excluded from statistics. Chain variables reset each iteration.</p>
          <fieldset disabled={running} className="grid grid-cols-2 md:grid-cols-4 gap-3 disabled:opacity-70">
            {numberFields.map(field => <label key={field.label} className="flex flex-col gap-1 text-xs text-dark-300">
              {field.label}<input type="number" min={field.min} max={field.max} step="1" value={field.value} onChange={event => field.change(event.target.value)} className={inputClass} />
            </label>)}
            <label className="flex flex-col gap-1 text-xs text-dark-300">Environment
              <select value={envId} onChange={event => setEnvId(event.target.value)} className={inputClass}>
                <option value="">No environment</option>{environments.map(env => <option key={env.id} value={env.id}>{env.name}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-dark-300 col-span-2 md:col-span-3">Thresholds (optional)
              <input value={limits} onChange={event => setLimits(event.target.value)} placeholder="p95<500, failureRate<=0" className={inputClass} />
              <span className="text-dark-400">Applied to each request. Latency in milliseconds; failureRate in percent.</span>
            </label>
            <label className="flex items-center gap-2 text-xs text-dark-300 col-span-2"><input type="checkbox" checked={bail} onChange={event => setBail(event.target.checked)} />Stop on first failure</label>
          </fieldset>
          {error && <p role="alert" className="text-sm text-accent-red">{error}</p>}
          <div className="flex items-center gap-3">
            {running ? <button onClick={() => { setStopping(true); controllerRef.current?.abort(); }} disabled={stopping} className="flex items-center gap-2 rounded px-3 py-2 bg-accent-red text-white text-sm cursor-pointer disabled:opacity-50"><Square size={14} />{stopping ? 'Stopping…' : 'Stop benchmark'}</button> :
              <button onClick={start} className="flex items-center gap-2 rounded px-3 py-2 bg-accent-blue text-white text-sm cursor-pointer"><Play size={14} />{report ? 'Run benchmark again' : 'Start benchmark'}</button>}
            {running && progress && <span role="status" className="text-xs text-dark-300">{progress.phase === 'warmup' ? 'Warm-up' : 'Iteration'} {progress.iteration} · {progress.completed}/{progress.total} requests completed</span>}
          </div>
          {report && <>
            <div role="status" className={`rounded border p-3 text-sm ${report.outcome === 'passed' ? 'text-accent-green border-accent-green/30' : 'text-accent-red border-accent-red/30'}`}>
              Benchmark {report.outcome} · {report.summary.completed}/{report.summary.total} measured requests · {report.summary.warmup.completed} warm-up requests · {(report.summary.durationMs / 1000).toFixed(2)}s total
            </div>
            <p className="text-xs text-dark-400">HTTP latency includes response body download. Script and schema validation time is included only in total duration. Missing timings display —.</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left whitespace-nowrap">
                <caption className="text-left text-dark-200 pb-2">HTTP latency by request (ms)</caption>
                <thead className="text-dark-400"><tr>{['Request', 'Samples', 'Avg', 'Median', 'p95', 'p99', 'Min', 'Max', 'Failure rate'].map(label => <th key={label} className="p-2 border-b border-dark-600">{label}</th>)}</tr></thead>
                <tbody>{report.requests.slice(0, 100).map(request => <tr key={request.index} className="text-dark-200">
                  <td className="p-2 max-w-48 truncate">{request.index + 1}. {request.name}</td><td className="p-2">{request.latency.samples}</td>
                  {(['avg', 'median', 'p95', 'p99', 'min', 'max'] as const).map(metric => <td key={metric} className="p-2 tabular-nums">{milliseconds(request.latency[metric])}</td>)}
                  <td className="p-2">{request.failureRate === null ? '—' : `${request.failureRate.toFixed(2)}%`}</td>
                </tr>)}</tbody>
              </table>
              {report.requests.length > 100 && <p className="text-xs text-dark-400 mt-2">Showing the first 100 requests. Export a report for all results.</p>}
            </div>
            {report.checks.length > 0 && <ul className="space-y-1 text-xs">{report.checks.slice(0, 100).map((check, index) => <li key={index} className={check.passed ? 'text-accent-green' : 'text-accent-red'}>
              {check.passed ? 'PASS' : 'FAIL'} · {report.requests[check.requestIndex].name} · {check.expression} · {check.message}
            </li>)}</ul>}
            {report.checks.length > 100 && <p className="text-xs text-dark-400">Showing the first 100 threshold results. Export a report for all results.</p>}
            {report.samples.some(sample => sample.outcome !== 'passed') && <details className="text-xs text-dark-300">
              <summary className="cursor-pointer">Failed requests and assertion details</summary>
              <ul className="mt-2 space-y-1">{report.samples.filter(sample => sample.outcome !== 'passed').slice(0, 100).map((sample, index) => <li key={index}>
                {sample.phase} {sample.iteration} · {report.requests[sample.requestIndex].name}: {sample.error || sample.tests.filter(test => !test.passed).map(test => `${test.name}: ${test.error}`).join('; ') || `HTTP ${sample.statusCode}`}
              </li>)}</ul>
              <p className="mt-2 text-dark-400">Showing up to 100 failures. Export a report for all results.</p>
            </details>}
            <div className="flex justify-end gap-2">{(['json', 'junit'] as const).map(format => <button key={format} onClick={() => downloadBenchmarkReport(report, format)} aria-label={`Export benchmark ${format === 'json' ? 'JSON' : 'JUnit'} report`} className="flex items-center gap-2 px-3 py-2 rounded text-xs bg-dark-700 text-dark-200 hover:bg-dark-600 cursor-pointer"><Download size={14} />{format === 'json' ? 'JSON' : 'JUnit XML'}</button>)}</div>
          </>}
        </div>
      </section>
    </div>
  );
}
