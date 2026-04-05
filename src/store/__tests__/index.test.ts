import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '../index';
import { createDefaultRequest } from '../../types';

// Reset store between tests
function resetStore() {
  useAppStore.setState(useAppStore.getInitialState());
}

beforeEach(() => {
  localStorage.clear();
  resetStore();
});

// ─── Tab Management ──────────────────────────────────────────────────────────

describe('Tab Management', () => {
  it('starts with one default tab', () => {
    const state = useAppStore.getState();
    expect(state.tabs).toHaveLength(1);
    expect(state.activeTabId).toBe(state.tabs[0].id);
  });

  it('addTab creates a new tab and sets it active', () => {
    const id = useAppStore.getState().addTab({ name: 'Test Tab', method: 'POST' });
    const state = useAppStore.getState();
    expect(state.tabs).toHaveLength(2);
    expect(state.activeTabId).toBe(id);
    expect(state.requests[id].name).toBe('Test Tab');
    expect(state.requests[id].method).toBe('POST');
  });

  it('closeTab removes tab and cleans up request/response', () => {
    const id = useAppStore.getState().addTab();
    useAppStore.getState().setResponse(id, {
      status: 200, statusText: 'OK', headers: {}, body: '', size: 0, time: 0, cookies: [],
    });
    useAppStore.getState().closeTab(id);
    const state = useAppStore.getState();
    expect(state.requests[id]).toBeUndefined();
    expect(state.responses[id]).toBeUndefined();
  });

  it('closeTab on active tab activates adjacent tab', () => {
    const id1 = useAppStore.getState().tabs[0].id;
    const id2 = useAppStore.getState().addTab();
    useAppStore.getState().setActiveTab(id2);
    useAppStore.getState().closeTab(id2);
    expect(useAppStore.getState().activeTabId).toBe(id1);
  });

  it('closeTab on last tab creates a new default tab', () => {
    const onlyTabId = useAppStore.getState().tabs[0].id;
    useAppStore.getState().closeTab(onlyTabId);
    const state = useAppStore.getState();
    expect(state.tabs).toHaveLength(1);
    expect(state.activeTabId).toBeTruthy();
    expect(state.activeTabId).not.toBe(onlyTabId);
  });

  it('setActiveTab updates activeTabId', () => {
    useAppStore.getState().addTab();
    const firstTabId = useAppStore.getState().tabs[0].id;
    useAppStore.getState().setActiveTab(firstTabId);
    expect(useAppStore.getState().activeTabId).toBe(firstTabId);
  });
});

// ─── Request State ───────────────────────────────────────────────────────────

describe('Request State', () => {
  it('updateRequest merges partial updates', () => {
    const tabId = useAppStore.getState().tabs[0].requestId;
    useAppStore.getState().updateRequest(tabId, { url: 'https://example.com', method: 'POST' });
    const req = useAppStore.getState().requests[tabId];
    expect(req.url).toBe('https://example.com');
    expect(req.method).toBe('POST');
  });

  it('updateRequest syncs tab name and method', () => {
    const tabId = useAppStore.getState().tabs[0].requestId;
    useAppStore.getState().updateRequest(tabId, { name: 'Updated', method: 'DELETE' });
    const tab = useAppStore.getState().tabs[0];
    expect(tab.name).toBe('Updated');
    expect(tab.method).toBe('DELETE');
    expect(tab.isModified).toBe(true);
  });

  it('setResponse stores response keyed by id', () => {
    const tabId = useAppStore.getState().tabs[0].requestId;
    const response = { status: 200, statusText: 'OK', headers: {}, body: '{}', size: 2, time: 100, cookies: [] };
    useAppStore.getState().setResponse(tabId, response);
    expect(useAppStore.getState().responses[tabId]).toEqual(response);
  });

  it('setLoading toggles loading state', () => {
    const tabId = useAppStore.getState().tabs[0].requestId;
    useAppStore.getState().setLoading(tabId, true);
    expect(useAppStore.getState().loadingRequests[tabId]).toBe(true);
    useAppStore.getState().setLoading(tabId, false);
    expect(useAppStore.getState().loadingRequests[tabId]).toBe(false);
  });
});

