import { useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useFinanceStore } from '../../store/useFinanceStore';
import { formatRs, paisaToInput, parseMoney } from '../../finance/money';
import { dayKeyOf } from '../../finance/ledger';
import { LOAN_KINDS, RECEIVABLE_KINDS, type Bucket, type FinTx, type TxInput, type TxKind } from '../../finance/types';
import { Field, Modal, Segmented, btnGhost, btnPrimary, fromLocalInput, inputCls, toLocalInput, useToast } from './ui';

type FormKind = 'expense' | 'income' | 'transfer' | 'refund';
const KINDS: { id: FormKind; label: string }[] = [
  { id: 'expense', label: 'Expense' }, { id: 'income', label: 'Income' }, { id: 'transfer', label: 'Transfer' }, { id: 'refund', label: 'Refund' },
];
const BUCKETS: { id: Bucket; label: string }[] = [{ id: 'needs', label: 'Needs' }, { id: 'wants', label: 'Wants' }, { id: 'savings', label: 'Savings' }];
const ACCOUNT_LABEL: Partial<Record<TxKind, string>> = { expense: 'Paid from', income: 'Received in', transfer: 'From', refund: 'Refunded to', loan_payment: 'Paid from', loan_received: 'Received in', lend: 'Lent from', collection: 'Received in' };

interface Props {
  onClose: () => void;
  initial?: FinTx | null;               // present = editing
  preset?: Partial<TxInput>;            // prefill for a new one
}

