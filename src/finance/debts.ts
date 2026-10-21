import { daysInMonth, dayKeyOf, isLive } from './ledger';
import type { FinLoan, FinReceivable, FinTx } from './types';
import type { Projection } from './insights';

const pad = (n: number) => String(n).padStart(2, '0');

/* ---------------- loans ---------------- */

/** Installment k (0 = the first one after tracking began): same day of month as `firstDueOn`, clamped to short months. */
export function dueDateFor(firstDueOn: string, k: number): string {
  const [y, m, d] = firstDueOn.split('-').map(Number);
  const idx = m - 1 + k;
  const year = y + Math.floor(idx / 12);
  const month = ((idx % 12) + 12) % 12;
  const day = Math.min(d, daysInMonth(`${year}-${pad(month + 1)}`));
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

export interface DueItem { loanId: string; name: string; dueDate: string; amountPaisa: number }

export interface LoanStatus {
  loan: FinLoan;
  paidSinceOpening: number;
  outstanding: number;
  payments: FinTx[];            // newest first
  emisPaid: number;             // before tracking + covered since
  emisTotal: number;
  emisLeft: number;
  progressPct: number;
  paidOff: boolean;
  next: { dueDate: string; amountPaisa: number; dueInDays: number; overdue: boolean } | null;
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const dayDiff = (a: string, b: Date) => Math.round((new Date(`${a}T00:00:00`).getTime() - startOfDay(b).getTime()) / 86400000);

/**
 * Payments are a running total against the schedule, so early, late, partial and extra payments all work:
 * 'covered' installments = floor(paid / EMI); whatever is left over is credited to the next one.
 */
export function loanStatus(loan: FinLoan, txs: FinTx[], now = new Date()): LoanStatus {
  const payments = txs
    .filter((t) => isLive(t) && t.kind === 'loan_payment' && t.loanId === loan.id && dayKeyOf(t.occurredAt) >= loan.openingDate)
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  const paid = payments.reduce((s, t) => s + t.amountPaisa, 0);
  const outstanding = Math.max(0, loan.openingOutstandingPaisa - paid);
  const covered = Math.floor(paid / loan.emiPaisa);
  const credit = paid - covered * loan.emiPaisa;

  const emisTotal = loan.emisPaidBefore + Math.ceil(loan.openingOutstandingPaisa / loan.emiPaisa);
  const emisPaid = Math.min(emisTotal, loan.emisPaidBefore + covered);
  const paidOff = outstanding === 0;
  let progressPct: number;
  if (paidOff) progressPct = 100;
  else if (loan.originalPaisa && loan.originalPaisa > 0) progressPct = Math.max(0, Math.min(100, Math.floor(((loan.originalPaisa - outstanding) * 100) / loan.originalPaisa)));
  else progressPct = Math.floor((emisPaid * 100) / Math.max(1, emisTotal));

  let next: LoanStatus['next'] = null;
  if (!paidOff) {
    const dueDate = dueDateFor(loan.firstDueOn, covered);
    const dueInDays = dayDiff(dueDate, now);
    next = { dueDate, amountPaisa: Math.min(loan.emiPaisa - credit, outstanding), dueInDays, overdue: dueInDays < 0 };
  }
  return { loan, paidSinceOpening: paid, outstanding, payments, emisPaid, emisTotal, emisLeft: Math.ceil(outstanding / loan.emiPaisa), progressPct, paidOff, next };
}

/** Every unpaid installment due on or before `horizon` (yyyy-mm-dd), overdue ones included. */
export function dueBefore(status: LoanStatus, horizon: string): DueItem[] {
  const { loan } = status;
  const out: DueItem[] = [];
  let remaining = status.outstanding;
  const covered = Math.floor(status.paidSinceOpening / loan.emiPaisa);
  const credit = status.paidSinceOpening - covered * loan.emiPaisa;
  for (let k = covered; remaining > 0 && k < covered + 600; k++) {
    const dueDate = dueDateFor(loan.firstDueOn, k);
    if (dueDate > horizon) break;
    const amountPaisa = Math.min(loan.emiPaisa - (k === covered ? credit : 0), remaining);
    out.push({ loanId: loan.id, name: loan.name, dueDate, amountPaisa });
    remaining -= amountPaisa;
  }
  return out;
}

/* ---------------- receivables ---------------- */
export interface ReceivableStatus {
  rec: FinReceivable;
  repaid: number;
  remaining: number;
  progressPct: number;
  collections: FinTx[];          // newest first
  state: 'open' | 'settled' | 'written-off';
  overdue: boolean;
  dueInDays: number | null;
}

export function receivableStatus(rec: FinReceivable, txs: FinTx[], now = new Date()): ReceivableStatus {
  const collections = txs
    .filter((t) => isLive(t) && t.kind === 'collection' && t.receivableId === rec.id)
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  const repaid = collections.reduce((s, t) => s + t.amountPaisa, 0);
  const remaining = Math.max(0, rec.amountPaisa - rec.writtenOffPaisa - repaid);
  const dueInDays = rec.expectedOn ? dayDiff(rec.expectedOn, now) : null;
  return {
    rec, repaid, remaining, collections,
    progressPct: rec.amountPaisa > 0 ? Math.min(100, Math.floor((repaid * 100) / rec.amountPaisa)) : 0,
    state: remaining > 0 ? 'open' : rec.writtenOffPaisa > 0 && repaid + rec.writtenOffPaisa >= rec.amountPaisa && repaid < rec.amountPaisa ? 'written-off' : 'settled',
    overdue: remaining > 0 && dueInDays !== null && dueInDays < 0,
    dueInDays,
  };
}

/* ---------------- the big picture ---------------- */
export interface NetWorth {
  availableCash: number;       // cash, bank and wallets
  receivables: number;         // owed to you, not cash
  loans: number;               // still owed on loans
  cardsOwed: number;           // card balances you owe
  cardCredit: number;          // card balances in your favour
  netWorth: number;
  netWorthWithoutReceivables: number;
}

/**
 * Net worth = available cash + receivables + card credit - loans - cards owed.
 * Paying an EMI, lending money, receiving a repayment and taking a loan each move value between lines
 * and leave the total unchanged. Only income, expenses and write-offs change it.
 */
export function computeNetWorth(totals: { available: number; cards: number }, loans: LoanStatus[], recs: ReceivableStatus[]): NetWorth {
  const loanTotal = loans.reduce((s, l) => s + l.outstanding, 0);
  const recTotal = recs.reduce((s, r) => s + r.remaining, 0);
  const cardsOwed = Math.max(0, -totals.cards);
  const cardCredit = Math.max(0, totals.cards);
  const netWorth = totals.available + cardCredit - cardsOwed + recTotal - loanTotal;
  return { availableCash: totals.available, receivables: recTotal, loans: loanTotal, cardsOwed, cardCredit, netWorth, netWorthWithoutReceivables: netWorth - recTotal };
}

export interface CashForecast {
  availableNow: number;
  loanDue: DueItem[];             // unpaid installments due by month end (overdue included)
  loanDueTotal: number;
  spendingRemaining: number;      // expenses still expected this month (loan payments are not in here)
  projectedCash: number;          // availableNow - loanDueTotal - spendingRemaining. No income, no receivables.
  expectedIncomeRemaining: number;
  projectedWithExpectedIncome: number;
  receivablesDue: { rec: FinReceivable; remaining: number }[]; // due or overdue by month end. NOT counted in any total above.
  receivablesDueTotal: number;
}

export function cashForecast(args: {
  now: Date; availableNow: number; loans: LoanStatus[]; receivables: ReceivableStatus[];
  projection: Projection[] | null; expectedIncomePaisa: number; incomeSoFar: number;
}): CashForecast {
  const { now, availableNow } = args;
  const monthEnd = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(daysInMonth(`${now.getFullYear()}-${pad(now.getMonth() + 1)}`))}`;
  const loanDue = args.loans.flatMap((l) => dueBefore(l, monthEnd));
  const loanDueTotal = loanDue.reduce((s, d) => s + d.amountPaisa, 0);
  const spendingRemaining = (args.projection ?? []).reduce((s, p) => s + Math.max(0, p.expenseProjected - p.expenseActual), 0);
  const projectedCash = availableNow - loanDueTotal - spendingRemaining;
  const expectedIncomeRemaining = args.expectedIncomePaisa > 0 ? Math.max(0, args.expectedIncomePaisa - args.incomeSoFar) : 0;
  const receivablesDue = args.receivables
    .filter((r) => r.remaining > 0 && r.rec.expectedOn !== null && r.rec.expectedOn <= monthEnd)
    .map((r) => ({ rec: r.rec, remaining: r.remaining }));
  return {
    availableNow, loanDue, loanDueTotal, spendingRemaining, projectedCash, expectedIncomeRemaining,
    projectedWithExpectedIncome: projectedCash + expectedIncomeRemaining,
    receivablesDue, receivablesDueTotal: receivablesDue.reduce((s, r) => s + r.remaining, 0),
  };
}