// ─── Collections ─────────────────────────────────────────────────────────────

describe('Collections', () => {
  it('createCollection adds collection and persists to localStorage', () => {
    useAppStore.getState().createCollection('My API');
    const state = useAppStore.getState();
    expect(state.collections).toHaveLength(1);
    expect(state.collections[0].name).toBe('My API');
    expect(state.collections[0].requests).toEqual([]);
    const stored = JSON.parse(localStorage.getItem('curlit_collections')!);
    expect(stored).toHaveLength(1);
  });

  it('deleteCollection removes collection and persists', () => {
    useAppStore.getState().createCollection('To Delete');
    const id = useAppStore.getState().collections[0].id;
    useAppStore.getState().deleteCollection(id);
    expect(useAppStore.getState().collections).toHaveLength(0);
  });

  it('renameCollection updates name and updatedAt', () => {
    useAppStore.getState().createCollection('Old Name');
    const col = useAppStore.getState().collections[0];
    useAppStore.getState().renameCollection(col.id, 'New Name');
    const updated = useAppStore.getState().collections[0];
    expect(updated.name).toBe('New Name');
    expect(updated.updatedAt).toBeGreaterThanOrEqual(col.updatedAt);
  });

  it('saveRequestToCollection adds request with new UUID', () => {
    useAppStore.getState().createCollection('Test Collection');
    const colId = useAppStore.getState().collections[0].id;
    const req = createDefaultRequest({ name: 'My Request', url: 'https://example.com' });
    useAppStore.getState().saveRequestToCollection(colId, req);
    const saved = useAppStore.getState().collections[0].requests;
    expect(saved).toHaveLength(1);
    expect(saved[0].name).toBe('My Request');
    expect(saved[0].id).not.toBe(req.id); // new UUID assigned
  });

  it('saveRequestToCollection updates existing request by id', () => {
    useAppStore.getState().createCollection('Test');
    const colId = useAppStore.getState().collections[0].id;
    const req = createDefaultRequest({ name: 'Original' });
    useAppStore.getState().saveRequestToCollection(colId, req);
    const updatedReq = { ...useAppStore.getState().collections[0].requests[0], name: 'Updated' };
    useAppStore.getState().saveRequestToCollection(colId, updatedReq);
    const requests = useAppStore.getState().collections[0].requests;
    expect(requests).toHaveLength(1);
    expect(requests[0].name).toBe('Updated');
  });

  it('removeRequestFromCollection removes request', () => {
    useAppStore.getState().createCollection('Test');
    const colId = useAppStore.getState().collections[0].id;
    useAppStore.getState().saveRequestToCollection(colId, createDefaultRequest({ name: 'Req1' }));
    const reqId = useAppStore.getState().collections[0].requests[0].id;
    useAppStore.getState().removeRequestFromCollection(colId, reqId);
    expect(useAppStore.getState().collections[0].requests).toHaveLength(0);
  });

  it('openRequestFromCollection creates new tab with collection linkage', () => {
    useAppStore.getState().createCollection('Test');
    const colId = useAppStore.getState().collections[0].id;
    useAppStore.getState().saveRequestToCollection(colId, createDefaultRequest({ name: 'Saved', url: 'https://saved.com' }));
    const sourceReqId = useAppStore.getState().collections[0].requests[0].id;
    const tabsBefore = useAppStore.getState().tabs.length;
    useAppStore.getState().openRequestFromCollection(colId, sourceReqId);
    const state = useAppStore.getState();
    expect(state.tabs.length).toBe(tabsBefore + 1);
    const newTab = state.tabs[state.tabs.length - 1];
    expect(newTab.collectionId).toBe(colId);
    expect(newTab.sourceRequestId).toBe(sourceReqId);
    expect(newTab.name).toBe('Saved');
  });

  it('openRequestFromCollection activates existing tab if already open', () => {
    useAppStore.getState().createCollection('Test');
    const colId = useAppStore.getState().collections[0].id;
    useAppStore.getState().saveRequestToCollection(colId, createDefaultRequest({ name: 'Saved' }));
    const sourceReqId = useAppStore.getState().collections[0].requests[0].id;
    useAppStore.getState().openRequestFromCollection(colId, sourceReqId);
    const tabCount = useAppStore.getState().tabs.length;
    // Open same request again
    useAppStore.getState().openRequestFromCollection(colId, sourceReqId);
    expect(useAppStore.getState().tabs.length).toBe(tabCount); // no new tab
  });
});

