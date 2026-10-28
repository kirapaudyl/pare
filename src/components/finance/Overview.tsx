import { AlertTriangle, CalendarClock, CheckCircle2, Scale, Tags } from 'lucide-react';
import { useFinanceStore } from '../../store/useFinanceStore';
import { formatRs } from '../../finance/money';
import { monthLabel } from '../../finance/ledger';
import type { FinTx } from '../../finance/types';
import { useFinanceDerived } from '../../finance/useFinanceDerived';
import type { FinanceTab } from './FinanceView';
import type { LedgerPreset } from './Ledger';
import IncomeGoal from './IncomeGoal';
import { cardCls } from './ui';

const niceDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const when = (days: number) => (days < 0 ? `${-days} day${days === -1 ? '' : 's'} overdue` : days === 0 ? 'today' : `in ${days} day${days === 1 ? '' : 's'}`);

/** One box from the sketch: a heading, a big number, and the lines that explain it. */
function Box({ title, note, aside, children, className = '' }: { title: string; note?: string; aside?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section aria-label={title} className={`${cardCls} ${className}`}>
      <header className="mb-3 flex items-baseline justify-between gap-3">
        <div><h2 className="font-display text-lg font-bold">{title}</h2>{note && <p className="text-xs text-muted">{note}</p>}</div>
        {aside}
      </header>
      {children}
    </section>
  );
}

function Line({ label, value, sub, sign, strong, tone }: { label: string; value: string; sub?: string; sign?: '+' | '\u2212' | '='; strong?: boolean; tone?: 'bad' | 'muted' }) {
  return (
    <li className={`flex items-baseline justify-between gap-4 py-1.5 text-sm ${strong ? 'mt-1 border-t border-line pt-3 font-bold' : ''} ${tone === 'muted' ? 'text-muted' : ''}`}>
      <span className="min-w-0">{sign && <span className="mr-2 inline-block w-3 text-muted">{sign}</span>}{label}{sub && <span className={`block text-xs font-normal text-muted ${sign ? 'pl-5' : ''}`}>{sub}</span>}</span>
      <span className={`shrink-0 ${strong ? 'font-display text-lg' : 'font-semibold'} ${tone === 'bad' ? 'text-red-600' : ''}`}>{value}</span>
    </li>
  );
}

const Link = ({ onClick, children }: { onClick: () => void; children: React.ReactNode }) => (
  <button onClick={onClick} className="text-sm font-semibold text-muted hover:text-ink">{children}</button>
);

