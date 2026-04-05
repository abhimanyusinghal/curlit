import { Plus, Trash2 } from 'lucide-react';
import type { KeyValuePair } from '../types';
import { createKeyValuePair } from '../types';

interface Props {
  pairs: KeyValuePair[];
  onChange: (pairs: KeyValuePair[]) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  showDescription?: boolean;
}

export function KeyValueEditor({
  pairs,
  onChange,
  keyPlaceholder = 'Key',
  valuePlaceholder = 'Value',
  showDescription = false,
}: Props) {
  const updatePair = (id: string, updates: Partial<KeyValuePair>) => {
    onChange(pairs.map(p => (p.id === id ? { ...p, ...updates } : p)));
  };

  const removePair = (id: string) => {
    onChange(pairs.filter(p => p.id !== id));
  };

  const addPair = () => {
    onChange([...pairs, createKeyValuePair()]);
  };

  return (
    <div className="flex flex-col gap-1">
      {/* Header */}
      <div className="grid gap-2 px-2 py-1 text-xs text-dark-300 font-medium" style={{
        gridTemplateColumns: showDescription ? '28px 1fr 1fr 1fr 28px' : '28px 1fr 1fr 28px',
      }}>
        <div />
        <div>{keyPlaceholder}</div>
        <div>{valuePlaceholder}</div>
        {showDescription && <div>Description</div>}
        <div />
      </div>

      {/* Rows */}
      {pairs.map(pair => (
        <div
          key={pair.id}
          className="group grid gap-2 px-2 py-0.5 items-center hover:bg-dark-700/50 rounded"
          style={{
            gridTemplateColumns: showDescription ? '28px 1fr 1fr 1fr 28px' : '28px 1fr 1fr 28px',
          }}
        >
          <input
            type="checkbox"
            checked={pair.enabled}
            onChange={e => updatePair(pair.id, { enabled: e.target.checked })}
            className="w-4 h-4 accent-accent-blue"
          />
          <input
            type="text"
            value={pair.key}
            onChange={e => updatePair(pair.id, { key: e.target.value })}
            placeholder={keyPlaceholder}
            className="bg-dark-800 border border-dark-600 rounded px-2 py-1.5 text-sm text-dark-100 placeholder:text-dark-400"
          />
          <input
            type="text"
            value={pair.value}
            onChange={e => updatePair(pair.id, { value: e.target.value })}
            placeholder={valuePlaceholder}
            className="bg-dark-800 border border-dark-600 rounded px-2 py-1.5 text-sm text-dark-100 placeholder:text-dark-400"
          />
          {showDescription && (
            <input
              type="text"
              value={pair.description || ''}
              onChange={e => updatePair(pair.id, { description: e.target.value })}
              placeholder="Description"
              className="bg-dark-800 border border-dark-600 rounded px-2 py-1.5 text-sm text-dark-100 placeholder:text-dark-400"
            />
          )}
          <button
            onClick={() => removePair(pair.id)}
            className="opacity-0 group-hover:opacity-100 p-1 text-dark-400 hover:text-accent-red transition-all cursor-pointer"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}

      {/* Add button */}
      <button
        onClick={addPair}
        className="flex items-center gap-1.5 px-2 py-1.5 text-sm text-dark-300 hover:text-dark-100 hover:bg-dark-700/50 rounded transition-colors cursor-pointer"
      >
        <Plus size={14} />
        Add
      </button>
    </div>
  );
}
