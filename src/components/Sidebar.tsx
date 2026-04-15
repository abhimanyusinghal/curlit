import { useState } from 'react';
import {
  FolderOpen,
  Clock,
  Globe,
  Plus,
  Trash2,
  ChevronRight,
  ChevronDown,
  MoreVertical,
  Import,
  Search,
} from 'lucide-react';
import { useAppStore, type SidebarView } from '../store';
import { MethodBadge } from './MethodBadge';
import { KeyValueEditor } from './KeyValueEditor';
import type { Collection, RequestConfig } from '../types';
import { isPostmanCollection, parsePostmanCollection } from '../utils/postman';
import { parseOpenApiInput, isOpenApiSpec, parseOpenApiSpec } from '../utils/openapi';

/** Strip scripts from imported requests to prevent code execution from untrusted collections. */
function stripScripts(request: RequestConfig): RequestConfig {
  const cleaned = { ...request };
  delete cleaned.preRequestScript;
  delete cleaned.testScript;
  return cleaned;
}

function stripScriptsFromCollection(collection: Collection): Collection {
  return { ...collection, requests: collection.requests.map(stripScripts) };
}

export function Sidebar() {
  const sidebarView = useAppStore(s => s.sidebarView);
  const setSidebarView = useAppStore(s => s.setSidebarView);

  const navItems: { id: SidebarView; icon: React.ReactNode; label: string }[] = [
    { id: 'collections', icon: <FolderOpen size={18} />, label: 'Collections' },
    { id: 'history', icon: <Clock size={18} />, label: 'History' },
    { id: 'environments', icon: <Globe size={18} />, label: 'Environments' },
  ];

  return (
    <div className="flex flex-col h-full bg-dark-900 border-r border-dark-600">
      {/* Nav tabs */}
      <div className="flex border-b border-dark-600">
        {navItems.map(item => (
          <button
            key={item.id}
            onClick={() => setSidebarView(item.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors cursor-pointer ${
              sidebarView === item.id
                ? 'text-dark-100 border-b-2 border-accent-blue bg-dark-800/50'
                : 'text-dark-400 hover:text-dark-200'
            }`}
            title={item.label}
          >
            {item.icon}
            <span className="hidden xl:inline">{item.label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {sidebarView === 'collections' && <CollectionsPanel />}
        {sidebarView === 'history' && <HistoryPanel />}
        {sidebarView === 'environments' && <EnvironmentsPanel />}
      </div>
    </div>
  );
}

function CollectionsPanel() {
  const collections = useAppStore(s => s.collections);
  const createCollection = useAppStore(s => s.createCollection);
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');

  const handleImport = () => {
    try {
      // Try OpenAPI/Swagger first (supports both JSON and YAML)
      try {
        const parsed = parseOpenApiInput(importText);
        if (isOpenApiSpec(parsed)) {
          const { name, requests } = parseOpenApiSpec(parsed);
          useAppStore.getState().createCollection(name);
          const newCollection = useAppStore.getState().collections[useAppStore.getState().collections.length - 1];
          requests.forEach(r => {
            useAppStore.getState().saveRequestToCollection(newCollection.id, r);
          });
          // Open the first request in a tab
          const saved = useAppStore.getState().collections.find(c => c.id === newCollection.id);
          if (saved && saved.requests.length > 0) {
            useAppStore.getState().openRequestFromCollection(newCollection.id, saved.requests[0].id);
          }
          setImportText('');
          setShowImport(false);
          return;
        }
      } catch {
        // Not OpenAPI, continue to try other formats
      }

      const data = JSON.parse(importText);

      if (isPostmanCollection(data)) {
        // Postman v2.1 format
        const { name, requests } = parsePostmanCollection(data);
        useAppStore.getState().createCollection(name);
        const newCollection = useAppStore.getState().collections[useAppStore.getState().collections.length - 1];
        requests.forEach(r => {
          useAppStore.getState().saveRequestToCollection(newCollection.id, stripScripts(r));
        });
      } else if (data.collections && Array.isArray(data.collections)) {
        // CurlIt native format — strip scripts from imported requests to
        // prevent untrusted collections from executing arbitrary code.
        data.collections.forEach((c: Collection) => {
          const safe = stripScriptsFromCollection(c);
          useAppStore.getState().createCollection(safe.name);
          const newCollection = useAppStore.getState().collections[useAppStore.getState().collections.length - 1];
          safe.requests.forEach(r => {
            useAppStore.getState().saveRequestToCollection(newCollection.id, r);
          });
        });
      } else {
        alert('Unrecognized format. Supported: CurlIt JSON, Postman v2.1, or OpenAPI/Swagger');
        return;
      }

      setImportText('');
      setShowImport(false);
    } catch {
      alert('Invalid format. Supported: CurlIt JSON, Postman v2.1, or OpenAPI/Swagger (JSON/YAML)');
    }
  };

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-xs text-dark-300 font-medium uppercase tracking-wider">Collections</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowImport(!showImport)}
            className="p-1 text-dark-400 hover:text-dark-200 rounded cursor-pointer"
            title="Import collection"
          >
            <Import size={14} />
          </button>
          <button
            onClick={() => {
              const name = prompt('Collection name:');
              if (name) createCollection(name);
            }}
            className="p-1 text-dark-400 hover:text-dark-200 rounded cursor-pointer"
            title="New collection"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>

      {showImport && (
        <div className="px-3 pb-2 flex flex-col gap-2">
          <textarea
            value={importText}
            onChange={e => setImportText(e.target.value)}
            placeholder='Paste CurlIt, Postman, or OpenAPI/Swagger spec (JSON/YAML)...'
            className="bg-dark-700 border border-dark-600 rounded text-xs p-2 h-24 text-dark-200 resize-none"
          />
          <div className="flex gap-1">
            <button
              onClick={handleImport}
              className="px-2 py-1 bg-accent-blue text-white text-xs rounded cursor-pointer"
            >
              Import
            </button>
            <button
              onClick={() => setShowImport(false)}
              className="px-2 py-1 bg-dark-700 text-dark-300 text-xs rounded cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {collections.length === 0 ? (
        <div className="text-dark-500 text-xs text-center py-8 px-4">
          No collections yet. Click + to create one.
        </div>
      ) : (
        collections.map(c => <CollectionItem key={c.id} collection={c} />)
      )}
    </div>
  );
}

function CollectionItem({ collection }: { collection: Collection }) {
  const [expanded, setExpanded] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const deleteCollection = useAppStore(s => s.deleteCollection);
  const renameCollection = useAppStore(s => s.renameCollection);
  const openRequestFromCollection = useAppStore(s => s.openRequestFromCollection);
  const removeRequestFromCollection = useAppStore(s => s.removeRequestFromCollection);
  const saveRequestToCollection = useAppStore(s => s.saveRequestToCollection);
  const requests = useAppStore(s => {
    const activeTabId = s.activeTabId;
    const tab = s.tabs.find(t => t.id === activeTabId);
    return tab ? s.requests[tab.requestId] : null;
  });

  const exportCollection = () => {
    const data = JSON.stringify({ collections: [collection] }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${collection.name}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="border-b border-dark-700/50">
      <div className="flex items-center group">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex-1 flex items-center gap-1.5 px-3 py-2 text-sm text-dark-200 hover:bg-dark-800/50 transition-colors cursor-pointer"
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <FolderOpen size={14} className="text-accent-yellow" />
          <span className="truncate text-xs">{collection.name}</span>
          <span className="text-[10px] text-dark-500 ml-auto">{collection.requests.length}</span>
        </button>
        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="opacity-0 group-hover:opacity-100 p-1.5 text-dark-400 hover:text-dark-200 cursor-pointer"
          >
            <MoreVertical size={12} />
          </button>
          {showMenu && (
            <div className="absolute right-0 top-full z-50 bg-dark-700 border border-dark-500 rounded-lg shadow-xl py-1 w-40">
              <button
                onClick={() => {
                  if (requests) saveRequestToCollection(collection.id, requests);
                  setShowMenu(false);
                }}
                className="w-full text-left px-3 py-1.5 text-xs text-dark-200 hover:bg-dark-600 cursor-pointer"
              >
                Save current request
              </button>
              <button
                onClick={() => {
                  const name = prompt('New name:', collection.name);
                  if (name) renameCollection(collection.id, name);
                  setShowMenu(false);
                }}
                className="w-full text-left px-3 py-1.5 text-xs text-dark-200 hover:bg-dark-600 cursor-pointer"
              >
                Rename
              </button>
              <button
                onClick={() => {
                  exportCollection();
                  setShowMenu(false);
                }}
                className="w-full text-left px-3 py-1.5 text-xs text-dark-200 hover:bg-dark-600 cursor-pointer"
              >
                Export
              </button>
              <button
                onClick={() => {
                  if (confirm('Delete this collection?')) deleteCollection(collection.id);
                  setShowMenu(false);
                }}
                className="w-full text-left px-3 py-1.5 text-xs text-accent-red hover:bg-dark-600 cursor-pointer"
              >
                Delete
              </button>
            </div>
          )}
        </div>
      </div>
      {expanded && (
        <div className="ml-4">
          {collection.requests.map(req => (
            <div key={req.id} className="flex items-center group">
              <button
                onClick={() => openRequestFromCollection(collection.id, req.id)}
                className="flex-1 flex items-center gap-2 px-3 py-1.5 hover:bg-dark-800/50 transition-colors cursor-pointer"
              >
                <MethodBadge method={req.method} size="sm" />
                <span className="text-xs text-dark-300 truncate">{req.name || req.url || 'Untitled'}</span>
              </button>
              <button
                onClick={() => removeRequestFromCollection(collection.id, req.id)}
                className="opacity-0 group-hover:opacity-100 p-1 text-dark-500 hover:text-accent-red cursor-pointer"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
          {collection.requests.length === 0 && (
            <div className="text-dark-500 text-[10px] px-3 py-2">No requests</div>
          )}
        </div>
      )}
    </div>
  );
}

function HistoryPanel() {
  const history = useAppStore(s => s.history);
  const clearHistory = useAppStore(s => s.clearHistory);
  const openFromHistory = useAppStore(s => s.openFromHistory);
  const [search, setSearch] = useState('');

  const filtered = search
    ? history.filter(h =>
        h.request.url.toLowerCase().includes(search.toLowerCase()) ||
        h.request.method.toLowerCase().includes(search.toLowerCase())
      )
    : history;

  const groupByDate = (entries: typeof history) => {
    const groups: Record<string, typeof history> = {};
    entries.forEach(entry => {
      const date = new Date(entry.timestamp).toLocaleDateString();
      if (!groups[date]) groups[date] = [];
      groups[date].push(entry);
    });
    return groups;
  };

  const grouped = groupByDate(filtered);

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-xs text-dark-300 font-medium uppercase tracking-wider">History</span>
        {history.length > 0 && (
          <button
            onClick={() => {
              if (confirm('Clear all history?')) clearHistory();
            }}
            className="text-[10px] text-dark-400 hover:text-accent-red cursor-pointer"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Search */}
      <div className="px-3 pb-2">
        <div className="relative">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-dark-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Filter history..."
            className="w-full bg-dark-700 border border-dark-600 rounded pl-7 pr-2 py-1.5 text-xs text-dark-200 placeholder:text-dark-500"
          />
        </div>
      </div>

      {history.length === 0 ? (
        <div className="text-dark-500 text-xs text-center py-8 px-4">
          No history yet. Send a request to see it here.
        </div>
      ) : (
        Object.entries(grouped).map(([date, entries]) => (
          <div key={date}>
            <div className="px-3 py-1 text-[10px] text-dark-500 font-medium">{date}</div>
            {entries.map(entry => (
              <button
                key={entry.id}
                onClick={() => openFromHistory(entry)}
                className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-dark-800/50 transition-colors cursor-pointer"
              >
                <MethodBadge method={entry.request.method} size="sm" />
                <span className="text-xs text-dark-300 truncate flex-1 text-left">
                  {entry.request.url || 'Untitled'}
                </span>
                <span className={`text-[10px] ${
                  entry.response
                    ? entry.response.status >= 200 && entry.response.status < 300
                      ? 'text-accent-green'
                      : 'text-accent-red'
                    : 'text-dark-500'
                }`}>
                  {entry.response?.status || '-'}
                </span>
              </button>
            ))}
          </div>
        ))
      )}
    </div>
  );
}

function EnvironmentsPanel() {
  const environments = useAppStore(s => s.environments);
  const activeEnvironmentId = useAppStore(s => s.activeEnvironmentId);
  const createEnvironment = useAppStore(s => s.createEnvironment);
  const deleteEnvironment = useAppStore(s => s.deleteEnvironment);
  const updateEnvironment = useAppStore(s => s.updateEnvironment);
  const setActiveEnvironment = useAppStore(s => s.setActiveEnvironment);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-xs text-dark-300 font-medium uppercase tracking-wider">Environments</span>
        <button
          onClick={() => {
            const name = prompt('Environment name:');
            if (name) createEnvironment(name);
          }}
          className="p-1 text-dark-400 hover:text-dark-200 rounded cursor-pointer"
          title="New environment"
        >
          <Plus size={14} />
        </button>
      </div>

      {environments.length === 0 ? (
        <div className="text-dark-500 text-xs text-center py-8 px-4">
          No environments yet. Click + to create one.
        </div>
      ) : (
        environments.map(env => (
          <div key={env.id} className="border-b border-dark-700/50">
            <div className="flex items-center group">
              <button
                onClick={() => setExpandedId(expandedId === env.id ? null : env.id)}
                className="flex-1 flex items-center gap-2 px-3 py-2 hover:bg-dark-800/50 transition-colors cursor-pointer"
              >
                {expandedId === env.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <Globe size={14} className={activeEnvironmentId === env.id ? 'text-accent-green' : 'text-dark-400'} />
                <span className="text-xs text-dark-200 truncate">{env.name}</span>
              </button>
              <button
                onClick={() =>
                  setActiveEnvironment(activeEnvironmentId === env.id ? null : env.id)
                }
                className={`px-2 py-0.5 text-[10px] rounded mr-1 cursor-pointer ${
                  activeEnvironmentId === env.id
                    ? 'bg-accent-green/20 text-accent-green'
                    : 'bg-dark-700 text-dark-400 hover:text-dark-200'
                }`}
              >
                {activeEnvironmentId === env.id ? 'Active' : 'Use'}
              </button>
              <button
                onClick={() => {
                  if (confirm('Delete this environment?')) deleteEnvironment(env.id);
                }}
                className="opacity-0 group-hover:opacity-100 p-1 text-dark-500 hover:text-accent-red mr-1 cursor-pointer"
              >
                <Trash2 size={12} />
              </button>
            </div>
            {expandedId === env.id && (
              <div className="px-2 pb-2">
                <KeyValueEditor
                  pairs={env.variables}
                  onChange={variables => updateEnvironment(env.id, { variables })}
                  keyPlaceholder="Variable"
                  valuePlaceholder="Value"
                />
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
