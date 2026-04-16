import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  SYNC_FILENAME,
  SYNC_VERSION,
  applySyncPayload,
  buildPayload,
  ensureGist,
  isSyncPayload,
  parsePayload,
  pullFromCloud,
  pushToCloud,
  type SyncPayload,
  type SyncSnapshot,
} from '../sync';
import { createDefaultRequest } from '../../types';
import type { Collection, Environment } from '../../types';
import * as github from '../github';

// ─── buildPayload ────────────────────────────────────────────────────────────

describe('buildPayload', () => {
  it('wraps snapshot in versioned envelope', () => {
    const snapshot: SyncSnapshot = {
      collections: [],
      environments: [],
      activeEnvironmentId: 'env-1',
    };
    const payload = buildPayload(snapshot);
    expect(payload.curlit_sync_version).toBe(SYNC_VERSION);
    expect(typeof payload.updated_at).toBe('number');
    expect(payload.data.activeEnvironmentId).toBe('env-1');
  });

  it('omits history, chain vars, theme — only syncs collections + envs + active env id', () => {
    const payload = buildPayload({
      collections: [],
      environments: [],
      activeEnvironmentId: null,
    });
    expect(Object.keys(payload.data).sort()).toEqual(['activeEnvironmentId', 'collections', 'environments']);
  });
});

// ─── isSyncPayload ───────────────────────────────────────────────────────────

describe('isSyncPayload', () => {
  it('accepts a valid payload', () => {
    expect(isSyncPayload(buildPayload({ collections: [], environments: [], activeEnvironmentId: null }))).toBe(true);
  });

  it('rejects a backup payload (wrong version key)', () => {
    expect(isSyncPayload({ curlit_backup_version: 1, data: {} })).toBe(false);
  });

  it('rejects null/primitives', () => {
    expect(isSyncPayload(null)).toBe(false);
    expect(isSyncPayload(42)).toBe(false);
    expect(isSyncPayload('string')).toBe(false);
  });
});

// ─── parsePayload ────────────────────────────────────────────────────────────

describe('parsePayload', () => {
  it('parses valid JSON payload', () => {
    const payload = buildPayload({ collections: [], environments: [], activeEnvironmentId: null });
    const parsed = parsePayload(JSON.stringify(payload));
    expect(parsed.curlit_sync_version).toBe(SYNC_VERSION);
  });

  it('throws on non-sync JSON', () => {
    expect(() => parsePayload('{"foo":"bar"}')).toThrow(/valid CurlIt sync/);
  });

  it('throws on future version', () => {
    const payload = buildPayload({ collections: [], environments: [], activeEnvironmentId: null });
    payload.curlit_sync_version = SYNC_VERSION + 99;
    expect(() => parsePayload(JSON.stringify(payload))).toThrow(/newer version/);
  });
});

// ─── ensureGist ──────────────────────────────────────────────────────────────

describe('ensureGist', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the id of an existing gist matching the sync filename', async () => {
    vi.spyOn(github, 'listGists').mockResolvedValue([
      { id: 'g-other', description: null, files: { 'other.md': { filename: 'other.md', content: '' } }, updated_at: '' },
      {
        id: 'g-sync',
        description: 'CurlIt sync',
        files: { [SYNC_FILENAME]: { filename: SYNC_FILENAME, content: '{}' } },
        updated_at: '',
      },
    ]);
    const createSpy = vi.spyOn(github, 'createGist');
    const id = await ensureGist('token');
    expect(id).toBe('g-sync');
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('creates a new private gist when none match', async () => {
    vi.spyOn(github, 'listGists').mockResolvedValue([]);
    const createSpy = vi.spyOn(github, 'createGist').mockResolvedValue({
      id: 'g-new',
      description: 'CurlIt sync',
      files: {},
      updated_at: '',
    });
    const id = await ensureGist('token');
    expect(id).toBe('g-new');
    expect(createSpy).toHaveBeenCalledWith(
      'token',
      SYNC_FILENAME,
      expect.stringContaining('curlit_sync_version'),
      'CurlIt sync',
      false, // private
    );
  });
});

// ─── pushToCloud ─────────────────────────────────────────────────────────────

