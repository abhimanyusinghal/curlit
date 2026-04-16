import { useRef, useState } from 'react';
import { X, Archive, Download, Upload, AlertTriangle } from 'lucide-react';
import { useAppStore } from '../store';
import {
  createBackup,
  downloadBackup,
  parseBackup,
  type BackupData,
  type ImportMode,
} from '../utils/backup';

interface Props {
  open: boolean;
  onClose: () => void;
}

type Tab = 'export' | 'import';

export function BackupModal({ open, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('export');
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [mode, setMode] = useState<ImportMode>('merge');
  const [pendingBackup, setPendingBackup] = useState<BackupData | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const collections = useAppStore(s => s.collections);
  const environments = useAppStore(s => s.environments);
  const history = useAppStore(s => s.history);

  if (!open) return null;

  const totalRequests = collections.reduce((sum, c) => sum + c.requests.length, 0);

  const reset = () => {
    setImportText('');
    setImportError(null);
    setPendingBackup(null);
    setMode('merge');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleExport = () => {
    const snapshot = useAppStore.getState().getBackupSnapshot();
    const backup = createBackup(snapshot, '1.0.0');
    downloadBackup(backup);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setImportText(String(reader.result ?? ''));
      setImportError(null);
      setPendingBackup(null);
    };
    reader.readAsText(file);
  };

  const handleValidate = () => {
    try {
      const backup = parseBackup(importText);
      setPendingBackup(backup);
      setImportError(null);
    } catch (err) {
      setPendingBackup(null);
      setImportError(err instanceof Error ? err.message : 'Invalid backup file');
    }
  };

  const handleConfirmImport = () => {
    if (!pendingBackup) return;
    if (mode === 'replace') {
      const ok = confirm(
        'Replace all data? This will delete your current collections, environments, and history.'
      );
      if (!ok) return;
    }
    useAppStore.getState().importBackup(pendingBackup, mode);
    handleClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-dark-800 border border-dark-600 rounded-xl shadow-2xl w-full max-w-lg mx-4">
        <div className="flex items-center justify-between px-4 py-3 border-b border-dark-600">
          <div className="flex items-center gap-2">
            <Archive size={16} className="text-accent-blue" />
            <h3 className="text-sm font-semibold text-dark-100">Backup &amp; Restore</h3>
          </div>
          <button
            onClick={handleClose}
            className="p-1 text-dark-400 hover:text-dark-200 rounded cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex border-b border-dark-600">
          <button
            onClick={() => setTab('export')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors cursor-pointer ${
              tab === 'export'
                ? 'text-dark-100 border-b-2 border-accent-blue bg-dark-800/50'
                : 'text-dark-400 hover:text-dark-200'
            }`}
          >
            <Download size={14} />
            Export
          </button>
          <button
            onClick={() => setTab('import')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors cursor-pointer ${
              tab === 'import'
                ? 'text-dark-100 border-b-2 border-accent-blue bg-dark-800/50'
                : 'text-dark-400 hover:text-dark-200'
            }`}
          >
            <Upload size={14} />
            Import
          </button>
        </div>

        {tab === 'export' ? (
          <div className="p-4">
            <p className="text-xs text-dark-300 mb-3">
              Download a single JSON file containing all your data.
            </p>
            <div className="bg-dark-900 border border-dark-600 rounded-lg p-3 mb-3">
              <div className="grid grid-cols-3 gap-3 text-center">
                <Stat label="Collections" value={collections.length} />
                <Stat label="Requests" value={totalRequests} />
                <Stat label="Environments" value={environments.length} />
              </div>
              <div className="mt-3 pt-3 border-t border-dark-700 text-[11px] text-dark-400 text-center">
                {history.length} history {history.length === 1 ? 'entry' : 'entries'} also included
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={handleClose}
                className="px-4 py-2 text-sm text-dark-300 hover:text-dark-100 bg-dark-700 rounded-lg cursor-pointer"
              >
                Close
              </button>
              <button
                onClick={handleExport}
                className="flex items-center gap-1.5 px-4 py-2 text-sm text-white bg-accent-blue hover:bg-accent-blue/80 rounded-lg cursor-pointer"
              >
                <Download size={14} />
                Download Backup
              </button>
            </div>
          </div>
        ) : (
          <div className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-dark-200 bg-dark-700 hover:bg-dark-600 rounded cursor-pointer"
              >
                <Upload size={12} />
                Choose File
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                onChange={handleFileSelect}
                className="hidden"
              />
              <span className="text-[11px] text-dark-500">or paste JSON below</span>
            </div>

            <textarea
              value={importText}
              onChange={e => {
                setImportText(e.target.value);
                setPendingBackup(null);
                setImportError(null);
              }}
              placeholder="Paste CurlIt backup JSON here..."
              className="w-full h-32 bg-dark-700 border border-dark-600 rounded-lg p-3 text-xs text-dark-200 font-mono placeholder:text-dark-500 resize-none"
            />

            {importError && (
              <div className="mt-2 flex items-start gap-2 px-3 py-2 bg-accent-red/10 border border-accent-red/30 rounded text-xs text-accent-red">
                <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
                <span>{importError}</span>
              </div>
            )}

            {pendingBackup && (
              <div className="mt-3 p-3 bg-dark-900 border border-dark-600 rounded-lg">
                <div className="text-[11px] text-dark-400 mb-2">Backup contents:</div>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <Stat label="Collections" value={pendingBackup.data.collections.length} />
                  <Stat
                    label="Requests"
                    value={pendingBackup.data.collections.reduce(
                      (sum, c) => sum + c.requests.length,
                      0
                    )}
                  />
                  <Stat label="Environments" value={pendingBackup.data.environments.length} />
                </div>
              </div>
            )}

            <div className="mt-3">
              <div className="text-[11px] text-dark-400 mb-1.5">Import mode:</div>
              <div className="flex gap-2">
                <ModeButton
                  selected={mode === 'merge'}
                  onClick={() => setMode('merge')}
                  label="Merge"
                  description="Add to existing data"
                />
                <ModeButton
                  selected={mode === 'replace'}
                  onClick={() => setMode('replace')}
                  label="Replace"
                  description="Overwrite everything"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={handleClose}
                className="px-4 py-2 text-sm text-dark-300 hover:text-dark-100 bg-dark-700 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              {pendingBackup ? (
                <button
                  onClick={handleConfirmImport}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm text-white bg-accent-blue hover:bg-accent-blue/80 rounded-lg cursor-pointer"
                >
                  <Upload size={14} />
                  {mode === 'replace' ? 'Replace All' : 'Merge Backup'}
                </button>
              ) : (
                <button
                  onClick={handleValidate}
                  disabled={!importText.trim()}
                  className="px-4 py-2 text-sm text-white bg-accent-blue hover:bg-accent-blue/80 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg cursor-pointer"
                >
                  Validate
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-lg font-semibold text-dark-100">{value}</div>
      <div className="text-[10px] text-dark-400 uppercase tracking-wider">{label}</div>
    </div>
  );
}

function ModeButton({
  selected,
  onClick,
  label,
  description,
}: {
  selected: boolean;
  onClick: () => void;
  label: string;
  description: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 text-left px-3 py-2 rounded-lg cursor-pointer transition-colors border ${
        selected
          ? 'bg-accent-blue/20 border-accent-blue/40 text-dark-100'
          : 'bg-dark-700 border-transparent text-dark-300 hover:bg-dark-600'
      }`}
    >
      <div className="text-xs font-medium">{label}</div>
      <div className="text-[10px] text-dark-400">{description}</div>
    </button>
  );
}
