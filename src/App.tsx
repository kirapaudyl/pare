import { Suspense, lazy, useEffect, useState } from 'react';
import { Flame, LayoutDashboard, Library, LogOut, Notebook, Plus, Wallet, X } from 'lucide-react';
import Dashboard from './components/Dashboard';
import Journal from './components/Journal';
import Resources from './components/Resources';
import QuickDump from './components/QuickDump';
import Auth from './components/Auth';
import SetupNotice from './components/SetupNotice';
import { isSupabaseConfigured } from './lib/supabase';
import LegacyImport from './components/LegacyImport';
import { useBrainStore, useStreak } from './store/useBrainStore';

// Finance loads on demand so the rest of Pare stays as light as before.
const FinanceView = lazy(() => import('./components/finance/FinanceView'));

type View = 'dashboard' | 'journal' | 'resources' | 'finance';

export default function App() {
  if (!isSupabaseConfigured) return <SetupNotice />;
  return <Gate />;
}

function Gate() {
  const status = useBrainStore((s) => s.status);
  const init = useBrainStore((s) => s.init);
  useEffect(() => init(), [init]);

  if (status === 'signed-out') return <Auth />;
  if (status === 'loading') return <div className="grid min-h-screen place-items-center text-sm text-muted">Loading your brain&hellip;</div>;
  if (status === 'error') return <LoadError />;
  return <Shell />;
}

function LoadError() {
  const error = useBrainStore((s) => s.syncError);
  const signOut = useBrainStore((s) => s.signOut);
  return (
    <div className="grid min-h-screen place-items-center px-5">
      <div className="w-full max-w-md rounded-xl2 bg-card p-7 shadow-lift">
        <h1 className="font-display text-xl font-bold">Couldn&rsquo;t load your data</h1>
        <p className="mt-2 text-sm text-muted">{error ?? 'Unknown error.'} If this is a new project, check that supabase/schema.sql has been run.</p>
        <div className="mt-5 flex gap-3">
          <button onClick={() => window.location.reload()} className="h-10 rounded-lg bg-ink px-4 text-sm font-semibold text-white">Retry</button>
          <button onClick={signOut} className="h-10 rounded-lg px-4 text-sm font-semibold text-muted hover:text-ink">Sign out</button>
        </div>
      </div>
    </div>
  );
}

function Banners() {
  const syncError = useBrainStore((s) => s.syncError);
  const dismiss = useBrainStore((s) => s.dismissSyncError);
  return (
    <>
      {syncError && (
        <div role="alert" className="flex items-start justify-between gap-3 bg-red-50 px-5 py-2.5 text-sm text-red-700">
          <span>{syncError}</span>
          <button onClick={dismiss} aria-label="Dismiss" className="shrink-0"><X size={16} /></button>
        </div>
      )}
      <LegacyImport />
    </>
  );
}

function Shell() {
  const signOut = useBrainStore((s) => s.signOut);
  const email = useBrainStore((s) => s.email);
  const [view, setView] = useState<View>('dashboard');
  const [dumpOpen, setDumpOpen] = useState(false);
  const streak = useStreak();
  const rollover = useBrainStore((s) => s.rollover);

  useEffect(() => {
    rollover();
    const onVis = () => document.visibilityState === 'visible' && rollover();
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [rollover]);

  const tab = (v: View, label: string, Icon: typeof Library) => (
    <button
      onClick={() => setView(v)}
      aria-current={view === v ? 'page' : undefined}
      className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors ${
        view === v ? 'bg-ink text-white' : 'text-muted hover:text-ink'
      }`}
    >
      <Icon size={16} /> {label}
    </button>
  );

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-line bg-paper/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-5 py-3">
          <span className="font-display text-2xl font-bold tracking-tight">pare</span>
          <nav className="ml-2 flex gap-1" aria-label="Views">
            {tab('dashboard', 'Dashboard', LayoutDashboard)}
            {tab('journal', 'Journal', Notebook)}
            {tab('resources', 'Resources', Library)}
            {tab('finance', 'Finance', Wallet)}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <div
              className="flex items-center gap-1.5 rounded-full bg-card px-3 py-1.5 text-sm font-semibold shadow-lift"
              title="Days in a row with a completed task or journal entry"
            >
              <Flame size={16} className={streak > 0 ? 'text-curiosity' : 'text-muted'} />
              {streak} day{streak === 1 ? '' : 's'}
            </div>
            <button
              onClick={signOut}
              title={email ? `Signed in as ${email}` : 'Sign out'}
              aria-label="Sign out"
              className="grid h-10 w-10 place-items-center rounded-lg text-muted hover:text-ink"
            >
              <LogOut size={17} />
            </button>
            <button
              onClick={() => setDumpOpen(true)}
              className="flex h-10 items-center gap-1.5 rounded-lg bg-ink px-4 text-sm font-semibold text-white transition-transform active:scale-95"
            >
              <Plus size={16} /> Quick Dump
            </button>
          </div>
        </div>
      </header>
      <Banners />

      <main className="mx-auto max-w-6xl px-5 py-8">
        {view === 'dashboard' && <Dashboard />}
        {view === 'journal' && <Journal />}
        {view === 'resources' && <Resources />}
        {view === 'finance' && (
          <Suspense fallback={<div className="grid min-h-[40vh] place-items-center text-sm text-muted">Loading Finance&hellip;</div>}>
            <FinanceView />
          </Suspense>
        )}
      </main>

      <QuickDump open={dumpOpen} onClose={() => setDumpOpen(false)} />
    </div>
  );
}