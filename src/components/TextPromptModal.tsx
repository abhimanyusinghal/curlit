import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { X } from 'lucide-react';

interface Props {
  open: boolean;
  title: string;
  label: string;
  initialValue?: string;
  placeholder?: string;
  submitLabel: string;
  onSubmit: (value: string) => void;
  onClose: () => void;
}

type DialogProps = Omit<Props, 'open'>;

/**
 * A small in-app replacement for `window.prompt()`. Electron intentionally
 * does not support JavaScript prompt dialogs, so user-entered names must be
 * collected in renderer UI instead.
 */
export function TextPromptModal({ open, ...props }: Props) {
  if (!open) return null;

  // Mount the dialog only while it is open so its field naturally resets to
  // the supplied initial value for every prompt without an effect-driven state
  // update.
  return <TextPromptDialog {...props} />;
}

function TextPromptDialog({
  title,
  label,
  initialValue = '',
  placeholder,
  submitLabel,
  onSubmit,
  onClose,
}: DialogProps) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const inputId = useId();

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!value) return;
    onSubmit(value);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="bg-dark-800 border border-dark-600 rounded-xl shadow-2xl w-full max-w-sm mx-4"
        onKeyDown={event => {
          if (event.key === 'Escape') onClose();
        }}
      >
        <form onSubmit={handleSubmit}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-dark-600">
            <h3 id={titleId} className="text-sm font-semibold text-dark-100">{title}</h3>
            <button
              type="button"
              onClick={onClose}
              className="p-1 text-dark-400 hover:text-dark-200 rounded cursor-pointer"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>
          <div className="p-4">
            <label htmlFor={inputId} className="block text-xs text-dark-300 mb-2">
              {label}
            </label>
            <input
              ref={inputRef}
              id={inputId}
              type="text"
              value={value}
              onChange={event => setValue(event.target.value)}
              placeholder={placeholder}
              className="w-full bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-sm text-dark-100 placeholder:text-dark-500 focus:outline-none focus:border-accent-blue"
              autoFocus
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm text-dark-300 hover:text-dark-100 bg-dark-700 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!value}
                className="px-4 py-2 text-sm text-white bg-accent-blue hover:bg-accent-blue/80 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg cursor-pointer"
              >
                {submitLabel}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
