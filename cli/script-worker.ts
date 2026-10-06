import { workerData, parentPort } from 'node:worker_threads';
import { runInNewContext } from 'node:vm';

// Bundled from the same script engine used in the browser. Nothing from the
// Node host (objects, callbacks, module loading, or environment) enters the VM.
declare const __CURLIT_SCRIPT_ENGINE__: string;

const { method, args, timeoutMs } = workerData as { method: 'runPreRequestScript' | 'runTestScript'; args: unknown[]; timeoutMs: number };
try {
  const input = JSON.stringify(JSON.stringify(args));
  const source = `${__CURLIT_SCRIPT_ENGINE__}\nJSON.stringify(CurlitScripts.${method}(...JSON.parse(${input})))`;
  const result = runInNewContext(source, Object.create(null), { timeout: timeoutMs, microtaskMode: 'afterEvaluate' });
  parentPort!.postMessage({ result: JSON.parse(result) });
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  parentPort!.postMessage({ error: message.includes('Script execution timed out') ? `Script timed out after ${timeoutMs}ms` : message });
}
