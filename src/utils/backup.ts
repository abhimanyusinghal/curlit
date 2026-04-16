import type { Collection, Environment, HistoryEntry, RequestConfig } from '../types';
import type { Theme } from '../store';

export const BACKUP_VERSION = 1;

export interface BackupData {
  curlit_backup_version: number;
  exported_at: number;
  app_version?: string;
  data: {
    collections: Collection[];
    environments: Environment[];
    activeEnvironmentId: string | null;
    history: HistoryEntry[];
    chainVariables: Record<string, string>;
    theme: Theme;
  };
}

export interface BackupSnapshot {
  collections: Collection[];
  environments: Environment[];
  activeEnvironmentId: string | null;
  history: HistoryEntry[];
  chainVariables: Record<string, string>;
  theme: Theme;
}

export function createBackup(snapshot: BackupSnapshot, appVersion?: string): BackupData {
  return {
    curlit_backup_version: BACKUP_VERSION,
    exported_at: Date.now(),
    app_version: appVersion,
    data: {
      collections: snapshot.collections,
      environments: snapshot.environments,
      activeEnvironmentId: snapshot.activeEnvironmentId,
      history: snapshot.history,
      chainVariables: snapshot.chainVariables,
      theme: snapshot.theme,
    },
  };
}

export function isBackup(obj: unknown): obj is BackupData {
  if (!obj || typeof obj !== 'object') return false;
  const b = obj as Partial<BackupData>;
  if (typeof b.curlit_backup_version !== 'number') return false;
  if (!b.data || typeof b.data !== 'object') return false;
  const d = b.data;
  return (
    Array.isArray(d.collections) &&
    Array.isArray(d.environments) &&
    Array.isArray(d.history) &&
    typeof d.chainVariables === 'object' &&
    d.chainVariables !== null
  );
}

export function parseBackup(text: string): BackupData {
  const parsed = JSON.parse(text);
  if (!isBackup(parsed)) {
    throw new Error('Not a valid CurlIt backup file');
  }
  if (parsed.curlit_backup_version > BACKUP_VERSION) {
    throw new Error(
      `Backup was created with a newer version (v${parsed.curlit_backup_version}). Update CurlIt to import it.`
    );
  }
  return parsed;
}

/** Strip pre-request/test scripts from requests to prevent code execution from untrusted backups. */
function stripScripts(request: RequestConfig): RequestConfig {
  const cleaned = { ...request };
  delete cleaned.preRequestScript;
  delete cleaned.testScript;
  return cleaned;
}

function sanitizeCollections(collections: Collection[]): Collection[] {
  return collections.map(c => ({ ...c, requests: c.requests.map(stripScripts) }));
}

export type ImportMode = 'replace' | 'merge';

/**
 * Compute the new snapshot after applying a backup to the current state.
 * In 'replace' mode, existing data is discarded. In 'merge' mode, incoming
 * collections/environments get fresh IDs so they do not collide with existing ones.
 */
export function applyBackup(
  current: BackupSnapshot,
  backup: BackupData,
  mode: ImportMode
): BackupSnapshot {
  const incoming = backup.data;
  const safeCollections = sanitizeCollections(incoming.collections);

  if (mode === 'replace') {
    return {
      collections: safeCollections,
      environments: incoming.environments,
      activeEnvironmentId: incoming.activeEnvironmentId ?? null,
      history: incoming.history.slice(0, 100),
      chainVariables: { ...incoming.chainVariables },
      theme: incoming.theme || current.theme,
    };
  }

  // Merge mode: regenerate IDs on incoming collections/environments to avoid collisions.
  const mergedCollections: Collection[] = [
    ...current.collections,
    ...safeCollections.map(c => ({
      ...c,
      id: crypto.randomUUID(),
      requests: c.requests.map(r => ({ ...r, id: crypto.randomUUID() })),
    })),
  ];

  const mergedEnvironments: Environment[] = [
    ...current.environments,
    ...incoming.environments.map(e => ({ ...e, id: crypto.randomUUID() })),
  ];

  const mergedHistory = [...incoming.history, ...current.history].slice(0, 100);

  return {
    collections: mergedCollections,
    environments: mergedEnvironments,
    activeEnvironmentId: current.activeEnvironmentId,
    history: mergedHistory,
    chainVariables: { ...current.chainVariables, ...incoming.chainVariables },
    theme: current.theme,
  };
}

export function downloadBackup(backup: BackupData, filename?: string): void {
  const data = JSON.stringify(backup, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const date = new Date(backup.exported_at).toISOString().split('T')[0];
  a.download = filename || `curlit-backup-${date}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
