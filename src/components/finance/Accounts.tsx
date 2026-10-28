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
  const byType = { cash: 0, bank: 0, wallet: 0, card: 0 };
  for (const a of active) byType[a.type] += d.balances.get(a.id) ?? 0;
  const hasCards = active.some((a) => a.type === 'card');

  return (
    <div className="space-y-6">
      <div className={`grid gap-4 sm:grid-cols-2 ${hasCards ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
        {([['Cash', byType.cash, 'Notes and coins you hold'], ['Bank', byType.bank, 'In your bank accounts'], ['Wallets', byType.wallet, 'eSewa, Khalti and other wallets']] as const).map(([label, value, sub]) => (
          <div key={label} className={cardCls}>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
            <p className={`mt-1 font-display text-2xl font-bold ${value < 0 ? 'text-red-600' : ''}`}>{formatRs(value)}</p>
            <p className="mt-1 text-xs text-muted">{sub}</p>
          </div>
        ))}
        {hasCards && (
          <div className={cardCls}>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Cards</p>
            <p className={`mt-1 font-display text-2xl font-bold ${byType.card < 0 ? 'text-red-600' : ''}`}>{formatRs(byType.card)}</p>
            <p className="mt-1 text-xs text-muted">Negative means you owe</p>
          </div>
        )}
      </div>
      <p className="-mt-2 text-sm text-muted">Money available (cash + bank + wallets): <b className="text-ink">{formatRs(d.totals.available)}</b></p>

      <div className="flex flex-wrap gap-3">
        <button onClick={() => setAdding(true)} className={`${btnPrimary} flex items-center gap-1.5`}><Plus size={16} /> Add account</button>
        <button onClick={onTransfer} disabled={active.length < 2} className={`${btnGhost} flex items-center gap-1.5`}><ArrowLeftRight size={16} /> Transfer between accounts</button>
      </div>

      {active.length === 0 ? <Empty title="No accounts yet">Add your cash, bank accounts, wallets and cards.</Empty> : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {active.map((a) => {
            const bal = d.balances.get(a.id) ?? 0;
            const stale = d.stale.find((s) => s.account.id === a.id);
            const below = bal < 0 && a.type !== 'card';
            return (
              <li key={a.id} className={cardCls}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0"><p className="truncate font-display text-lg font-bold">{a.name}</p><p className="text-xs text-muted">{typeLabel(a.type)}{a.id === defaultAccountId ? ' \u00B7 default' : ''}</p></div>
                </div>
                <p className={`mt-3 font-display text-2xl font-bold ${bal < 0 ? 'text-red-600' : ''}`}>{formatRs(bal)}</p>
                {below ? (
                  <p className="mt-1 text-xs text-amber-700">
                    Below zero because more has gone out of {a.name} than Pare knows went in, usually a missing starting balance. Tap <b>Set balance</b> and enter what you really have.
                  </p>
                ) : (
                  <p className={`mt-1 text-xs ${stale ? 'font-semibold text-amber-700' : 'text-muted'}`}>
                    {a.lastCheckedAt ? `Checked ${daysAgo(a.lastCheckedAt) === 0 ? 'today' : `${daysAgo(a.lastCheckedAt)} days ago`}` : 'Not checked against the real balance yet'}
                  </p>
                )}
                <div className="mt-4 flex flex-wrap gap-2 text-sm font-semibold">
                  <button onClick={() => setReconciling(a)} className={below ? `${btnPrimary} flex h-9 items-center gap-1.5` : 'flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 hover:border-ink'}><Scale size={14} /> Set balance</button>
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

type BalanceMode = 'start' | 'adjust';

/**
 * "What do you really have?" Two honest ways to make Pare agree:
 *  start  - the starting balance was wrong or missing, so fix it. History is untouched. (Right for a balance below zero.)
 *  adjust - money genuinely went missing or appeared, so record the difference where you can see it.
 */
function ReconcileDialog({ account, ledgerPaisa, onClose, onAddExpense }: { account: FinAccount; ledgerPaisa: number; onClose: () => void; onAddExpense: (p: Partial<TxInput>) => void }) {
  const reconcile = useFinanceStore((s) => s.reconcile);
  const fixStart = useFinanceStore((s) => s.fixStartingBalance);
  const toast = useToast();
  const [counted, setCounted] = useState('');
  const [mode, setMode] = useState<BalanceMode>(account.lastCheckedAt === null || (ledgerPaisa < 0 && account.type !== 'card') ? 'start' : 'adjust');
  const [error, setError] = useState<string | null>(null);

  const parsed = counted.trim() ? parseMoney(counted, { allowNegative: true, allowZero: true }) : null;
  const diff = parsed?.ok ? parsed.paisa - ledgerPaisa : null;

  const confirm = () => {
    if (!parsed || !parsed.ok) { setError(parsed ? parsed.error : 'Enter what you actually have'); return; }
    const r = mode === 'start' || parsed.paisa === ledgerPaisa ? fixStart(account.id, parsed.paisa) : reconcile(account.id, parsed.paisa);
    if (!r.ok) { setError(r.error); return; }
    toast(r.diff === 0 ? `${account.name} already matches` : mode === 'start' ? `${account.name} now shows ${formatRs(parsed.paisa)}` : `Recorded a ${formatRs(r.diff, { signed: true })} adjustment on ${account.name}`);
    onClose();
  };

  return (
    <Modal open onClose={onClose} title={`Set balance: ${account.name}`}>
      <p className="text-sm text-muted">Check your {account.type === 'cash' ? 'wallet or drawer' : account.type === 'bank' ? 'bank app or statement' : account.type === 'wallet' ? 'wallet app' : 'card statement'} and enter what you really have right now.</p>
      <p className="mt-4 text-sm">Pare currently shows <b>{formatRs(ledgerPaisa)}</b></p>
      <div className="mt-3"><Field label="What you actually have (Rs)" hint={account.type === 'card' ? 'For a card, enter what you owe as a negative number.' : undefined} error={error}>
        <input autoFocus inputMode="decimal" value={counted} onChange={(e) => { setCounted(e.target.value); setError(null); }} onKeyDown={(e) => e.key === 'Enter' && confirm()} className={inputCls} />
      </Field></div>

      {diff !== null && diff !== 0 && (
        <fieldset className="mt-4 space-y-2" aria-label="How to fix the difference">
          <legend className="mb-1 text-sm font-semibold">The difference is {formatRs(diff, { signed: true })}. Why?</legend>
          {([
            ['start', 'Pare never knew the right starting balance', 'Fixes the starting balance. Nothing in your history changes. Choose this when setting up or when old money was never entered.'],
            ['adjust', 'Money went missing or showed up', 'Adds a "balance reconciliation" entry you can see in the ledger, and flags it on the dashboard.'],
          ] as const).map(([id, label, help]) => (
            <label key={id} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${mode === id ? 'border-ink' : 'border-line'}`}>
              <input type="radio" name="mode" checked={mode === id} onChange={() => setMode(id)} className="mt-1 accent-[#12141F]" />
              <span><span className="block text-sm font-semibold">{label}</span><span className="block text-xs text-muted">{help}</span></span>
            </label>
          ))}
        </fieldset>
      )}
      {diff === 0 && <p className="mt-3 text-sm font-semibold text-money">Matches exactly.</p>}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button onClick={confirm} disabled={diff === null} className={btnPrimary}>{diff === 0 ? 'Mark as checked' : 'Save'}</button>
        {diff !== null && diff < 0 && mode === 'adjust' && (
          <button onClick={() => onAddExpense({ kind: 'expense', amountPaisa: -diff, accountId: account.id, description: 'Untracked spending', bucket: 'wants' })} className={btnGhost}>Add it as an expense instead</button>
        )}
      </div>
    </Modal>
  );
}
