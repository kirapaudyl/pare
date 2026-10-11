import { useMemo, useState } from 'react';
import { Archive, Check, Database, FileText, Link2, X } from 'lucide-react';
import type { JournalEntry, Resource, Task } from '../types';
import type { LegacyData, LegacySelection } from '../store/useBrainStore';

type ReviewItem = {
  key: string;
  kind: 'task' | 'journal' | 'resource';
  title: string;
  detail: string;
  task?: Task;
  journal?: JournalEntry;
  resource?: Resource;
};

type Props = {
  legacy: LegacyData;
  busy: boolean;
  onClose: () => void;
  onImport: (selection: LegacySelection) => Promise<void>;
  onDiscard: (selection: LegacySelection) => void;
};

function makeSelection(items: ReviewItem[], selectedKeys: Set<string>): LegacySelection {
  const chosen = items.filter((item) => selectedKeys.has(item.key));
  return {
    tasks: chosen.flatMap((item) => item.task ? [item.task] : []),
    journal: chosen.flatMap((item) => item.journal ? [item.journal] : []),
    resources: chosen.flatMap((item) => item.resource ? [item.resource] : []),
  };
}

export default function LegacyImportDialog({ legacy, busy, onClose, onImport, onDiscard }: Props) {
  const items = useMemo<ReviewItem[]>(() => [
    ...(legacy.tasks ?? []).map((task) => ({
      key: `task:${task.id}`, kind: 'task' as const, title: task.title,
      detail: `Task · ${task.status === 'completed' ? 'Completed' : 'Pending'}`, task,
    })),
    ...(legacy.journal ?? []).map((journal) => ({
      key: `journal:${journal.id}`, kind: 'journal' as const,
      title: journal.title?.trim() || 'Untitled journal entry',
      detail: `Journal · ${(journal.content ?? '').replace(/\s+/g, ' ').slice(0, 96) || 'No preview available'}`, journal,
    })),
    ...(legacy.resources ?? []).map((resource) => ({
      key: `resource:${resource.id}`, kind: 'resource' as const, title: resource.title,
      detail: `Resource · ${resource.platform || 'Saved link'}`, resource,
    })),
  ], [legacy]);

  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const selectedCount = selected.size;
  const allSelected = items.length > 0 && selectedCount === items.length;

  const iconFor = (kind: ReviewItem['kind']) => {
    if (kind === 'task') return <Check size={15} />;
    if (kind === 'journal') return <FileText size={15} />;
    return <Link2 size={15} />;
  };

  const actOnSelection = () => makeSelection(items, selected);

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-ink/45 p-3 backdrop-blur-sm sm:p-6" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="legacy-dialog-title" className="flex max-h-[min(85vh,760px)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/70 bg-card shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4 sm:px-6">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-career/10 px-2.5 py-1 text-xs font-semibold text-career">
              <Database size={13} /> Before Supabase
            </div>
            <h2 id="legacy-dialog-title" className="font-display text-xl font-bold sm:text-2xl">Review saved items</h2>
            <p className="mt-1 text-sm text-muted">Select any items, then choose whether to import or discard them. Unselected items stay untouched.</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close review" className="rounded-lg p-2 text-muted hover:bg-paper hover:text-ink disabled:opacity-40"><X size={18} /></button>
        </header>

        <div className="flex items-center justify-between border-b border-line px-5 py-3 text-sm sm:px-6">
          <span className="text-muted">{items.length} old item{items.length === 1 ? '' : 's'} · {selectedCount} selected</span>
          <button type="button" disabled={busy || items.length === 0} onClick={() => setSelected(allSelected ? new Set() : new Set(items.map((item) => item.key)))} className="font-semibold text-career hover:underline disabled:opacity-40">
            {allSelected ? 'Select none' : 'Select all'}
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-paper/60 p-3 sm:p-4">
          {items.map((item) => {
            const checked = selected.has(item.key);
            return (
              <label key={item.key} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors sm:p-4 ${checked ? 'border-career/35 bg-white shadow-sm' : 'border-line bg-card/60 opacity-75'}`}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => setSelected((old) => {
                    const next = new Set(old);
                    if (next.has(item.key)) next.delete(item.key); else next.add(item.key);
                    return next;
                  })}
                  disabled={busy}
                  className="mt-1 h-4 w-4 shrink-0 accent-indigo-600"
                />
                <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg ${checked ? 'bg-career/10 text-career' : 'bg-paper text-muted'}`}>
                  {iconFor(item.kind)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-sm font-semibold text-ink">{item.title || 'Untitled item'}</span>
                  <span className="mt-1 block break-words text-xs leading-relaxed text-muted">{item.detail}</span>
                </span>
                <span className={`mt-1 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${checked ? 'bg-career/10 text-career' : 'bg-paper text-muted'}`}>
                  {checked ? 'Selected' : 'Not selected'}
                </span>
              </label>
            );
          })}
          {items.length === 0 && <p className="p-8 text-center text-sm text-muted">There are no unreviewed browser items.</p>}
        </div>

        <footer className="flex flex-col-reverse gap-2 border-t border-line bg-card px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <button type="button" disabled={busy || selectedCount === 0} onClick={() => onDiscard(actOnSelection())} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-line px-4 text-sm font-semibold text-muted hover:border-red-200 hover:text-red-600 disabled:opacity-40">
            <Archive size={15} /> Discard selected
          </button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <button type="button" disabled={busy} onClick={onClose} className="h-10 rounded-lg px-4 text-sm font-semibold text-muted hover:text-ink disabled:opacity-40">Later</button>
            <button type="button" disabled={busy || selectedCount === 0} onClick={() => void onImport(actOnSelection())} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-ink px-4 text-sm font-semibold text-white hover:bg-ink/90 disabled:opacity-40">
              <Database size={15} /> {busy ? 'Importing…' : `Import ${selectedCount} selected`}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
