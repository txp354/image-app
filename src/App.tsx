import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Loader2 } from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import AuthForm from './components/AuthForm';
import ImageDropzone from './components/ImageDropzone';
import ResultViewer from './components/ResultViewer';
import ErrorBanner from './components/ErrorBanner';
import { generateImage } from './lib/api';
import { supabase } from './lib/supabase';

type Status = 'idle' | 'ready' | 'loading' | 'success' | 'error';

export default function App() {
  // undefined until the stored session has been read, then a session or null.
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [file1, setFile1] = useState<File | null>(null);
  const [file2, setFile2] = useState<File | null>(null);
  const [result, setResult] = useState<{ url: string; type: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

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

  async function handleSignOut() {
    handleReset();
    await supabase.auth.signOut();
  }

  const displayName = session?.user.user_metadata?.full_name || session?.user.email;

  return (
    <div className="min-h-screen">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
          <span className="text-lg font-medium uppercase tracking-[0.3em]">Try-On Studio</span>
          {session ? (
            <div className="flex items-center gap-4">
              <span className="hidden max-w-[16rem] truncate text-xs uppercase tracking-[0.14em] text-muted sm:inline">
                {displayName}
              </span>
              <button
                type="button"
                onClick={handleSignOut}
                className="border border-ink bg-white px-4 py-2 text-xs font-medium uppercase tracking-[0.14em] transition hover:bg-ink hover:text-white"
              >
                Sign out
              </button>
            </div>
          ) : (
            <span className="hidden text-xs uppercase tracking-[0.14em] text-muted sm:inline">
              AI image merger
            </span>
          )}
        </div>
      </header>

      {session === undefined ? null : !session ? (
        <main className="mx-auto max-w-6xl px-4 pb-16 pt-12 sm:px-6">
          <h1 className="text-center text-4xl font-medium sm:text-5xl">Welcome</h1>
          <p className="mx-auto mt-3 mb-10 max-w-md text-center text-muted">
            Sign in or create an account to use the virtual try-on studio.
          </p>
          <AuthForm />
        </main>
      ) : (
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
      )}
    </div>
  );
}
