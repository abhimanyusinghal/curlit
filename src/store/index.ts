import { create } from 'zustand';
import type {
  RequestConfig,
  ResponseData,
  Collection,
  HistoryEntry,
  Environment,
  Tab,
  HttpMethod,
} from '../types';
import { createDefaultRequest } from '../types';

const STORAGE_KEYS = {
  collections: 'curlit_collections',
  history: 'curlit_history',
  environments: 'curlit_environments',
  activeEnv: 'curlit_active_env',
  theme: 'curlit_theme',
};

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : fallback;
  } catch {
    return fallback;
  }
}

function saveToStorage(key: string, data: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // storage full, silently fail
  }
}

export type SidebarView = 'collections' | 'history' | 'environments';
export type Theme = 'dark' | 'light';

interface AppState {
  // Tabs
  tabs: Tab[];
  activeTabId: string | null;

  // Requests (keyed by ID)
  requests: Record<string, RequestConfig>;
  responses: Record<string, ResponseData | null>;
  loadingRequests: Record<string, boolean>;

  // Collections
  collections: Collection[];

  // History
  history: HistoryEntry[];

  // Environments
  environments: Environment[];
  activeEnvironmentId: string | null;

  // UI
  theme: Theme;
  sidebarView: SidebarView;
  sidebarOpen: boolean;

  // Actions - Tabs
  addTab: (request?: Partial<RequestConfig>) => string;
  duplicateTab: () => void;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;

  // Actions - Requests
  updateRequest: (id: string, updates: Partial<RequestConfig>) => void;
  setResponse: (id: string, response: ResponseData | null) => void;
  setLoading: (id: string, loading: boolean) => void;

  // Actions - Collections
  createCollection: (name: string) => void;
  deleteCollection: (id: string) => void;
  renameCollection: (id: string, name: string) => void;
  saveRequestToCollection: (collectionId: string, request: RequestConfig) => void;
  removeRequestFromCollection: (collectionId: string, requestId: string) => void;
  openRequestFromCollection: (collectionId: string, requestId: string) => void;

  // Actions - History
  addToHistory: (request: RequestConfig, response: ResponseData | null) => void;
  clearHistory: () => void;
  openFromHistory: (entry: HistoryEntry) => void;

  // Actions - Environments
  createEnvironment: (name: string) => void;
  deleteEnvironment: (id: string) => void;
  updateEnvironment: (id: string, updates: Partial<Environment>) => void;
  setActiveEnvironment: (id: string | null) => void;
  getActiveVariables: () => Record<string, string>;

  // Actions - Save
  saveActiveRequest: () => 'saved' | 'needs-collection';
  markTabSaved: (tabId: string, collectionId: string, sourceRequestId: string) => void;

  // Actions - UI
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  setSidebarView: (view: SidebarView) => void;
  toggleSidebar: () => void;
}

const initialRequest = createDefaultRequest({ name: 'Untitled Request' });

