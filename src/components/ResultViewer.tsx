import { useEffect, useState } from 'react';
import { Download, Loader2, RotateCcw, Sparkles } from 'lucide-react';

interface Props {
  isLoading: boolean;
  resultUrl: string | null;
  resultType: string | null;
  onReset: () => void;
}

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export default function ResultViewer({ isLoading, resultUrl, resultType, onReset }: Props) {
  const elapsed = useElapsedSeconds(isLoading);

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-xs font-medium uppercase tracking-[0.14em]">Result</span>
        {isLoading && <span className="text-xs tabular-nums text-muted">{elapsed}s</span>}
      </div>

      <div className="relative flex aspect-[4/5] w-full items-center justify-center overflow-hidden border border-ink bg-well">
        {isLoading ? (
          <>
            <div className="skeleton absolute inset-0" />
            <div className="relative flex flex-col items-center gap-3 px-6 text-center">
              <Loader2 size={28} strokeWidth={1.5} className="animate-spin" />
              <p className="text-xs font-medium uppercase tracking-[0.14em]">
                {elapsed < 3 ? 'Uploading images…' : 'Generating your look…'}
              </p>
              <p className="text-xs text-muted">This can take up to a minute</p>
            </div>
          </>
        ) : resultUrl ? (
          <img src={resultUrl} alt="Generated result" className="h-full w-full object-contain" />
        ) : (
          <div className="flex flex-col items-center gap-3 px-6 text-center text-muted">
            <Sparkles size={28} strokeWidth={1.25} />
            <p className="text-sm">Your generated image will appear here.</p>
          </div>
        )}
      </div>

      {resultUrl && !isLoading && (
        <div className="mt-4 grid grid-cols-2 gap-3">
          <a
            href={resultUrl}
            download={`tryon-result.${EXTENSIONS[resultType ?? ''] ?? 'png'}`}
            className="inline-flex items-center justify-center gap-2 bg-ink px-4 py-4 text-xs font-medium uppercase tracking-[0.14em] text-white transition hover:bg-black/80"
          >
            <Download size={16} /> Download
          </a>
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center justify-center gap-2 border border-ink bg-white px-4 py-4 text-xs font-medium uppercase tracking-[0.14em] transition hover:bg-ink hover:text-white"
          >
            <RotateCcw size={16} /> Reset
          </button>
        </div>
      )}
    </div>
  );
}

function useElapsedSeconds(active: boolean): number {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    setSeconds(0);
    if (!active) return;
    const start = Date.now();
    const id = setInterval(() => setSeconds(Math.floor((Date.now() - start) / 1000)), 500);
    return () => clearInterval(id);
  }, [active]);
  return seconds;
}
