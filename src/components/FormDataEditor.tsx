import { useRef } from 'react';
import { Plus, Trash2, Upload, X } from 'lucide-react';
import type { FormDataEntry } from '../types';
import { createFormDataEntry } from '../types';
import { setFile, removeFile, getFile } from '../utils/fileStore';

interface Props {
  requestId: string;
  entries: FormDataEntry[];
  onChange: (entries: FormDataEntry[]) => void;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function FormDataEditor({ requestId, entries, onChange }: Props) {
  const fileInputRefs = useRef<Map<string, HTMLInputElement>>(new Map());

  const updateEntry = (id: string, updates: Partial<FormDataEntry>) => {
    onChange(entries.map(e => (e.id === id ? { ...e, ...updates } : e)));
  };

  const removeEntry = (id: string) => {
    removeFile(requestId, id);
    onChange(entries.filter(e => e.id !== id));
  };

  const addEntry = () => {
    onChange([...entries, createFormDataEntry()]);
  };

  const handleTypeChange = (entry: FormDataEntry, valueType: 'text' | 'file') => {
    if (valueType === (entry.valueType || 'text')) return;
    if ((entry.valueType || 'text') === 'file') {
      removeFile(requestId, entry.id);
    }
    updateEntry(entry.id, {
      valueType,
      value: '',
      fileName: undefined,
      fileSize: undefined,
      fileType: undefined,
    });
  };

  const handleFileSelect = (entry: FormDataEntry, file: File) => {
    setFile(requestId, entry.id, file);
    updateEntry(entry.id, {
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type || 'application/octet-stream',
    });
  };

  const handleRemoveFile = (entry: FormDataEntry) => {
    removeFile(requestId, entry.id);
    updateEntry(entry.id, {
      fileName: undefined,
      fileSize: undefined,
      fileType: undefined,
    });
  };

  return (
    <div className="flex flex-col gap-1">
      {/* Header */}
      <div
        className="grid gap-2 px-2 py-1 text-xs text-dark-300 font-medium"
        style={{ gridTemplateColumns: '28px 80px 1fr 1fr 28px' }}
      >
        <div />
        <div>Type</div>
        <div>Key</div>
        <div>Value</div>
        <div />
      </div>

      {/* Rows */}
      {entries.map(entry => (
        <div
          key={entry.id}
          className="group grid gap-2 px-2 py-0.5 items-center hover:bg-dark-700/50 rounded"
          style={{ gridTemplateColumns: '28px 80px 1fr 1fr 28px' }}
        >
          <input
            type="checkbox"
            checked={entry.enabled}
            onChange={e => updateEntry(entry.id, { enabled: e.target.checked })}
            className="w-4 h-4 accent-accent-blue"
          />

          <select
            value={entry.valueType || 'text'}
            onChange={e => handleTypeChange(entry, e.target.value as 'text' | 'file')}
            className="bg-dark-800 border border-dark-600 rounded px-1.5 py-1.5 text-xs text-dark-100 cursor-pointer focus:outline-none focus:border-accent-blue"
          >
            <option value="text">Text</option>
            <option value="file">File</option>
          </select>

          <input
            type="text"
            value={entry.key}
            onChange={e => updateEntry(entry.id, { key: e.target.value })}
            placeholder="Key"
            className="bg-dark-800 border border-dark-600 rounded px-2 py-1.5 text-sm text-dark-100 placeholder:text-dark-400"
          />

          {(entry.valueType || 'text') === 'text' ? (
            <input
              type="text"
              value={entry.value}
              onChange={e => updateEntry(entry.id, { value: e.target.value })}
              placeholder="Value"
              className="bg-dark-800 border border-dark-600 rounded px-2 py-1.5 text-sm text-dark-100 placeholder:text-dark-400"
            />
          ) : (
            <div className="flex items-center gap-1.5">
              {entry.fileName ? (
                <div className="flex items-center gap-1.5 flex-1 min-w-0 bg-dark-800 border border-dark-600 rounded px-2 py-1 text-sm">
                  <span className="truncate text-dark-100" title={entry.fileName}>
                    {entry.fileName}
                  </span>
                  {entry.fileSize != null && (
                    <span className="text-dark-400 text-xs shrink-0">
                      ({formatFileSize(entry.fileSize)})
                    </span>
                  )}
                  {!getFile(requestId, entry.id) && (
                    <span className="text-accent-yellow text-xs shrink-0" title="File not in memory — re-select to send">
                      (stale)
                    </span>
                  )}
                  <button
                    onClick={() => handleRemoveFile(entry)}
                    className="shrink-0 p-0.5 text-dark-400 hover:text-accent-red transition-colors cursor-pointer"
                    title="Remove file"
                  >
                    <X size={12} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileInputRefs.current.get(entry.id)?.click()}
                  className="flex items-center gap-1.5 flex-1 bg-dark-800 border border-dark-600 border-dashed rounded px-2 py-1.5 text-sm text-dark-400 hover:text-dark-200 hover:border-dark-400 transition-colors cursor-pointer"
                >
                  <Upload size={14} />
                  Select File
                </button>
              )}
              <input
                ref={el => {
                  if (el) fileInputRefs.current.set(entry.id, el);
                  else fileInputRefs.current.delete(entry.id);
                }}
                type="file"
                className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) handleFileSelect(entry, file);
                  e.target.value = '';
                }}
              />
              {entry.fileName && (
                <button
                  onClick={() => fileInputRefs.current.get(entry.id)?.click()}
                  className="shrink-0 p-1 text-dark-400 hover:text-dark-200 transition-colors cursor-pointer"
                  title="Change file"
                >
                  <Upload size={14} />
                </button>
              )}
            </div>
          )}

          <button
            onClick={() => removeEntry(entry.id)}
            className="opacity-0 group-hover:opacity-100 p-1 text-dark-400 hover:text-accent-red transition-all cursor-pointer"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}

      {/* Add button */}
      <button
        onClick={addEntry}
        className="flex items-center gap-1.5 px-2 py-1.5 text-sm text-dark-300 hover:text-dark-100 hover:bg-dark-700/50 rounded transition-colors cursor-pointer"
      >
        <Plus size={14} />
        Add
      </button>
    </div>
  );
}
