import { AlertTriangle, CalendarClock, CheckCircle2, Scale, Tags } from 'lucide-react';
import { useFinanceStore } from '../../store/useFinanceStore';
import { formatRs } from '../../finance/money';
import { monthLabel } from '../../finance/ledger';
import type { FinTx } from '../../finance/types';
import { useFinanceDerived } from '../../finance/useFinanceDerived';
import type { FinanceTab } from './FinanceView';
import type { LedgerPreset } from './Ledger';
import { Bar, Card, Empty, cardCls } from './ui';

const BUCKET_LABEL = { needs: 'Needs', wants: 'Wants', savings: 'Savings' } as const;
const niceDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const when = (days: number) => (days < 0 ? `${-days} day${days === -1 ? '' : 's'} overdue` : days === 0 ? 'today' : `in ${days} day${days === 1 ? '' : 's'}`);

function Kpi({ label, tag, value, sub, tone, bar }: {
  label: string; tag?: string; value: string; sub?: string; tone?: 'good' | 'bad';
  bar?: { ratio: number; state: 'ok' | 'warn' | 'over' | 'met' };
}) {
  return (
    <div className={cardCls}>
      <p className="flex items-baseline justify-between gap-2 text-xs font-semibold uppercase tracking-wide text-muted"><span>{label}</span>{tag && <span className="font-normal normal-case">{tag}</span>}</p>
      <p className={`mt-1 font-display text-2xl font-bold ${tone === 'good' ? 'text-money' : tone === 'bad' ? 'text-red-600' : ''}`}>{value}</p>
      {bar && <div className="mt-2"><Bar ratio={bar.ratio} state={bar.state} /></div>}
      {sub && <p className="mt-2 text-xs text-muted">{sub}</p>}
    </div>
  );
}

function Row({ label, value, sign, strong, muted, sub }: { label: string; value: string; sign?: '+' | '\u2212' | '='; strong?: boolean; muted?: boolean; sub?: string }) {
  return (
    <li className={`flex items-baseline justify-between gap-4 py-1.5 text-sm ${strong ? 'border-t border-line pt-3 font-bold' : ''} ${muted ? 'text-muted' : ''}`}>
      <span className="min-w-0"><span className="mr-2 inline-block w-3 text-muted">{sign}</span>{label}{sub && <span className="block pl-5 text-xs font-normal text-muted">{sub}</span>}</span>
      <span className={strong ? 'font-display text-lg' : 'font-semibold'}>{value}</span>
    </li>
  );
}

