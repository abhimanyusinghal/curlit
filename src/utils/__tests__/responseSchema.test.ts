import { describe, expect, it } from 'vitest';
import { validateResponseSchema } from '../responseSchema';

function validate(schema: unknown, data: unknown) {
  return validateResponseSchema(JSON.stringify(schema), JSON.stringify(data));
}

describe('response schema validation', () => {
  it('accepts draft-07 objects, arrays, nullable values, references and formats', () => {
    const schema = {
      $schema: 'https://json-schema.org/draft-07/schema',
      type: 'object', required: ['users'], additionalProperties: false,
      properties: { users: { type: 'array', minItems: 1, uniqueItems: true, items: { $ref: '#/definitions/user' } } },
      definitions: { user: { type: 'object', required: ['id', 'email'], properties: { id: { type: 'integer', minimum: 1 }, email: { type: 'string', format: 'email' }, name: { type: ['string', 'null'] } } } },
    };
    expect(validate(schema, { users: [{ id: 1, email: 'user@example.com', name: null }] })).toEqual({ outcome: 'passed', tests: [{ name: 'Response schema', passed: true }] });
  });

  it('returns field and array paths for every failed constraint without echoing values', () => {
    const result = validate({ type: 'object', required: ['id'], additionalProperties: false, properties: { users: { type: 'array', items: { type: 'object', properties: { email: { type: 'string', format: 'email' } } } } } },
      { 'a/b~c': 'private-extra-value', users: [{ email: 'private-invalid-email' }] });
    expect(result.outcome).toBe('failed');
    expect(result.tests.map(test => test.name)).toEqual(expect.arrayContaining(['Response schema: /id', 'Response schema: /a~1b~0c', 'Response schema: /users/0/email']));
    expect(JSON.stringify(result)).not.toContain('private-');
  });

  it('does not coerce types, populate defaults or remove unexpected properties', () => {
    const result = validate({ type: 'object', required: ['name'], additionalProperties: false, properties: { id: { type: 'integer' }, name: { type: 'string', default: 'default' } } }, { id: '12', extra: true });
    expect(result.outcome).toBe('failed');
    expect(result.tests.map(test => test.name)).toEqual(expect.arrayContaining(['Response schema: /id', 'Response schema: /name', 'Response schema: /extra']));
  });

  it('supports boolean schemas and composition constraints', () => {
    expect(validate(true, null).outcome).toBe('passed');
    expect(validate(false, {}).outcome).toBe('failed');
    expect(validate({ oneOf: [{ type: 'number', maximum: 3 }, { type: 'string', minLength: 5, pattern: '^hello' }] }, 8).outcome).toBe('failed');
    expect(validate({ enum: ['active', 'inactive'] }, 'active').outcome).toBe('passed');
  });

  it.each([
    ['', 'enabled but empty'], ['{', 'not valid JSON'], ['null', 'object or boolean'], ['[]', 'object or boolean'],
    ['{"type":"wrong"}', 'Invalid response schema'], ['{"typo":true}', 'Invalid response schema'],
    ['{"type":"string","format":"made-up"}', 'Invalid response schema'],
    ['{"$schema":"https://json-schema.org/draft/2020-12/schema"}', 'Unsupported response schema dialect'],
    ['{"$ref":"#/definitions/missing"}', 'Invalid response schema'],
    ['{"$ref":"https://example.invalid/remote.json"}', 'Invalid response schema'],
    ['{"$async":true}', 'Asynchronous response schemas'],
  ])('reports a configuration error for schema %s', (schema, message) => {
    const result = validateResponseSchema(schema, '{}');
    expect(result.outcome).toBe('error');
    expect(result.error).toContain(message);
    expect(result.tests[0].passed).toBe(false);
  });

  it.each(['', '<html>private-body</html>', '{"invalid":private-value}'])('fails non-JSON or empty responses without leaking their contents', body => {
    const result = validateResponseSchema('{}', body);
    expect(result.outcome).toBe('failed');
    expect(result.tests[0].error).toContain('Response body is not valid JSON');
    expect(JSON.stringify(result)).not.toContain('private');
  });

  it('bounds schema size and the number of reported errors', () => {
    expect(validateResponseSchema(' '.repeat(100_001), '{}').outcome).toBe('error');
    const result = validate({ type: 'array', items: { type: 'integer' } }, Array(30).fill('wrong'));
    expect(result.tests).toHaveLength(26);
    expect(result.tests.at(-1)?.error).toBe('5 more validation errors omitted');
  });
});
