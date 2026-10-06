import { RESPONSE_SCHEMA_TIMEOUT_MS, schemaValidationError, type SchemaValidationResult } from './responseSchemaConfig';

export function validateResponseSchemaInBrowser(schema: string, body: string, signal?: AbortSignal): Promise<SchemaValidationResult> {
  signal?.throwIfAborted();
  return new Promise(resolve => {
    const worker = new Worker(new URL('./responseSchema.worker.ts', import.meta.url), { type: 'module' });
    let settled = false;
    const finish = (result: SchemaValidationResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      worker.terminate();
      resolve(result);
    };
    const abort = () => finish(schemaValidationError('Response schema validation was interrupted'));
    let timer = setTimeout(() => finish(schemaValidationError('Response schema validation worker did not start')), 10_000);
    worker.onmessage = (event: MessageEvent<{ type: 'ready' } | { type: 'result'; result: SchemaValidationResult }>) => {
      if (event.data.type === 'ready') {
        clearTimeout(timer);
        timer = setTimeout(() => finish(schemaValidationError(`Response schema validation exceeded ${RESPONSE_SCHEMA_TIMEOUT_MS}ms`)), RESPONSE_SCHEMA_TIMEOUT_MS);
        worker.postMessage({ schema, body });
      } else finish(event.data.result);
    };
    worker.onerror = () => finish(schemaValidationError('Response schema validation worker failed'));
    worker.onmessageerror = () => finish(schemaValidationError('Response schema validation worker returned invalid data'));
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
  });
}
