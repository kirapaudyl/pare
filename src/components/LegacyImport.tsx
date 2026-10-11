import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useBrainStore, useLegacyPending, type LegacyItem, type LegacyKind } from '../store/useBrainStore';

const SECTIONS: { kind: LegacyKind; title: string }[] = [
  { kind: 't', title: 'Tasks' },
  { kind: 'j', title: 'Journal entries' },
  { kind: 'r', title: 'Resources' },
];

export default function LegacyImport() {
  const items = useLegacyPending();
  const importItems = useBrainStore((s) => s.importLegacyItems);
  const dismiss = useBrainStore((s) => s.dismissLegacy);
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  // Drop selections for items that are no longer listed; close the dialog when nothing is left.
  useEffect(() => {
    setChecked((cur) => {
      const live = new Set(items.map((i) => i.key));
      const next = new Set([...cur].filter((k) => live.has(k)));
      return next.size === cur.size ? cur : next;
    });
    if (items.length === 0) setOpen(false);
  }, [items]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (items.length === 0) return null;

  const importable = items.filter((i) => !i.blocked);
  const selectedItems = items.filter((i) => checked.has(i.key));
  const selectedImportable = selectedItems.filter((i) => !i.blocked);

  const toggle = (key: string) =>
    setChecked((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });

  const doImport = async () => {
    setBusy(true);
    const n = await importItems(selectedImportable.map((i) => i.key));
    setBusy(false);
    setNote(n ? `Imported ${n} item${n === 1 ? '' : 's'}.` : null);
  };

  const doDiscard = (list: LegacyItem[]) => {
    if (!list.length) return;
    dismiss(list.map((i) => i.key));
    setNote(`Discarded ${list.length} item${list.length === 1 ? '' : 's'}.`);
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 bg-card px-5 py-2.5 text-sm shadow-lift">
        <span>
          This browser has {items.length} old item{items.length === 1 ? '' : 's'} from before Supabase that {items.length === 1 ? 'isn\u2019t' : 'aren\u2019t'} in your account.
        </span>
        <button onClick={() => setOpen(true)} className="h-8 rounded-lg bg-ink px-3 font-semibold text-white">Review</button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-50 grid place-items-end bg-ink/40 p-4 sm:place-items-center"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}
          >
            <motion.div
              role="dialog" aria-modal="true" aria-label="Review old items"
              initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 340, damping: 30 }}
              className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl2 bg-card p-6 shadow-2xl"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-xl font-bold">Old items in this browser</h2>
                  <p className="mt-1 text-sm text-muted">
                    Tick what you want, then import it or discard it. Discarding only hides it here; nothing in your account is touched.
                  </p>
                </div>
                <button onClick={() => setOpen(false)} aria-label="Close" className="rounded-md p-1 text-muted hover:text-ink"><X size={18} /></button>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
                <button onClick={() => setChecked(new Set(importable.map((i) => i.key)))} className="font-semibold text-muted hover:text-ink">Select all importable</button>
                <button onClick={() => setChecked(new Set())} className="font-semibold text-muted hover:text-ink">Clear</button>
                {note && <span role="status" className="ml-auto text-money">{note}</span>}
              </div>

              <div className="mt-3 flex-1 space-y-5 overflow-y-auto pr-1">
                {SECTIONS.map(({ kind, title }) => {
                  const rows = items.filter((i) => i.kind === kind);
                  if (!rows.length) return null;
                  return (
                    <div key={kind}>
                      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{title} ({rows.length})</h3>
                      <ul className="space-y-1">
                        {rows.map((i) => (
                          <li key={i.key}>
                            <label className="flex cursor-pointer items-start gap-3 rounded-xl px-2 py-2 hover:bg-paper">
                              <input type="checkbox" checked={checked.has(i.key)} onChange={() => toggle(i.key)} className="mt-1 h-4 w-4 accent-[#12141F]" />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-[15px] font-medium">{i.title}</span>
                                <span className="text-xs text-muted">
                                  {[i.domainName, i.when && new Date(i.when).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })].filter(Boolean).join(' \u00B7 ')}
                                  {i.blocked && <span className="ml-2 font-semibold text-red-600">Its domain no longer exists, so it can only be discarded</span>}
                                </span>
                              </span>
                            </label>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line pt-4">
                <button
                  disabled={busy || selectedImportable.length === 0} onClick={doImport}
                  className="h-10 rounded-lg bg-ink px-4 text-sm font-semibold text-white disabled:opacity-30"
                >
                  {busy ? 'Importing' : `Import selected (${selectedImportable.length})`}
                </button>
                <button
                  disabled={busy || selectedItems.length === 0} onClick={() => doDiscard(selectedItems)}
                  className="h-10 rounded-lg border border-line px-4 text-sm font-semibold disabled:opacity-30"
                >
                  Discard selected ({selectedItems.length})
                </button>
                <button
                  disabled={busy}
                  onClick={() => { if (window.confirm(`Discard all ${items.length} old items? They will no longer be offered.`)) doDiscard(items); }}
                  className="ml-auto h-10 px-2 text-sm font-semibold text-muted hover:text-red-600"
                >
                  Discard all
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