export const useAppStore = create<AppState>((set, get) => ({
  // Initial state
  tabs: [
    {
      id: initialRequest.id,
      requestId: initialRequest.id,
      name: 'Untitled Request',
      method: 'GET',
      isModified: false,
    },
  ],
  activeTabId: initialRequest.id,
  requests: { [initialRequest.id]: initialRequest },
  responses: {},
  loadingRequests: {},
  collections: loadFromStorage<Collection[]>(STORAGE_KEYS.collections, []),
  history: loadFromStorage<HistoryEntry[]>(STORAGE_KEYS.history, []),
  environments: loadFromStorage<Environment[]>(STORAGE_KEYS.environments, []),
  activeEnvironmentId: loadFromStorage<string | null>(STORAGE_KEYS.activeEnv, null),
  theme: loadFromStorage<Theme>(STORAGE_KEYS.theme, 'dark'),
  sidebarView: 'collections',
  sidebarOpen: true,

  // Tab actions
  addTab: (requestOverrides) => {
    const request = createDefaultRequest({
      name: 'Untitled Request',
      ...requestOverrides,
    });
    const tab: Tab = {
      id: request.id,
      requestId: request.id,
      name: request.name,
      method: request.method,
      isModified: false,
    };
    set(state => ({
      tabs: [...state.tabs, tab],
      activeTabId: tab.id,
      requests: { ...state.requests, [request.id]: request },
    }));
    return request.id;
  },

  duplicateTab: () => {
    const state = get();
    const activeTab = state.tabs.find(t => t.id === state.activeTabId);
    if (!activeTab) return;
    const request = state.requests[activeTab.requestId];
    if (!request) return;

    const { id: _, ...requestData } = request;
    const newReq = createDefaultRequest({
      ...requestData,
      name: `${request.name} (copy)`,
    });
    const tab: Tab = {
      id: newReq.id,
      requestId: newReq.id,
      name: newReq.name,
      method: newReq.method,
      isModified: false,
    };
    set(s => ({
      tabs: [...s.tabs, tab],
      activeTabId: tab.id,
      requests: { ...s.requests, [newReq.id]: newReq },
    }));
  },

  closeTab: (tabId) => {
    set(state => {
      const newTabs = state.tabs.filter(t => t.id !== tabId);
      const newRequests = { ...state.requests };
      const newResponses = { ...state.responses };
      const tab = state.tabs.find(t => t.id === tabId);
      if (tab) {
        delete newRequests[tab.requestId];
        delete newResponses[tab.requestId];
      }

      let newActiveTabId = state.activeTabId;
      if (state.activeTabId === tabId) {
        const idx = state.tabs.findIndex(t => t.id === tabId);
        if (newTabs.length > 0) {
          newActiveTabId = newTabs[Math.min(idx, newTabs.length - 1)].id;
        } else {
          // Always keep at least one tab
          const newReq = createDefaultRequest({ name: 'Untitled Request' });
          const newTab: Tab = {
            id: newReq.id,
            requestId: newReq.id,
            name: 'Untitled Request',
            method: 'GET',
            isModified: false,
          };
          newTabs.push(newTab);
          newRequests[newReq.id] = newReq;
          newActiveTabId = newTab.id;
        }
      }

      return {
        tabs: newTabs,
        activeTabId: newActiveTabId,
        requests: newRequests,
        responses: newResponses,
      };
    });
  },

  setActiveTab: (tabId) => set({ activeTabId: tabId }),

  // Request actions
  updateRequest: (id, updates) => {
    set(state => {
      const existing = state.requests[id];
      if (!existing) return state;
      const updated = { ...existing, ...updates };
      const newTabs = state.tabs.map(t =>
        t.requestId === id
          ? { ...t, name: updated.name, method: updated.method as HttpMethod, isModified: true }
          : t
      );
      return {
        requests: { ...state.requests, [id]: updated },
        tabs: newTabs,
      };
    });
  },

  setResponse: (id, response) => {
    set(state => ({
      responses: { ...state.responses, [id]: response },
    }));
  },

  setLoading: (id, loading) => {
    set(state => ({
      loadingRequests: { ...state.loadingRequests, [id]: loading },
    }));
  },

  // Collection actions
  createCollection: (name) => {
    const collection: Collection = {
      id: crypto.randomUUID(),
      name,
      requests: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    set(state => {
      const collections = [...state.collections, collection];
      saveToStorage(STORAGE_KEYS.collections, collections);
      return { collections };
    });
  },

  deleteCollection: (id) => {
    set(state => {
      const collections = state.collections.filter(c => c.id !== id);
      saveToStorage(STORAGE_KEYS.collections, collections);
      return { collections };
    });
  },

  renameCollection: (id, name) => {
    set(state => {
      const collections = state.collections.map(c =>
        c.id === id ? { ...c, name, updatedAt: Date.now() } : c
      );
      saveToStorage(STORAGE_KEYS.collections, collections);
      return { collections };
    });
  },

  saveRequestToCollection: (collectionId, request) => {
    set(state => {
      const collections = state.collections.map(c => {
        if (c.id !== collectionId) return c;
        const existingIdx = c.requests.findIndex(r => r.id === request.id);
        const newRequests = [...c.requests];
        if (existingIdx >= 0) {
          newRequests[existingIdx] = request;
        } else {
          newRequests.push({ ...request, id: crypto.randomUUID() });
        }
        return { ...c, requests: newRequests, updatedAt: Date.now() };
      });
      saveToStorage(STORAGE_KEYS.collections, collections);
      return { collections };
    });
  },

  removeRequestFromCollection: (collectionId, requestId) => {
    set(state => {
      const collections = state.collections.map(c => {
        if (c.id !== collectionId) return c;
        return {
          ...c,
          requests: c.requests.filter(r => r.id !== requestId),
          updatedAt: Date.now(),
        };
      });
      saveToStorage(STORAGE_KEYS.collections, collections);
      return { collections };
    });
  },

  openRequestFromCollection: (collectionId, requestId) => {
    const state = get();
    const collection = state.collections.find(c => c.id === collectionId);
    if (!collection) return;
    const request = collection.requests.find(r => r.id === requestId);
    if (!request) return;

    // Check if already open
    const existingTab = state.tabs.find(t => t.sourceRequestId === requestId && t.collectionId === collectionId);
    if (existingTab) {
      set({ activeTabId: existingTab.id });
    } else {
      const newReq = { ...request, id: crypto.randomUUID() };
      const tab: Tab = {
        id: newReq.id,
        requestId: newReq.id,
        name: newReq.name,
        method: newReq.method,
        isModified: false,
        collectionId,
        sourceRequestId: requestId,
      };
      set(s => ({
        tabs: [...s.tabs, tab],
        activeTabId: tab.id,
        requests: { ...s.requests, [newReq.id]: newReq },
      }));
    }
  },

  // History actions
  addToHistory: (request, response) => {
    const entry: HistoryEntry = {
      id: crypto.randomUUID(),
      request: { ...request },
      response,
      timestamp: Date.now(),
    };
    set(state => {
      const history = [entry, ...state.history].slice(0, 100);
      saveToStorage(STORAGE_KEYS.history, history);
      return { history };
    });
  },

  clearHistory: () => {
    saveToStorage(STORAGE_KEYS.history, []);
    set({ history: [] });
  },

  openFromHistory: (entry) => {
    get().addTab({
      ...entry.request,
      id: undefined as unknown as string,
      name: entry.request.name || entry.request.url || 'From History',
    });
  },

  // Environment actions
  createEnvironment: (name) => {
    const env: Environment = {
      id: crypto.randomUUID(),
      name,
      variables: [],
      isActive: false,
    };
    set(state => {
      const environments = [...state.environments, env];
      saveToStorage(STORAGE_KEYS.environments, environments);
      return { environments };
    });
  },

  deleteEnvironment: (id) => {
    set(state => {
      const environments = state.environments.filter(e => e.id !== id);
      saveToStorage(STORAGE_KEYS.environments, environments);
      const activeEnvironmentId = state.activeEnvironmentId === id ? null : state.activeEnvironmentId;
      saveToStorage(STORAGE_KEYS.activeEnv, activeEnvironmentId);
      return { environments, activeEnvironmentId };
    });
  },

  updateEnvironment: (id, updates) => {
    set(state => {
      const environments = state.environments.map(e =>
        e.id === id ? { ...e, ...updates } : e
      );
      saveToStorage(STORAGE_KEYS.environments, environments);
      return { environments };
    });
  },

  setActiveEnvironment: (id) => {
    saveToStorage(STORAGE_KEYS.activeEnv, id);
    set({ activeEnvironmentId: id });
  },

  getActiveVariables: () => {
    const state = get();
    const activeEnv = state.environments.find(e => e.id === state.activeEnvironmentId);
    if (!activeEnv) return {};
    const vars: Record<string, string> = {};
    activeEnv.variables.filter(v => v.enabled && v.key).forEach(v => {
      vars[v.key] = v.value;
    });
    return vars;
  },

  // Save actions
  saveActiveRequest: () => {
    const state = get();
    const activeTab = state.tabs.find(t => t.id === state.activeTabId);
    if (!activeTab) return 'needs-collection';

    const request = state.requests[activeTab.requestId];
    if (!request) return 'needs-collection';

    if (activeTab.collectionId && activeTab.sourceRequestId) {
      // Save back to source collection in-place
      const collection = state.collections.find(c => c.id === activeTab.collectionId);
      if (!collection || !collection.requests.some(r => r.id === activeTab.sourceRequestId)) {
        return 'needs-collection';
      }
      const collections = state.collections.map(c => {
        if (c.id !== activeTab.collectionId) return c;
        return {
          ...c,
          requests: c.requests.map(r =>
            r.id === activeTab.sourceRequestId ? { ...request, id: activeTab.sourceRequestId! } : r
          ),
          updatedAt: Date.now(),
        };
      });
      saveToStorage(STORAGE_KEYS.collections, collections);
      set({
        collections,
        tabs: state.tabs.map(t =>
          t.id === activeTab.id ? { ...t, isModified: false } : t
        ),
      });
      return 'saved';
    }

    return 'needs-collection';
  },

  markTabSaved: (tabId, collectionId, sourceRequestId) => {
    set(state => ({
      tabs: state.tabs.map(t =>
        t.id === tabId ? { ...t, collectionId, sourceRequestId, isModified: false } : t
      ),
    }));
  },

  // UI actions
  setTheme: (theme) => {
    document.documentElement.setAttribute('data-theme', theme);
    saveToStorage(STORAGE_KEYS.theme, theme);
    set({ theme });
  },
  toggleTheme: () => {
    const newTheme = get().theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    saveToStorage(STORAGE_KEYS.theme, newTheme);
    set({ theme: newTheme });
  },
  setSidebarView: (view) => set({ sidebarView: view }),
  toggleSidebar: () => set(state => ({ sidebarOpen: !state.sidebarOpen })),
}));