export default function Overview({ ym, goto }: { ym: string; goto: (t: FinanceTab, p?: LedgerPreset) => void; onEdit?: (t: FinTx) => void }) {
  const accounts = useFinanceStore((s) => s.accounts);
  const d = useFinanceDerived(ym);
  const { summary, netWorth: nw, forecast, projections: pr, gap, byType } = d;

  const bankOwed = d.loanList.filter((l) => l.loan.kind === 'bank').reduce((s, l) => s + l.outstanding, 0);
  const friendOwed = d.loanList.filter((l) => l.loan.kind === 'personal').reduce((s, l) => s + l.outstanding, 0);
  const debtTotal = nw.loans + nw.cardsOwed;
  const nextEmi = d.loanList.filter((l) => l.next).map((l) => ({ name: l.loan.name, ...l.next! })).sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
  const nextReceivable = d.receivableList.filter((r) => r.remaining > 0 && r.rec.expectedOn).sort((a, b) => a.rec.expectedOn!.localeCompare(b.rec.expectedOn!))[0];
  const topCategories = [...summary.byCategory.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const liveAccounts = accounts.filter((a) => !a.archived && a.type !== 'card');

  /* ---------- things that need attention ---------- */
  const alerts: { key: string; icon: 'warn' | 'info' | 'date' | 'tag'; text: string; action?: { label: string; run: () => void } }[] = [];
  for (const a of d.negative) {
    alerts.push({ key: `neg-${a.id}`, icon: 'warn', text: `${a.name} shows ${formatRs(d.balances.get(a.id) ?? 0)}. That usually means its starting balance is missing.`, action: { label: 'Fix', run: () => goto('accounts') } });
  }
  for (const l of d.loanList) {
    const n = l.next;
    if (n && (n.overdue || n.dueInDays <= 7)) alerts.push({ key: `loan-${l.loan.id}`, icon: n.overdue ? 'warn' : 'date', text: `${l.loan.name}: ${formatRs(n.amountPaisa)} EMI ${n.overdue ? 'was due' : 'is due'} ${n.dueInDays === 0 ? 'today' : `${niceDate(n.dueDate)} (${when(n.dueInDays)})`}.`, action: { label: 'Pay', run: () => goto('debts') } });
    const r = l.returnBy;
    if (r && (r.overdue || r.dueInDays <= 7)) alerts.push({ key: `friend-${l.loan.id}`, icon: r.overdue ? 'warn' : 'date', text: `You hoped to return ${formatRs(l.outstanding)} to ${l.loan.lender || l.loan.name} by ${niceDate(r.date)} (${when(r.dueInDays)}).`, action: { label: 'Open', run: () => goto('debts') } });
  }
  for (const r of d.receivableList) {
    if (r.remaining > 0 && r.dueInDays !== null && r.dueInDays <= 7) alerts.push({ key: `rec-${r.rec.id}`, icon: r.overdue ? 'warn' : 'date', text: `${r.rec.person} owes you ${formatRs(r.remaining)}, expected back ${niceDate(r.rec.expectedOn!)} (${when(r.dueInDays)}).`, action: { label: 'Open', run: () => goto('debts') } });
  }
  if (forecast && forecast.projectedCash < 0) alerts.push({ key: 'cash-neg', icon: 'warn', text: `Projected cash at month end is ${formatRs(forecast.projectedCash)} after your loan payments and expected spending.` });
  if (d.uncategorized.length) alerts.push({ key: 'uncat', icon: 'tag', text: `${d.uncategorized.length} transaction${d.uncategorized.length === 1 ? ' has' : 's have'} no category.`, action: { label: 'Review', run: () => goto('ledger', { category: '__none', scope: 'all' }) } });
  for (const r of d.recurring.filter((x) => !x.paidThisMonth && x.dueInDays >= -3 && x.dueInDays <= 7)) {
    alerts.push({ key: `bill-${r.key}`, icon: 'date', text: `${r.label} (about ${formatRs(r.amountPaisa)}) is due ${r.dueInDays === 0 ? 'today' : when(r.dueInDays)}.` });
  }
  for (const u of d.unexplained) alerts.push({ key: `unx-${u.accountId}`, icon: 'warn', text: `${u.name}: ${formatRs(u.adjustmentPaisa, { signed: true })} of unexplained difference this month.`, action: { label: 'Accounts', run: () => goto('accounts') } });
  for (const s of d.stale.filter((x) => x.days !== null).slice(0, 2)) alerts.push({ key: `stale-${s.account.id}`, icon: 'info', text: `${s.account.name} was last checked ${s.days} days ago.`, action: { label: 'Check', run: () => goto('accounts') } });

  return (
    <div className="space-y-6">
      <IncomeGoal ym={ym} gap={gap} receivables={d.receivableList} />

      <div className="grid items-start gap-6 lg:grid-cols-2">
        {/* ---------------- left column ---------------- */}
        <div className="space-y-6">
          <Box title="Money available" note="Cash + Bank + Wallet" aside={<Link onClick={() => goto('accounts')}>Accounts</Link>}>
            <p className={`font-display text-3xl font-bold ${nw.availableCash < 0 ? 'text-red-600' : ''}`}>{formatRs(nw.availableCash)}</p>
            <ul className="mt-2">
              <Line label="Cash" value={formatRs(byType.cash)} tone={byType.cash < 0 ? 'bad' : undefined} />
              <Line label="Bank" value={formatRs(byType.bank)} tone={byType.bank < 0 ? 'bad' : undefined} />
              <Line label="Wallet" value={formatRs(byType.wallet)} tone={byType.wallet < 0 ? 'bad' : undefined} />
            </ul>
            {liveAccounts.length === 0 && <p className="mt-2 text-xs text-muted">Add your cash, bank and wallet accounts in the Accounts tab.</p>}
            <p className="mt-2 text-xs text-muted">Receivables are not included until they are received.</p>
          </Box>

          <Box title="Expenses" note={`Total expenses of ${monthLabel(ym)}`} aside={<Link onClick={() => goto('ledger', { scope: 'month', kind: 'expense' })}>Ledger</Link>}>
            <p className="font-display text-3xl font-bold">{formatRs(summary.spendingTotal)}</p>
            {topCategories.length > 0 ? (
              <ul className="mt-2">
                {topCategories.map(([id, v]) => <Line key={id || 'none'} label={id ? d.categoryName.get(id) ?? 'Removed category' : 'Uncategorized'} value={formatRs(v)} tone="muted" />)}
              </ul>
            ) : <p className="mt-2 text-sm text-muted">Nothing spent yet. Type something like <b>ride 20</b> in the bar above.</p>}
            <p className="mt-2 text-xs text-muted">Loan payments are shown under Debt, not here.</p>
          </Box>

          <Box title="Debt and Receivables" aside={<Link onClick={() => goto('debts')}>Manage</Link>}>
            <ul>
              <Line
                label="Debt" value={formatRs(debtTotal)} strong
                sub={`${[bankOwed ? `Bank loans ${formatRs(bankOwed)}` : '', friendOwed ? `Friends ${formatRs(friendOwed)}` : '', nw.cardsOwed ? `Cards ${formatRs(nw.cardsOwed)}` : ''].filter(Boolean).join(' \u00B7 ') || 'No debt tracked'}${nextEmi ? ` \u00B7 next EMI ${formatRs(nextEmi.amountPaisa)} on ${niceDate(nextEmi.dueDate)}` : ''}`}
              />
              <Line
                label="Receivables" value={formatRs(nw.receivables)} strong
                sub={nw.receivables > 0 ? `Owed to you${nextReceivable ? ` \u00B7 ${nextReceivable.rec.person} expected ${niceDate(nextReceivable.rec.expectedOn!)}` : ''}` : 'Nobody owes you right now'}
              />
            </ul>
          </Box>

          <Box title="Cash outlook">
            {!forecast ? (
              <p className="text-sm text-muted">The outlook looks ahead from today, so it is shown for the current month.</p>
            ) : (
              <>
                <ul>
                  <Line label="Money available today" value={formatRs(forecast.availableNow)} />
                  <Line sign={'\u2212'} label="Loan payments still due this month" value={formatRs(forecast.loanDueTotal)} sub={forecast.loanDue.length ? forecast.loanDue.map((x) => `${x.name} ${niceDate(x.dueDate)}`).join(' \u00B7 ') : 'None due'} />
                  <Line sign={'\u2212'} label="Expected spending for the rest of the month" value={formatRs(forecast.spendingRemaining)} sub="From your day-to-day pace and recurring bills" />
                  <Line sign="=" label="Projected cash at month end" value={formatRs(forecast.projectedCash)} strong tone={forecast.projectedCash < 0 ? 'bad' : undefined} />
                </ul>
                {(forecast.receivablesDueTotal > 0 || forecast.friendReturnsTotal > 0) && (
                  <div className="mt-3 rounded-xl bg-paper p-3 text-sm">
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Not counted above</p>
                    {forecast.receivablesDueTotal > 0 && <p className="flex justify-between gap-3"><span>Owed to you, due by month end ({forecast.receivablesDue.map((r) => r.rec.person).join(', ')})</span><span className="font-semibold">{formatRs(forecast.receivablesDueTotal)}</span></p>}
                    {forecast.friendReturnsTotal > 0 && <p className="mt-1 flex justify-between gap-3"><span>You hoped to return to friends ({forecast.friendReturns.map((f) => f.loan.lender || f.loan.name).join(', ')})</span><span className="font-semibold">{formatRs(forecast.friendReturnsTotal)}</span></p>}
                    <p className="mt-1 text-xs text-muted">Money owed to you counts only once it is received. Friend repayments have no fixed amount, so nothing is deducted until you pay.</p>
                  </div>
                )}
              </>
            )}
          </Box>

          <Box title="Need attention">
            {alerts.length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-muted"><CheckCircle2 size={16} className="text-money" /> All clear for {monthLabel(ym)}.</p>
            ) : (
              <ul className="space-y-3">
                {alerts.map((i) => (
                  <li key={i.key} className="flex items-start gap-3 text-sm">
                    {i.icon === 'warn' ? <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600" /> : i.icon === 'date' ? <CalendarClock size={16} className="mt-0.5 shrink-0 text-muted" /> : i.icon === 'tag' ? <Tags size={16} className="mt-0.5 shrink-0 text-muted" /> : <Scale size={16} className="mt-0.5 shrink-0 text-muted" />}
                    <span className="flex-1">{i.text}</span>
                    {i.action && <button onClick={i.action.run} className="shrink-0 font-semibold underline">{i.action.label}</button>}
                  </li>
                ))}
              </ul>
            )}
          </Box>
        </div>

        {/* ---------------- right column ---------------- */}
        <div className="space-y-6">
          <Box title="Net worth" note="Of what you track here" aside={<Link onClick={() => goto('debts')}>Loans &amp; receivables</Link>}>
            <p className={`font-display text-3xl font-bold ${nw.netWorth < 0 ? 'text-red-600' : ''}`}>{formatRs(nw.netWorth)}</p>
            <ul className="mt-2">
              <Line sign="+" label="Money available" value={formatRs(nw.availableCash)} />
              <Line sign="+" label="Receivables (owed to you)" value={formatRs(nw.receivables)} />
              {nw.cardCredit > 0 && <Line sign="+" label="Card credit" value={formatRs(nw.cardCredit)} />}
              <Line sign={'\u2212'} label="Loans" value={formatRs(nw.loans)} sub={bankOwed || friendOwed ? `Bank ${formatRs(bankOwed)} \u00B7 Friends ${formatRs(friendOwed)}` : undefined} />
              {nw.cardsOwed > 0 && <Line sign={'\u2212'} label="Cards owed" value={formatRs(nw.cardsOwed)} />}
              <Line sign="=" label="Net worth" value={formatRs(nw.netWorth)} strong />
            </ul>
            <p className="mt-3 text-xs text-muted">Without receivables: {formatRs(nw.netWorthWithoutReceivables)}. Paying a loan, lending money or being repaid moves value between these lines without changing the total.</p>
          </Box>

          <Box title="Other calculations and projections" note={forecast ? 'Looking ahead from today' : 'Switch to this month for the full picture'}>
            <ul className="space-y-4">
              <li>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">Expenses by month end</p>
                <p className="font-display text-xl font-bold">{pr.expensesMonthEnd !== null ? formatRs(pr.expensesMonthEnd) : '\u2014'}</p>
                {pr.expensesMonthEnd !== null && <p className="text-xs text-muted">{formatRs(summary.spendingTotal)} so far plus {formatRs(forecast?.spendingRemaining ?? 0)} still expected</p>}
              </li>
              <li>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">Net worth at month end</p>
                <p className="font-display text-xl font-bold">{pr.netWorthMonthEnd !== null ? formatRs(pr.netWorthMonthEnd) : '\u2014'}</p>
                {pr.netWorthMonthEnd !== null && <p className="text-xs text-muted">If no more income arrives. Loan payments do not change it.</p>}
              </li>
              <li>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">Cash runway</p>
                <p className="font-display text-xl font-bold">{pr.runwayMonths === null ? '\u2014' : pr.runwayMonths >= 24 ? '2+ years' : `${pr.runwayMonths.toFixed(1)} months`}</p>
                <p className="text-xs text-muted">
                  {pr.runwayMonths === null
                    ? 'Appears once you have a little spending history.'
                    : `Money available at about ${formatRs(pr.avgMonthlyExpenses ?? 0)}/month of expenses${pr.monthlyCommitments > 0 ? ` plus ${formatRs(pr.monthlyCommitments)} of EMIs` : ''}${pr.avgBasis === 'this-month' ? ' (this month\u2019s pace)' : ''}.`}
                </p>
              </li>
              <li>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">Debt-free</p>
                <p className="font-display text-xl font-bold">
                  {pr.debtFree.date ? new Date(`${pr.debtFree.date}T00:00:00`).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : pr.debtFree.undatedPaisa > 0 ? 'No fixed date' : 'No bank debt'}
                </p>
                <p className="text-xs text-muted">
                  {pr.debtFree.date ? `When your last bank EMI is due${pr.debtFree.undatedPaisa > 0 ? `, plus ${formatRs(pr.debtFree.undatedPaisa)} owed to friends with no fixed date` : ''}.` : pr.debtFree.undatedPaisa > 0 ? `${formatRs(pr.debtFree.undatedPaisa)} owed to friends, repaid whenever you choose.` : 'Nothing owed on bank loans.'}
                </p>
              </li>
            </ul>
          </Box>
        </div>
      </div>
    </div>
  );
}
