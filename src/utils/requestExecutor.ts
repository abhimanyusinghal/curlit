import type { RequestConfig } from '../types';
import { sendRequest } from './http';
import { runPreRequestScript, runTestScript } from './scriptEngine';
import { validateResponseSchemaInBrowser } from './responseSchema.browser';
import { executeRequestWithScripts as execute, type ExecuteContext, type ExecutionRuntime } from './requestExecutorCore';

export type { ExecuteContext, ExecuteOutcome, ExecuteResult, ExecutionRuntime } from './requestExecutorCore';
export { executionError } from './requestExecutorCore';

const browserRuntime: ExecutionRuntime = {
  sendRequest, runPreRequestScript, runTestScript, validateResponseSchema: validateResponseSchemaInBrowser,
};

export function executeRequestWithScripts(request: RequestConfig, context: ExecuteContext, runtime = browserRuntime) {
  return execute(request, context, runtime);
}
