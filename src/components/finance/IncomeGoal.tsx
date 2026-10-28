import { useState } from 'react';
import { Check, Pencil, Plus, Trash2 } from 'lucide-react';
import { useFinanceStore } from '../../store/useFinanceStore';
import { formatRs, paisaToInput, parseMoney } from '../../finance/money';
import { monthLabel } from '../../finance/ledger';
import type { GapSummary } from '../../finance/dashboard';
import type { ReceivableStatus } from '../../finance/debts';
import type { FinGapItem } from '../../finance/types';
import { Bar, Field, Modal, Segmented, btnGhost, btnPrimary, cardCls, inputCls, useToast } from './ui';

/**
 * Top of the dashboard: your monthly income target, what you have earned, the gap, and the resources and options
 * you plan to use to close it. Finished items stop counting as planned because their money is already in current income.
 */
export default function IncomeGoal({ ym, gap, receivables }: { ym: string; gap: GapSummary; receivables: ReceivableStatus[] }) {
  const saveSettings = useFinanceStore((s) => s.saveSettings);
  const updateGapItem = useFinanceStore((s) => s.updateGapItem);
  const deleteGapItem = useFinanceStore((s) => s.deleteGapItem);
  const toast = useToast();

  const [editingTarget, setEditingTarget] = useState(false);
  const [draft, setDraft] = useState('');
  const [targetError, setTargetError] = useState<string | null>(null);
  const [form, setForm] = useState<FinGapItem | { kind: 'resource' | 'option' } | null>(null);

  const hasTarget = gap.target > 0;
  const startEdit = () => { setDraft(hasTarget ? paisaToInput(gap.target) : ''); setTargetError(null); setEditingTarget(true); };
  const saveTarget = () => {
    const p = draft.trim() ? parseMoney(draft, { allowZero: true }) : ({ ok: true, paisa: 0 } as const);
    if (!p.ok) { setTargetError(p.error); return; }
    const r = saveSettings({ incomeTargetPaisa: p.paisa });
    if (!r.ok) { setTargetError(r.error); return; }
    setEditingTarget(false);
  };

  const items = [...gap.open, ...gap.done];

  return (
    <section aria-label="Monthly income goal" className={cardCls}>
      <div className="grid gap-8 lg:grid-cols-[1fr_1.05fr]">
        {/* ---- target, current, gap ---- */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Targeted monthly income</p>
          {editingTarget ? (
            <div className="mt-2">
              <div className="flex gap-2">
                <input
                  autoFocus inputMode="decimal" value={draft} placeholder="200000" aria-label="Targeted monthly income"
                  onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') saveTarget(); if (e.key === 'Escape') setEditingTarget(false); }}
                  className={`${inputCls} h-12 text-lg`}
                />
                <button onClick={saveTarget} className={`${btnPrimary} h-12`}>Save</button>
              </div>
              {targetError && <p role="alert" className="mt-1 text-sm text-red-600">{targetError}</p>}
            </div>
          ) : (
            <button onClick={startEdit} aria-label="Edit targeted monthly income" className="group mt-1 flex items-center gap-3 text-left">
              <span className="font-display text-4xl font-bold tracking-tight sm:text-5xl">{hasTarget ? formatRs(gap.target) : 'Set a target'}</span>
              <Pencil size={16} className="text-muted opacity-60 group-hover:opacity-100" />
            </button>
          )}

          {hasTarget && (
            <>
              <div className="mt-4"><Bar ratio={gap.pct / 100} state={gap.gap === 0 ? 'met' : 'ok'} /></div>
              <dl className="mt-4 grid grid-cols-2 gap-4">
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Current income</dt>
                  <dd className="mt-0.5 font-display text-2xl font-bold">{formatRs(gap.current)}</dd>
                  <dd className="text-xs text-muted">{monthLabel(ym)} &middot; {gap.pct}% of target</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{gap.gap === 0 ? 'Target reached' : 'Gap'}</dt>
                  <dd className={`mt-0.5 font-display text-2xl font-bold ${gap.gap === 0 ? 'text-money' : ''}`}>{gap.gap === 0 ? `+${formatRs(gap.surplus)}` : formatRs(gap.gap)}</dd>
                  <dd className="text-xs text-muted">{gap.gap === 0 ? 'More than you aimed for' : 'Still to earn this month'}</dd>
                </div>
              </dl>
            </>
          )}
          {!hasTarget && <p className="mt-2 text-sm text-muted">Enter what you want to earn each month. Pare shows how far you are and what could close the gap.</p>}
        </div>

        {/* ---- resources and options ---- */}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-lg font-bold">Ways to cover the gap</h2>
            <div className="flex gap-2 text-sm font-semibold">
              <button onClick={() => setForm({ kind: 'resource' })} className={`${btnGhost} flex h-8 items-center gap-1 px-3`}><Plus size={14} /> Resource</button>
              <button onClick={() => setForm({ kind: 'option' })} className={`${btnGhost} flex h-8 items-center gap-1 px-3`}><Plus size={14} /> Option</button>
            </div>
          </div>
          <p className="mt-1 text-xs text-muted"><b>Resources</b> are money you already have or are owed. <b>Options</b> are things you could do to earn more.</p>

          {items.length === 0 ? (
            <p className="mt-4 rounded-xl border-2 border-dashed border-line p-4 text-center text-sm text-muted">Nothing planned yet. Add a resource (like money a friend owes you) or an option (like a weekend project).</p>
          ) : (
            <ul className="mt-4 space-y-2 border-l-2 border-line pl-4">
              {items.map((i) => (
                <li key={i.id} className="relative flex items-center gap-3 rounded-xl bg-paper px-3 py-2.5 before:absolute before:-left-4 before:top-1/2 before:w-3 before:border-t-2 before:border-line">
                  <button
                    onClick={() => updateGapItem(i.id, { done: !i.done })} role="checkbox" aria-checked={i.done} aria-label={`Mark ${i.title} ${i.done ? 'not done' : 'done'}`}
                    className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border-2 ${i.done ? 'border-ink bg-ink text-white' : 'border-line bg-white'}`}
                  >
                    {i.done && <Check size={12} strokeWidth={3} />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className={`flex items-center gap-2 text-sm font-semibold ${i.done ? 'text-muted line-through' : ''}`}>
                      <span className={`shrink-0 rounded px-1.5 py-px text-[10px] font-bold uppercase no-underline ${i.kind === 'resource' ? 'bg-sky-100 text-sky-700' : 'bg-violet-100 text-violet-700'}`}>{i.kind}</span>
                      <span className="truncate">{i.title}</span>
                    </p>
                    {(i.note || i.done) && <p className="truncate text-xs text-muted">{i.done ? 'Done: it is already counted in current income.' : i.note}</p>}
                  </div>
                  <span className={`shrink-0 text-sm font-semibold ${i.done ? 'text-muted' : ''}`}>{i.expectedPaisa > 0 ? formatRs(i.expectedPaisa) : '\u2014'}</span>
                  <button onClick={() => setForm(i)} aria-label={`Edit ${i.title}`} className="shrink-0 rounded-md p-1 text-muted hover:text-ink"><Pencil size={14} /></button>
                  <button
                    onClick={() => { if (window.confirm(`Remove ${i.title}?`)) { deleteGapItem(i.id); toast('Removed'); } }}
                    aria-label={`Remove ${i.title}`} className="shrink-0 rounded-md p-1 text-muted hover:text-red-600"
                  ><Trash2 size={14} /></button>
                </li>
              ))}
            </ul>
          )}

          {hasTarget && gap.gap > 0 && gap.open.length > 0 && (
            <p className="mt-4 text-sm">
              Your plan could bring in <b>{formatRs(gap.planned)}</b>, covering <b>{formatRs(gap.covered)}</b> of the gap.
              {gap.uncovered > 0 ? <> <span className="text-muted">{formatRs(gap.uncovered)} still has no plan.</span></> : <> <span className="font-semibold text-money">The gap is fully planned for.</span></>}
            </p>
          )}
        </div>
      </div>

      {form && <GapItemForm key={'id' in form ? form.id : form.kind} initial={form} receivables={receivables} onClose={() => setForm(null)} />}
    </section>
  );
}

function GapItemForm({ initial, receivables, onClose }: { initial: FinGapItem | { kind: 'resource' | 'option' }; receivables: ReceivableStatus[]; onClose: () => void }) {
  const addGapItem = useFinanceStore((s) => s.addGapItem);
  const updateGapItem = useFinanceStore((s) => s.updateGapItem);
  const existing = 'id' in initial ? initial : null;

  const [kind, setKind] = useState<'resource' | 'option'>(initial.kind);
  const [title, setTitle] = useState(existing?.title ?? '');
  const [amount, setAmount] = useState(existing && existing.expectedPaisa > 0 ? paisaToInput(existing.expectedPaisa) : '');
  const [note, setNote] = useState(existing?.note ?? '');
  const [error, setError] = useState<string | null>(null);

  const owed = receivables.filter((r) => r.remaining > 0);
  const fillFrom = (id: string) => {
    const r = owed.find((x) => x.rec.id === id);
    if (!r) return;
    setTitle(`Collect from ${r.rec.person}`);
    setAmount(paisaToInput(r.remaining));
    if (r.rec.expectedOn) setNote(`Expected back ${r.rec.expectedOn}`);
  };

  const submit = () => {
    const a = amount.trim() ? parseMoney(amount, { allowZero: true }) : ({ ok: true, paisa: 0 } as const);
    if (!a.ok) { setError(a.error); return; }
    const v = { kind, title, expectedPaisa: a.paisa, note: note.trim() || null };
    const r = existing ? updateGapItem(existing.id, v) : addGapItem(v);
    if (!r.ok) { setError(r.error); return; }
    onClose();
  };

  return (
    <Modal open onClose={onClose} title={existing ? 'Edit' : kind === 'resource' ? 'Add a resource' : 'Add an option'}>
      <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="space-y-4">
        <Segmented label="Type" value={kind} onChange={setKind} options={[{ id: 'resource', label: 'Resource' }, { id: 'option', label: 'Option' }]} />
        <p className="text-xs text-muted">{kind === 'resource' ? 'Money you already have or are owed, such as a friend who will repay you.' : 'Something you could do to earn more, such as a side project or selling something.'}</p>
        {kind === 'resource' && owed.length > 0 && !existing && (
          <Field label="Fill from money someone owes you (optional)">
            <select defaultValue="" onChange={(e) => fillFrom(e.target.value)} className={inputCls}>
              <option value="">Choose a person</option>
              {owed.map((r) => <option key={r.rec.id} value={r.rec.id}>{r.rec.person} &middot; {formatRs(r.remaining)}</option>)}
            </select>
          </Field>
        )}
        <Field label="What is it"><input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder={kind === 'resource' ? 'Collect from Ram' : 'Weekend freelance project'} className={inputCls} /></Field>
        <Field label="How much could it bring in (Rs)" hint="Leave empty if you do not know yet."><input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputCls} /></Field>
        <Field label="Note (optional)"><input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} className={inputCls} /></Field>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-3"><button type="submit" className={btnPrimary}>{existing ? 'Save' : 'Add'}</button><button type="button" onClick={onClose} className={btnGhost}>Cancel</button></div>
      </form>
    </Modal>
  );
}
