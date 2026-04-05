import { useState, useRef, useEffect } from 'react';
import { X, Plus } from 'lucide-react';
import { useAppStore } from '../store';
import { MethodBadge } from './MethodBadge';

export function RequestTabs() {
  const tabs = useAppStore(s => s.tabs);
  const activeTabId = useAppStore(s => s.activeTabId);
  const setActiveTab = useAppStore(s => s.setActiveTab);
  const closeTab = useAppStore(s => s.closeTab);
  const addTab = useAppStore(s => s.addTab);
  const updateRequest = useAppStore(s => s.updateRequest);

  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingTabId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingTabId]);

  const startEditing = (tabId: string, currentName: string) => {
    setEditingTabId(tabId);
    setEditValue(currentName);
  };

  const commitEdit = (tab: typeof tabs[0]) => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== tab.name) {
      updateRequest(tab.requestId, { name: trimmed });
    }
    setEditingTabId(null);
  };

  return (
    <div className="flex items-center bg-dark-900 border-b border-dark-600 overflow-x-auto">
      {tabs.map(tab => (
        <div
          key={tab.id}
          onClick={() => setActiveTab(tab.id)}
          className={`group flex items-center gap-2 px-3 py-2 text-sm cursor-pointer border-r border-dark-600 min-w-[140px] max-w-[220px] transition-colors ${
            activeTabId === tab.id
              ? 'bg-dark-800 text-dark-100 border-b-2 border-b-accent-blue'
              : 'bg-dark-900 text-dark-300 hover:bg-dark-800/50'
          }`}
        >
          <MethodBadge method={tab.method} size="sm" />
          {editingTabId === tab.id ? (
            <input
              ref={inputRef}
              type="text"
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              onBlur={() => commitEdit(tab)}
              onKeyDown={e => {
                if (e.key === 'Enter') commitEdit(tab);
                if (e.key === 'Escape') setEditingTabId(null);
              }}
              onClick={e => e.stopPropagation()}
              className="flex-1 text-xs bg-dark-700 border border-accent-blue rounded px-1 py-0.5 text-dark-100 outline-none min-w-0"
            />
          ) : (
            <span
              className="truncate flex-1 text-xs"
              onDoubleClick={e => {
                e.stopPropagation();
                startEditing(tab.id, tab.name);
              }}
              title="Double-click to rename"
            >
              {tab.name}
            </span>
          )}
          {tab.isModified && (
            <span className="w-1.5 h-1.5 rounded-full bg-accent-orange flex-shrink-0" />
          )}
          <button
            onClick={e => {
              e.stopPropagation();
              closeTab(tab.id);
            }}
            className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-dark-600 rounded transition-all cursor-pointer"
          >
            <X size={12} />
          </button>
        </div>
      ))}
      <button
        onClick={() => addTab()}
        className="p-2 text-dark-400 hover:text-dark-200 hover:bg-dark-800/50 transition-colors cursor-pointer"
        title="New Tab"
      >
        <Plus size={16} />
      </button>
    </div>
  );
}
