import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  SHARE_VERSION,
  buildShareUrl,
  decodePayload,
  encodeRequest,
  readShareFromLocation,
  sharedRequestToTabSeed,
} from '../share';
import { createDefaultRequest, createFormDataEntry } from '../../types';
import type { RequestConfig } from '../../types';

function requestWithEverything(): RequestConfig {
  return createDefaultRequest({
    name: 'Full Request',
    method: 'POST',
    url: 'https://api.example.com/users',
    params: [{ id: 'p1', key: 'q', value: 'search', enabled: true }],
    headers: [{ id: 'h1', key: 'X-Trace', value: '123', enabled: true }],
    body: { type: 'json', raw: '{"name":"alice"}', formData: [], urlencoded: [] },
    auth: { type: 'bearer', bearer: { token: 'secret-token' } },
    preRequestScript: 'pm.env.set("x", 1)',
    testScript: 'pm.expect(res.status).toBe(200)',
  });
}

// ─── encode/decode round-trip ────────────────────────────────────────────────

describe('encodeRequest / decodePayload', () => {
  it('round-trips a request', () => {
    const req = createDefaultRequest({ name: 'Simple', url: 'https://example.com' });
    const encoded = encodeRequest(req, { includeSecrets: false });
    const payload = decodePayload(encoded);
    expect(payload.v).toBe(SHARE_VERSION);
    expect(payload.request.url).toBe('https://example.com');
  });

  it('handles unicode in request body', () => {
    const req = createDefaultRequest({
      body: { type: 'json', raw: '{"name":"こんにちは 👋"}', formData: [], urlencoded: [] },
    });
    const encoded = encodeRequest(req, { includeSecrets: false });
    const payload = decodePayload(encoded);
    expect(payload.request.body.raw).toBe('{"name":"こんにちは 👋"}');
  });

  it('produces URL-safe output (no +, /, or = padding)', () => {
    // Body crafted to produce padding-requiring output
    const req = createDefaultRequest({ url: 'a'.repeat(50) });
    const encoded = encodeRequest(req, { includeSecrets: false });
    expect(encoded).not.toMatch(/[+/=]/);
  });
});

// ─── includeSecrets: false (default) ─────────────────────────────────────────

describe('encodeRequest with includeSecrets=false', () => {
  it('strips auth, preRequestScript, and testScript', () => {
    const encoded = encodeRequest(requestWithEverything(), { includeSecrets: false });
    const payload = decodePayload(encoded);
    expect(payload.request.auth).toEqual({ type: 'none' });
    expect(payload.request.preRequestScript).toBeUndefined();
    expect(payload.request.testScript).toBeUndefined();
    expect(payload.includesSecrets).toBe(false);
  });

  it('leaves non-secret fields intact', () => {
    const encoded = encodeRequest(requestWithEverything(), { includeSecrets: false });
    const payload = decodePayload(encoded);
    expect(payload.request.url).toBe('https://api.example.com/users');
    expect(payload.request.headers[0].key).toBe('X-Trace');
    expect(payload.request.body.raw).toBe('{"name":"alice"}');
  });
});

// ─── includeSecrets: true (opt-in) ───────────────────────────────────────────

describe('encodeRequest with includeSecrets=true', () => {
  it('keeps auth, preRequestScript, and testScript', () => {
    const encoded = encodeRequest(requestWithEverything(), { includeSecrets: true });
    const payload = decodePayload(encoded);
    expect(payload.request.auth.type).toBe('bearer');
    expect(payload.request.auth.bearer?.token).toBe('secret-token');
    expect(payload.request.preRequestScript).toBe('pm.env.set("x", 1)');
    expect(payload.request.testScript).toBe('pm.expect(res.status).toBe(200)');
    expect(payload.includesSecrets).toBe(true);
  });
});

// ─── form-data file stripping (always) ───────────────────────────────────────

