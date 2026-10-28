import { useMemo, useState } from 'react';
import { Download, RotateCcw, Trash2 } from 'lucide-react';
import { useFinanceStore } from '../../store/useFinanceStore';
import { formatRs } from '../../finance/money';
import { dayKeyOf, monthLabel, ymOf } from '../../finance/ledger';
import { transactionsToCsv } from '../../finance/exportCsv';
import type { FinTx, TxKind } from '../../finance/types';
import { Empty, btnGhost, cardCls, inputCls, useToast } from './ui';

const TAG: Partial<Record<TxKind, string>> = { adjustment: 'reconcile', loan_payment: 'EMI', loan_received: 'loan in', lend: 'lent', collection: 'repaid to you' };

export interface LedgerPreset { category?: string; kind?: TxKind | ''; scope?: 'month' | 'all' }
const PAGE = 100;

export default function Ledger({ ym, preset, onEdit }: { ym: string; preset?: LedgerPreset | null; onEdit: (t: FinTx) => void }) {
  const txs = useFinanceStore((s) => s.txs);
  const trash = useFinanceStore((s) => s.trash);
  const accounts = useFinanceStore((s) => s.accounts);
  const categories = useFinanceStore((s) => s.categories);
  const loans = useFinanceStore((s) => s.loans);
  const receivables = useFinanceStore((s) => s.receivables);
  const deleteTx = useFinanceStore((s) => s.deleteTx);
  const restoreTx = useFinanceStore((s) => s.restoreTx);
  const toast = useToast();

  const [q, setQ] = useState('');
  const [kind, setKind] = useState<TxKind | ''>(preset?.kind ?? '');
  const [account, setAccount] = useState('');
  const [category, setCategory] = useState(preset?.category ?? '');
  const [scope, setScope] = useState<'month' | 'all'>(preset?.scope ?? 'month');
  const [limit, setLimit] = useState(PAGE);
  const [showTrash, setShowTrash] = useState(false);

  const accName = useMemo(() => new Map(accounts.map((a) => [a.id, a.name])), [accounts]);
  const catName = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);
  const linked = useMemo(() => new Map<string, string>([...loans.map((l) => [l.id, l.name] as [string, string]), ...receivables.map((r) => [r.id, r.person] as [string, string])]), [loans, receivables]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return txs.filter((t) => {
      if (scope === 'month' && ymOf(t.occurredAt) !== ym) return false;
      if (kind && t.kind !== kind) return false;
      if (account && t.accountId !== account && t.toAccountId !== account) return false;
      if (category === '__none') { if (t.categoryId || (t.kind !== 'expense' && t.kind !== 'income')) return false; }
      else if (category && t.categoryId !== category) return false;
      if (needle) {
        const hay = `${t.description} ${t.note ?? ''} ${catName.get(t.categoryId ?? '') ?? ''} ${accName.get(t.accountId) ?? ''} ${(t.amountPaisa / 100).toString()}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [txs, q, kind, account, category, scope, ym, catName, accName]);

  const totals = useMemo(() => {
    let inn = 0, out = 0;
    for (const t of rows) {
      // Real income and spending only. Loan, lending and repayment cash has its own entries and is never added here.
      if (t.kind === 'income' || t.kind === 'refund') inn += t.amountPaisa;
      else if (t.kind === 'expense') out += t.amountPaisa;
    }
    return { inn, out };
  }, [rows]);

  const days = useMemo(() => {
    const map = new Map<string, FinTx[]>();
    for (const t of rows.slice(0, limit)) {
      const k = dayKeyOf(t.occurredAt);
      (map.get(k) ?? map.set(k, []).get(k)!).push(t);
    }
    return [...map.entries()];
  }, [rows, limit]);

  const remove = (t: FinTx) => {
    const r = deleteTx(t.id);
    if (!r.ok) { toast(r.error); return; }
    toast('Transaction deleted', { label: 'Undo', run: () => { const x = restoreTx(t.id); if (!x.ok) toast(x.error); } });
  };

  const exportCsv = () => {
    const csv = transactionsToCsv(rows, accounts, categories, linked);
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `pare-ledger-${scope === 'month' ? ym : 'all'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const amountCell = (t: FinTx) => {
    if (t.kind === 'income' || t.kind === 'refund' || t.kind === 'collection' || t.kind === 'loan_received') return <span className="font-semibold text-money">{formatRs(t.amountPaisa, { signed: true })}</span>;
    if (t.kind === 'loan_payment' || t.kind === 'lend') return <span className="font-semibold">{formatRs(-t.amountPaisa)}</span>;
    if (t.kind === 'expense') return <span className="font-semibold">{formatRs(-t.amountPaisa)}</span>;
    if (t.kind === 'adjustment') return <span className="font-semibold text-muted">{formatRs(t.amountPaisa, { signed: true })}</span>;
    return <span className="font-semibold text-muted">{formatRs(t.amountPaisa)}</span>;
  };
  const subtitle = (t: FinTx) =>
    t.kind === 'transfer' ? `${accName.get(t.accountId) ?? '?'} \u2192 ${accName.get(t.toAccountId ?? '') ?? '?'}${t.goalId ? ' \u00B7 goal' : t.bucket === 'savings' ? ' \u00B7 savings' : ''}`
    : t.loanId || t.receivableId ? `${accName.get(t.accountId) ?? '?'} \u00B7 ${linked.get(t.loanId ?? t.receivableId ?? '') ?? ''}`
    : `${accName.get(t.accountId) ?? '?'}${t.categoryId ? ` \u00B7 ${catName.get(t.categoryId) ?? ''}` : t.kind === 'expense' || t.kind === 'income' ? ' \u00B7 Uncategorized' : ''}`;
  const kindTag = (t: FinTx) => (t.kind === 'expense' || t.kind === 'income' ? null : (
    <span className="rounded bg-paper px-1.5 py-px text-[10px] font-bold uppercase text-muted">{TAG[t.kind] ?? t.kind}</span>
  ));

  return (
    <div className="space-y-4">
      <section className={cardCls} aria-label="Ledger filters">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <input value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }} placeholder="Search" aria-label="Search transactions" className={`${inputCls} lg:col-span-2`} />
          <select aria-label="Type" value={kind} onChange={(e) => setKind(e.target.value as TxKind | '')} className={inputCls}>
            <option value="">All types</option><option value="expense">Expenses</option><option value="income">Income</option>
            <option value="transfer">Transfers</option><option value="refund">Refunds</option><option value="adjustment">Adjustments</option>
            <option value="loan_payment">Loan payments</option><option value="loan_received">Loan money received</option>
            <option value="lend">Money lent</option><option value="collection">Repayments received</option>
          </select>
          <select aria-label="Account" value={account} onChange={(e) => setAccount(e.target.value)} className={inputCls}>
            <option value="">All accounts</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls}>
            <option value="">All categories</option><option value="__none">Uncategorized</option>
            {categories.filter((c) => !c.archived).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <div role="group" aria-label="Period" className="flex overflow-hidden rounded-lg border border-line font-semibold">
            {(['month', 'all'] as const).map((s) => (
              <button key={s} aria-pressed={scope === s} onClick={() => setScope(s)} className={`px-3 py-1.5 ${scope === s ? 'bg-ink text-white' : 'text-muted hover:text-ink'}`}>{s === 'month' ? monthLabel(ym) : 'All time'}</button>
            ))}
          </div>
          <span className="text-muted">{rows.length} transaction{rows.length === 1 ? '' : 's'} &middot; in {formatRs(totals.inn)} &middot; out {formatRs(totals.out)}</span>
          <button onClick={exportCsv} disabled={rows.length === 0} className={`${btnGhost} ml-auto flex h-9 items-center gap-1.5`}><Download size={14} /> Export CSV</button>
        </div>
      </section>

      {rows.length === 0 ? (
        <Empty title={txs.length === 0 ? 'No transactions yet' : 'Nothing matches'}>
          {txs.length === 0 ? 'Use the quick entry bar above, for example: ride 20' : 'Try clearing a filter or switching to All time.'}
        </Empty>
      ) : (
        <section className={cardCls}>
          {days.map(([day, list]) => {
            const spent = list.filter((t) => t.kind === 'expense').reduce((s, t) => s + t.amountPaisa, 0);
            return (
              <div key={day} className="mb-4 last:mb-0">
                <div className="mb-1 flex items-baseline justify-between border-b border-line pb-1 text-xs font-semibold text-muted">
                  <span>{new Date(`${day}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                  {spent > 0 && <span>Spent {formatRs(spent)}</span>}
                </div>
                <ul>
                  {list.map((t) => (
                    <li key={t.id} className="group flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-paper">
                      <button onClick={() => onEdit(t)} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-label={`Edit ${t.description || t.kind}`}>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2"><span className="truncate text-[15px] font-medium">{t.description || <span className="text-muted">No description</span>}</span>{kindTag(t)}</span>
                          <span className="block truncate text-xs text-muted">{new Date(t.occurredAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} &middot; {subtitle(t)}</span>
                        </span>
                        {amountCell(t)}
                      </button>
                      <button onClick={() => remove(t)} aria-label={`Delete ${t.description || t.kind}`} className="rounded-md p-1 text-muted opacity-0 hover:text-red-600 focus-visible:opacity-100 group-hover:opacity-100"><Trash2 size={15} /></button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
          {rows.length > limit && <button onClick={() => setLimit((l) => l + PAGE)} className={`${btnGhost} mt-2 w-full`}>Show more ({rows.length - limit} left)</button>}
        </section>
      )}

      <section className="text-sm">
        <button onClick={() => setShowTrash((v) => !v)} aria-expanded={showTrash} className="font-semibold text-muted hover:text-ink">
          Recently deleted ({trash.length}) {showTrash ? '\u2212' : '+'}
        </button>
        {showTrash && (
          <div className={`${cardCls} mt-2`}>
            {trash.length === 0 ? <p className="text-muted">Nothing deleted in the last 30 days.</p> : (
              <ul className="divide-y divide-line">
                {trash.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 py-2">
                    <span className="min-w-0 flex-1 truncate">{t.description || t.kind} <span className="text-muted">&middot; {dayKeyOf(t.occurredAt)}</span></span>
                    <span className="font-semibold">{formatRs(t.amountPaisa)}</span>
                    <button onClick={() => { const r = restoreTx(t.id); if (!r.ok) toast(r.error); }} className="flex items-center gap-1 font-semibold text-muted hover:text-ink"><RotateCcw size={14} /> Restore</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
