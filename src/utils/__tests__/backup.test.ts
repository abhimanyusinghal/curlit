import { describe, it, expect } from 'vitest';
import {
  BACKUP_VERSION,
  applyBackup,
  createBackup,
  isBackup,
  parseBackup,
  type BackupData,
  type BackupSnapshot,
} from '../backup';
import { createDefaultRequest } from '../../types';
import type { Collection, Environment, HistoryEntry } from '../../types';

function emptySnapshot(): BackupSnapshot {
  return {
    collections: [],
    environments: [],
    activeEnvironmentId: null,
    history: [],
    chainVariables: {},
    theme: 'dark',
  };
}

function sampleCollection(name = 'Col'): Collection {
  return {
    id: crypto.randomUUID(),
    name,
    requests: [createDefaultRequest({ name: 'Req' })],
    createdAt: 1,
    updatedAt: 1,
  };
}

function sampleEnvironment(name = 'Env'): Environment {
  return {
    id: crypto.randomUUID(),
    name,
    variables: [{ id: '1', key: 'host', value: 'api.test', enabled: true }],
    isActive: false,
  };
}

function sampleHistoryEntry(url = 'https://example.com'): HistoryEntry {
  return {
    id: crypto.randomUUID(),
    request: createDefaultRequest({ url }),
    response: null,
    timestamp: Date.now(),
  };
}

// ─── createBackup ────────────────────────────────────────────────────────────

describe('createBackup', () => {
  it('wraps snapshot with versioned envelope', () => {
    const snapshot = emptySnapshot();
    const backup = createBackup(snapshot);
    expect(backup.curlit_backup_version).toBe(BACKUP_VERSION);
    expect(typeof backup.exported_at).toBe('number');
    expect(backup.data).toEqual(snapshot);
  });

  it('includes app version when provided', () => {
    const backup = createBackup(emptySnapshot(), '1.2.3');
    expect(backup.app_version).toBe('1.2.3');
  });
});

// ─── isBackup ────────────────────────────────────────────────────────────────

describe('isBackup', () => {
  it('accepts valid backup', () => {
    const backup = createBackup(emptySnapshot());
    expect(isBackup(backup)).toBe(true);
  });

  it('rejects null/undefined/primitives', () => {
    expect(isBackup(null)).toBe(false);
    expect(isBackup(undefined)).toBe(false);
    expect(isBackup('string')).toBe(false);
    expect(isBackup(42)).toBe(false);
  });

  it('rejects postman-style object', () => {
    expect(isBackup({ info: { name: 'X' }, item: [] })).toBe(false);
  });

  it('rejects object missing required fields', () => {
    expect(isBackup({ curlit_backup_version: 1 })).toBe(false);
    expect(isBackup({ curlit_backup_version: 1, data: {} })).toBe(false);
  });
});

// ─── parseBackup ─────────────────────────────────────────────────────────────

describe('parseBackup', () => {
  it('parses valid backup JSON', () => {
    const backup = createBackup(emptySnapshot());
    const parsed = parseBackup(JSON.stringify(backup));
    expect(parsed.curlit_backup_version).toBe(BACKUP_VERSION);
  });

  it('throws on invalid JSON', () => {
    expect(() => parseBackup('not json')).toThrow();
  });

  it('throws on well-formed JSON that is not a backup', () => {
    expect(() => parseBackup('{"foo":"bar"}')).toThrow(/valid CurlIt backup/);
  });

  it('throws on a future backup version', () => {
    const backup = createBackup(emptySnapshot());
    const future = { ...backup, curlit_backup_version: BACKUP_VERSION + 99 };
    expect(() => parseBackup(JSON.stringify(future))).toThrow(/newer version/);
  });
});

// ─── applyBackup: replace mode ───────────────────────────────────────────────

