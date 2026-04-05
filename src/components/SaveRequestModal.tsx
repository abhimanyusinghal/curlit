import { useState } from 'react';
import { X, Save, Plus } from 'lucide-react';
import { useAppStore } from '../store';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function SaveRequestModal({ open, onClose }: Props) {
  const collections = useAppStore(s => s.collections);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (!open) return null;

  const handleSave = () => {
    if (!selectedId) return;

    const state = useAppStore.getState();
    const activeTab = state.tabs.find(t => t.id === state.activeTabId);
    if (!activeTab) return;

    const request = state.requests[activeTab.requestId];
    if (!request) return;

    state.saveRequestToCollection(selectedId, request);

    // Find the newly saved request ID in the collection
    const updatedCollection = useAppStore.getState().collections.find(c => c.id === selectedId);
    const savedReq = updatedCollection?.requests[updatedCollection.requests.length - 1];

    if (savedReq) {
      state.markTabSaved(activeTab.id, selectedId, savedReq.id);
    }

    onClose();
  };

  const handleCreateAndSave = () => {
    const name = prompt('Collection name:');
    if (!name) return;
    useAppStore.getState().createCollection(name);
    const newCol = useAppStore.getState().collections[useAppStore.getState().collections.length - 1];
    setSelectedId(newCol.id);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-dark-800 border border-dark-600 rounded-xl shadow-2xl w-full max-w-sm mx-4">
        <div className="flex items-center justify-between px-4 py-3 border-b border-dark-600">
          <div className="flex items-center gap-2">
            <Save size={16} className="text-accent-blue" />
            <h3 className="text-sm font-semibold text-dark-100">Save Request</h3>
          </div>
          <button onClick={onClose} className="p-1 text-dark-400 hover:text-dark-200 rounded cursor-pointer">
            <X size={16} />
          </button>
        </div>
        <div className="p-4">
          <p className="text-xs text-dark-300 mb-3">Select a collection to save this request to:</p>

          {collections.length === 0 ? (
            <div className="text-dark-500 text-xs text-center py-4">
              No collections yet. Create one below.
            </div>
          ) : (
            <div className="flex flex-col gap-1 max-h-48 overflow-auto mb-3">
              {collections.map(c => (
                <button
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className={`text-left px-3 py-2 text-xs rounded-lg cursor-pointer transition-colors ${
                    selectedId === c.id
                      ? 'bg-accent-blue/20 text-accent-blue border border-accent-blue/30'
                      : 'bg-dark-700 text-dark-200 hover:bg-dark-600 border border-transparent'
                  }`}
                >
                  {c.name}
                  <span className="text-dark-500 ml-2">({c.requests.length})</span>
                </button>
              ))}
            </div>
          )}

          <button
            onClick={handleCreateAndSave}
            className="flex items-center gap-1.5 w-full px-3 py-2 text-xs text-dark-300 hover:text-dark-100 bg-dark-700 hover:bg-dark-600 rounded-lg cursor-pointer transition-colors mb-3"
          >
            <Plus size={12} />
            New Collection
          </button>

          <div className="flex justify-end gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-dark-300 hover:text-dark-100 bg-dark-700 rounded-lg cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!selectedId}
              className="px-4 py-2 text-sm text-white bg-accent-blue hover:bg-accent-blue/80 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg cursor-pointer"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
