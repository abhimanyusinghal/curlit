import { useRef } from 'react';
import { Upload, X, FileIcon } from 'lucide-react';
import { setFile, removeFile, getFile } from '../utils/fileStore';

const BINARY_ENTRY_ID = '__binary__';

interface BinaryFileInfo {
  fileName: string;
  fileSize: number;
  fileType: string;
}

interface Props {
  requestId: string;
  binaryFile?: BinaryFileInfo;
  onChange: (binaryFile?: BinaryFileInfo) => void;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function BinaryBodyEditor({ requestId, binaryFile, onChange }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (file: File) => {
    setFile(requestId, BINARY_ENTRY_ID, file);
    onChange({
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type || 'application/octet-stream',
    });
  };

  const handleRemoveFile = () => {
    removeFile(requestId, BINARY_ENTRY_ID);
    onChange(undefined);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  };

  const isStale = binaryFile && !getFile(requestId, BINARY_ENTRY_ID);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-dark-400">
        Select a file to send as the raw request body. The file's content type will be used as the Content-Type header (unless overridden in Headers).
      </p>

      {binaryFile ? (
        <div className="flex items-center gap-3 bg-dark-700 border border-dark-600 rounded-lg px-4 py-3">
          <FileIcon size={20} className="text-accent-blue shrink-0" />
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-sm text-dark-100 truncate" title={binaryFile.fileName}>
              {binaryFile.fileName}
            </span>
            <div className="flex items-center gap-2 text-xs text-dark-400">
              <span>{formatFileSize(binaryFile.fileSize)}</span>
              <span>{binaryFile.fileType}</span>
              {isStale && (
                <span className="text-accent-yellow" title="File not in memory — re-select to send">
                  (stale — re-select to send)
                </span>
              )}
            </div>
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-2 py-1 text-xs text-dark-300 hover:text-dark-100 bg-dark-600 hover:bg-dark-500 rounded transition-colors cursor-pointer"
          >
            Change
          </button>
          <button
            onClick={handleRemoveFile}
            className="p-1 text-dark-400 hover:text-accent-red transition-colors cursor-pointer"
            title="Remove file"
          >
            <X size={16} />
          </button>
        </div>
      ) : (
        <button
          onClick={() => fileInputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
          className="flex flex-col items-center gap-2 py-8 border-2 border-dashed border-dark-600 hover:border-dark-400 rounded-lg text-dark-400 hover:text-dark-200 transition-colors cursor-pointer"
        >
          <Upload size={24} />
          <span className="text-sm">Click or drag a file here</span>
        </button>
      )}

      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0];
          if (file) handleFileSelect(file);
          e.target.value = '';
        }}
      />
    </div>
  );
}