describe('applyBackup replace mode', () => {
  it('overwrites current snapshot entirely', () => {
    const current: BackupSnapshot = {
      collections: [sampleCollection('Old')],
      environments: [sampleEnvironment('OldEnv')],
      activeEnvironmentId: 'old-id',
      history: [sampleHistoryEntry('https://old.com')],
      chainVariables: { old: 'value' },
      theme: 'light',
    };

    const incomingCol = sampleCollection('New');
    const incomingEnv = sampleEnvironment('NewEnv');
    const backup: BackupData = createBackup({
      collections: [incomingCol],
      environments: [incomingEnv],
      activeEnvironmentId: incomingEnv.id,
      history: [sampleHistoryEntry('https://new.com')],
      chainVariables: { fresh: 'v' },
      theme: 'dark',
    });

    const result = applyBackup(current, backup, 'replace');
    expect(result.collections).toHaveLength(1);
    expect(result.collections[0].name).toBe('New');
    expect(result.environments[0].name).toBe('NewEnv');
    expect(result.activeEnvironmentId).toBe(incomingEnv.id);
    expect(result.history[0].request.url).toBe('https://new.com');
    expect(result.chainVariables).toEqual({ fresh: 'v' });
    expect(result.theme).toBe('dark');
  });

  it('strips pre-request and test scripts from incoming requests', () => {
    const col = sampleCollection();
    col.requests[0].preRequestScript = 'alert(1)';
    col.requests[0].testScript = 'console.log("test")';
    const backup = createBackup({ ...emptySnapshot(), collections: [col] });
    const result = applyBackup(emptySnapshot(), backup, 'replace');
    expect(result.collections[0].requests[0].preRequestScript).toBeUndefined();
    expect(result.collections[0].requests[0].testScript).toBeUndefined();
  });

  it('caps history at 100 entries', () => {
    const manyEntries = Array.from({ length: 150 }, (_, i) => sampleHistoryEntry(`https://e${i}.com`));
    const backup = createBackup({ ...emptySnapshot(), history: manyEntries });
    const result = applyBackup(emptySnapshot(), backup, 'replace');
    expect(result.history).toHaveLength(100);
  });
});

// ─── applyBackup: merge mode ─────────────────────────────────────────────────

describe('applyBackup merge mode', () => {
  it('appends incoming collections with new IDs', () => {
    const existing = sampleCollection('Existing');
    const current: BackupSnapshot = { ...emptySnapshot(), collections: [existing] };
    const incoming = sampleCollection('Incoming');
    const incomingReqId = incoming.requests[0].id;
    const backup = createBackup({ ...emptySnapshot(), collections: [incoming] });

    const result = applyBackup(current, backup, 'merge');
    expect(result.collections).toHaveLength(2);
    expect(result.collections[0].name).toBe('Existing');
    expect(result.collections[1].name).toBe('Incoming');
    expect(result.collections[1].id).not.toBe(incoming.id);
    expect(result.collections[1].requests[0].id).not.toBe(incomingReqId);
  });

  it('appends environments with new IDs and keeps current active env', () => {
    const existing = sampleEnvironment('Existing');
    const current: BackupSnapshot = {
      ...emptySnapshot(),
      environments: [existing],
      activeEnvironmentId: existing.id,
    };
    const incoming = sampleEnvironment('Incoming');
    const backup = createBackup({
      ...emptySnapshot(),
      environments: [incoming],
      activeEnvironmentId: incoming.id,
    });

    const result = applyBackup(current, backup, 'merge');
    expect(result.environments).toHaveLength(2);
    expect(result.environments[1].id).not.toBe(incoming.id);
    expect(result.activeEnvironmentId).toBe(existing.id);
  });

  it('merges history with incoming first, capped at 100', () => {
    const currentEntries = Array.from({ length: 60 }, (_, i) => sampleHistoryEntry(`https://cur${i}.com`));
    const incomingEntries = Array.from({ length: 60 }, (_, i) => sampleHistoryEntry(`https://inc${i}.com`));
    const current: BackupSnapshot = { ...emptySnapshot(), history: currentEntries };
    const backup = createBackup({ ...emptySnapshot(), history: incomingEntries });

    const result = applyBackup(current, backup, 'merge');
    expect(result.history).toHaveLength(100);
    expect(result.history[0].request.url).toBe('https://inc0.com');
  });

  it('merges chain variables with incoming taking precedence', () => {
    const current: BackupSnapshot = {
      ...emptySnapshot(),
      chainVariables: { a: 'old', b: 'keep' },
    };
    const backup = createBackup({
      ...emptySnapshot(),
      chainVariables: { a: 'new', c: 'added' },
    });
    const result = applyBackup(current, backup, 'merge');
    expect(result.chainVariables).toEqual({ a: 'new', b: 'keep', c: 'added' });
  });

  it('preserves current theme in merge mode', () => {
    const current: BackupSnapshot = { ...emptySnapshot(), theme: 'light' };
    const backup = createBackup({ ...emptySnapshot(), theme: 'dark' });
    const result = applyBackup(current, backup, 'merge');
    expect(result.theme).toBe('light');
  });

  it('strips scripts from merged collections', () => {
    const incoming = sampleCollection('With Script');
    incoming.requests[0].preRequestScript = 'alert(1)';
    const backup = createBackup({ ...emptySnapshot(), collections: [incoming] });
    const result = applyBackup(emptySnapshot(), backup, 'merge');
    expect(result.collections[0].requests[0].preRequestScript).toBeUndefined();
  });
});
