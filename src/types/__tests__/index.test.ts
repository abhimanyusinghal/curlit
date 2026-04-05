import { describe, it, expect } from 'vitest';
import { createDefaultRequest, createKeyValuePair } from '../index';

describe('createDefaultRequest', () => {
  it('creates a request with default values', () => {
    const req = createDefaultRequest();
    expect(req.id).toBeTruthy();
    expect(req.name).toBe('New Request');
    expect(req.method).toBe('GET');
    expect(req.url).toBe('');
    expect(req.params).toEqual([]);
    expect(req.headers).toEqual([]);
    expect(req.body).toEqual({ type: 'none', raw: '', formData: [], urlencoded: [] });
    expect(req.auth).toEqual({ type: 'none' });
  });

  it('applies overrides', () => {
    const req = createDefaultRequest({ name: 'My Request', method: 'POST', url: 'https://example.com' });
    expect(req.name).toBe('My Request');
    expect(req.method).toBe('POST');
    expect(req.url).toBe('https://example.com');
  });

  it('generates unique IDs', () => {
    const a = createDefaultRequest();
    const b = createDefaultRequest();
    expect(a.id).not.toBe(b.id);
  });
});

describe('createKeyValuePair', () => {
  it('creates a pair with default values', () => {
    const pair = createKeyValuePair();
    expect(pair.id).toBeTruthy();
    expect(pair.key).toBe('');
    expect(pair.value).toBe('');
    expect(pair.enabled).toBe(true);
  });

  it('applies overrides', () => {
    const pair = createKeyValuePair({ key: 'Content-Type', value: 'application/json', enabled: false });
    expect(pair.key).toBe('Content-Type');
    expect(pair.value).toBe('application/json');
    expect(pair.enabled).toBe(false);
  });
});
