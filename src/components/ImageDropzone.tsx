import { useEffect, useRef, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { ACCEPTED_TYPES, formatBytes, validateImage } from '../lib/validate';

interface Props {
  label: string;
  hint: string;
  file: File | null;
  disabled?: boolean;
  onChange: (file: File | null) => void;
}

const CHIPS = ['JPEG', 'PNG', 'WebP', 'Max 10 MB'];

export default function ImageDropzone({ label, hint, file, disabled, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function accept(candidate: File | undefined) {
    if (!candidate) return;
    const message = await validateImage(candidate);
    setError(message);
    if (!message) onChange(candidate);
  }

  function openPicker() {
    if (!disabled) inputRef.current?.click();
  }

  function clear() {
    setError(null);
    onChange(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span className="text-xs font-medium uppercase tracking-[0.14em]">{label}</span>
        <span className="text-xs text-muted">{hint}</span>
      </div>

      {file && previewUrl ? (
        <div className="relative border border-ink bg-well">
          <img
            src={previewUrl}
            alt={`${label} preview`}
            className="aspect-[4/5] w-full object-contain"
          />
          <button
            type="button"
            onClick={clear}
            disabled={disabled}
            aria-label={`Remove ${label}`}
            className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full border border-ink bg-white transition hover:bg-ink hover:text-white disabled:opacity-40"
          >
            <X size={16} />
          </button>
          <div className="flex items-center justify-between gap-3 border-t border-ink bg-white px-4 py-3 text-sm">
            <span className="truncate">{file.name}</span>
            <span className="shrink-0 text-muted">{formatBytes(file.size)}</span>
          </div>
        </div>
      ) : (
        <div
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-label={`Upload ${label}`}
          onClick={openPicker}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              openPicker();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            if (!disabled) setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            if (!disabled) accept(e.dataTransfer.files[0]);
          }}
          className={`flex aspect-[4/5] w-full cursor-pointer flex-col items-center justify-center gap-3 border px-6 text-center outline-none transition focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 ${
            isDragging
              ? 'border-solid border-ink bg-[#e8e8e8]'
              : 'border-dashed border-line bg-well hover:border-ink'
          }`}
        >
          <ImagePlus size={28} strokeWidth={1.25} />
          <p className="text-sm">
            <span className="underline underline-offset-4">Click to upload</span> or drag &amp; drop
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {CHIPS.map((chip) => (
              <span key={chip} className="rounded-full border border-ink bg-white px-3 py-0.5 text-xs">
                {chip}
              </span>
            ))}
          </div>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_TYPES.join(',')}
        className="hidden"
        onChange={(e) => accept(e.target.files?.[0])}
      />

      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
