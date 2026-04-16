import type { Collection, Environment } from '../types';
import {
  createGist,
  getGist,
  listGists,
  readGistFile,
  updateGist,
  type GistSummary,
} from './github';
import { applyBackup, type BackupSnapshot, type ImportMode } from './backup';

export const SYNC_VERSION = 1;
export const SYNC_FILENAME = 'curlit-sync.json';
export const SYNC_GIST_DESCRIPTION = 'CurlIt sync';

export interface SyncPayload {
  curlit_sync_version: number;
  updated_at: number;
  data: {
    collections: Collection[];
    environments: Environment[];
    activeEnvironmentId: string | null;
  };
}

export interface SyncSnapshot {
  collections: Collection[];
  environments: Environment[];
  activeEnvironmentId: string | null;
}

export function buildPayload(snapshot: SyncSnapshot): SyncPayload {
  return {
    curlit_sync_version: SYNC_VERSION,
    updated_at: Date.now(),
    data: {
      collections: snapshot.collections,
      environments: snapshot.environments,
      activeEnvironmentId: snapshot.activeEnvironmentId,
    },
  };
}

export function isSyncPayload(obj: unknown): obj is SyncPayload {
  if (!obj || typeof obj !== 'object') return false;
  const p = obj as Partial<SyncPayload>;
  if (typeof p.curlit_sync_version !== 'number') return false;
  if (!p.data || typeof p.data !== 'object') return false;
  return Array.isArray(p.data.collections) && Array.isArray(p.data.environments);
}

export function parsePayload(text: string): SyncPayload {
  const parsed = JSON.parse(text);
  if (!isSyncPayload(parsed)) throw new Error('Not a valid CurlIt sync payload');
  if (parsed.curlit_sync_version > SYNC_VERSION) {
    throw new Error(
      `Sync payload was created with a newer version (v${parsed.curlit_sync_version}). Update CurlIt to pull it.`
    );
  }
  return parsed;
}

/**
 * Find the existing curlit-sync gist for the user, or create one. Returns the
 * gist id in both cases. Looking by filename lets a second device converge on
 * the same gist without any extra configuration.
 */
export async function ensureGist(token: string): Promise<string> {
  const gists = await listGists(token);
  const existing = gists.find(g => SYNC_FILENAME in g.files);
  if (existing) return existing.id;

  const empty = buildPayload({ collections: [], environments: [], activeEnvironmentId: null });
  const created = await createGist(
    token,
    SYNC_FILENAME,
    JSON.stringify(empty, null, 2),
    SYNC_GIST_DESCRIPTION,
    false
  );
  return created.id;
}

export async function pushToCloud(token: string, gistId: string, snapshot: SyncSnapshot): Promise<SyncPayload> {
  const payload = buildPayload(snapshot);
  await updateGist(token, gistId, SYNC_FILENAME, JSON.stringify(payload, null, 2));
  return payload;
}

export async function pullFromCloud(token: string, gistId: string): Promise<SyncPayload> {
  const gist: GistSummary = await getGist(token, gistId);
  const raw = readGistFile(gist, SYNC_FILENAME);
  if (raw == null) throw new Error(`Gist is missing ${SYNC_FILENAME}`);
  return parsePayload(raw);
}

/**
 * Apply a pulled sync payload to a caller-supplied current snapshot. Reuses
 * applyBackup so merge/replace semantics (fresh UUIDs on merge, script
 * stripping) stay identical to Backup & Restore. Returns the new collection +
 * environment lists plus the active env id; the caller is responsible for
 * writing these into the store and touching localStorage.
 */
export function applySyncPayload(
  current: SyncSnapshot,
  payload: SyncPayload,
  mode: ImportMode
): SyncSnapshot {
  const currentBackup: BackupSnapshot = {
    collections: current.collections,
    environments: current.environments,
    activeEnvironmentId: current.activeEnvironmentId,
    history: [],
    chainVariables: {},
    theme: 'dark',
  };
  const incomingBackup = {
    curlit_backup_version: 1,
    exported_at: payload.updated_at,
    data: {
      collections: payload.data.collections,
      environments: payload.data.environments,
      activeEnvironmentId: payload.data.activeEnvironmentId,
      history: [],
      chainVariables: {},
      theme: 'dark' as const,
    },
  };
  const merged = applyBackup(currentBackup, incomingBackup, mode);
  return {
    collections: merged.collections,
    environments: merged.environments,
    activeEnvironmentId: merged.activeEnvironmentId,
  };
}