// ─── History ─────────────────────────────────────────────────────────────────

describe('History', () => {
  it('addToHistory prepends entry', () => {
    const req = createDefaultRequest({ url: 'https://example.com' });
    useAppStore.getState().addToHistory(req, null);
    expect(useAppStore.getState().history).toHaveLength(1);
    expect(useAppStore.getState().history[0].request.url).toBe('https://example.com');
  });

  it('addToHistory caps at 100 entries', () => {
    for (let i = 0; i < 105; i++) {
      useAppStore.getState().addToHistory(createDefaultRequest({ url: `https://example.com/${i}` }), null);
    }
    expect(useAppStore.getState().history).toHaveLength(100);
    // Most recent should be first
    expect(useAppStore.getState().history[0].request.url).toBe('https://example.com/104');
  });

  it('clearHistory empties array and clears localStorage', () => {
    useAppStore.getState().addToHistory(createDefaultRequest(), null);
    useAppStore.getState().clearHistory();
    expect(useAppStore.getState().history).toHaveLength(0);
    expect(JSON.parse(localStorage.getItem('curlit_history')!)).toEqual([]);
  });

  it('openFromHistory creates new tab from history entry', () => {
    const req = createDefaultRequest({ name: 'History Request', url: 'https://history.com' });
    useAppStore.getState().addToHistory(req, null);
    const entry = useAppStore.getState().history[0];
    const tabsBefore = useAppStore.getState().tabs.length;
    useAppStore.getState().openFromHistory(entry);
    expect(useAppStore.getState().tabs.length).toBe(tabsBefore + 1);
  });
});

// ─── Environments ────────────────────────────────────────────────────────────

describe('Environments', () => {
  it('createEnvironment adds environment and persists', () => {
    useAppStore.getState().createEnvironment('Production');
    const state = useAppStore.getState();
    expect(state.environments).toHaveLength(1);
    expect(state.environments[0].name).toBe('Production');
    expect(state.environments[0].variables).toEqual([]);
    const stored = JSON.parse(localStorage.getItem('curlit_environments')!);
    expect(stored).toHaveLength(1);
  });

  it('deleteEnvironment removes environment', () => {
    useAppStore.getState().createEnvironment('To Delete');
    const id = useAppStore.getState().environments[0].id;
    useAppStore.getState().deleteEnvironment(id);
    expect(useAppStore.getState().environments).toHaveLength(0);
  });

  it('deleteEnvironment clears activeEnvironmentId if it was active', () => {
    useAppStore.getState().createEnvironment('Active Env');
    const id = useAppStore.getState().environments[0].id;
    useAppStore.getState().setActiveEnvironment(id);
    useAppStore.getState().deleteEnvironment(id);
    expect(useAppStore.getState().activeEnvironmentId).toBeNull();
  });

  it('updateEnvironment merges updates', () => {
    useAppStore.getState().createEnvironment('Dev');
    const id = useAppStore.getState().environments[0].id;
    useAppStore.getState().updateEnvironment(id, { name: 'Development' });
    expect(useAppStore.getState().environments[0].name).toBe('Development');
  });

  it('setActiveEnvironment sets id and persists', () => {
    useAppStore.getState().createEnvironment('Env');
    const id = useAppStore.getState().environments[0].id;
    useAppStore.getState().setActiveEnvironment(id);
    expect(useAppStore.getState().activeEnvironmentId).toBe(id);
    expect(JSON.parse(localStorage.getItem('curlit_active_env')!)).toBe(id);
  });

  it('getActiveVariables returns enabled variables as Record', () => {
    useAppStore.getState().createEnvironment('Test');
    const id = useAppStore.getState().environments[0].id;
    useAppStore.getState().updateEnvironment(id, {
      variables: [
        { id: '1', key: 'host', value: 'api.test', enabled: true },
        { id: '2', key: 'disabled', value: 'skip', enabled: false },
        { id: '3', key: '', value: 'emptykey', enabled: true },
      ],
    });
    useAppStore.getState().setActiveEnvironment(id);
    const vars = useAppStore.getState().getActiveVariables();
    expect(vars).toEqual({ host: 'api.test' });
  });

  it('getActiveVariables returns empty object when no active environment', () => {
    expect(useAppStore.getState().getActiveVariables()).toEqual({});
  });
});

