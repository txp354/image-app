import { useState, type FormEvent } from 'react';
import { ArrowRight, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

type Mode = 'signIn' | 'signUp';

const inputClass =
  'mt-2 w-full border border-ink bg-white px-4 py-3 text-base outline-none focus:ring-2 focus:ring-ink/20';
const labelClass = 'block text-xs font-medium uppercase tracking-[0.14em]';

export default function AuthForm() {
  const [mode, setMode] = useState<Mode>('signIn');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setNotice(null);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === 'signUp') {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { full_name: name.trim() },
            emailRedirectTo: window.location.origin,
          },
        });
        if (error) throw error;
        // With email confirmation on, Supabase returns no session until the link is clicked.
        if (!data.session) {
          setNotice(`We sent a confirmation link to ${email.trim()}. Open it, then sign in.`);
          setPassword('');
          setMode('signIn');
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      }
      // On success, App picks up the new session via onAuthStateChange.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setIsSubmitting(false);
    }
  }

  const isSignUp = mode === 'signUp';

  return (
    <div className="mx-auto max-w-md">
      <div className="grid grid-cols-2 border border-ink" role="tablist">
        {(['signIn', 'signUp'] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => switchMode(m)}
            className={`py-3 text-xs font-medium uppercase tracking-[0.14em] transition ${
              mode === m ? 'bg-ink text-white' : 'bg-white hover:bg-well'
            }`}
          >
            {m === 'signIn' ? 'Sign in' : 'Create account'}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="mt-8 space-y-5">
        {isSignUp && (
          <label className={labelClass}>
            Name
            <input
              type="text"
              required
              maxLength={100}
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
            />
          </label>
        )}
        <label className={labelClass}>
          Email
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Password
          <input
            type="password"
            required
            minLength={isSignUp ? 8 : undefined}
            autoComplete={isSignUp ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
          {isSignUp && (
            <span className="mt-2 block text-xs normal-case tracking-normal text-muted">
              At least 8 characters.
            </span>
          )}
        </label>

        {error && (
          <p role="alert" className="border border-red-700 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="border border-ink bg-well p-3 text-sm">
            {notice}
          </p>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="flex w-full items-center justify-between bg-ink px-6 py-5 text-sm font-medium uppercase tracking-[0.14em] text-white transition hover:bg-black/80 disabled:cursor-not-allowed disabled:bg-[#bdbdbd]"
        >
          <span>{isSignUp ? 'Create account' : 'Sign in'}</span>
          {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <ArrowRight size={18} />}
        </button>
      </form>
    </div>
  );
}
