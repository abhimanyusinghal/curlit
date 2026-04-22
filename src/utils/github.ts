/**
 * Low-level GitHub API helpers for the cloud sync feature. Keeps network
 * details isolated so src/utils/sync.ts can focus on orchestration.
 *
 * Device flow requests go through our Express proxy (/api/github/*) so the
 * OAuth client_id stays server-side and matches the existing /api/oauth/token
 * pattern. Gist API calls talk directly to api.github.com since it supports
 * CORS with a user-held access token.
 */

import { proxyUrl } from './proxyConfig';

// ─── Device flow ─────────────────────────────────────────────────────────────

export interface DeviceCode {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  interval: number;
  expiresIn: number;
}

export type DevicePollResult =
  | { status: 'pending' }
  | { status: 'slow_down'; intervalHint?: number }
  | { status: 'ok'; accessToken: string }
  | { status: 'expired' }
  | { status: 'denied' }
  | { status: 'error'; message: string };

export async function fetchSyncStatus(): Promise<{ configured: boolean }> {
  const res = await fetch(proxyUrl('/api/github/status'));
  if (!res.ok) return { configured: false };
  return res.json();
}

export async function requestDeviceCode(): Promise<DeviceCode> {
  const res = await fetch(proxyUrl('/api/github/device-code'), { method: 'POST' });
  const data = await res.json();
  if (!res.ok || !data.device_code) {
    throw new Error(data.error || 'Could not start GitHub sign-in');
  }
  return {
    deviceCode: data.device_code,
    userCode: data.user_code,
    verificationUri: data.verification_uri,
    interval: data.interval ?? 5,
    expiresIn: data.expires_in ?? 900,
  };
}

export async function pollDeviceToken(deviceCode: string): Promise<DevicePollResult> {
  const res = await fetch(proxyUrl('/api/github/device-token'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceCode }),
  });
  const data = await res.json();

  if (data.access_token) return { status: 'ok', accessToken: data.access_token };

  switch (data.error) {
    case 'authorization_pending':
      return { status: 'pending' };
    case 'slow_down':
      return { status: 'slow_down', intervalHint: data.interval };
    case 'expired_token':
      return { status: 'expired' };
    case 'access_denied':
      return { status: 'denied' };
    default:
      return { status: 'error', message: data.error_description || data.error || 'Sign-in failed' };
  }
}

// ─── Gist API (direct) ───────────────────────────────────────────────────────

const GIST_API = 'https://api.github.com';

export interface GistFile {
  filename: string;
  content: string;
  raw_url?: string;
  size?: number;
  truncated?: boolean;
}

export interface GistSummary {
  id: string;
  description: string | null;
  files: Record<string, GistFile>;
  updated_at: string;
}

function authHeaders(token: string): Record<string, string> {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

async function githubJson<T>(url: string, token: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { ...authHeaders(token), ...(init.headers as Record<string, string> | undefined) },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`GitHub ${res.status}: ${detail.slice(0, 200) || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export async function getAuthenticatedUser(token: string): Promise<{ login: string }> {
  return githubJson<{ login: string }>(`${GIST_API}/user`, token);
}

/** Lists the authenticated user's gists (paginated, but the first page is enough for our match-by-filename use). */
export async function listGists(token: string): Promise<GistSummary[]> {
  return githubJson<GistSummary[]>(`${GIST_API}/gists?per_page=100`, token);
}

export async function getGist(token: string, id: string): Promise<GistSummary> {
  return githubJson<GistSummary>(`${GIST_API}/gists/${id}`, token);
}

export async function createGist(
  token: string,
  filename: string,
  content: string,
  description: string,
  isPublic: boolean
): Promise<GistSummary> {
  return githubJson<GistSummary>(`${GIST_API}/gists`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      description,
      public: isPublic,
      files: { [filename]: { content } },
    }),
  });
}

export async function updateGist(
  token: string,
  id: string,
  filename: string,
  content: string
): Promise<GistSummary> {
  return githubJson<GistSummary>(`${GIST_API}/gists/${id}`, token, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ files: { [filename]: { content } } }),
  });
}

/** Extract content for a given filename from a gist response. Returns null if the file is missing or truncated beyond reach. */
export function readGistFile(gist: GistSummary, filename: string): string | null {
  const file = gist.files[filename];
  if (!file) return null;
  return file.content ?? null;
}
