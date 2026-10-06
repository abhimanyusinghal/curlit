import type { ResponseSchemaConfig, TestResult } from '../types';

export const RESPONSE_SCHEMA_TIMEOUT_MS = 2_000;
export const MAX_RESPONSE_SCHEMA_LENGTH = 100_000;
export const RESPONSE_SCHEMA_DRAFT = 'http://json-schema.org/draft-07/schema#';

export interface SchemaValidationResult {
  outcome: 'passed' | 'failed' | 'error';
  tests: TestResult[];
  error?: string;
}

/** Used by CLI imports and the executor, including restored collection data. */
export function parseResponseSchemaConfig(value: unknown): ResponseSchemaConfig | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('responseSchema must be an object with enabled and schema fields');
  }
  const config = value as Partial<ResponseSchemaConfig>;
  if (typeof config.enabled !== 'boolean' || typeof config.schema !== 'string') {
    throw new Error('responseSchema.enabled must be a boolean and responseSchema.schema must be a string');
  }
  return { enabled: config.enabled, schema: config.schema };
}

export function schemaValidationError(message: string): SchemaValidationResult {
  return { outcome: 'error', tests: [{ name: 'Response schema', passed: false, error: message }], error: message };
}
