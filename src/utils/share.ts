import type { RequestConfig, FormDataEntry } from '../types';

export const SHARE_VERSION = 1;

export interface SharePayload {
  v: number;
  request: RequestConfig;
  includesSecrets: boolean;
}

export interface ShareOptions {
  includeSecrets: boolean;
}

function base64UrlEncode(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(b64url: string): string {
  const pad = '='.repeat((4 - (b64url.length % 4)) % 4);
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/') + pad;
  const binary = atob(b64);
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/**
 * Strip everything a share link should never carry by default: auth credentials
 * and pre-request/test scripts.
 */
function stripSecrets(request: RequestConfig): RequestConfig {
  const cleaned: RequestConfig = { ...request, auth: { type: 'none' } };
  delete cleaned.preRequestScript;
  delete cleaned.testScript;
  return cleaned;
}

/**
 * File references are in-memory only and cannot survive a share link. Convert
 * file entries to empty text entries so the recipient sees the field with a
 * note to re-attach rather than a dangling reference.
 */
function stripFormDataFiles(request: RequestConfig): RequestConfig {
  if (request.body.type !== 'form-data') return request;
  const sanitized: FormDataEntry[] = request.body.formData.map(entry => {
    if (entry.valueType !== 'file') return entry;
    return {
      id: entry.id,
      key: entry.key,
      value: '',
      enabled: entry.enabled,
      description: entry.description,
      valueType: 'text',
    };
  });
  return {
    ...request,
    body: { ...request.body, formData: sanitized },
  };
}

export function encodeRequest(request: RequestConfig, options: ShareOptions): string {
  const withoutFiles = stripFormDataFiles(request);
  const cleaned = options.includeSecrets ? withoutFiles : stripSecrets(withoutFiles);
  const payload: SharePayload = {
    v: SHARE_VERSION,
    request: cleaned,
    includesSecrets: options.includeSecrets,
  };
  return base64UrlEncode(JSON.stringify(payload));
}

export function buildShareUrl(origin: string, encoded: string): string {
  return `${origin}/#share=${encoded}`;
}

export function decodePayload(encoded: string): SharePayload {
  let json: string;
  try {
    json = base64UrlDecode(encoded);
  } catch {
    throw new Error('Share link is malformed');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('Share link contains invalid data');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Share link contains invalid data');
  }
  const p = parsed as Partial<SharePayload>;
  if (typeof p.v !== 'number') {
    throw new Error('Share link contains invalid data');
  }
  if (p.v > SHARE_VERSION) {
    throw new Error(`Share link was created with a newer version (v${p.v}). Update CurlIt to open it.`);
  }
  if (!p.request || typeof p.request !== 'object') {
    throw new Error('Share link contains invalid data');
  }
  return p as SharePayload;
}

/**
 * Return overrides to pass to addTab when opening a shared request. Always
 * drop pre-request/test scripts on the import side (belt-and-braces — the
 * sender should have stripped them, but we defend against hand-crafted links).
 */
export function sharedRequestToTabSeed(payload: SharePayload): Partial<RequestConfig> {
  const { preRequestScript: _pre, testScript: _test, id: _id, ...rest } = payload.request;
  return { ...rest, name: rest.name || 'Shared Request' };
}

function clearShareHash(): void {
  history.replaceState(null, '', window.location.pathname + window.location.search);
}

/**
 * Extract a share payload from the current URL hash, or null if no share is present.
 * On success or failure, clears the hash so a refresh doesn't re-import.
 */
export function readShareFromLocation(): SharePayload | null {
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash;
  if (!hash.startsWith('#share=')) return null;
  const encoded = hash.slice('#share='.length);
  try {
    const payload = decodePayload(encoded);
    clearShareHash();
    return payload;
  } catch {
    clearShareHash();
    throw new Error('This share link could not be opened');
  }
}
