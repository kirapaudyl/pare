import { MAX_PAISA, formatRs } from './money';
import { LOAN_KINDS, RECEIVABLE_KINDS } from './types';
import type { Bucket, FinAccount, FinCategory, FinGoal, FinLoan, FinReceivable, FinSettings, FinTx, TxInput } from './types';

/* ---------------- dates ---------------- */
const pad = (n: number) => String(n).padStart(2, '0');
export const ymOf = (d: string | Date): string => {
  const x = typeof d === 'string' ? new Date(d) : d;
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}`;
};
export const dayKeyOf = (d: string | Date): string => {
  const x = typeof d === 'string' ? new Date(d) : d;
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
};
export const daysInMonth = (ym: string): number => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m, 0).getDate();
};
export const shiftMonth = (ym: string, delta: number): string => {
  const [y, m] = ym.split('-').map(Number);
  return ymOf(new Date(y, m - 1 + delta, 1));
};
export const monthLabel = (ym: string): string => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
};

/* ---------------- balances ---------------- */
export const isLive = (t: FinTx) => !t.deletedAt;

/** How one transaction moves each account. This is the only place direction is decided. */
export function txEffects(t: FinTx): [accountId: string, delta: number][] {
  switch (t.kind) {
    case 'expense':
    case 'loan_payment':
    case 'lend': return [[t.accountId, -t.amountPaisa]];
    case 'income':
    case 'refund':
    case 'loan_received':
    case 'collection': return [[t.accountId, t.amountPaisa]];
    case 'adjustment': return [[t.accountId, t.amountPaisa]];
    case 'transfer': return t.toAccountId ? [[t.accountId, -t.amountPaisa], [t.toAccountId, t.amountPaisa]] : [];
  }
}

export function accountBalances(accounts: FinAccount[], txs: FinTx[]): Map<string, number> {
  const bal = new Map(accounts.map((a) => [a.id, a.openingPaisa]));
  for (const t of txs) {
    if (!isLive(t)) continue;
    for (const [id, delta] of txEffects(t)) if (bal.has(id)) bal.set(id, bal.get(id)! + delta);
  }
  return bal;
}

/** Liquid money (cash, bank, wallet) and what is owed on cards, kept apart. */
export function balanceTotals(accounts: FinAccount[], bal: Map<string, number>) {
  let available = 0, cards = 0;
  for (const a of accounts) {
    if (a.archived) continue;
    const v = bal.get(a.id) ?? 0;
    if (a.type === 'card') cards += v; else available += v;
  }
  return { available, cards, net: available + cards };
}

/* ---------------- month summary ---------------- */
/** A refund takes the bucket/category of the expense it refunds, so re-categorising the expense moves the refund with it. */
export function effectiveMeta(t: FinTx, byId: Map<string, FinTx>): { bucket: Bucket | null; categoryId: string | null } {
  if (t.kind === 'refund' && t.refundOf) {
    const o = byId.get(t.refundOf);
    if (o && !o.deletedAt) return { bucket: o.bucket, categoryId: o.categoryId };
  }
  return { bucket: t.bucket, categoryId: t.categoryId };
}

export interface MonthSummary {
  ym: string;
  income: number;
  spending: { needs: number; wants: number };
  spendingTotal: number;
  saved: number;
  refunds: number;
  adjustments: number;
  debtPayments: number;  // loan payments made this month (kept apart from spending)
  collections: number;   // money received back from people who owed you (not income)
  lent: number;          // money you lent out this month (not spending)
  borrowed: number;      // loan money that arrived this month (not income)
  netCashFlow: number;   // income - spending - debt payments (money kept, including what was saved)
  unallocated: number;   // netCashFlow - saved
  byCategory: Map<string, number>; // net spend per category id ('' = uncategorized), spending buckets only
  savedByCategory: Map<string, number>;
  /** Net amount per category inside each bucket. Each map adds up exactly to that bucket's total (savings: expenses only). */
  byBucketCategory: Record<Bucket, Map<string, number>>;
  count: number;
}

export function summarizeMonth(txs: FinTx[], ym: string): MonthSummary {
  const byId = new Map(txs.map((t) => [t.id, t]));
  const s: MonthSummary = {
    ym, income: 0, spending: { needs: 0, wants: 0 }, spendingTotal: 0, saved: 0, refunds: 0, adjustments: 0,
    debtPayments: 0, collections: 0, lent: 0, borrowed: 0, netCashFlow: 0, unallocated: 0, byCategory: new Map(), savedByCategory: new Map(), count: 0,
    byBucketCategory: { needs: new Map(), wants: new Map(), savings: new Map() },
  };
  const add = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v);

  for (const t of txs) {
    if (!isLive(t) || ymOf(t.occurredAt) !== ym) continue;
    s.count++;
    if (t.kind === 'income') { s.income += t.amountPaisa; continue; }
    if (t.kind === 'adjustment') { s.adjustments += t.amountPaisa; continue; }
    // Loan and receivable movements are cash events with their own line. They are never income or spending.
    if (t.kind === 'loan_payment') { s.debtPayments += t.amountPaisa; continue; }
    if (t.kind === 'loan_received') { s.borrowed += t.amountPaisa; continue; }
    if (t.kind === 'lend') { s.lent += t.amountPaisa; continue; }
    if (t.kind === 'collection') { s.collections += t.amountPaisa; continue; }
    if (t.kind === 'transfer') {
      if (t.bucket === 'savings') s.saved += t.amountPaisa; // a savings contribution is not spending
      continue;                                              // any other transfer changes nothing but balances
    }
    const sign = t.kind === 'refund' ? -1 : 1;
    if (t.kind === 'refund') s.refunds += t.amountPaisa;
    const { bucket, categoryId } = effectiveMeta(t, byId);
    const v = sign * t.amountPaisa;
    add(s.byBucketCategory[bucket ?? 'wants'], categoryId ?? '', v);
    if (bucket === 'savings') { s.saved += v; add(s.savedByCategory, categoryId ?? '', v); }
    else { s.spending[bucket === 'needs' ? 'needs' : 'wants'] += v; add(s.byCategory, categoryId ?? '', v); }
  }
  s.spendingTotal = s.spending.needs + s.spending.wants;
  s.netCashFlow = s.income - s.spendingTotal - s.debtPayments;
  s.unallocated = s.netCashFlow - s.saved;
  return s;
}

/* ---------------- 50/30/20 ---------------- */
export type BudgetState = 'ok' | 'warn' | 'over' | 'met' | 'open';
export interface BudgetLine {
  bucket: Bucket;
  pct: number;
  planned: number;
  actual: number;
  debt: number;      // part of `actual` that is loan payments (when the plan counts them in this bucket)
  remaining: number; // planned - actual (for savings: still to save)
  ratio: number;
  state: BudgetState;
}

export function budgetBase(settings: FinSettings, summary: MonthSummary): number {
  if (settings.budgetBase === 'actual') return summary.income;
  if (settings.budgetBase === 'expected') return settings.expectedIncomePaisa || settings.incomeTargetPaisa;
  return settings.incomeTargetPaisa;
}

/** Needs and wants are rounded down; savings takes the remainder, so the three always add up to the base exactly. */
export function planBudget(settings: FinSettings, summary: MonthSummary): { base: number; lines: BudgetLine[] } {
  const base = Math.max(0, budgetBase(settings, summary));
  const needs = Math.floor((base * settings.needsPct) / 100);
  const wants = Math.floor((base * settings.wantsPct) / 100);
  const planned: Record<Bucket, number> = { needs, wants, savings: base - needs - wants };
  const pct: Record<Bucket, number> = { needs: settings.needsPct, wants: settings.wantsPct, savings: settings.savingsPct };
  // Loan payments are counted once: inside the bucket chosen in the plan, or not at all.
  const debt: Record<Bucket, number> = {
    needs: settings.debtBucket === 'needs' ? summary.debtPayments : 0,
    wants: settings.debtBucket === 'wants' ? summary.debtPayments : 0,
    savings: 0,
  };
  const actual: Record<Bucket, number> = { needs: summary.spending.needs + debt.needs, wants: summary.spending.wants + debt.wants, savings: summary.saved };

  const lines = (['needs', 'wants', 'savings'] as const).map((bucket): BudgetLine => {
    const p = planned[bucket], a = actual[bucket];
    const r = p > 0 ? a / p : a > 0 ? Infinity : 0;
    let state: BudgetState;
    if (bucket === 'savings') state = p > 0 && a >= p ? 'met' : 'open';
    else state = r > 1 ? 'over' : r >= 0.8 ? 'warn' : 'ok';
    return { bucket, pct: pct[bucket], planned: p, actual: a, debt: debt[bucket], remaining: p - a, ratio: r, state };
  });
  return { base, lines };
}

/* ---------------- goals ---------------- */
export interface GoalProgress {
  saved: number;
  remaining: number;
  pct: number;
  monthsLeft: number | null;
  requiredMonthly: number | null;
  status: 'done' | 'on-track' | 'behind' | 'overdue' | 'open';
}

export function goalProgress(goal: FinGoal, txs: FinTx[], now = new Date()): GoalProgress {
  let saved = 0;
  for (const t of txs) if (isLive(t) && t.kind === 'transfer' && t.goalId === goal.id) saved += t.amountPaisa;
  const remaining = Math.max(0, goal.targetPaisa - saved);
  const pct = goal.targetPaisa > 0 ? Math.min(100, Math.floor((saved * 100) / goal.targetPaisa)) : 0;
  if (remaining === 0) return { saved, remaining, pct: 100, monthsLeft: null, requiredMonthly: null, status: 'done' };
  if (!goal.deadline) return { saved, remaining, pct, monthsLeft: null, requiredMonthly: null, status: 'open' };

  const end = new Date(`${goal.deadline}T23:59:59`);
  const monthsLeft = (end.getTime() - now.getTime()) / (30.44 * 86400000);
  if (monthsLeft <= 0) return { saved, remaining, pct, monthsLeft: 0, requiredMonthly: remaining, status: 'overdue' };
  const requiredMonthly = Math.ceil(remaining / Math.max(1, Math.ceil(monthsLeft)));
  const projected = saved + goal.plannedMonthlyPaisa * Math.ceil(monthsLeft);
  return { saved, remaining, pct, monthsLeft, requiredMonthly, status: projected >= goal.targetPaisa ? 'on-track' : 'behind' };
}

/* ---------------- validation ---------------- */
export interface ValidationCtx {
  accounts: FinAccount[];
  categories: FinCategory[];
  goals: FinGoal[];
  loans: FinLoan[];
  receivables: FinReceivable[];
  txs: FinTx[];
  editingId?: string;
}

/** Returns a human-readable problem, or null if the transaction is safe to save. */
export function validateTx(t: TxInput, ctx: ValidationCtx): string | null {
  if (!Number.isSafeInteger(t.amountPaisa) || Math.abs(t.amountPaisa) > MAX_PAISA) return 'Amount is not valid';
  if (t.kind === 'adjustment' ? t.amountPaisa === 0 : t.amountPaisa <= 0) return 'Amount must be more than 0';
  if (Number.isNaN(new Date(t.occurredAt).getTime())) return 'Date is not valid';
  const acc = (id: string | null) => ctx.accounts.find((a) => a.id === id);
  if (!acc(t.accountId)) return 'Choose an account';

  if (t.kind !== 'transfer' && t.toAccountId) return 'Only transfers have a destination account';
  if (t.goalId && t.kind !== 'transfer') return 'Only transfers can fund a goal';
  if (t.loanId && !LOAN_KINDS.includes(t.kind)) return 'Only loan payments can be linked to a loan';
  if (t.receivableId && !RECEIVABLE_KINDS.includes(t.kind)) return 'Only lending and repayments can be linked to a receivable';
  if ((LOAN_KINDS.includes(t.kind) || RECEIVABLE_KINDS.includes(t.kind)) && (t.bucket || t.categoryId)) return 'Loan and receivable entries have no category or bucket';
  const cat = t.categoryId ? ctx.categories.find((c) => c.id === t.categoryId) : null;
  if (t.categoryId && !cat) return 'That category no longer exists';

  switch (t.kind) {
    case 'expense':
      if (!t.bucket) return 'Choose Needs, Wants or Savings';
      if (cat && cat.kind !== 'expense') return 'Pick an expense category';
      break;
    case 'income':
      if (cat && cat.kind !== 'income') return 'Pick an income category';
      break;
    case 'transfer':
      if (!t.toAccountId || !acc(t.toAccountId)) return 'Choose the account the money goes to';
      if (t.toAccountId === t.accountId) return 'A transfer needs two different accounts';
      if (t.goalId && !ctx.goals.some((g) => g.id === t.goalId)) return 'That goal no longer exists';
      if (t.goalId && t.bucket !== 'savings') return 'Goal contributions count as Savings';
      break;
    case 'refund': {
      if (!t.refundOf) { if (!t.bucket) return 'Choose the bucket this refund belongs to'; break; }
      const o = ctx.txs.find((x) => x.id === t.refundOf);
      if (!o || o.deletedAt || o.kind !== 'expense') return 'The refunded expense was not found';
      const already = ctx.txs
        .filter((x) => !x.deletedAt && x.kind === 'refund' && x.refundOf === o.id && x.id !== ctx.editingId)
        .reduce((s, x) => s + x.amountPaisa, 0);
      if (already + t.amountPaisa > o.amountPaisa) return 'Refunds on this expense would exceed what was spent';
      break;
    }
    case 'adjustment': break;
    case 'loan_payment':
    case 'loan_received': {
      const loan = ctx.loans.find((l) => l.id === t.loanId);
      if (!loan) return 'Choose a loan';
      if (dayKeyOf(t.occurredAt) < loan.openingDate) {
        return `This loan\u2019s balance was set on ${loan.openingDate}, so anything before that is already included in it`;
      }
      if (t.kind === 'loan_payment') {
        const paid = ctx.txs
          .filter((x) => !x.deletedAt && x.kind === 'loan_payment' && x.loanId === loan.id && x.id !== ctx.editingId && dayKeyOf(x.occurredAt) >= loan.openingDate)
          .reduce((s, x) => s + x.amountPaisa, 0);
        const outstanding = Math.max(0, loan.openingOutstandingPaisa - paid);
        if (t.amountPaisa > outstanding) return `That is more than what is still owed on this loan (${formatRs(outstanding)})`;
      }
      break;
    }
    case 'lend':
    case 'collection': {
      const rec = ctx.receivables.find((r) => r.id === t.receivableId);
      if (!rec) return 'Choose who this is for';
      if (t.kind === 'collection') {
        const repaid = ctx.txs
          .filter((x) => !x.deletedAt && x.kind === 'collection' && x.receivableId === rec.id && x.id !== ctx.editingId)
          .reduce((s, x) => s + x.amountPaisa, 0);
        const remaining = Math.max(0, rec.amountPaisa - rec.writtenOffPaisa - repaid);
        if (t.amountPaisa > remaining) return `That is more than what ${rec.person} still owes (${formatRs(remaining)})`;
      }
      break;
    }
  }
  return null;
}
