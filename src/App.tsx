import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Loader2 } from 'lucide-react';
import ImageDropzone from './components/ImageDropzone';
import ResultViewer from './components/ResultViewer';
import ErrorBanner from './components/ErrorBanner';
import { generateImage } from './lib/api';

type Status = 'idle' | 'ready' | 'loading' | 'success' | 'error';

export default function App() {
  const [file1, setFile1] = useState<File | null>(null);
  const [file2, setFile2] = useState<File | null>(null);
  const [result, setResult] = useState<{ url: string; type: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Revoke the previous result URL whenever it is replaced, and on unmount.
  const resultUrlRef = useRef<string | null>(null);
  useEffect(() => {
    const previous = resultUrlRef.current;
    resultUrlRef.current = result?.url ?? null;
    if (previous && previous !== result?.url) URL.revokeObjectURL(previous);
  }, [result]);
  useEffect(() => () => {
    if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
  }, []);

  const status: Status = isLoading
    ? 'loading'
    : error
      ? 'error'
      : result
        ? 'success'
        : file1 && file2
          ? 'ready'
          : 'idle';
  const canGenerate = Boolean(file1 && file2) && !isLoading;

  async function handleGenerate() {
    if (!file1 || !file2) return;
    setIsLoading(true);
    setError(null);
    try {
      setResult(await generateImage(file1, file2));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setIsLoading(false);
    }
  }

  function handleReset() {
    setFile1(null);
    setFile2(null);
    setResult(null);
    setError(null);
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
          <span className="text-lg font-medium uppercase tracking-[0.3em]">Try-On Studio</span>
          <span className="hidden text-xs uppercase tracking-[0.14em] text-muted sm:inline">
            AI image merger
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-6">
        <nav className="text-sm text-muted" aria-label="Breadcrumb">
          Studio <span className="mx-2">›</span> <span className="text-ink">Virtual try-on</span>
        </nav>
        <h1 className="mt-4 text-4xl font-medium sm:text-5xl">Virtual try-on</h1>
        <p className="mt-3 max-w-xl text-muted">
          Upload a photo of a person and a garment. We'll merge them into a single image.
        </p>

        <div className="mt-10 grid gap-10 lg:grid-cols-2 lg:gap-12">
          <section aria-label="Inputs" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <ImageDropzone
                label="Image 1 · Model"
                hint="Person photo"
                file={file1}
                disabled={isLoading}
                onChange={setFile1}
              />
              <ImageDropzone
                label="Image 2 · Garment"
                hint="Clothing item"
                file={file2}
                disabled={isLoading}
                onChange={setFile2}
              />
            </div>

            <button
              type="button"
              onClick={handleGenerate}
              disabled={!canGenerate}
              className="flex w-full items-center justify-between bg-ink px-6 py-5 text-sm font-medium uppercase tracking-[0.14em] text-white transition hover:bg-black/80 disabled:cursor-not-allowed disabled:bg-[#bdbdbd]"
            >
              <span>{isLoading ? 'Generating…' : 'Generate'}</span>
              {isLoading ? <Loader2 size={18} className="animate-spin" /> : <ArrowRight size={18} />}
            </button>
            {status === 'idle' && (
              <p className="text-center text-xs text-muted">Add both images to enable Generate.</p>
            )}

            {error && (
              <ErrorBanner
                message={error}
                onRetry={handleGenerate}
                onDismiss={() => setError(null)}
              />
            )}
          </section>

          <section aria-label="Output" className="lg:sticky lg:top-8 lg:self-start">
            <ResultViewer
              isLoading={isLoading}
              resultUrl={result?.url ?? null}
              resultType={result?.type ?? null}
              onReset={handleReset}
            />
          </section>
        </div>
      </main>
    </div>
  );
}