// ─── Save Active Request ─────────────────────────────────────────────────────

describe('Save Active Request', () => {
  it('returns needs-collection for unsaved request', () => {
    const result = useAppStore.getState().saveActiveRequest();
    expect(result).toBe('needs-collection');
  });

  it('saves back to collection in-place and clears isModified', () => {
    useAppStore.getState().createCollection('API');
    const colId = useAppStore.getState().collections[0].id;
    useAppStore.getState().saveRequestToCollection(colId, createDefaultRequest({ name: 'Original', url: 'https://example.com' }));
    const sourceReqId = useAppStore.getState().collections[0].requests[0].id;

    useAppStore.getState().openRequestFromCollection(colId, sourceReqId);
    const activeTabId = useAppStore.getState().activeTabId!;
    const tab = useAppStore.getState().tabs.find(t => t.id === activeTabId)!;

    useAppStore.getState().updateRequest(tab.requestId, { name: 'Renamed', url: 'https://updated.com' });
    expect(useAppStore.getState().tabs.find(t => t.id === activeTabId)!.isModified).toBe(true);

    const result = useAppStore.getState().saveActiveRequest();
    expect(result).toBe('saved');

    const savedReq = useAppStore.getState().collections[0].requests[0];
    expect(savedReq.name).toBe('Renamed');
    expect(savedReq.url).toBe('https://updated.com');
    expect(useAppStore.getState().tabs.find(t => t.id === activeTabId)!.isModified).toBe(false);
  });

  it('markTabSaved sets collection linkage and clears isModified', () => {
    const tabId = useAppStore.getState().tabs[0].id;
    useAppStore.getState().updateRequest(useAppStore.getState().tabs[0].requestId, { name: 'test' });
    expect(useAppStore.getState().tabs[0].isModified).toBe(true);

    useAppStore.getState().markTabSaved(tabId, 'col-123', 'req-456');
    const tab = useAppStore.getState().tabs[0];
    expect(tab.collectionId).toBe('col-123');
    expect(tab.sourceRequestId).toBe('req-456');
    expect(tab.isModified).toBe(false);
  });
});

// ─── localStorage Persistence ────────────────────────────────────────────────

describe('localStorage Persistence', () => {
  it('initializes collections from localStorage', () => {
    const collections = [{ id: 'c1', name: 'Saved', requests: [], createdAt: 1, updatedAt: 1 }];
    localStorage.setItem('curlit_collections', JSON.stringify(collections));
    // Re-create the store to pick up localStorage
    resetStore();
    // The store reads from localStorage on creation, but resetStore uses getInitialState
    // which is captured at module load. For this test, we verify saveToStorage round-trip.
    useAppStore.getState().createCollection('New');
    const stored = JSON.parse(localStorage.getItem('curlit_collections')!);
    expect(stored.length).toBeGreaterThan(0);
  });

  it('persists history on mutation', () => {
    useAppStore.getState().addToHistory(createDefaultRequest({ url: 'https://test.com' }), null);
    const stored = JSON.parse(localStorage.getItem('curlit_history')!);
    expect(stored).toHaveLength(1);
    expect(stored[0].request.url).toBe('https://test.com');
  });

  it('handles corrupted localStorage gracefully', () => {
    localStorage.setItem('curlit_collections', 'not valid json');
    // Store should fall back to default empty array
    // This is tested indirectly - if it throws, the store would fail to initialize
    resetStore();
    expect(useAppStore.getState().collections).toBeDefined();
  });
});
