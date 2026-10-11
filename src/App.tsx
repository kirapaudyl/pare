import { useEffect, useState } from 'react';
import { Flame, LayoutDashboard, Library, LogOut, Notebook, Plus, X } from 'lucide-react';
import Dashboard from './components/Dashboard';
import Journal from './components/Journal';
import Resources from './components/Resources';
import QuickDump from './components/QuickDump';
import Auth from './components/Auth';
import SetupNotice from './components/SetupNotice';
import LegacyImportDialog from './components/LegacyImportDialog';
import { isSupabaseConfigured } from './lib/supabase';
import { countLegacyItems, readLegacy, resolveLegacyItems, useBrainStore, useStreak, type LegacySelection } from './store/useBrainStore';

type View = 'dashboard' | 'journal' | 'resources';

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
  const importLegacy = useBrainStore((s) => s.importLegacy);
  const tasks = useBrainStore((s) => s.tasks);
  const journal = useBrainStore((s) => s.journal);
  const resources = useBrainStore((s) => s.resources);
  const [busy, setBusy] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [, setLegacyRevision] = useState(0);

  // If an old record is already in Supabase, remember that it was migrated.
  // This prevents it reappearing in the legacy prompt after the user later deletes it.
  useEffect(() => {
    const legacy = readLegacy();
    if (!legacy) return;
    const alreadyPresent: LegacySelection = {
      tasks: (legacy.tasks ?? []).filter((old) => tasks.some((current) => current.id === old.id)),
      journal: (legacy.journal ?? []).filter((old) => journal.some((current) => current.id === old.id)),
      resources: (legacy.resources ?? []).filter((old) => resources.some((current) => current.id === old.id)),
    };
    if (countLegacyItems(alreadyPresent) > 0 && resolveLegacyItems(alreadyPresent, true) > 0) {
      setLegacyRevision((revision) => revision + 1);
    }
  }, [tasks, journal, resources]);

  const rawLegacy = readLegacy();
  const taskIds = new Set(tasks.map((item) => item.id));
  const journalIds = new Set(journal.map((item) => item.id));
  const resourceIds = new Set(resources.map((item) => item.id));
  const missingLegacy = rawLegacy ? {
    ...rawLegacy,
    tasks: (rawLegacy.tasks ?? []).filter((item) => !taskIds.has(item.id)),
    journal: (rawLegacy.journal ?? []).filter((item) => !journalIds.has(item.id)),
    resources: (rawLegacy.resources ?? []).filter((item) => !resourceIds.has(item.id)),
  } : null;
  const missing = countLegacyItems(missingLegacy);

  const handleImport = async (selection: LegacySelection) => {
    setBusy(true);
    try {
      const imported = await importLegacy(selection);
      if (imported > 0) setReviewOpen(false);
      setLegacyRevision((revision) => revision + 1);
    } finally {
      setBusy(false);
    }
  };

  const handleDiscard = (selection: LegacySelection) => {
    resolveLegacyItems(selection, true);
    setReviewOpen(false);
    setLegacyRevision((revision) => revision + 1);
  };

  return (
    <>
      {syncError && (
        <div role="alert" className="flex items-start justify-between gap-3 bg-red-50 px-5 py-2.5 text-sm text-red-700">
          <span>{syncError}</span>
          <button onClick={dismiss} aria-label="Dismiss" className="shrink-0"><X size={16} /></button>
        </div>
      )}
      {missing > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 bg-card px-5 py-2.5 text-sm shadow-lift">
          <span>This browser has {missing} unreviewed item{missing === 1 ? '' : 's'} saved from before Supabase.</span>
          <button
            onClick={() => setReviewOpen(true)}
            className="h-9 rounded-lg bg-ink px-4 font-semibold text-white transition-colors hover:bg-ink/90"
          >
            Review {missing} item{missing === 1 ? '' : 's'}
          </button>
        </div>
      )}
      {reviewOpen && missingLegacy && (
        <LegacyImportDialog
          legacy={missingLegacy}
          busy={busy}
          onClose={() => setReviewOpen(false)}
          onImport={handleImport}
          onDiscard={handleDiscard}
        />
      )}
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
      </main>

      <QuickDump open={dumpOpen} onClose={() => setDumpOpen(false)} />
    </div>
  );
}