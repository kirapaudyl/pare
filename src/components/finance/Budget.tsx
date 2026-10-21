import { useEffect, useState } from 'react';
import { useFinanceStore } from '../../store/useFinanceStore';
import { formatRs, paisaToInput, parseMoney } from '../../finance/money';
import { monthLabel } from '../../finance/ledger';
import { useFinanceDerived } from '../../finance/useFinanceDerived';
import type { BudgetBase, Bucket, DebtBucket } from '../../finance/types';
import { Bar, Card, Field, Segmented, btnPrimary, inputCls, useToast } from './ui';

const LABEL: Record<Bucket, string> = { needs: 'Needs', wants: 'Wants', savings: 'Savings' };
const HELP: Record<Bucket, string> = { needs: 'Rent, food, transport, bills', wants: 'Eating out, fun, shopping', savings: 'Savings, investments, goal contributions' };

export default function Budget({ ym }: { ym: string }) {
  const settings = useFinanceStore((s) => s.settings);
  const categories = useFinanceStore((s) => s.categories);
  const saveSettings = useFinanceStore((s) => s.saveSettings);
  const d = useFinanceDerived(ym);
  const toast = useToast();

  const [target, setTarget] = useState('');
  const [expected, setExpected] = useState('');
  const [pct, setPct] = useState({ needs: '50', wants: '30', savings: '20' });
  const [base, setBase] = useState<BudgetBase>('expected');
  const [debtBucket, setDebtBucket] = useState<DebtBucket>('needs');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTarget(settings.incomeTargetPaisa ? paisaToInput(settings.incomeTargetPaisa) : '');
    setExpected(settings.expectedIncomePaisa ? paisaToInput(settings.expectedIncomePaisa) : '');
    setPct({ needs: String(settings.needsPct), wants: String(settings.wantsPct), savings: String(settings.savingsPct) });
    setBase(settings.budgetBase);
    setDebtBucket(settings.debtBucket);
  }, [settings]);

  const sum = Number(pct.needs) + Number(pct.wants) + Number(pct.savings);
  const sumOk = sum === 100;

  const save = () => {
    const money = (s: string) => (s.trim() ? parseMoney(s, { allowZero: true }) : ({ ok: true, paisa: 0 } as const));
    const t = money(target), e = money(expected);
    if (!t.ok) { setError(`Income target: ${t.error}`); return; }
    if (!e.ok) { setError(`Expected income: ${e.error}`); return; }
    const r = saveSettings({
      incomeTargetPaisa: t.paisa, expectedIncomePaisa: e.paisa, budgetBase: base, debtBucket,
      needsPct: Number(pct.needs), wantsPct: Number(pct.wants), savingsPct: Number(pct.savings),
    });
    if (!r.ok) { setError(r.error); return; }
    setError(null);
    toast('Plan saved');
  };

  const catName = new Map(categories.map((c) => [c.id, c.name]));

  return (
    <div className="space-y-6">
      <Card title="Income plan & split">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Monthly income target (Rs)" hint="What you are aiming to earn each month."><input inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} className={inputCls} placeholder="0" /></Field>
          <Field label="Expected income (Rs)" hint="What you are fairly sure of, such as salary."><input inputMode="decimal" value={expected} onChange={(e) => setExpected(e.target.value)} className={inputCls} placeholder="0" /></Field>
        </div>
        <div className="mt-4">
          <p className="mb-1 text-sm font-semibold">Budget is calculated from</p>
          <Segmented label="Budget base" value={base} onChange={setBase} options={[{ id: 'target', label: 'Target' }, { id: 'expected', label: 'Expected' }, { id: 'actual', label: 'Actual so far' }]} />
          <p className="mt-1 text-xs text-muted">Actual uses what you have really received this month, so the budget grows as income arrives.</p>
        </div>
        <div className="mt-4">
          <p className="mb-1 text-sm font-semibold">Loan payments (EMIs) count toward</p>
          <Segmented label="Loan payments bucket" value={debtBucket} onChange={setDebtBucket} options={[{ id: 'needs', label: 'Needs' }, { id: 'wants', label: 'Wants' }, { id: 'none', label: 'Not in budget' }]} />
          <p className="mt-1 text-xs text-muted">Each EMI is counted once, here, and never as an expense as well. On the dashboard it always shows under Debt.</p>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {(['needs', 'wants', 'savings'] as const).map((b) => (
            <Field key={b} label={`${LABEL[b]} %`} hint={HELP[b]}>
              <input inputMode="numeric" value={pct[b]} onChange={(e) => setPct({ ...pct, [b]: e.target.value.replace(/\D/g, '') })} className={inputCls} />
            </Field>
          ))}
        </div>
        <p className={`mt-2 text-sm font-semibold ${sumOk ? 'text-money' : 'text-red-600'}`}>{sumOk ? 'Adds up to 100%' : `Adds up to ${Number.isNaN(sum) ? '?' : sum}%. It must be exactly 100%.`}</p>
        {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
        <button onClick={save} disabled={!sumOk} className={`${btnPrimary} mt-4`}>Save plan</button>
      </Card>

      <div>
        <h2 className="mb-3 font-display text-xl font-bold">{monthLabel(ym)}: planned vs actual</h2>
        {d.budget.base === 0 && <p className="mb-3 rounded-xl bg-paper p-3 text-sm text-muted">No income base yet, so planned amounts are Rs 0. Enter your income above{settings.budgetBase === 'actual' ? ' or record income this month' : ''}.</p>}
        <div className="grid gap-4 lg:grid-cols-3">
          {d.budget.lines.map((l) => {
            const proj = d.projection?.find((p) => p.bucket === l.bucket);
            const cats = [...d.summary.byBucketCategory[l.bucket].entries()].filter(([, v]) => v !== 0).sort((a, b) => b[1] - a[1]);
            return (
              <section key={l.bucket} className="rounded-xl2 bg-card p-5 shadow-lift">
                <div className="flex items-baseline justify-between"><h3 className="font-display text-lg font-bold">{LABEL[l.bucket]}</h3><span className="text-sm text-muted">{l.pct}%</span></div>
                <p className="mt-2 font-display text-2xl font-bold">{formatRs(l.actual)}</p>
                <p className="text-sm text-muted">of {formatRs(l.planned)} planned{l.debt > 0 ? ` \u00B7 includes ${formatRs(l.debt)} of loan payments` : ''}</p>
                <div className="my-3"><Bar ratio={Number.isFinite(l.ratio) ? l.ratio : 1} state={l.state} /></div>
                <p className={`text-sm font-semibold ${l.state === 'over' ? 'text-red-600' : l.state === 'warn' ? 'text-amber-700' : l.state === 'met' ? 'text-money' : ''}`}>
                  {l.bucket === 'savings'
                    ? l.state === 'met' ? 'Savings target met' : `${formatRs(Math.max(0, l.remaining))} left to save`
                    : l.state === 'over' ? `Over by ${formatRs(-l.remaining)}` : `${formatRs(l.remaining)} left${l.state === 'warn' ? ` \u00B7 ${Math.round(l.ratio * 100)}% used` : ''}`}
                </p>
                {proj && l.planned > 0 && (
                  <p className={`mt-1 text-xs ${proj.over ? 'font-semibold text-red-600' : 'text-muted'}`}>
                    Projected {formatRs(proj.projected)} by month end{proj.over ? `, ${formatRs(proj.projected - proj.planned)} over` : ''}{proj.confidence === 'low' ? ' (early estimate)' : ''}
                  </p>
                )}
                {cats.length > 0 && (
                  <ul className="mt-3 space-y-1 border-t border-line pt-3 text-sm">
                    {cats.map(([id, v]) => <li key={id} className="flex justify-between gap-3"><span className="truncate">{id ? catName.get(id) ?? 'Removed category' : 'Uncategorized'}</span><span className="text-muted">{formatRs(v)}</span></li>)}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