export default function TransactionForm({ onClose, initial, preset }: Props) {
  const accounts = useFinanceStore((s) => s.accounts);
  const categories = useFinanceStore((s) => s.categories);
  const txs = useFinanceStore((s) => s.txs);
  const goals = useFinanceStore((s) => s.goals);
  const defaultAccountId = useFinanceStore((s) => s.settings.defaultAccountId);
  const addTx = useFinanceStore((s) => s.addTx);
  const updateTx = useFinanceStore((s) => s.updateTx);
  const deleteTx = useFinanceStore((s) => s.deleteTx);
  const restoreTx = useFinanceStore((s) => s.restoreTx);
  const toast = useToast();

  const base = initial ?? preset ?? {};
  const liveAccounts = accounts.filter((a) => !a.archived || a.id === base.accountId || a.id === base.toAccountId);
  const [kind, setKind] = useState<TxKind>(base.kind ?? 'expense');
  const [amount, setAmount] = useState(base.amountPaisa ? paisaToInput(base.amountPaisa) : '');
  const [description, setDescription] = useState(base.description ?? '');
  const [when, setWhen] = useState(toLocalInput(base.occurredAt ?? new Date()));
  const [accountId, setAccountId] = useState(base.accountId ?? defaultAccountId ?? liveAccounts[0]?.id ?? '');
  const [toAccountId, setToAccountId] = useState(base.toAccountId ?? '');
  const [categoryId, setCategoryId] = useState(base.categoryId ?? '');
  const [bucket, setBucket] = useState<Bucket>(base.bucket ?? 'wants');
  const [refundOf, setRefundOf] = useState(base.refundOf ?? '');
  const [isSaving, setIsSaving] = useState(base.bucket === 'savings' && base.kind === 'transfer');
  const [goalId, setGoalId] = useState(base.goalId ?? '');
  const [note, setNote] = useState(base.note ?? '');
  const [error, setError] = useState<string | null>(null);

  const original = txs.find((t) => t.id === refundOf) ?? null;
  const refundable = useMemo(() => {
    const out = new Map<string, number>();
    for (const t of txs) {
      if (t.kind !== 'expense') continue;
      const refunded = txs.filter((r) => r.kind === 'refund' && r.refundOf === t.id && r.id !== initial?.id).reduce((s, r) => s + r.amountPaisa, 0);
      out.set(t.id, t.amountPaisa - refunded);
    }
    return out;
  }, [txs, initial?.id]);
  const refundChoices = useMemo(() => txs.filter((t) => t.kind === 'expense' && ((refundable.get(t.id) ?? 0) > 0 || t.id === refundOf)).slice(0, 300), [txs, refundable, refundOf]);

  const chooseOriginal = (id: string) => {
    setRefundOf(id);
    const o = txs.find((t) => t.id === id);
    if (!o) return;
    setAccountId(o.accountId);
    if (!amount.trim()) setAmount(paisaToInput(refundable.get(id) ?? o.amountPaisa));
    if (!description.trim()) setDescription(`Refund: ${o.description}`.slice(0, 200));
  };

  const chooseCategory = (id: string) => {
    setCategoryId(id);
    const c = categories.find((x) => x.id === id);
    if (c?.bucket && kind === 'expense') setBucket(c.bucket);
  };

  const catKind = kind === 'income' ? 'income' : 'expense';
  const catOptions = categories.filter((c) => c.kind === catKind && (!c.archived || c.id === categoryId));
  const activeGoals = goals.filter((g) => !g.archived || g.id === goalId);

  const save = () => {
    const parsed = parseMoney(amount);
    if (!parsed.ok) { setError(parsed.error); return; }
    const occurredAt = fromLocalInput(when);
    if (!occurredAt) { setError('Date is not valid'); return; }

    const common = { amountPaisa: parsed.paisa, occurredAt, description: description.trim(), accountId, note: note.trim() || null, loanId: null, receivableId: null };
    let input: TxInput;
    if (kind === 'transfer') {
      input = { ...common, kind, toAccountId: toAccountId || null, categoryId: null, bucket: isSaving ? 'savings' : null, refundOf: null, goalId: isSaving && goalId ? goalId : null };
    } else if (kind === 'refund') {
      input = original
        ? { ...common, kind, toAccountId: null, categoryId: original.categoryId, bucket: original.bucket, refundOf: original.id, goalId: null }
        : { ...common, kind, toAccountId: null, categoryId: categoryId || null, bucket, refundOf: null, goalId: null };
    } else if (kind === 'income') {
      input = { ...common, kind, toAccountId: null, categoryId: categoryId || null, bucket: null, refundOf: null, goalId: null };
    } else {
      input = { ...common, kind: 'expense', toAccountId: null, categoryId: categoryId || null, bucket, refundOf: null, goalId: null };
    }
    const r = initial ? updateTx(initial.id, input) : addTx(input);
    if (!r.ok) { setError(r.error); return; }
    onClose();
  };

  const remove = () => {
    if (!initial) return;
    const r = deleteTx(initial.id);
    if (!r.ok) { setError(r.error); return; }
    toast('Transaction deleted', { label: 'Undo', run: () => { const x = restoreTx(initial.id); if (!x.ok) toast(x.error); } });
    onClose();
  };

  /* EMIs, loan money, lending and repayments are created from the Loans & Receivables screen; here they can be corrected or removed. */
  if (initial && (LOAN_KINDS.includes(initial.kind) || RECEIVABLE_KINDS.includes(initial.kind))) {
    return <DebtEntryForm initial={initial} onClose={onClose} />;
  }

  /* Reconciliation adjustments are system-made: show them, allow deleting, nothing else. */
  if (initial?.kind === 'adjustment') {
    return (
      <Modal open onClose={onClose} title="Reconciliation adjustment">
        <p className="text-sm text-muted">
          Recorded when a counted balance differed from the ledger. It changes the account balance but is never counted as income, spending or budget.
        </p>
        <p className="mt-3 font-display text-2xl font-bold">{formatRs(initial.amountPaisa, { signed: true })}</p>
        <p className="mt-1 text-sm text-muted">{accounts.find((a) => a.id === initial.accountId)?.name} &middot; {dayKeyOf(initial.occurredAt)}</p>
        {initial.note && <p className="mt-2 text-sm">{initial.note}</p>}
        {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
        <div className="mt-5 flex gap-3"><button onClick={remove} className={btnGhost}>Delete adjustment</button><button onClick={onClose} className={btnPrimary}>Close</button></div>
      </Modal>
    );
  }

  return (
    <Modal open onClose={onClose} title={initial ? 'Edit transaction' : 'New transaction'} wide>
      <form onSubmit={(e) => { e.preventDefault(); save(); }} className="space-y-4">
        <Segmented label="Type" value={kind as FormKind} onChange={(k) => { setKind(k); setError(null); }} options={KINDS} />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Amount (Rs)"><input autoFocus inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className={inputCls} /></Field>
          <Field label="When"><input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className={inputCls} /></Field>
        </div>

        <Field label="Description"><input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} className={inputCls} /></Field>

        {kind === 'refund' && (
          <Field label="Which expense is being refunded?" hint="Pick it so the refund reduces the right budget. Leave empty for a standalone refund.">
            <select value={refundOf} onChange={(e) => chooseOriginal(e.target.value)} className={inputCls}>
              <option value="">No original expense</option>
              {refundChoices.map((t) => (
                <option key={t.id} value={t.id}>{dayKeyOf(t.occurredAt)} &middot; {t.description || 'No description'} &middot; {formatRs(t.amountPaisa)}{(refundable.get(t.id) ?? 0) < t.amountPaisa ? ` (${formatRs(refundable.get(t.id) ?? 0)} left)` : ''}</option>
              ))}
            </select>
          </Field>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={ACCOUNT_LABEL[kind] ?? 'Account'}>
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={inputCls}>
              {liveAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
          {kind === 'transfer' && (
            <Field label="To">
              <select value={toAccountId} onChange={(e) => setToAccountId(e.target.value)} className={inputCls}>
                <option value="">Choose account</option>
                {liveAccounts.filter((a) => a.id !== accountId).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </Field>
          )}
          {kind !== 'transfer' && !(kind === 'refund' && original) && (
            <Field label="Category">
              <select value={categoryId} onChange={(e) => chooseCategory(e.target.value)} className={inputCls}>
                <option value="">Uncategorized</option>
                {catOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
          )}
        </div>

        {(kind === 'expense' || (kind === 'refund' && !original)) && (
          <div><p className="mb-1 text-sm font-semibold">Budget bucket</p><Segmented label="Budget bucket" value={bucket} onChange={setBucket} options={BUCKETS} /></div>
        )}
        {kind === 'refund' && original && (
          <p className="rounded-lg bg-paper px-3 py-2 text-sm text-muted">Counts against the same category and bucket as the original expense.</p>
        )}

        {kind === 'transfer' && (
          <div className="space-y-3 rounded-xl bg-paper p-3">
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input type="checkbox" checked={isSaving} onChange={(e) => setIsSaving(e.target.checked)} className="h-4 w-4 accent-[#12141F]" />
              This is a savings contribution
            </label>
            <p className="text-xs text-muted">Moves money between your accounts without counting as spending. Savings contributions count toward the Savings bucket.</p>
            {isSaving && activeGoals.length > 0 && (
              <Field label="Savings goal (optional)">
                <select value={goalId} onChange={(e) => { setGoalId(e.target.value); const g = goals.find((x) => x.id === e.target.value); if (g?.accountId && !toAccountId) setToAccountId(g.accountId); }} className={inputCls}>
                  <option value="">No goal</option>
                  {activeGoals.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </Field>
            )}
          </div>
        )}

        <Field label="Note"><input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} className={inputCls} /></Field>

        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button type="submit" className={btnPrimary}>{initial ? 'Save changes' : 'Save'}</button>
          <button type="button" onClick={onClose} className={btnGhost}>Cancel</button>
          {initial && <button type="button" onClick={remove} className="ml-auto flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-red-600"><Trash2 size={15} /> Delete</button>}
        </div>
      </form>
    </Modal>
  );
}

const DEBT_LABEL: Partial<Record<TxKind, string>> = { loan_payment: 'EMI / loan payment', loan_received: 'Loan money received', lend: 'Money lent out', collection: 'Repayment received' };

/** Correct or delete an EMI, a loan disbursement, a loan to someone, or a repayment from them. */
function DebtEntryForm({ initial, onClose }: { initial: FinTx; onClose: () => void }) {
  const accounts = useFinanceStore((s) => s.accounts);
  const loans = useFinanceStore((s) => s.loans);
  const receivables = useFinanceStore((s) => s.receivables);
  const updateTx = useFinanceStore((s) => s.updateTx);
  const deleteTx = useFinanceStore((s) => s.deleteTx);
  const restoreTx = useFinanceStore((s) => s.restoreTx);
  const toast = useToast();

  const [amount, setAmount] = useState(paisaToInput(initial.amountPaisa));
  const [when, setWhen] = useState(toLocalInput(initial.occurredAt));
  const [accountId, setAccountId] = useState(initial.accountId);
  const [note, setNote] = useState(initial.note ?? '');
  const [error, setError] = useState<string | null>(null);

  const subject = initial.loanId ? loans.find((l) => l.id === initial.loanId)?.name : receivables.find((r) => r.id === initial.receivableId)?.person;
  const inflow = initial.kind === 'loan_received' || initial.kind === 'collection';

  const save = () => {
    const parsed = parseMoney(amount);
    if (!parsed.ok) { setError(parsed.error); return; }
    const occurredAt = fromLocalInput(when);
    if (!occurredAt) { setError('Date is not valid'); return; }
    const r = updateTx(initial.id, {
      kind: initial.kind, amountPaisa: parsed.paisa, occurredAt, description: initial.description, accountId, toAccountId: null, categoryId: null, bucket: null,
      refundOf: null, goalId: null, loanId: initial.loanId, receivableId: initial.receivableId, note: note.trim() || null,
    });
    if (!r.ok) { setError(r.error); return; }
    onClose();
  };

  const remove = () => {
    const r = deleteTx(initial.id);
    if (!r.ok) { setError(r.error); return; }
    toast('Entry deleted', { label: 'Undo', run: () => { const x = restoreTx(initial.id); if (!x.ok) toast(x.error); } });
    onClose();
  };

  return (
    <Modal open onClose={onClose} title={DEBT_LABEL[initial.kind] ?? 'Entry'}>
      <form onSubmit={(e) => { e.preventDefault(); save(); }} className="space-y-4">
        <p className="rounded-lg bg-paper px-3 py-2 text-sm text-muted">
          {subject ? <><b className="text-ink">{subject}</b>. </> : null}
          {initial.kind === 'loan_payment' && 'Lowers what you owe. Not counted as an expense.'}
          {initial.kind === 'loan_received' && 'Cash from borrowing. Not counted as income.'}
          {initial.kind === 'lend' && 'Cash you lent out. Not counted as an expense.'}
          {initial.kind === 'collection' && 'Cash coming back to you. Not counted as income.'}
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Amount (Rs)"><input autoFocus inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputCls} /></Field>
          <Field label="When"><input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className={inputCls} /></Field>
        </div>
        <Field label={inflow ? 'Received in' : 'Paid from'}>
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={inputCls}>
            {accounts.filter((a) => !a.archived || a.id === initial.accountId).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
        <Field label="Note"><input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} className={inputCls} /></Field>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className={btnPrimary}>Save changes</button>
          <button type="button" onClick={onClose} className={btnGhost}>Cancel</button>
          <button type="button" onClick={remove} className="ml-auto flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-red-600"><Trash2 size={15} /> Delete</button>
        </div>
      </form>
    </Modal>
  );
}