export default function Overview({ ym, goto, onEdit }: { ym: string; goto: (t: FinanceTab, p?: LedgerPreset) => void; onEdit: (t: FinTx) => void }) {
  const settings = useFinanceStore((s) => s.settings);
  const txs = useFinanceStore((s) => s.txs);
  const d = useFinanceDerived(ym);
  const { summary, budget, netWorth: nw, forecast } = d;
  const [needs, wants, savings] = budget.lines;
  const planned = needs.planned + wants.planned;
  const budgetActual = needs.actual + wants.actual;       // expenses, plus loan payments if the plan counts them here
  const remaining = planned - budgetActual;
  const goalsSaved = d.goalList.reduce((s, g) => s + g.progress.saved, 0);
  const goalsTarget = d.goalList.reduce((s, g) => s + g.goal.targetPaisa, 0);
  const noPlan = budget.base === 0;
  const target = settings.incomeTargetPaisa;
  const debtTotal = nw.loans + nw.cardsOwed;

  /* ---------- things that need attention ---------- */
  const insights: { key: string; icon: 'warn' | 'info' | 'date' | 'tag'; text: string; action?: { label: string; run: () => void } }[] = [];
  for (const l of d.loanList) {
    const n = l.next;
    if (n && (n.overdue || n.dueInDays <= 7)) insights.push({ key: `loan-${l.loan.id}`, icon: n.overdue ? 'warn' : 'date', text: `${l.loan.name}: ${formatRs(n.amountPaisa)} EMI ${n.overdue ? 'was due' : 'is due'} ${n.dueInDays === 0 ? 'today' : n.overdue ? `${niceDate(n.dueDate)} (${when(n.dueInDays)})` : `${niceDate(n.dueDate)} (${when(n.dueInDays)})`}.`, action: { label: 'Pay', run: () => goto('debts') } });
  }
  for (const r of d.receivableList) {
    if (r.remaining > 0 && r.dueInDays !== null && r.dueInDays <= 7) insights.push({ key: `rec-${r.rec.id}`, icon: r.overdue ? 'warn' : 'date', text: `${r.rec.person} owes you ${formatRs(r.remaining)}, expected back ${niceDate(r.rec.expectedOn!)} (${when(r.dueInDays)}).`, action: { label: 'Open', run: () => goto('debts') } });
  }
  if (forecast && forecast.projectedCash < 0) insights.push({ key: 'cash-neg', icon: 'warn', text: `Projected cash at month end is ${formatRs(forecast.projectedCash)} after your loan payments and expected spending.` });
  if (noPlan) insights.push({ key: 'plan', icon: 'info', text: 'Set your income plan to turn on budgets and projections.', action: { label: 'Set plan', run: () => goto('budget') } });
  if (d.uncategorized.length) insights.push({ key: 'uncat', icon: 'tag', text: `${d.uncategorized.length} transaction${d.uncategorized.length === 1 ? ' has' : 's have'} no category.`, action: { label: 'Review', run: () => goto('ledger', { category: '__none', scope: 'all' }) } });
  for (const p of d.projection ?? []) {
    if (p.over) insights.push({ key: `proj-${p.bucket}`, icon: 'warn', text: `At this pace ${BUCKET_LABEL[p.bucket]} reaches ${formatRs(p.projected)} by month end, ${formatRs(p.projected - p.planned)} over budget.${p.confidence === 'low' ? ' (Early in the month, so low confidence.)' : ''}`, action: { label: 'Budget', run: () => goto('budget') } });
  }
  for (const l of [needs, wants]) if (l.state === 'over') insights.push({ key: `over-${l.bucket}`, icon: 'warn', text: `${BUCKET_LABEL[l.bucket]} is over budget by ${formatRs(-l.remaining)}.`, action: { label: 'Review', run: () => goto('ledger', { scope: 'month', kind: 'expense' }) } });
  for (const r of d.recurring.filter((x) => !x.paidThisMonth && x.dueInDays >= -3 && x.dueInDays <= 7)) {
    insights.push({ key: `bill-${r.key}`, icon: 'date', text: `${r.label} (about ${formatRs(r.amountPaisa)}) is due ${r.dueInDays === 0 ? 'today' : when(r.dueInDays)}.` });
  }
  for (const u of d.unexplained) insights.push({ key: `unx-${u.accountId}`, icon: 'warn', text: `${u.name}: ${formatRs(u.adjustmentPaisa, { signed: true })} of unexplained difference this month (${u.adjustments} reconciliation${u.adjustments === 1 ? '' : 's'}).`, action: { label: 'Accounts', run: () => goto('accounts') } });
  for (const s of d.stale.slice(0, 2)) insights.push({ key: `stale-${s.account.id}`, icon: 'info', text: `${s.account.name} ${s.days === null ? 'has never been counted' : `was last counted ${s.days} days ago`}. Reconcile to catch missing entries.`, action: { label: 'Reconcile', run: () => goto('accounts') } });

  const upcoming = d.recurring.filter((r) => !r.paidThisMonth);

  return (
    <div className="space-y-6">
      {/* Six separate numbers. Each answers one question and nothing is counted in two of them. */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Kpi label="Available cash" tag="now" value={formatRs(nw.availableCash)} sub="Cash, bank and wallets. Receivables are not included." />
        <Kpi
          label="Income" tag={monthLabel(ym)} value={formatRs(summary.income)}
          sub={`Expected ${formatRs(settings.expectedIncomePaisa)} \u00B7 Target ${formatRs(target)}`}
          bar={target > 0 ? { ratio: summary.income / target, state: summary.income >= target ? 'met' : 'ok' } : undefined}
        />
        <Kpi label="Expenses" tag={monthLabel(ym)} value={formatRs(summary.spendingTotal)} sub="Needs + Wants, net of refunds. Loan payments are under Debt, not here." />
        <Kpi
          label="Debt" tag="now" value={formatRs(debtTotal)}
          sub={`Loans ${formatRs(nw.loans)}${nw.cardsOwed ? ` \u00B7 Cards ${formatRs(nw.cardsOwed)}` : ''} \u00B7 paid this month ${formatRs(summary.debtPayments)}`}
        />
        <Kpi label="Receivables" tag="now" value={formatRs(nw.receivables)} sub="Owed to you. Not cash until it is received." />
        <Kpi label="Net worth" tag="now" value={formatRs(nw.netWorth)} tone={nw.netWorth < 0 ? 'bad' : undefined} sub="Cash + receivables \u2212 debt, of what you track here." />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Kpi label="Net cash flow" tag={monthLabel(ym)} value={formatRs(summary.netCashFlow, { signed: true })} tone={summary.netCashFlow >= 0 ? 'good' : 'bad'} sub={`Income \u2212 expenses \u2212 loan payments (${formatRs(summary.debtPayments)}). ${formatRs(summary.saved)} of it was saved.`} />
        <Kpi
          label="Remaining budget" tag={monthLabel(ym)} value={noPlan ? '\u2014' : formatRs(remaining)} tone={noPlan ? undefined : remaining < 0 ? 'bad' : undefined}
          sub={noPlan ? 'Set an income plan first' : `Needs + Wants plan ${formatRs(planned)}${settings.debtBucket !== 'none' && summary.debtPayments > 0 ? `, including ${formatRs(summary.debtPayments)} of loan payments` : ''}`}
          bar={noPlan ? undefined : { ratio: planned > 0 ? budgetActual / planned : 1, state: budgetActual > planned ? 'over' : budgetActual >= planned * 0.8 ? 'warn' : 'ok' }}
        />
        <Kpi
          label="Savings progress" tag={monthLabel(ym)} value={formatRs(summary.saved)}
          sub={`${noPlan ? '' : `of ${formatRs(savings.planned)} planned \u00B7 `}goals: ${formatRs(goalsSaved)} of ${formatRs(goalsTarget)}`}
          bar={savings.planned > 0 ? { ratio: summary.saved / savings.planned, state: savings.state === 'met' ? 'met' : 'ok' } : undefined}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Cash outlook">
          {!forecast ? (
            <p className="text-sm text-muted">The outlook looks ahead from today, so it is shown for the current month. Switch to this month to see it.</p>
          ) : (
            <>
              <ul>
                <Row label="Available cash today" value={formatRs(forecast.availableNow)} />
                <Row sign={'\u2212'} label="Loan payments still due this month" value={formatRs(forecast.loanDueTotal)} sub={forecast.loanDue.length ? forecast.loanDue.map((x) => `${x.name} ${niceDate(x.dueDate)}`).join(' \u00B7 ') : 'None due'} />
                <Row sign={'\u2212'} label="Expected spending for the rest of the month" value={formatRs(forecast.spendingRemaining)} sub={noPlan && forecast.spendingRemaining === 0 ? undefined : 'From your day-to-day pace and recurring bills'} />
                <Row sign="=" label="Projected cash at month end" value={formatRs(forecast.projectedCash)} strong />
              </ul>
              <div className="mt-4 rounded-xl bg-paper p-3 text-sm">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Not counted above</p>
                <p className="flex justify-between gap-3"><span>Receivables due by month end{forecast.receivablesDue.length ? ` (${forecast.receivablesDue.map((r) => r.rec.person).join(', ')})` : ''}</span><span className="font-semibold">{formatRs(forecast.receivablesDueTotal)}</span></p>
                <p className="mt-1 text-xs text-muted">Counted only once it has actually been received.</p>
                {forecast.expectedIncomeRemaining > 0 && (
                  <p className="mt-2 flex justify-between gap-3"><span>If the {formatRs(forecast.expectedIncomeRemaining)} of expected income arrives</span><span className="font-semibold">{formatRs(forecast.projectedWithExpectedIncome)}</span></p>
                )}
              </div>
            </>
          )}
        </Card>

        <Card title="Net worth" aside={<button onClick={() => goto('debts')} className="text-sm font-semibold text-muted hover:text-ink">Loans &amp; receivables</button>}>
          <ul>
            <Row sign="+" label="Available cash" value={formatRs(nw.availableCash)} />
            <Row sign="+" label="Receivables (owed to you)" value={formatRs(nw.receivables)} />
            {nw.cardCredit > 0 && <Row sign="+" label="Card credit" value={formatRs(nw.cardCredit)} />}
            <Row sign={'\u2212'} label="Loans outstanding" value={formatRs(nw.loans)} />
            {nw.cardsOwed > 0 && <Row sign={'\u2212'} label="Cards owed" value={formatRs(nw.cardsOwed)} />}
            <Row sign="=" label="Net worth" value={formatRs(nw.netWorth)} strong />
          </ul>
          <p className="mt-3 text-xs text-muted">Without receivables: {formatRs(nw.netWorthWithoutReceivables)}. Paying an EMI, lending money or being repaid moves value between these lines without changing the total.</p>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Needs attention">
          {insights.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-muted"><CheckCircle2 size={16} className="text-money" /> All clear for {monthLabel(ym)}.</p>
          ) : (
            <ul className="space-y-3">
              {insights.map((i) => (
                <li key={i.key} className="flex items-start gap-3 text-sm">
                  {i.icon === 'warn' ? <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600" /> : i.icon === 'date' ? <CalendarClock size={16} className="mt-0.5 shrink-0 text-muted" /> : i.icon === 'tag' ? <Tags size={16} className="mt-0.5 shrink-0 text-muted" /> : <Scale size={16} className="mt-0.5 shrink-0 text-muted" />}
                  <span className="flex-1">{i.text}</span>
                  {i.action && <button onClick={i.action.run} className="shrink-0 font-semibold underline">{i.action.label}</button>}
                </li>
              ))}
            </ul>
          )}
          {upcoming.length > 0 && (
            <div className="mt-5 border-t border-line pt-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Recurring bills detected</p>
              <ul className="space-y-1 text-sm">
                {upcoming.slice(0, 5).map((r) => <li key={r.key} className="flex justify-between gap-3"><span className="truncate">{r.label}</span><span className="text-muted">~{formatRs(r.amountPaisa)} &middot; {r.nextDate.slice(5)}</span></li>)}
              </ul>
            </div>
          )}
        </Card>

        <Card title="50 / 30 / 20" aside={<button onClick={() => goto('budget')} className="text-sm font-semibold text-muted hover:text-ink">Open planner</button>}>
          {noPlan ? <p className="text-sm text-muted">Set your monthly income and split in the Budget tab.</p> : (
            <ul className="space-y-4">
              {budget.lines.map((l) => (
                <li key={l.bucket}>
                  <div className="mb-1 flex items-baseline justify-between text-sm"><span className="font-semibold">{BUCKET_LABEL[l.bucket]} <span className="font-normal text-muted">{l.pct}%</span></span><span className="text-muted">{formatRs(l.actual)} of {formatRs(l.planned)}</span></div>
                  <Bar ratio={Number.isFinite(l.ratio) ? l.ratio : 1} state={l.state} />
                  {l.debt > 0 && <p className="mt-1 text-xs text-muted">Includes {formatRs(l.debt)} of loan payments</p>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Recent" aside={<button onClick={() => goto('ledger')} className="text-sm font-semibold text-muted hover:text-ink">Open ledger</button>}>
        {txs.length === 0 ? <Empty title="No transactions yet">Type something like <b>ride 20</b> in the bar above and press Enter.</Empty> : (
          <ul className="divide-y divide-line">
            {txs.slice(0, 8).map((t) => {
              const inflow = t.kind === 'income' || t.kind === 'refund' || t.kind === 'collection' || t.kind === 'loan_received';
              const tag = t.kind === 'loan_payment' ? 'Loan payment' : t.kind === 'loan_received' ? 'Loan received' : t.kind === 'lend' ? 'Lent' : t.kind === 'collection' ? 'Repayment' : d.categoryName.get(t.categoryId ?? '') ?? (t.kind === 'transfer' ? 'Transfer' : t.kind);
              return (
                <li key={t.id}>
                  <button onClick={() => onEdit(t)} className="flex w-full items-center gap-3 py-2.5 text-left">
                    <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{t.description || t.kind}</span>
                    <span className="text-xs text-muted">{tag}</span>
                    <span className={`font-semibold ${inflow ? 'text-money' : ''}`}>{t.kind === 'transfer' ? formatRs(t.amountPaisa) : formatRs(inflow ? t.amountPaisa : -t.amountPaisa, { signed: inflow })}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
