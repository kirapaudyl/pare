import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useFinanceStore } from '../../store/useFinanceStore';
import { monthLabel, shiftMonth, ymOf } from '../../finance/ledger';
import type { FinTx, TxInput } from '../../finance/types';
import Accounts from './Accounts';
import Budget from './Budget';
import Debts from './Debts';
import Goals from './Goals';
import Ledger, { type LedgerPreset } from './Ledger';
import Overview from './Overview';
import QuickAdd from './QuickAdd';
import Rules from './Rules';
import TransactionForm from './TransactionForm';
import { ToastProvider, btnGhost, btnPrimary, cardCls } from './ui';

export type FinanceTab = 'overview' | 'ledger' | 'budget' | 'accounts' | 'debts' | 'goals' | 'rules';
const TABS: { id: FinanceTab; label: string }[] = [
  { id: 'overview', label: 'Overview' }, { id: 'ledger', label: 'Ledger' }, { id: 'budget', label: 'Budget' },
  { id: 'accounts', label: 'Accounts' }, { id: 'debts', label: 'Loans & Receivables' }, { id: 'goals', label: 'Goals' }, { id: 'rules', label: 'Categories' },
];
const WITH_MONTH: FinanceTab[] = ['overview', 'ledger', 'budget', 'debts'];

interface FormState { initial?: FinTx | null; preset?: Partial<TxInput> }

export default function FinanceView() {
  return <ToastProvider><FinanceInner /></ToastProvider>;
}

function FinanceInner() {
  const status = useFinanceStore((s) => s.status);
  const error = useFinanceStore((s) => s.error);
  const needsSchema = useFinanceStore((s) => s.needsSchema);
  const notice = useFinanceStore((s) => s.notice);
  const dismissNotice = useFinanceStore((s) => s.dismissNotice);
  const load = useFinanceStore((s) => s.load);

  const [tab, setTab] = useState<FinanceTab>('overview');
  const [ym, setYm] = useState(() => ymOf(new Date()));
  const [form, setForm] = useState<FormState | null>(null);
  const [ledgerPreset, setLedgerPreset] = useState<LedgerPreset | null>(null);
  const quickRef = useRef<HTMLInputElement>(null);

  useEffect(() => { void load(); }, [load]);

  // Refresh when you come back to the tab (another device may have added entries).
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible' && Date.now() - useFinanceStore.getState().loadedAt > 60_000) void load(true);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [load]);

  // "N" jumps to quick entry from anywhere on this page, unless you are typing or a dialog is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'n' || e.ctrlKey || e.metaKey || e.altKey || form) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
      e.preventDefault();
      quickRef.current?.focus();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [form]);

  const goto = useCallback((t: FinanceTab, preset?: LedgerPreset) => {
    setLedgerPreset(preset ?? null);
    setTab(t);
  }, []);
  const edit = useCallback((t: FinTx) => setForm({ initial: t }), []);

  if (status === 'idle' || status === 'loading') {
    return <div className="grid min-h-[40vh] place-items-center text-sm text-muted">Loading your finances&hellip;</div>;
  }
  if (status === 'error') {
    return (
      <div className={`${cardCls} mx-auto max-w-xl`}>
        <h2 className="font-display text-xl font-bold">{needsSchema ? 'Finance needs a one-time database setup' : 'Couldn\u2019t load Finance'}</h2>
        <p className="mt-2 text-sm text-muted">
          {needsSchema
            ? 'Open your Supabase project, go to SQL Editor, paste the contents of supabase/schema_finance.sql and run it (running it again on an existing setup is safe and adds the newer tables). Then retry.'
            : error}
        </p>
        <button onClick={() => void load(true)} className={`${btnPrimary} mt-4`}>Retry</button>
      </div>
    );
  }

  const nowYm = ymOf(new Date());

  return (
    <div className="space-y-6">
      {notice && (
        <div role="alert" className="flex items-start justify-between gap-3 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700">
          <span>{notice}</span><button onClick={dismissNotice} aria-label="Dismiss" className="shrink-0"><X size={16} /></button>
        </div>
      )}

      <QuickAdd inputRef={quickRef} onMore={() => setForm({ preset: { kind: 'transfer' } })} />

      <div className="flex flex-wrap items-center gap-3">
        <nav className="flex flex-wrap gap-1" aria-label="Finance sections">
          {TABS.map((t) => (
            <button
              key={t.id} onClick={() => goto(t.id)} aria-current={tab === t.id ? 'page' : undefined}
              className={`rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors ${tab === t.id ? 'bg-ink text-white' : 'text-muted hover:text-ink'}`}
            >
              {t.label}
            </button>
          ))}
        </nav>
        {WITH_MONTH.includes(tab) && (
          <div className="ml-auto flex items-center gap-1">
            <button onClick={() => setYm(shiftMonth(ym, -1))} aria-label="Previous month" className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:text-ink"><ChevronLeft size={18} /></button>
            <span className="min-w-[8.5rem] text-center font-display text-base font-bold">{monthLabel(ym)}</span>
            <button onClick={() => setYm(shiftMonth(ym, 1))} aria-label="Next month" className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:text-ink"><ChevronRight size={18} /></button>
            {ym !== nowYm && <button onClick={() => setYm(nowYm)} className={`${btnGhost} ml-1 h-9 px-3`}>This month</button>}
          </div>
        )}
      </div>

      {tab === 'overview' && <Overview ym={ym} goto={goto} onEdit={edit} />}
      {tab === 'ledger' && <Ledger key={JSON.stringify(ledgerPreset)} ym={ym} preset={ledgerPreset} onEdit={edit} />}
      {tab === 'budget' && <Budget ym={ym} />}
      {tab === 'accounts' && <Accounts ym={ym} onTransfer={() => setForm({ preset: { kind: 'transfer' } })} onAddExpense={(preset) => setForm({ preset })} />}
      {tab === 'debts' && <Debts ym={ym} />}
      {tab === 'goals' && <Goals ym={ym} />}
      {tab === 'rules' && <Rules />}

      {form && <TransactionForm key={form.initial?.id ?? JSON.stringify(form.preset ?? 'new')} initial={form.initial} preset={form.preset} onClose={() => setForm(null)} />}
    </div>
  );
}