describe('pushToCloud', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes a payload built from the snapshot and returns it', async () => {
    const updateSpy = vi.spyOn(github, 'updateGist').mockResolvedValue({
      id: 'g1',
      description: null,
      files: {},
      updated_at: '',
    });

    const collection: Collection = {
      id: 'c1',
      name: 'Col',
      requests: [createDefaultRequest({ name: 'Req' })],
      createdAt: 1,
      updatedAt: 1,
    };
    const environment: Environment = { id: 'e1', name: 'Env', variables: [], isActive: false };

    const payload = await pushToCloud('token', 'g1', {
      collections: [collection],
      environments: [environment],
      activeEnvironmentId: 'e1',
    });

    expect(payload.data.collections[0].name).toBe('Col');
    expect(updateSpy).toHaveBeenCalledWith('token', 'g1', SYNC_FILENAME, expect.any(String));
    const written = JSON.parse(updateSpy.mock.calls[0][3]);
    expect(written.curlit_sync_version).toBe(SYNC_VERSION);
    expect(written.data.environments[0].name).toBe('Env');
  });
});

// ─── pullFromCloud ───────────────────────────────────────────────────────────

describe('pullFromCloud', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the parsed sync payload', async () => {
    const payload = buildPayload({ collections: [], environments: [], activeEnvironmentId: 'e1' });
    vi.spyOn(github, 'getGist').mockResolvedValue({
      id: 'g1',
      description: null,
      files: { [SYNC_FILENAME]: { filename: SYNC_FILENAME, content: JSON.stringify(payload) } },
      updated_at: '',
    });
    const pulled = await pullFromCloud('token', 'g1');
    expect(pulled.data.activeEnvironmentId).toBe('e1');
  });

  it('throws when the gist is missing the sync file', async () => {
    vi.spyOn(github, 'getGist').mockResolvedValue({
      id: 'g1',
      description: null,
      files: { 'other.md': { filename: 'other.md', content: '' } },
      updated_at: '',
    });
    await expect(pullFromCloud('token', 'g1')).rejects.toThrow(/missing/);
  });
});

// ─── applySyncPayload ────────────────────────────────────────────────────────

describe('applySyncPayload', () => {
  function collection(name: string): Collection {
    return {
      id: crypto.randomUUID(),
      name,
      requests: [createDefaultRequest({ name: `${name}-req` })],
      createdAt: 1,
      updatedAt: 1,
    };
  }
  function environment(name: string): Environment {
    return { id: crypto.randomUUID(), name, variables: [], isActive: false };
  }

  it('replace mode overwrites current collections and environments', () => {
    const current: SyncSnapshot = {
      collections: [collection('Old')],
      environments: [environment('OldEnv')],
      activeEnvironmentId: 'existing-id',
    };
    const payload: SyncPayload = buildPayload({
      collections: [collection('New')],
      environments: [environment('NewEnv')],
      activeEnvironmentId: 'new-id',
    });
    const result = applySyncPayload(current, payload, 'replace');
    expect(result.collections).toHaveLength(1);
    expect(result.collections[0].name).toBe('New');
    expect(result.environments[0].name).toBe('NewEnv');
    expect(result.activeEnvironmentId).toBe('new-id');
  });

  it('merge mode appends incoming with fresh IDs and preserves current active env', () => {
    const current: SyncSnapshot = {
      collections: [collection('Existing')],
      environments: [environment('ExistingEnv')],
      activeEnvironmentId: 'e-existing',
    };
    const incomingCol = collection('Incoming');
    const incomingColId = incomingCol.id;
    const payload = buildPayload({
      collections: [incomingCol],
      environments: [environment('IncomingEnv')],
      activeEnvironmentId: 'e-incoming',
    });

    const result = applySyncPayload(current, payload, 'merge');
    expect(result.collections).toHaveLength(2);
    expect(result.collections[1].id).not.toBe(incomingColId); // fresh UUID
    expect(result.environments).toHaveLength(2);
    expect(result.activeEnvironmentId).toBe('e-existing'); // current preserved
  });

  it('strips pre-request and test scripts from incoming requests in both modes', () => {
    const colWithScripts = collection('Scripted');
    colWithScripts.requests[0].preRequestScript = 'alert(1)';
    colWithScripts.requests[0].testScript = 'ok(1)';
    const payload = buildPayload({
      collections: [colWithScripts],
      environments: [],
      activeEnvironmentId: null,
    });

    for (const mode of ['replace', 'merge'] as const) {
      const result = applySyncPayload(
        { collections: [], environments: [], activeEnvironmentId: null },
        payload,
        mode,
      );
      expect(result.collections[0].requests[0].preRequestScript).toBeUndefined();
      expect(result.collections[0].requests[0].testScript).toBeUndefined();
    }
  });
});
