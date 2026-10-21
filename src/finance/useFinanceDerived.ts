import { useMemo } from 'react';
import { useFinanceStore } from '../store/useFinanceStore';
import { accountBalances, balanceTotals, goalProgress, planBudget, summarizeMonth, ymOf } from './ledger';
import { cashForecast, computeNetWorth, dueBefore, loanStatus, receivableStatus } from './debts';
import { detectRecurring, projectMonth, staleAccounts, uncategorized, unexplainedDiffs } from './insights';

/** Everything on screen is computed from the ledger here, in one place. */
export function useFinanceDerived(ym: string) {
  const accounts = useFinanceStore((s) => s.accounts);
  const txs = useFinanceStore((s) => s.txs);
  const goals = useFinanceStore((s) => s.goals);
  const settings = useFinanceStore((s) => s.settings);
  const categories = useFinanceStore((s) => s.categories);
  const loans = useFinanceStore((s) => s.loans);
  const receivables = useFinanceStore((s) => s.receivables);

  return useMemo(() => {
    const balances = accountBalances(accounts, txs);
    const totals = balanceTotals(accounts, balances);
    const summary = summarizeMonth(txs, ym);
    const budget = planBudget(settings, summary);
    const now = new Date();
    const recurring = detectRecurring(txs);

    // Loans and receivables are derived from the same ledger as everything else.
    const loanList = loans.filter((l) => !l.archived).map((l) => loanStatus(l, txs, now));
    const receivableList = receivables.filter((r) => !r.archived).map((r) => receivableStatus(r, txs, now));
    const isCurrent = ym === ymOf(now);
    const monthEnd = `${ym}-${String(new Date(Number(ym.slice(0, 4)), Number(ym.slice(5)), 0).getDate()).padStart(2, '0')}`;
    const loanDueThisMonth = loanList.flatMap((l) => dueBefore(l, monthEnd));
    const loanDueTotal = loanDueThisMonth.reduce((s, d) => s + d.amountPaisa, 0);

    const projection = projectMonth(txs, summary, budget.lines, now, { bucket: settings.debtBucket, due: loanDueTotal });
    const netWorth = computeNetWorth(totals, loanList, receivableList);
    const forecast = isCurrent
      ? cashForecast({ now, availableNow: totals.available, loans: loanList, receivables: receivableList, projection, expectedIncomePaisa: settings.expectedIncomePaisa, incomeSoFar: summary.income })
      : null;
    const goalList = goals.filter((g) => !g.archived).map((g) => ({ goal: g, progress: goalProgress(g, txs) }));
    return {
      balances, totals, summary, budget, recurring, projection, goalList,
      loanList, receivableList, loanDueThisMonth, loanDueTotal, netWorth, forecast,
      loanName: new Map(loans.map((l) => [l.id, l.name])),
      receivableName: new Map(receivables.map((r) => [r.id, r.person])),
      uncategorized: uncategorized(txs),
      unexplained: unexplainedDiffs(accounts, txs, ym),
      stale: staleAccounts(accounts),
      categoryName: new Map(categories.map((c) => [c.id, c.name])),
      accountName: new Map(accounts.map((a) => [a.id, a.name])),
    };
  }, [accounts, txs, goals, settings, categories, loans, receivables, ym]);
}
