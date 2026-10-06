import type { RequestConfig, ResponseData, TestResult, ScriptConsoleEntry } from '../types';
import { resolveRequestVariables, buildHeaders, buildBody } from './http';
import type { runPreRequestScript, runTestScript, PreRequestResult, TestScriptResult } from './scriptEngine';
import { parseResponseSchemaConfig, schemaValidationError, type SchemaValidationResult } from './responseSchemaConfig';

export interface ExecuteContext {
  /** Environment variables available via {{ }} substitution. */
  variables: Record<string, string>;
  /** Chain variables snapshot (updated by prior test scripts). */
  chainVars: Record<string, string>;
  signal?: AbortSignal;
}

/** Runtime adapters keep collection semantics shared across the UI and CLI. */
export interface ExecutionRuntime {
  sendRequest: (request: RequestConfig, signal?: AbortSignal) => Promise<ResponseData>;
  runPreRequestScript: (...args: Parameters<typeof runPreRequestScript>) => PreRequestResult | Promise<PreRequestResult>;
  runTestScript: (...args: Parameters<typeof runTestScript>) => TestScriptResult | Promise<TestScriptResult>;
  validateResponseSchema: (schema: string, body: string, signal?: AbortSignal) => Promise<SchemaValidationResult>;
}

export type ExecuteOutcome = 'passed' | 'failed' | 'error';

export interface ExecuteResult {
  resolvedRequest: RequestConfig;
  /** Always present; transport/pre-request failures use status 0. */
  response: ResponseData;
  testResults: TestResult[];
  chainVarUpdates: Record<string, string>;
  logs: ScriptConsoleEntry[];
  error: string | null;
  outcome: ExecuteOutcome;
}

function errorResponse(statusText: string, body: string): ResponseData {
  return { status: 0, statusText, headers: {}, body, size: 0, time: 0, cookies: [] };
}

export function executionError(request: RequestConfig, error: unknown): ExecuteResult {
  const message = error instanceof Error ? error.message : String(error);
  return {
    resolvedRequest: request,
    response: errorResponse('Error', message),
    testResults: [], chainVarUpdates: {}, logs: [], error: message, outcome: 'error',
  };
}

/**
 * Run the full send-a-request sequence: variable substitution → optional
 * pre-request script → network send → response schema → optional test script. Returns all
 * artifacts so the caller can decide where to persist them (tab store, runner
 * state, history, etc.) — this function never touches the store directly.
 *
 * Extracted from UrlBar.handleSend so the Collection Runner can reuse it per
 * iteration without duplicating 150 lines of script-handling nuance.
 */
export async function executeRequestWithScripts(
  request: RequestConfig,
  ctx: ExecuteContext,
  runtime: ExecutionRuntime,
): Promise<ExecuteResult> {
  try {
    ctx.signal?.throwIfAborted();
    if (request.protocol === 'websocket') {
      throw new Error('Collection runs support HTTP and GraphQL requests; WebSocket sessions must be run interactively.');
    }
    return await execute(request, ctx, runtime);
  } catch (error) {
    return executionError(request, error);
  }
}

