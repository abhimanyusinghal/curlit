import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { Agent } from 'undici';
import type { RequestConfig, ResponseData } from '../src/types';
import { prepareRequest } from '../src/utils/http';
import type { ExecutionRuntime } from '../src/utils/requestExecutorCore';
import type { PreRequestResult, TestScriptResult } from '../src/utils/scriptEngine';
import { RESPONSE_SCHEMA_TIMEOUT_MS, type SchemaValidationResult } from '../src/utils/responseSchemaConfig';

function workerTask<T>(file: string, workerData: unknown, timeoutMs: number, timeoutMessage: string, signal: AbortSignal, waitForReady = false): Promise<T> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const worker = new Worker(join(__dirname, file), {
      workerData,
      env: {}, execArgv: [], stdout: true, stderr: true,
      resourceLimits: { maxOldGenerationSizeMb: 64, stackSizeMb: 4 },
    });
    let settled = false;
    const finish = (error?: Error, result?: T) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      void worker.terminate();
      if (error) reject(error); else resolve(result!);
    };
    const abort = () => finish(new Error('Run interrupted'));
    let timer = setTimeout(() => finish(new Error(waitForReady ? 'Schema validation worker did not start' : timeoutMessage)), waitForReady ? 10_000 : timeoutMs);
    signal.addEventListener('abort', abort, { once: true });
    worker.on('message', (message: { ready?: boolean; error?: string; result?: T }) => {
      if (waitForReady && message.ready) {
        clearTimeout(timer);
        timer = setTimeout(() => finish(new Error(timeoutMessage)), timeoutMs);
      } else finish(message.error ? new Error(message.error) : undefined, message.result);
    });
    worker.once('error', error => finish(error));
    worker.once('exit', code => { if (!settled) finish(new Error(`Worker exited before returning a result (code ${code})`)); });
    if (signal.aborted) abort();
  });
}

function script<T>(method: 'runPreRequestScript' | 'runTestScript', args: unknown[], timeoutMs: number, signal: AbortSignal): Promise<T> {
  // VM timeout measures execution; this also bounds worker startup/serialization.
  return workerTask('script-worker.cjs', { method, args, timeoutMs }, timeoutMs + 5_000,
    `Script worker exceeded its ${timeoutMs}ms execution budget`, signal);
}

export function createNodeRuntime(timeoutMs: number, scriptTimeoutMs: number, runSignal: AbortSignal): ExecutionRuntime {
  return {
    async sendRequest(request: RequestConfig, signal?: AbortSignal): Promise<ResponseData> {
      if (request.auth.type === 'oauth2' && !request.auth.oauth2?.token?.accessToken) {
        throw new Error('OAuth requires an access token in CLI runs; provide a saved token or Bearer auth with a variable override');
      }
      const { url, headers, body } = prepareRequest(request);
      const target = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
      if (!['http:', 'https:'].includes(target.protocol) || /^[a-z][a-z\d+.-]*:\/\//i.test(url) && !/^https?:\/\//i.test(url)) {
        throw new Error('CLI requests must use http:// or https://');
      }
      if (body instanceof FormData) {
        // Fetch supplies the boundary for the actual multipart body.
        for (const key of Object.keys(headers)) if (key.toLowerCase() === 'content-type') delete headers[key];
      }
      const timeout = AbortSignal.timeout(timeoutMs);
      const combined = AbortSignal.any([signal ?? runSignal, timeout]);
      const dispatcher = new Agent({ connect: { rejectUnauthorized: request.sslVerification !== false } });
      const started = performance.now();
      try {
        const options: RequestInit & { dispatcher: Agent } = { method: request.method, headers, body, dispatcher, signal: combined };
        const response = await fetch(target, options);
        let text = await response.text();
        const httpTimeMs = performance.now() - started;
        try { text = JSON.stringify(JSON.parse(text), null, 2); } catch { /* Preserve non-JSON responses. */ }
        const cookies = response.headers.getSetCookie().map(cookie => {
          const pair = cookie.split(';')[0];
          const equals = pair.indexOf('=');
          return { name: pair.slice(0, equals).trim(), value: pair.slice(equals + 1).trim() };
        });
        return {
          status: response.status, statusText: response.statusText,
          headers: Object.fromEntries(response.headers), body: text, cookies,
          size: Buffer.byteLength(text), time: Math.round(httpTimeMs), httpTimeMs,
        };
      } catch (error) {
        if (timeout.aborted) throw new Error(`Request timed out after ${timeoutMs}ms`);
        if (combined.aborted) throw new Error('Run interrupted');
        const cause = (error as Error & { cause?: Error }).cause;
        throw new Error(cause?.message || (error as Error).message);
      } finally {
        await dispatcher.destroy();
      }
    },
    runPreRequestScript: (...args) => script<PreRequestResult>('runPreRequestScript', args, scriptTimeoutMs, runSignal),
    runTestScript: (...args) => script<TestScriptResult>('runTestScript', args, scriptTimeoutMs, runSignal),
    validateResponseSchema: (schema, body, signal) => workerTask<SchemaValidationResult>(
      'schema-worker.cjs', { schema, body }, RESPONSE_SCHEMA_TIMEOUT_MS,
      `Response schema validation exceeded ${RESPONSE_SCHEMA_TIMEOUT_MS}ms`, signal ?? runSignal, true,
    ),
  };
}