describe('encodeRequest with form-data files', () => {
  it('converts file entries to empty text entries even when includeSecrets=true', () => {
    const req = createDefaultRequest({
      body: {
        type: 'form-data',
        raw: '',
        formData: [
          createFormDataEntry({ key: 'avatar', valueType: 'file', fileName: 'p.png', fileSize: 100, fileType: 'image/png' }),
          createFormDataEntry({ key: 'note', value: 'hi', valueType: 'text' }),
        ],
        urlencoded: [],
      },
    });
    const encoded = encodeRequest(req, { includeSecrets: true });
    const payload = decodePayload(encoded);
    const entries = payload.request.body.formData;
    expect(entries[0].valueType).toBe('text');
    expect(entries[0].value).toBe('');
    expect(entries[0].fileName).toBeUndefined();
    expect(entries[1].valueType).toBe('text');
    expect(entries[1].value).toBe('hi');
  });
});

// ─── decodePayload validation ────────────────────────────────────────────────

describe('decodePayload', () => {
  it('throws on malformed base64', () => {
    expect(() => decodePayload('!!!not-base64!!!')).toThrow(/malformed|invalid data/);
  });

  it('throws on valid base64 that is not JSON', () => {
    const encoded = btoa('not json').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(() => decodePayload(encoded)).toThrow(/invalid data/);
  });

  it('throws on payload missing version', () => {
    const bad = btoa(JSON.stringify({ request: {} })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(() => decodePayload(bad)).toThrow(/invalid data/);
  });

  it('throws on payload from a newer version', () => {
    const payload = { v: SHARE_VERSION + 99, request: createDefaultRequest(), includesSecrets: false };
    const enc = btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(() => decodePayload(enc)).toThrow(/newer version/);
  });
});

// ─── buildShareUrl ───────────────────────────────────────────────────────────

describe('buildShareUrl', () => {
  it('formats origin + hash correctly', () => {
    const url = buildShareUrl('https://curlit.app', 'abc123');
    expect(url).toBe('https://curlit.app/#share=abc123');
  });
});

// ─── sharedRequestToTabSeed ──────────────────────────────────────────────────

describe('sharedRequestToTabSeed', () => {
  it('drops scripts and id from incoming payload', () => {
    const encoded = encodeRequest(requestWithEverything(), { includeSecrets: true });
    const payload = decodePayload(encoded);
    const seed = sharedRequestToTabSeed(payload);
    // Scripts always stripped on import, even when sender opted in
    expect(seed.preRequestScript).toBeUndefined();
    expect(seed.testScript).toBeUndefined();
    expect(seed.id).toBeUndefined();
    // Non-secret fields preserved
    expect(seed.url).toBe('https://api.example.com/users');
  });

  it('falls back to "Shared Request" when name is empty', () => {
    const req = createDefaultRequest({ name: '' });
    const encoded = encodeRequest(req, { includeSecrets: false });
    const payload = decodePayload(encoded);
    expect(sharedRequestToTabSeed(payload).name).toBe('Shared Request');
  });
});

// ─── readShareFromLocation ───────────────────────────────────────────────────

describe('readShareFromLocation', () => {
  const originalHash = window.location.hash;

  beforeEach(() => {
    history.replaceState(null, '', window.location.pathname);
  });

  afterEach(() => {
    history.replaceState(null, '', window.location.pathname + originalHash);
  });

  it('returns null when no share hash is present', () => {
    expect(readShareFromLocation()).toBeNull();
  });

  it('decodes a valid share hash and clears it', () => {
    const req = createDefaultRequest({ url: 'https://shared.com' });
    const encoded = encodeRequest(req, { includeSecrets: false });
    history.replaceState(null, '', `${window.location.pathname}#share=${encoded}`);

    const payload = readShareFromLocation();
    expect(payload).not.toBeNull();
    expect(payload!.request.url).toBe('https://shared.com');
    expect(window.location.hash).toBe('');
  });

  it('throws and clears the hash when the share is malformed', () => {
    history.replaceState(null, '', `${window.location.pathname}#share=!!!garbage!!!`);
    expect(() => readShareFromLocation()).toThrow();
    expect(window.location.hash).toBe('');
  });
});