async function execute(
  request: RequestConfig,
  ctx: ExecuteContext,
  runtime: ExecutionRuntime,
): Promise<ExecuteResult> {
  const logs: ScriptConsoleEntry[] = [];
  const chainVarUpdates: Record<string, string> = {};

  let resolved = resolveRequestVariables(request, ctx.variables, ctx.chainVars);

  // --- Pre-request script ---
  if (request.preRequestScript?.trim()) {
    const headers = buildHeaders(resolved.headers, resolved.auth);
    const body = buildBody(resolved);
    const bodyStr = body === null ? null : typeof body === 'string' ? body : null;

    const preResult = await runtime.runPreRequestScript(
      request.preRequestScript,
      resolved,
      headers,
      bodyStr,
      ctx.variables,
      ctx.chainVars,
    );
    logs.push(...preResult.logs);

    if (preResult.error) {
      return {
        resolvedRequest: resolved,
        response: errorResponse('Script Error', `Pre-request script error: ${preResult.error}`),
        testResults: [],
        chainVarUpdates: preResult.chain,
        logs,
        error: preResult.error,
        outcome: 'error',
      };
    }

    Object.assign(chainVarUpdates, preResult.chain);

    // Apply mutations from pre-request script. The script received fully-built
    // headers (auth already baked in), so we neutralize header-based auth to
    // prevent sendRequest from re-applying auth on top of what the script set.
    // Query-style API-key auth is preserved because sendRequest appends those
    // to the URL — they aren't in the headers the script saw.
    const isQueryApiKey =
      resolved.auth.type === 'api-key' && resolved.auth.apiKey?.addTo === 'query';
    resolved = {
      ...resolved,
      method: (preResult.request.method as RequestConfig['method']) || resolved.method,
      url: preResult.request.url || resolved.url,
      headers: Object.entries(preResult.request.headers).map(([key, value]) => ({
        id: crypto.randomUUID(),
        key,
        value,
        enabled: true,
      })),
      auth: isQueryApiKey ? resolved.auth : { type: 'none' },
    };

    // If the script changed the body, override with the raw string and switch
    // body type to 'text' so buildBody() reads .raw instead of rebuilding from
    // structured fields (graphql, form-data, etc.). Preserve Content-Type by
    // carrying over what sendRequest would have auto-set for the original body
    // type, unless the script already set one.
    if (preResult.request.body !== null && preResult.request.body !== bodyStr) {
      const originalType = resolved.body.type;
      resolved = {
        ...resolved,
        body: { ...resolved.body, type: 'text', raw: preResult.request.body },
      };

      const hasContentType = resolved.headers.some(
        h => h.enabled && h.key.toLowerCase() === 'content-type',
      );
      if (!hasContentType) {
        const autoType: Record<string, string> = {
          json: 'application/json',
          graphql: 'application/json',
          xml: 'application/xml',
          'x-www-form-urlencoded': 'application/x-www-form-urlencoded',
        };
        const ct = autoType[originalType];
        if (ct) {
          resolved = {
            ...resolved,
            headers: [
              ...resolved.headers,
              { id: crypto.randomUUID(), key: 'Content-Type', value: ct, enabled: true },
            ],
          };
        }
      }
    }
  }

  // --- Send ---
  let response: ResponseData;
  try {
    ctx.signal?.throwIfAborted();
    response = await runtime.sendRequest(resolved, ctx.signal);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to send request';
    const isProxyDown = message === 'Failed to fetch' || message.includes('NetworkError');
    return {
      resolvedRequest: resolved,
      response: errorResponse(
        'Error',
        isProxyDown
          ? 'Could not reach the proxy server. Make sure it is running (npm run dev:server on port 3001).'
          : message,
      ),
      testResults: [],
      chainVarUpdates,
      logs,
      error: message,
      outcome: 'error',
    };
  }

  // Status 0 from the proxy means the target request failed at the network /
  // SSL / validation layer — the proxy itself returned 200 but wrapped a
  // failure in the JSON payload (e.g. `{ status: 0, statusText: 'Error',
  // body: 'unable to verify the first certificate' }`). Treat that the same
  // as a thrown network error: skip test scripts and classify as 'error'.
  if (response.status === 0) {
    return {
      resolvedRequest: resolved,
      response,
      testResults: [],
      chainVarUpdates,
      logs,
      error: response.body || response.statusText || 'Network error',
      outcome: 'error',
    };
  }

  // Schema assertions are independent of scripts: neither can override a failure
  // from the other. Retain the actual response even when a schema is invalid.
  let schemaResult: SchemaValidationResult | undefined;
  try {
    const schema = parseResponseSchemaConfig(request.responseSchema);
    if (schema?.enabled) schemaResult = await runtime.validateResponseSchema(schema.schema, response.body, ctx.signal);
  } catch (error) {
    schemaResult = schemaValidationError(error instanceof Error ? error.message : String(error));
  }
  const testResults: TestResult[] = [...(schemaResult?.tests ?? [])];

  // --- Post-response test script ---
  const hasTestScript = !!request.testScript?.trim();
  if (hasTestScript) {
    // Merge in any chain-var updates from pre-request so tests see them.
    const chainForTests = { ...ctx.chainVars, ...chainVarUpdates };
    let testResult: TestScriptResult;
    try {
      testResult = await runtime.runTestScript(request.testScript!, resolved, response, chainForTests);
    } catch (error) {
      testResult = { tests: [], logs: [], chain: {}, error: error instanceof Error ? error.message : String(error) };
    }
    logs.push(...testResult.logs);
    testResults.push(...testResult.tests);
    Object.assign(chainVarUpdates, testResult.chain);

    if (testResult.error) {
      logs.push({
        type: 'error',
        args: [`Test script error: ${testResult.error}`],
        timestamp: Date.now(),
      });
      // A script can throw before (or after) registering assertions. It must
      // never turn an incomplete test run into a passing CI result.
      testResults.push({ name: 'Test script', passed: false, error: testResult.error });
      return {
        resolvedRequest: resolved, response, testResults, chainVarUpdates, logs,
        error: testResult.error, outcome: 'error',
      };
    }
  }

  // Outcome rules:
  //  - A schema configuration/worker error is always an error.
  //  - Any failed schema or script assertion fails the request.
  //  - Otherwise, fall back to HTTP status: 4xx/5xx without a test script
  //    counts as failed so collection-runner rows don't green-check an error
  //    response the user hasn't explicitly blessed.
  let outcome: ExecuteOutcome;
  if (schemaResult?.outcome === 'error') outcome = 'error';
  else if (testResults.some(t => !t.passed) || (!hasTestScript && response.status >= 400)) outcome = 'failed';
  else outcome = 'passed';

  return {
    resolvedRequest: resolved,
    response,
    testResults,
    chainVarUpdates,
    logs,
    error: schemaResult?.error ?? null,
    outcome,
  };
}
