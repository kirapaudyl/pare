import { useEffect, useState } from 'react';
import { Flame, LayoutDashboard, Library, Notebook, Plus } from 'lucide-react';
import Dashboard from './components/Dashboard';
import Journal from './components/Journal';
import Resources from './components/Resources';
import QuickDump from './components/QuickDump';
import { useBrainStore, useStreak } from './store/useBrainStore';

type View = 'dashboard' | 'journal' | 'resources';

export default function App() {
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
          <span className="font-display text-2xl font-bold tracking-tight">Orbit</span>
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
              onClick={() => setDumpOpen(true)}
              className="flex h-10 items-center gap-1.5 rounded-lg bg-ink px-4 text-sm font-semibold text-white transition-transform active:scale-95"
            >
              <Plus size={16} /> Quick Dump
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-8">
        {view === 'dashboard' && <Dashboard />}
        {view === 'journal' && <Journal />}
        {view === 'resources' && <Resources />}
      </main>

      <QuickDump open={dumpOpen} onClose={() => setDumpOpen(false)} />
    </div>
  );
}