import { useEffect, useMemo, useState, type RefObject } from 'react';
import { Plus, SlidersHorizontal } from 'lucide-react';
import { useFinanceStore } from '../../store/useFinanceStore';
import { formatRs } from '../../finance/money';
import { parseQuickLine, suggestCategory } from '../../finance/quick';
import type { Bucket } from '../../finance/types';
import { Segmented, btnPrimary, cardCls, fromLocalInput, inputCls, toLocalInput, useToast } from './ui';

/**
 * One line: "ride 20", "20 momo", "+50000 salary". Enter saves. The account stays selected between entries,
 * and the category/bucket are filled from your keyword rules and history, so a normal entry is type + Enter.
 */
export default function QuickAdd({ inputRef, onMore }: { inputRef: RefObject<HTMLInputElement>; onMore: () => void }) {
  const accounts = useFinanceStore((s) => s.accounts);
  const categories = useFinanceStore((s) => s.categories);
  const txs = useFinanceStore((s) => s.txs);
  const defaultAccountId = useFinanceStore((s) => s.settings.defaultAccountId);
  const addTx = useFinanceStore((s) => s.addTx);
  const deleteTx = useFinanceStore((s) => s.deleteTx);
  const toast = useToast();

  const [line, setLine] = useState('');
  const [kindToggle, setKindToggle] = useState<'expense' | 'income'>('expense');
  const [accountId, setAccountId] = useState<string | null>(null);
  const [pickedCat, setPickedCat] = useState<string | null | undefined>(undefined); // undefined = follow the suggestion
  const [more, setMore] = useState(false);
  const [when, setWhen] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const live = useMemo(() => accounts.filter((a) => !a.archived), [accounts]);
  const parsed = useMemo(() => parseQuickLine(line), [line]);
  const kind = parsed.kind === 'income' ? 'income' : kindToggle;
  const suggestion = useMemo(() => suggestCategory(parsed.description, kind, categories, txs), [parsed.description, kind, categories, txs]);

  const account = live.find((a) => a.id === accountId) ?? live.find((a) => a.id === defaultAccountId) ?? live[0];
  const categoryId = pickedCat === undefined ? suggestion?.categoryId ?? null : pickedCat;
  const category = categories.find((c) => c.id === categoryId) ?? null;
  // The category decides the internal bucket; there is no budget to pick one for any more.
  const bucket: Bucket = category?.bucket ?? 'wants';
  const catOptions = categories.filter((c) => c.kind === kind && !c.archived);

  // Typing a new description lets the suggestion take over again.
  useEffect(() => { setPickedCat(undefined); }, [parsed.description, kind]);
  useEffect(() => { setError(null); }, [line]);

  const submit = () => {
    if (!account) { setError('Add an account first (Accounts tab)'); return; }
    if (parsed.amountPaisa === null) { setError(parsed.error ?? 'Add an amount, e.g. ride 20'); return; }
    const occurredAt = (more && when ? fromLocalInput(when) : null) ?? new Date().toISOString();
    const r = addTx({
      kind, amountPaisa: parsed.amountPaisa, occurredAt, description: parsed.description, accountId: account.id,
      toAccountId: null, categoryId, bucket: kind === 'expense' ? bucket : null, refundOf: null, goalId: null, loanId: null, receivableId: null, note: note.trim() || null,
    });
    if (!r.ok) { setError(r.error); return; }
    const id = r.id;
    toast(`${kind === 'income' ? 'Income' : 'Saved'} ${formatRs(parsed.amountPaisa)}${category ? ` \u00B7 ${category.name}` : ''}`, { label: 'Undo', run: () => deleteTx(id) });
    setLine(''); setNote(''); setWhen('');
    inputRef.current?.focus();
  };

  return (
    <section className={cardCls} aria-label="Quick entry">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented label="Type" value={kind} onChange={setKindToggle} options={[{ id: 'expense', label: 'Expense' }, { id: 'income', label: 'Income' }]} />
        <p className="text-xs text-muted">Type like <b>ride 20</b>, <b>20 momo</b> or <b>+50000 salary</b>, then press Enter. Press <kbd className="rounded border border-line px-1">N</kbd> to jump here.</p>
      </div>

      <div className="mt-3 flex gap-2">
        <input
          ref={inputRef} value={line} onChange={(e) => setLine(e.target.value)} aria-label="Quick entry"
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), submit())}
          placeholder={kind === 'income' ? '+50000 salary' : 'ride 20'} inputMode="text" autoComplete="off"
          className={`${inputCls} h-12 text-base`}
        />
        <button onClick={submit} className={`${btnPrimary} flex h-12 items-center gap-1.5`}><Plus size={16} /> Add</button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <span className="min-w-[5.5rem] font-display text-lg font-bold" aria-live="polite">
          {parsed.amountPaisa !== null ? formatRs(parsed.amountPaisa) : <span className="text-muted">Rs 0</span>}
        </span>

        <div role="radiogroup" aria-label="Account" className="flex flex-wrap gap-1.5">
          {live.map((a) => {
            const on = a.id === account?.id;
            return (
              <button key={a.id} role="radio" aria-checked={on} onClick={() => setAccountId(a.id)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${on ? 'border-ink bg-ink text-white' : 'border-line text-muted hover:text-ink'}`}>
                {a.name}
              </button>
            );
          })}
        </div>

        <select
          aria-label="Category" value={categoryId ?? ''} className="h-9 rounded-lg border border-line bg-paper px-2 text-sm"
          onChange={(e) => setPickedCat(e.target.value || null)}
        >
          <option value="">Uncategorized</option>
          {catOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {pickedCat === undefined && suggestion && (
          <span className="text-xs text-muted">{suggestion.reason === 'history' ? 'from your history' : 'from a keyword rule'}</span>
        )}

        <button onClick={() => setMore((v) => !v)} aria-expanded={more} className="ml-auto flex items-center gap-1.5 text-xs font-semibold text-muted hover:text-ink">
          <SlidersHorizontal size={14} /> {more ? 'Fewer options' : 'Date, note'}
        </button>
        <button onClick={onMore} className="text-xs font-semibold text-muted hover:text-ink">Transfer or refund&hellip;</button>
      </div>

      {more && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm"><span className="mb-1 block font-semibold">When</span>
            <input type="datetime-local" value={when || toLocalInput(new Date())} onChange={(e) => setWhen(e.target.value)} className={inputCls} />
          </label>
          <label className="block text-sm"><span className="mb-1 block font-semibold">Note</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} className={inputCls} />
          </label>
        </div>
      )}

      {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
    </section>
  );
}
