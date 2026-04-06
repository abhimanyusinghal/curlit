import { useState, useRef } from 'react';
import { X, FileCode, Upload, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useAppStore } from '../store';
import { parseOpenApiInput, isOpenApiSpec, parseOpenApiSpec } from '../utils/openapi';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function OpenApiImportModal({ open, onClose }: Props) {
  const [specText, setSpecText] = useState('');
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<{ name: string; count: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const handleParse = (text: string) => {
    setSpecText(text);
    setError('');
    setPreview(null);

    if (!text.trim()) return;

    try {
      const parsed = parseOpenApiInput(text);
      if (!isOpenApiSpec(parsed)) {
        setError('Not a valid OpenAPI/Swagger specification. Must contain openapi/swagger version, info, and paths.');
        return;
      }
      const result = parseOpenApiSpec(parsed);
      setPreview({ name: result.name, count: result.requests.length });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to parse specification');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        handleParse(reader.result);
      }
    };
    reader.readAsText(file);
    // Reset so the same file can be re-selected
    e.target.value = '';
  };

  const handleImport = () => {
    if (!specText.trim()) return;

    try {
      const parsed = parseOpenApiInput(specText);
      if (!isOpenApiSpec(parsed)) {
        setError('Not a valid OpenAPI/Swagger specification.');
        return;
      }

      const { name, requests } = parseOpenApiSpec(parsed);

      if (requests.length === 0) {
        setError('No operations found in the specification.');
        return;
      }

      // Create a collection with all the requests
      useAppStore.getState().createCollection(name);
      const newCollection = useAppStore.getState().collections[useAppStore.getState().collections.length - 1];

      for (const req of requests) {
        useAppStore.getState().saveRequestToCollection(newCollection.id, req);
      }

      // Open the first request in a tab
      const saved = useAppStore.getState().collections.find(c => c.id === newCollection.id);
      if (saved && saved.requests.length > 0) {
        useAppStore.getState().openRequestFromCollection(newCollection.id, saved.requests[0].id);
      }

      setSpecText('');
      setError('');
      setPreview(null);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to import specification');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-dark-800 border border-dark-600 rounded-xl shadow-2xl w-full max-w-2xl mx-4">
        <div className="flex items-center justify-between px-4 py-3 border-b border-dark-600">
          <div className="flex items-center gap-2">
            <FileCode size={16} className="text-accent-green" />
            <h3 className="text-sm font-semibold text-dark-100">Import OpenAPI / Swagger</h3>
          </div>
          <button onClick={onClose} className="p-1 text-dark-400 hover:text-dark-200 rounded cursor-pointer">
            <X size={16} />
          </button>
        </div>

        <div className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <p className="text-xs text-dark-400 flex-1">
              Paste an OpenAPI 3.x or Swagger 2.0 spec (JSON or YAML), or upload a file.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.yaml,.yml"
              onChange={handleFileUpload}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-dark-300 hover:text-dark-100 bg-dark-700 hover:bg-dark-600 rounded-md transition-colors cursor-pointer"
            >
              <Upload size={13} />
              Upload file
            </button>
          </div>

          <textarea
            value={specText}
            onChange={e => handleParse(e.target.value)}
            placeholder={`Paste your OpenAPI/Swagger spec here...\n\ne.g.\nopenapi: "3.0.0"\ninfo:\n  title: My API\n  version: "1.0"\npaths:\n  /users:\n    get:\n      summary: List users`}
            className="w-full h-56 bg-dark-700 border border-dark-600 rounded-lg p-3 text-sm text-dark-200 font-mono placeholder:text-dark-500 resize-none"
            autoFocus
          />

          {error && (
            <div className="flex items-start gap-2 mt-2 p-2 bg-accent-red/10 border border-accent-red/30 rounded-lg">
              <AlertCircle size={14} className="text-accent-red mt-0.5 flex-shrink-0" />
              <span className="text-xs text-accent-red">{error}</span>
            </div>
          )}

          {preview && !error && (
            <div className="flex items-center gap-2 mt-2 p-2 bg-accent-green/10 border border-accent-green/30 rounded-lg">
              <CheckCircle2 size={14} className="text-accent-green flex-shrink-0" />
              <span className="text-xs text-accent-green">
                Found <strong>{preview.count}</strong> request{preview.count !== 1 ? 's' : ''} in <strong>{preview.name}</strong>
              </span>
            </div>
          )}

          <div className="flex justify-end gap-2 mt-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-dark-300 hover:text-dark-100 bg-dark-700 rounded-lg cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleImport}
              disabled={!preview || !!error}
              className="px-4 py-2 text-sm text-white bg-accent-green hover:bg-accent-green/80 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg cursor-pointer"
            >
              Import as Collection
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
