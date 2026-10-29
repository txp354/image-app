import { AlertCircle, RotateCw, X } from 'lucide-react';

interface Props {
  message: string;
  onRetry: () => void;
  onDismiss: () => void;
}

export default function ErrorBanner({ message, onRetry, onDismiss }: Props) {
  return (
    <div role="alert" className="flex items-start gap-3 border border-red-700 bg-red-50 p-4">
      <AlertCircle size={18} className="mt-0.5 shrink-0 text-red-700" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-red-700">
          Generation failed
        </p>
        <p className="mt-1 break-words text-sm">{message}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 inline-flex items-center gap-2 border border-ink bg-white px-4 py-2 text-xs font-medium uppercase tracking-[0.14em] transition hover:bg-ink hover:text-white"
        >
          <RotateCw size={14} /> Retry
        </button>
      </div>
      <button type="button" onClick={onDismiss} aria-label="Dismiss error" className="shrink-0">
        <X size={18} />
      </button>
    </div>
  );
}
