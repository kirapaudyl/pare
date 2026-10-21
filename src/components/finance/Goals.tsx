import { useState } from 'react';
import { Plus, Target } from 'lucide-react';
import { useFinanceStore } from '../../store/useFinanceStore';
import { formatRs, paisaToInput, parseMoney } from '../../finance/money';
import { useFinanceDerived } from '../../finance/useFinanceDerived';
import type { GoalProgress } from '../../finance/ledger';
import type { FinGoal } from '../../finance/types';
import { Bar, Empty, Field, Modal, btnGhost, btnPrimary, cardCls, fromLocalInput, inputCls, toLocalInput, useToast } from './ui';

const STATUS: Record<GoalProgress['status'], { label: string; cls: string }> = {
  done: { label: 'Reached', cls: 'bg-emerald-100 text-emerald-800' },
  'on-track': { label: 'On track', cls: 'bg-emerald-100 text-emerald-800' },
  behind: { label: 'Behind plan', cls: 'bg-amber-100 text-amber-800' },
  overdue: { label: 'Past deadline', cls: 'bg-red-100 text-red-700' },
  open: { label: 'No deadline', cls: 'bg-slate-100 text-slate-600' },
};

export default function Goals({ ym }: { ym: string }) {
  const accounts = useFinanceStore((s) => s.accounts);
  const goals = useFinanceStore((s) => s.goals);
  const d = useFinanceDerived(ym);
  const [editing, setEditing] = useState<FinGoal | 'new' | null>(null);
  const [contributing, setContributing] = useState<FinGoal | null>(null);
  const archivedGoals = goals.filter((g) => g.archived);
  const accName = new Map(accounts.map((a) => [a.id, a.name]));

  return (
    <div className="space-y-6">
      <button onClick={() => setEditing('new')} className={`${btnPrimary} flex items-center gap-1.5`}><Plus size={16} /> New goal</button>

      {d.goalList.length === 0 ? <Empty title="No savings goals yet">Set a target and a deadline, then contribute from any account. Contributions move money; they are not spending.</Empty> : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {d.goalList.map(({ goal: g, progress: p }) => (
            <li key={g.id} className={cardCls}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0"><h3 className="flex items-center gap-2 font-display text-lg font-bold"><Target size={16} /> <span className="truncate">{g.name}</span></h3>
                  <p className="text-xs text-muted">{g.deadline ? `By ${new Date(`${g.deadline}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}` : 'No deadline'}{g.accountId ? ` \u00B7 kept in ${accName.get(g.accountId) ?? 'an account'}` : ''}</p></div>
                <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${STATUS[p.status].cls}`}>{STATUS[p.status].label}</span>
              </div>
              <p className="mt-3 font-display text-2xl font-bold">{formatRs(p.saved)} <span className="text-base font-normal text-muted">of {formatRs(g.targetPaisa)}</span></p>
              <div className="my-3"><Bar ratio={p.pct / 100} state={p.status === 'done' ? 'met' : p.status === 'behind' || p.status === 'overdue' ? 'warn' : 'ok'} /></div>
              <p className="text-sm text-muted">
                {p.status === 'done' ? 'Target reached.' : `${formatRs(p.remaining)} to go`}
                {p.requiredMonthly !== null && p.status !== 'done' && p.status !== 'overdue' && <> &middot; needs {formatRs(p.requiredMonthly)}/month</>}
                {g.plannedMonthlyPaisa > 0 && <> &middot; planned {formatRs(g.plannedMonthlyPaisa)}/month</>}
              </p>
              <div className="mt-4 flex gap-2 text-sm font-semibold">
                <button onClick={() => setContributing(g)} disabled={p.status === 'done'} className={`${btnGhost} h-9`}>Add contribution</button>
                <button onClick={() => setEditing(g)} className="rounded-lg px-3 text-muted hover:text-ink">Edit</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {archivedGoals.length > 0 && <ArchivedGoals goals={archivedGoals} />}
      {editing && <GoalForm key={editing === 'new' ? 'new' : editing.id} initial={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {contributing && <ContributeDialog key={contributing.id} goal={contributing} onClose={() => setContributing(null)} />}
    </div>
  );
}

function ArchivedGoals({ goals }: { goals: FinGoal[] }) {
  const updateGoal = useFinanceStore((s) => s.updateGoal);
  return (
    <details className="text-sm"><summary className="cursor-pointer font-semibold text-muted">Archived goals ({goals.length})</summary>
      <ul className={`${cardCls} mt-2 divide-y divide-line`}>{goals.map((g) => <li key={g.id} className="flex items-center gap-3 py-2"><span className="flex-1">{g.name}</span><button onClick={() => updateGoal(g.id, { archived: false })} className="font-semibold text-muted hover:text-ink">Restore</button></li>)}</ul>
    </details>
  );
}

function GoalForm({ initial, onClose }: { initial: FinGoal | null; onClose: () => void }) {
  const accounts = useFinanceStore((s) => s.accounts).filter((a) => !a.archived);
  const addGoal = useFinanceStore((s) => s.addGoal);
  const updateGoal = useFinanceStore((s) => s.updateGoal);
  const [name, setName] = useState(initial?.name ?? '');
  const [target, setTarget] = useState(initial ? paisaToInput(initial.targetPaisa) : '');
  const [deadline, setDeadline] = useState(initial?.deadline ?? '');
  const [planned, setPlanned] = useState(initial?.plannedMonthlyPaisa ? paisaToInput(initial.plannedMonthlyPaisa) : '');
  const [accountId, setAccountId] = useState(initial?.accountId ?? '');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const t = parseMoney(target);
    if (!t.ok) { setError(`Target: ${t.error}`); return; }
    const p = planned.trim() ? parseMoney(planned, { allowZero: true }) : ({ ok: true, paisa: 0 } as const);
    if (!p.ok) { setError(`Monthly plan: ${p.error}`); return; }
    const v = { name, targetPaisa: t.paisa, deadline: deadline || null, plannedMonthlyPaisa: p.paisa, accountId: accountId || null };
    const r = initial ? updateGoal(initial.id, v) : addGoal(v);
    if (!r.ok) { setError(r.error); return; }
    onClose();
  };

  return (
    <Modal open onClose={onClose} title={initial ? 'Edit goal' : 'New savings goal'}>
      <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="space-y-4">
        <Field label="Goal"><input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Emergency fund" className={inputCls} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Target (Rs)"><input inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} className={inputCls} /></Field>
          <Field label="Deadline (optional)"><input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className={inputCls} /></Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Planned per month (Rs)"><input inputMode="decimal" value={planned} onChange={(e) => setPlanned(e.target.value)} placeholder="0" className={inputCls} /></Field>
          <Field label="Money is kept in" hint="Default destination for contributions.">
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={inputCls}><option value="">Not set</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
          </Field>
        </div>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className={btnPrimary}>Save</button><button type="button" onClick={onClose} className={btnGhost}>Cancel</button>
          {initial && <button type="button" onClick={() => { updateGoal(initial.id, { archived: true }); onClose(); }} className="ml-auto text-sm font-semibold text-muted hover:text-ink">Archive</button>}
        </div>
      </form>
    </Modal>
  );
}

function ContributeDialog({ goal, onClose }: { goal: FinGoal; onClose: () => void }) {
  const accounts = useFinanceStore((s) => s.accounts).filter((a) => !a.archived);
  const defaultAccountId = useFinanceStore((s) => s.settings.defaultAccountId);
  const contribute = useFinanceStore((s) => s.contribute);
  const toast = useToast();
  const from0 = accounts.find((a) => a.id !== goal.accountId && a.id === defaultAccountId)?.id ?? accounts.find((a) => a.id !== goal.accountId)?.id ?? '';
  const [from, setFrom] = useState(from0);
  const [to, setTo] = useState(goal.accountId ?? '');
  const [amount, setAmount] = useState(goal.plannedMonthlyPaisa ? paisaToInput(goal.plannedMonthlyPaisa) : '');
  const [when, setWhen] = useState(toLocalInput(new Date()));
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const a = parseMoney(amount);
    if (!a.ok) { setError(a.error); return; }
    const occurredAt = fromLocalInput(when);
    if (!occurredAt) { setError('Date is not valid'); return; }
    const r = contribute(goal.id, { fromAccountId: from, toAccountId: to, amountPaisa: a.paisa, occurredAt });
    if (!r.ok) { setError(r.error); return; }
    toast(`Added ${formatRs(a.paisa)} to ${goal.name}`);
    onClose();
  };

  return (
    <Modal open onClose={onClose} title={`Contribute to ${goal.name}`}>
      <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="space-y-4">
        <p className="text-sm text-muted">Moves money between two accounts. It counts as saving, not spending.</p>
        <Field label="Amount (Rs)"><input autoFocus inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputCls} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="From"><select value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
          <Field label="To"><select value={to} onChange={(e) => setTo(e.target.value)} className={inputCls}><option value="">Choose account</option>{accounts.filter((a) => a.id !== from).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
        </div>
        <Field label="When"><input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className={inputCls} /></Field>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-3"><button type="submit" className={btnPrimary}>Add contribution</button><button type="button" onClick={onClose} className={btnGhost}>Cancel</button></div>
      </form>
    </Modal>
  );
}
