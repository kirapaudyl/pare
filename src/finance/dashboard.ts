import { shiftMonth, summarizeMonth } from './ledger';
import { debtFreeDate, type LoanStatus } from './debts';
import type { FinGapItem, FinTx } from './types';

/* ---------------- the income gap ---------------- */
export interface GapSummary {
  target: number;
  current: number;
  gap: number;        // how far you are from the target (0 once you reach it)
  surplus: number;    // how far past it you are
  pct: number;        // progress toward the target, 0-100
  planned: number;    // what the open items are expected to bring in
  covered: number;    // the part of the gap the open items would cover
  uncovered: number;  // the part of the gap with no plan yet
  open: FinGapItem[];
  done: FinGapItem[];
}

/**
 * Items you have already finished are not counted as planned: their money has arrived, so it is already in
 * "current income" and counting it again would shrink the gap twice.
 */
export function computeGap(targetPaisa: number, currentPaisa: number, items: FinGapItem[]): GapSummary {
  const gap = Math.max(0, targetPaisa - currentPaisa);
  const open = items.filter((i) => !i.done).sort((a, b) => a.position - b.position);
  const planned = open.reduce((s, i) => s + i.expectedPaisa, 0);
  const covered = Math.min(planned, gap);
  return {
    target: targetPaisa, current: currentPaisa, gap, surplus: Math.max(0, currentPaisa - targetPaisa),
    pct: targetPaisa > 0 ? Math.min(100, Math.floor((currentPaisa * 100) / targetPaisa)) : 0,
    planned, covered, uncovered: gap - covered, open, done: items.filter((i) => i.done),
  };
}

/* ---------------- projections ---------------- */
export interface Projections {
  expensesMonthEnd: number | null;       // this month's expenses so far + what is still expected
  netWorthMonthEnd: number | null;       // net worth if no more income arrives
  avgMonthlyExpenses: number | null;     // average of recent full months, or this month's pace if there is no history
  avgBasis: 'history' | 'this-month' | null;
  monthlyCommitments: number;            // bank-loan EMIs
  runwayMonths: number | null;           // how long available cash lasts at that pace
  debtFree: { date: string | null; undatedPaisa: number; bankLoans: number };
}

export function computeProjections(a: {
  txs: FinTx[]; ym: string; isCurrentMonth: boolean; availableNow: number; netWorth: number;
  spendingSoFar: number; spendingRemaining: number; loans: LoanStatus[];
}): Projections {
  const expensesMonthEnd = a.isCurrentMonth ? a.spendingSoFar + a.spendingRemaining : null;
  const netWorthMonthEnd = a.isCurrentMonth ? a.netWorth - a.spendingRemaining : null;

  const past = [1, 2, 3].map((n) => summarizeMonth(a.txs, shiftMonth(a.ym, -n)).spendingTotal).filter((v) => v > 0);
  let avg: number | null = null;
  let basis: Projections['avgBasis'] = null;
  if (past.length > 0) { avg = Math.round(past.reduce((s, v) => s + v, 0) / past.length); basis = 'history'; }
  else if (expensesMonthEnd !== null && expensesMonthEnd > 0) { avg = expensesMonthEnd; basis = 'this-month'; }

  const monthlyCommitments = a.loans.filter((l) => !l.paidOff && l.loan.kind === 'bank').reduce((s, l) => s + (l.loan.emiPaisa ?? 0), 0);
  const outflow = (avg ?? 0) + monthlyCommitments;
  const runwayMonths = outflow > 0 ? Math.max(0, a.availableNow) / outflow : null;

  return { expensesMonthEnd, netWorthMonthEnd, avgMonthlyExpenses: avg, avgBasis: basis, monthlyCommitments, runwayMonths, debtFree: debtFreeDate(a.loans) };
}
