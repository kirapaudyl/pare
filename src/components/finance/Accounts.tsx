import { useState } from 'react';
import { ArrowLeftRight, Plus, Scale } from 'lucide-react';
import { useFinanceStore } from '../../store/useFinanceStore';
import { formatRs, paisaToInput, parseMoney } from '../../finance/money';
import { useFinanceDerived } from '../../finance/useFinanceDerived';
import type { AccountType, FinAccount, TxInput } from '../../finance/types';
import { Empty, Field, Modal, btnGhost, btnPrimary, cardCls, inputCls, useToast } from './ui';

const TYPES: { id: AccountType; label: string }[] = [
  { id: 'cash', label: 'Cash' }, { id: 'bank', label: 'Bank account' }, { id: 'wallet', label: 'Digital wallet' }, { id: 'card', label: 'Card' },
];
const typeLabel = (t: AccountType) => TYPES.find((x) => x.id === t)!.label;
const daysAgo = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);

export default function Accounts({ ym, onTransfer, onAddExpense }: { ym: string; onTransfer: () => void; onAddExpense: (preset: Partial<TxInput>) => void }) {
  const accounts = useFinanceStore((s) => s.accounts);
  const defaultAccountId = useFinanceStore((s) => s.settings.defaultAccountId);
  const addAccount = useFinanceStore((s) => s.addAccount);
  const updateAccount = useFinanceStore((s) => s.updateAccount);
  const setArchived = useFinanceStore((s) => s.setAccountArchived);
  const deleteAccount = useFinanceStore((s) => s.deleteAccount);
  const saveSettings = useFinanceStore((s) => s.saveSettings);
  const d = useFinanceDerived(ym);
  const toast = useToast();

  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<FinAccount | null>(null);
  const [reconciling, setReconciling] = useState<FinAccount | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const active = accounts.filter((a) => !a.archived);
  const archived = accounts.filter((a) => a.archived);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className={cardCls}><p className="text-xs font-semibold uppercase tracking-wide text-muted">Available</p><p className="mt-1 font-display text-2xl font-bold">{formatRs(d.totals.available)}</p><p className="mt-1 text-xs text-muted">Cash, bank and wallets</p></div>
        <div className={cardCls}><p className="text-xs font-semibold uppercase tracking-wide text-muted">Cards</p><p className={`mt-1 font-display text-2xl font-bold ${d.totals.cards < 0 ? 'text-red-600' : ''}`}>{formatRs(d.totals.cards)}</p><p className="mt-1 text-xs text-muted">Negative means you owe</p></div>
        <div className={cardCls}><p className="text-xs font-semibold uppercase tracking-wide text-muted">Net</p><p className="mt-1 font-display text-2xl font-bold">{formatRs(d.totals.net)}</p><p className="mt-1 text-xs text-muted">Available plus cards</p></div>
      </div>

      <div className="flex flex-wrap gap-3">
        <button onClick={() => setAdding(true)} className={`${btnPrimary} flex items-center gap-1.5`}><Plus size={16} /> Add account</button>
        <button onClick={onTransfer} disabled={active.length < 2} className={`${btnGhost} flex items-center gap-1.5`}><ArrowLeftRight size={16} /> Transfer between accounts</button>
      </div>

      {active.length === 0 ? <Empty title="No accounts yet">Add your cash, bank accounts, wallets and cards.</Empty> : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {active.map((a) => {
            const bal = d.balances.get(a.id) ?? 0;
            const stale = d.stale.find((s) => s.account.id === a.id);
            return (
              <li key={a.id} className={cardCls}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0"><p className="truncate font-display text-lg font-bold">{a.name}</p><p className="text-xs text-muted">{typeLabel(a.type)}{a.id === defaultAccountId ? ' \u00B7 default' : ''}</p></div>
                </div>
                <p className={`mt-3 font-display text-2xl font-bold ${bal < 0 ? 'text-red-600' : ''}`}>{formatRs(bal)}</p>
                <p className={`mt-1 text-xs ${stale ? 'font-semibold text-amber-700' : 'text-muted'}`}>
                  {a.lastCheckedAt ? `Counted ${daysAgo(a.lastCheckedAt) === 0 ? 'today' : `${daysAgo(a.lastCheckedAt)} days ago`}` : 'Never counted'}
                </p>
                <div className="mt-4 flex flex-wrap gap-2 text-sm font-semibold">
                  <button onClick={() => setReconciling(a)} className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 hover:border-ink"><Scale size={14} /> Reconcile</button>
                  <button onClick={() => setEditing(a)} className="rounded-lg px-3 py-1.5 text-muted hover:text-ink">Edit</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {archived.length > 0 && (
        <div className="text-sm">
          <button onClick={() => setShowArchived((v) => !v)} aria-expanded={showArchived} className="font-semibold text-muted hover:text-ink">Archived accounts ({archived.length}) {showArchived ? '\u2212' : '+'}</button>
          {showArchived && (
            <ul className={`${cardCls} mt-2 divide-y divide-line`}>
              {archived.map((a) => (
                <li key={a.id} className="flex items-center gap-3 py-2"><span className="flex-1">{a.name}</span><button onClick={() => { const r = setArchived(a.id, false); if (!r.ok) toast(r.error); }} className="font-semibold text-muted hover:text-ink">Restore</button></li>
              ))}
            </ul>
          )}
        </div>
      )}

      {adding && <AccountForm onClose={() => setAdding(false)} onSave={(v) => addAccount(v)} title="Add account" />}
      {editing && (
        <AccountForm
          key={editing.id} onClose={() => setEditing(null)} title="Edit account" initial={editing}
          onSave={(v) => updateAccount(editing.id, v)}
          extra={
            <div className="mt-5 space-y-2 border-t border-line pt-4 text-sm">
              {editing.id !== defaultAccountId && !editing.archived && (
                <button onClick={() => { const r = saveSettings({ defaultAccountId: editing.id }); toast(r.ok ? `${editing.name} is now your default account` : r.error); setEditing(null); }} className="font-semibold text-muted hover:text-ink">Make default for quick entry</button>
              )}
              <div className="flex gap-4">
                <button onClick={() => { const r = setArchived(editing.id, true); if (!r.ok) toast(r.error); else setEditing(null); }} className="font-semibold text-muted hover:text-ink">Archive</button>
                <button onClick={() => { if (!window.confirm(`Delete ${editing.name}? This cannot be undone.`)) return; const r = deleteAccount(editing.id); if (!r.ok) toast(r.error); else setEditing(null); }} className="font-semibold text-muted hover:text-red-600">Delete</button>
              </div>
            </div>
          }
        />
      )}
      {reconciling && (
        <ReconcileDialog
          account={reconciling} ledgerPaisa={d.balances.get(reconciling.id) ?? 0} onClose={() => setReconciling(null)}
          onAddExpense={(preset) => { setReconciling(null); onAddExpense(preset); }}
        />
      )}
    </div>
  );
}

function AccountForm({ title, initial, onSave, onClose, extra }: {
  title: string; initial?: FinAccount; onClose: () => void; extra?: React.ReactNode;
  onSave: (v: { name: string; type: AccountType; openingPaisa: number }) => { ok: boolean; error?: string };
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [type, setType] = useState<AccountType>(initial?.type ?? 'bank');
  const [opening, setOpening] = useState(initial ? paisaToInput(initial.openingPaisa) : '');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const o = opening.trim() ? parseMoney(opening, { allowNegative: true, allowZero: true }) : ({ ok: true, paisa: 0 } as const);
    if (!o.ok) { setError(o.error); return; }
    const r = onSave({ name, type, openingPaisa: o.paisa });
    if (!r.ok) { setError(r.error ?? 'Could not save'); return; }
    onClose();
  };

  return (
    <Modal open onClose={onClose} title={title}>
      <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="space-y-4">
        <Field label="Name"><input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Nabil savings" className={inputCls} /></Field>
        <Field label="Type"><select value={type} onChange={(e) => setType(e.target.value as AccountType)} className={inputCls}>{TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select></Field>
        <Field label="Opening balance (Rs)" hint={type === 'card' ? 'For a card you owe money on, enter a negative number, e.g. -12000.' : 'What was in the account before your first entry here.'} error={error}>
          <input inputMode="decimal" value={opening} onChange={(e) => setOpening(e.target.value)} placeholder="0" className={inputCls} />
        </Field>
        {initial && <p className="text-xs text-muted">Changing the opening balance changes this account&rsquo;s balance for all time.</p>}
        <div className="flex gap-3"><button type="submit" className={btnPrimary}>Save</button><button type="button" onClick={onClose} className={btnGhost}>Cancel</button></div>
      </form>
      {extra}
    </Modal>
  );
}

function ReconcileDialog({ account, ledgerPaisa, onClose, onAddExpense }: { account: FinAccount; ledgerPaisa: number; onClose: () => void; onAddExpense: (p: Partial<TxInput>) => void }) {
  const reconcile = useFinanceStore((s) => s.reconcile);
  const toast = useToast();
  const [counted, setCounted] = useState('');
  const [error, setError] = useState<string | null>(null);

  const parsed = counted.trim() ? parseMoney(counted, { allowNegative: true, allowZero: true }) : null;
  const diff = parsed?.ok ? parsed.paisa - ledgerPaisa : null;

  const confirm = () => {
    if (!parsed || !parsed.ok) { setError(parsed ? parsed.error : 'Enter what you actually have'); return; }
    const r = reconcile(account.id, parsed.paisa);
    if (!r.ok) { setError(r.error); return; }
    toast(r.diff === 0 ? `${account.name} matches the ledger` : `Recorded a ${formatRs(r.diff, { signed: true })} adjustment on ${account.name}`);
    onClose();
  };

  return (
    <Modal open onClose={onClose} title={`Reconcile ${account.name}`}>
      <p className="text-sm text-muted">Count what is really in this account (check your wallet, app or statement) and enter it. If it differs from the ledger, the difference is recorded as an adjustment and flagged on your dashboard.</p>
      <p className="mt-4 text-sm">Ledger says <b>{formatRs(ledgerPaisa)}</b></p>
      <div className="mt-3"><Field label="Actual balance (Rs)" hint={account.type === 'card' ? 'For a card, enter what you owe as a negative number.' : undefined} error={error}>
        <input autoFocus inputMode="decimal" value={counted} onChange={(e) => { setCounted(e.target.value); setError(null); }} onKeyDown={(e) => e.key === 'Enter' && confirm()} className={inputCls} />
      </Field></div>
      {diff !== null && (
        <p className={`mt-3 text-sm font-semibold ${diff === 0 ? 'text-money' : 'text-amber-700'}`}>
          {diff === 0 ? 'Matches the ledger exactly.' : `Difference: ${formatRs(diff, { signed: true })} (${diff < 0 ? 'money missing from the ledger' : 'extra money not in the ledger'})`}
        </p>
      )}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button onClick={confirm} disabled={diff === null} className={btnPrimary}>{diff === 0 ? 'Mark as checked' : 'Record adjustment'}</button>
        {diff !== null && diff < 0 && (
          <button onClick={() => onAddExpense({ kind: 'expense', amountPaisa: -diff, accountId: account.id, description: 'Untracked spending', bucket: 'wants' })} className={btnGhost}>Add it as an expense instead</button>
        )}
      </div>
    </Modal>
  );
}
