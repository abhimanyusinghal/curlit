import { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { Plus, Trash2, AlignJustify, List } from 'lucide-react';
import type { KeyValuePair } from '../types';
import { createKeyValuePair } from '../types';

interface Props {
  pairs: KeyValuePair[];
  onChange: (pairs: KeyValuePair[]) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  showDescription?: boolean;
}

function pairsToText(pairs: KeyValuePair[]): string {
  return pairs
    .map(p => {
      const line = `${p.key}: ${p.value}`;
      return p.enabled ? line : `// ${line}`;
    })
    .join('\n');
}

function textToPairs(text: string, descriptionMap: Map<string, string>): KeyValuePair[] {
  return text.split('\n')
    .filter(line => line.trim() !== '')
    .map(line => {
      const disabled = line.startsWith('//');
      const content = disabled ? line.slice(2).trimStart() : line;
      const colonIdx = content.indexOf(': ');
      const key = colonIdx >= 0 ? content.slice(0, colonIdx) : content;
      const value = colonIdx >= 0 ? content.slice(colonIdx + 2) : '';
      const description = descriptionMap.get(key);
      return createKeyValuePair({ key, value, enabled: !disabled, description });
    });
}

export function KeyValueEditor({
  pairs,
  onChange,
  keyPlaceholder = 'Key',
  valuePlaceholder = 'Value',
  showDescription = false,
}: Props) {
  const [bulkEdit, setBulkEdit] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const descriptionMapRef = useRef<Map<string, string>>(new Map());
  const bulkTextRef = useRef(bulkText);
  bulkTextRef.current = bulkText;

  const commitBulkText = useCallback(() => {
    onChange(textToPairs(bulkTextRef.current, descriptionMapRef.current));
  }, [onChange]);

  // Flush local text to store before the component unmounts while still in bulk mode
  // (e.g. user switches to a different request tab or closes the tab)
  useEffect(() => {
    if (!bulkEdit) return;
    return () => commitBulkText();
  }, [bulkEdit, commitBulkText]);

  const enterBulkEdit = useCallback(() => {
    const map = new Map<string, string>();
    for (const p of pairs) {
      if (p.key && p.description) map.set(p.key, p.description);
    }
    descriptionMapRef.current = map;
    setBulkText(pairsToText(pairs));
    setBulkEdit(true);
  }, [pairs]);

  const exitBulkEdit = useCallback(() => {
    commitBulkText();
    setBulkEdit(false);
  }, [commitBulkText]);

  const updatePair = (id: string, updates: Partial<KeyValuePair>) => {
    onChange(pairs.map(p => (p.id === id ? { ...p, ...updates } : p)));
  };

  const removePair = (id: string) => {
    onChange(pairs.filter(p => p.id !== id));
  };

  const addPair = () => {
    onChange([...pairs, createKeyValuePair()]);
  };

  const placeholderText = useMemo(
    () => `${keyPlaceholder}: ${valuePlaceholder}\n// disabled-${keyPlaceholder.toLowerCase()}: ${valuePlaceholder.toLowerCase()}`,
    [keyPlaceholder, valuePlaceholder],
  );

  return (
    <div className="flex flex-col gap-1">
      {/* Toolbar */}
      <div className="flex items-center justify-end px-2 py-0.5">
        <button
          onClick={bulkEdit ? exitBulkEdit : enterBulkEdit}
          className="flex items-center gap-1 px-2 py-1 text-[11px] text-dark-300 hover:text-dark-100 bg-dark-700 hover:bg-dark-600 rounded transition-colors cursor-pointer"
          title={bulkEdit ? 'Switch to form view' : 'Bulk edit as text'}
        >
          {bulkEdit ? <List size={12} /> : <AlignJustify size={12} />}
          {bulkEdit ? 'Form' : 'Bulk Edit'}
        </button>
      </div>

      {bulkEdit ? (
        <textarea
          value={bulkText}
          onChange={e => setBulkText(e.target.value)}
          onBlur={commitBulkText}
          placeholder={placeholderText}
          spellCheck={false}
          className="w-full min-h-[180px] bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-sm text-dark-100 font-mono placeholder:text-dark-400 resize-y focus:outline-none focus:border-accent-blue"
        />
      ) : (
        <>
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
        </>
      )}
    </div>
  );
}
