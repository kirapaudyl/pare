import { useState } from 'react';
import { supabase } from '../lib/supabase';

export default function Auth() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
      if (error) setError(error.message);
      else if (!data.session) setNotice('Check your email and click the confirmation link, then sign in.');
    }
    setBusy(false);
  };

  const field = 'h-11 w-full rounded-xl border border-line bg-paper px-3.5 text-[15px] outline-none focus:border-ink';

  return (
    <div className="grid min-h-screen place-items-center px-5">
      <form onSubmit={submit} className="w-full max-w-sm rounded-xl2 bg-card p-7 shadow-lift">
        <h1 className="font-display text-3xl font-bold tracking-tight">pare</h1>
        <p className="mt-1 text-sm text-muted">
          {mode === 'signin' ? 'Sign in to open your brain.' : 'Create an account to start saving your data.'}
        </p>

        <label className="mt-6 block text-sm font-semibold" htmlFor="email">Email</label>
        <input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={`${field} mt-1.5`} />

        <label className="mt-4 block text-sm font-semibold" htmlFor="password">Password</label>
        <input
          id="password" type="password" required minLength={8}
          autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          value={password} onChange={(e) => setPassword(e.target.value)} className={`${field} mt-1.5`}
        />

        {error && <p role="alert" className="mt-4 text-sm text-red-600">{error}</p>}
        {notice && <p role="status" className="mt-4 text-sm text-money">{notice}</p>}

        <button disabled={busy} className="mt-6 h-11 w-full rounded-xl bg-ink text-sm font-semibold text-white disabled:opacity-40">
          {busy ? 'Please wait' : mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>
        <button
          type="button" onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(null); setNotice(null); }}
          className="mt-4 w-full text-center text-sm font-semibold text-muted hover:text-ink"
        >
          {mode === 'signin' ? 'New here? Create an account' : 'Have an account? Sign in'}
        </button>
      </form>
    </div>
  );
}
