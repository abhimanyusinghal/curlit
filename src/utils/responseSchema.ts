import Ajv, { type ErrorObject } from 'ajv';
import addFormats from 'ajv-formats';
import type { TestResult } from '../types';
import { MAX_RESPONSE_SCHEMA_LENGTH, RESPONSE_SCHEMA_DRAFT, schemaValidationError, type SchemaValidationResult } from './responseSchemaConfig';

const MAX_REPORTED_ERRORS = 25;

function pointerToken(value: string): string {
  return value.replace(/~/g, '~0').replace(/\//g, '~1');
}

function assertion(error: ErrorObject): TestResult {
  let path = error.instancePath;
  // Ajv reports missing/extra keys on the parent object; point to the actual field.
  if (error.keyword === 'required') path += `/${pointerToken(String(error.params.missingProperty))}`;
  if (error.keyword === 'additionalProperties') path += `/${pointerToken(String(error.params.additionalProperty))}`;
  return { name: `Response schema: ${path || '/'}`, passed: false, error: error.message || 'Schema constraint failed' };
}

/** Runs in a disposable worker in both the UI and CLI. No schema/network loading. */
export function validateResponseSchema(schemaText: string, body: string): SchemaValidationResult {
  if (schemaText.length > MAX_RESPONSE_SCHEMA_LENGTH) return schemaValidationError('Response schema exceeds the 100,000 character limit');
  if (!schemaText.trim()) return schemaValidationError('Response schema is enabled but empty. Add a JSON Schema or disable validation.');
  let schema: unknown;
  try { schema = JSON.parse(schemaText); }
  catch { return schemaValidationError('Response schema is not valid JSON'); }
  if (typeof schema !== 'boolean' && (!schema || typeof schema !== 'object' || Array.isArray(schema))) {
    return schemaValidationError('Response schema must be a JSON object or boolean');
  }
  if (typeof schema === 'object' && schema !== null) {
    const dialect = (schema as { $schema?: unknown }).$schema;
    if (dialect !== undefined && (typeof dialect !== 'string' || !/^https?:\/\/json-schema\.org\/draft-07\/schema#?$/.test(dialect))) {
      return schemaValidationError('Unsupported response schema dialect. Use JSON Schema draft-07.');
    }
    if (dialect !== undefined) (schema as { $schema: string }).$schema = RESPONSE_SCHEMA_DRAFT;
  }

  try {
    const ajv = new Ajv({
      allErrors: true, strictSchema: true, strictTypes: false, strictTuples: false,
      strictRequired: false, logger: false, ownProperties: true,
      coerceTypes: false, useDefaults: false, removeAdditional: false,
    });
    addFormats(ajv);
    const validate = ajv.compile(schema as object | boolean);
    if ('$async' in validate && validate.$async) return schemaValidationError('Asynchronous response schemas are not supported');
    let data: unknown;
    try { data = JSON.parse(body); }
    catch { return { outcome: 'failed', tests: [{ name: 'Response schema', passed: false, error: 'Response body is not valid JSON (or is empty)' }] }; }
    if (validate(data)) return { outcome: 'passed', tests: [{ name: 'Response schema', passed: true }] };
    const errors = validate.errors ?? [];
    const tests = errors.slice(0, MAX_REPORTED_ERRORS).map(assertion);
    if (errors.length > MAX_REPORTED_ERRORS) {
      tests.push({ name: 'Response schema', passed: false, error: `${errors.length - MAX_REPORTED_ERRORS} more validation errors omitted` });
    }
    return { outcome: 'failed', tests };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return schemaValidationError(`Invalid response schema: ${message}`);
  }
}
