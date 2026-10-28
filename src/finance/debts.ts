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
  /** Bank loans: the next EMI. Personal loans never have one. */
  next: { dueDate: string; amountPaisa: number; dueInDays: number; overdue: boolean } | null;
  /** Personal loans: the optional "return by" reminder. */
  returnBy: { date: string; dueInDays: number; overdue: boolean } | null;
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const dayDiff = (a: string, b: Date) => Math.round((new Date(`${a}T00:00:00`).getTime() - startOfDay(b).getTime()) / 86400000);

/**
 * Payments are a running total against the schedule, so early, late, partial and extra payments all work:
 * 'covered' installments = floor(paid / EMI); whatever is left over is credited to the next one.
 */
export function loanStatus(loan: FinLoan, txs: FinTx[], now = new Date()): LoanStatus {
  if (loan.kind === 'personal' || !loan.emiPaisa || !loan.firstDueOn) return personalLoanStatus(loan, txs, now);
  const emi = loan.emiPaisa;
  const firstDueOn = loan.firstDueOn;
  const payments = txs
    .filter((t) => isLive(t) && t.kind === 'loan_payment' && t.loanId === loan.id && dayKeyOf(t.occurredAt) >= loan.openingDate)
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  const paid = payments.reduce((s, t) => s + t.amountPaisa, 0);
  const outstanding = Math.max(0, loan.openingOutstandingPaisa - paid);
  const covered = Math.floor(paid / emi);
  const credit = paid - covered * emi;

  const emisTotal = loan.emisPaidBefore + Math.ceil(loan.openingOutstandingPaisa / emi);
  const emisPaid = Math.min(emisTotal, loan.emisPaidBefore + covered);
  const paidOff = outstanding === 0;
  let progressPct: number;
  if (paidOff) progressPct = 100;
  else if (loan.originalPaisa && loan.originalPaisa > 0) progressPct = Math.max(0, Math.min(100, Math.floor(((loan.originalPaisa - outstanding) * 100) / loan.originalPaisa)));
  else progressPct = Math.floor((emisPaid * 100) / Math.max(1, emisTotal));

  let next: LoanStatus['next'] = null;
  if (!paidOff) {
    const dueDate = dueDateFor(firstDueOn, covered);
    const dueInDays = dayDiff(dueDate, now);
    next = { dueDate, amountPaisa: Math.min(emi - credit, outstanding), dueInDays, overdue: dueInDays < 0 };
  }
  return { loan, paidSinceOpening: paid, outstanding, payments, emisPaid, emisTotal, emisLeft: Math.ceil(outstanding / emi), progressPct, paidOff, next, returnBy: null };
}

/**
 * A loan from a friend: no EMI, no schedule. The balance is what you borrowed minus whatever you have paid back, in any
 * amounts and at any time. An optional return-by date is only a reminder.
 */
function personalLoanStatus(loan: FinLoan, txs: FinTx[], now: Date): LoanStatus {
  const payments = txs
    .filter((t) => isLive(t) && t.kind === 'loan_payment' && t.loanId === loan.id && dayKeyOf(t.occurredAt) >= loan.openingDate)
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  const paid = payments.reduce((s, t) => s + t.amountPaisa, 0);
  const outstanding = Math.max(0, loan.openingOutstandingPaisa - paid);
  const paidOff = outstanding === 0;
  const whole = loan.originalPaisa && loan.originalPaisa > 0 ? loan.originalPaisa : loan.openingOutstandingPaisa;
  const already = loan.originalPaisa && loan.originalPaisa > 0 ? loan.originalPaisa - loan.openingOutstandingPaisa : 0;
  const progressPct = paidOff ? 100 : Math.max(0, Math.min(100, Math.floor(((already + paid) * 100) / whole)));
  let returnBy: LoanStatus['returnBy'] = null;
  if (loan.returnBy && !paidOff) {
    const dueInDays = dayDiff(loan.returnBy, now);
    returnBy = { date: loan.returnBy, dueInDays, overdue: dueInDays < 0 };
  }
  return { loan, paidSinceOpening: paid, outstanding, payments, emisPaid: 0, emisTotal: 0, emisLeft: 0, progressPct, paidOff, next: null, returnBy };
}

/** Every unpaid installment due on or before `horizon` (yyyy-mm-dd), overdue ones included. */
export function dueBefore(status: LoanStatus, horizon: string): DueItem[] {
  const { loan } = status;
  if (loan.kind === 'personal' || !loan.emiPaisa || !loan.firstDueOn) return []; // a friend's loan has no scheduled installments
  const emi = loan.emiPaisa;
  const out: DueItem[] = [];
  let remaining = status.outstanding;
  const covered = Math.floor(status.paidSinceOpening / emi);
  const credit = status.paidSinceOpening - covered * emi;
  for (let k = covered; remaining > 0 && k < covered + 600; k++) {
    const dueDate = dueDateFor(loan.firstDueOn, k);
    if (dueDate > horizon) break;
    const amountPaisa = Math.min(emi - (k === covered ? credit : 0), remaining);
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
  /** Friends you promised to repay by a date this month. A reminder only: there is no fixed amount, so nothing is deducted above. */
  friendReturns: { loan: FinLoan; remaining: number; overdue: boolean }[];
  friendReturnsTotal: number;
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
  const friendReturns = args.loans
    .filter((l) => l.loan.kind === 'personal' && !l.paidOff && l.loan.returnBy !== null && l.loan.returnBy <= monthEnd)
    .map((l) => ({ loan: l.loan, remaining: l.outstanding, overdue: !!l.returnBy?.overdue }));
  return {
    availableNow, loanDue, loanDueTotal, spendingRemaining, projectedCash, expectedIncomeRemaining,
    projectedWithExpectedIncome: projectedCash + expectedIncomeRemaining,
    receivablesDue, receivablesDueTotal: receivablesDue.reduce((s, r) => s + r.remaining, 0),
    friendReturns, friendReturnsTotal: friendReturns.reduce((s, r) => s + r.remaining, 0),
  };
}

/** When the last bank EMI falls due, plus how much is owed to friends (which has no date). */
export function debtFreeDate(loans: LoanStatus[]): { date: string | null; undatedPaisa: number; bankLoans: number } {
  let date: string | null = null;
  let undated = 0;
  let bankLoans = 0;
  for (const s of loans) {
    if (s.paidOff) continue;
    if (s.loan.kind === 'personal' || !s.loan.emiPaisa || !s.loan.firstDueOn) { undated += s.outstanding; continue; }
    bankLoans++;
    const covered = Math.floor(s.paidSinceOpening / s.loan.emiPaisa);
    const last = dueDateFor(s.loan.firstDueOn, covered + Math.max(0, s.emisLeft - 1));
    if (!date || last > date) date = last;
  }
  return { date, undatedPaisa: undated, bankLoans };
}
