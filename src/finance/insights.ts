import { daysInMonth, dayKeyOf, isLive, ymOf, type BudgetLine } from './ledger';
import { normalizeDesc } from './text';
import type { Bucket, FinAccount, FinTx } from './types';
import type { MonthSummary } from './ledger';

const DAY = 86400000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/* ---------------- uncategorized ---------------- */
export const uncategorized = (txs: FinTx[]): FinTx[] =>
  txs.filter((t) => isLive(t) && (t.kind === 'expense' || t.kind === 'income') && !t.categoryId)
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));

/* ---------------- recurring bills ---------------- */
export interface Recurring {
  key: string;
  label: string;
  amountPaisa: number;
  lastDate: string;   // yyyy-mm-dd
  nextDate: string;   // yyyy-mm-dd
  occurrences: number;
  categoryId: string | null;
  bucket: Bucket | null;
  dueInDays: number;
  paidThisMonth: boolean;
}

export const recurringKey = (t: FinTx) => `${normalizeDesc(t.description)}|${t.categoryId ?? ''}`;

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * Same description + category, in at least 2 different months, roughly a month apart (26-35 days),
 * with amounts within 15% of each other, and seen in the last ~70 days.
 */
export function detectRecurring(txs: FinTx[], now = new Date()): Recurring[] {
  const groups = new Map<string, FinTx[]>();
  for (const t of txs) {
    if (!isLive(t) || t.kind !== 'expense') continue;
    const key = recurringKey(t);
    if (key.startsWith('|')) continue; // no description to group on
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(t);
  }

  const today = startOfDay(now);
  const nowYm = ymOf(now);
  const out: Recurring[] = [];
  for (const [key, list] of groups) {
    list.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
    if (new Set(list.map((t) => ymOf(t.occurredAt))).size < 2) continue;

    const days = list.map((t) => startOfDay(new Date(t.occurredAt)).getTime());
    const gaps = days.slice(1).map((d, i) => Math.round((d - days[i]) / DAY)).filter((g) => g > 0);
    if (gaps.length === 0) continue;
    const gap = median(gaps);
    if (gap < 26 || gap > 35) continue;

    const amt = median(list.map((t) => t.amountPaisa));
    if (!list.every((t) => Math.abs(t.amountPaisa - amt) <= amt * 0.15)) continue;

    const last = list[list.length - 1];
    const lastDay = startOfDay(new Date(last.occurredAt));
    if ((today.getTime() - lastDay.getTime()) / DAY > 70) continue;

    const next = new Date(lastDay.getTime() + Math.round(gap) * DAY);
    out.push({
      key, label: last.description.trim() || key.split('|')[0], amountPaisa: Math.round(amt),
      lastDate: dayKeyOf(lastDay), nextDate: dayKeyOf(next), occurrences: list.length,
      categoryId: last.categoryId, bucket: last.bucket,
      dueInDays: Math.round((startOfDay(next).getTime() - today.getTime()) / DAY),
      paidThisMonth: list.some((t) => ymOf(t.occurredAt) === nowYm),
    });
  }
  return out.sort((a, b) => a.nextDate.localeCompare(b.nextDate));
}

/* ---------------- unexplained differences ---------------- */
export interface Unexplained {
  accountId: string;
  name: string;
  adjustmentPaisa: number; // signed total of reconciliation adjustments this month
  adjustments: number;
}

export function unexplainedDiffs(accounts: FinAccount[], txs: FinTx[], ym: string) {
  const adj = new Map<string, { total: number; n: number }>();
  for (const t of txs) {
    if (!isLive(t) || t.kind !== 'adjustment' || ymOf(t.occurredAt) !== ym) continue;
    const cur = adj.get(t.accountId) ?? { total: 0, n: 0 };
    adj.set(t.accountId, { total: cur.total + t.amountPaisa, n: cur.n + 1 });
  }
  const differences: Unexplained[] = accounts
    .filter((a) => adj.has(a.id))
    .map((a) => ({ accountId: a.id, name: a.name, adjustmentPaisa: adj.get(a.id)!.total, adjustments: adj.get(a.id)!.n }));
  return differences;
}

/** Accounts nobody has counted for a while. Cash drifts fastest, so it nags sooner. */
export function staleAccounts(accounts: FinAccount[], now = new Date()) {
  return accounts
    .filter((a) => !a.archived)
    .map((a) => {
      const days = a.lastCheckedAt ? Math.floor((now.getTime() - new Date(a.lastCheckedAt).getTime()) / DAY) : null;
      return { account: a, days, limit: a.type === 'cash' ? 14 : 30 };
    })
    .filter((x) => x.days === null || x.days > x.limit);
}

/* ---------------- month-end projection ---------------- */
export interface Projection {
  bucket: 'needs' | 'wants';
  actual: number;        // as the budget sees it (includes loan payments if the plan counts them here)
  projected: number;
  expenseActual: number;    // expenses only, never loan payments
  expenseProjected: number; // expenses only: what is still to be spent is expenseProjected - expenseActual
  planned: number;
  over: boolean;
  confidence: 'low' | 'ok';
}

/**
 * actual so far
 *  + recurring bills still due this month (not yet paid)
 *  + the day-to-day run-rate (everything that is not a recurring bill) for the remaining days.
 * Loan payments are not extrapolated like spending. Those already paid are kept as they are, and those still scheduled
 * for this month (`debtDue`) are added once, in the bucket the plan counts them in.
 * Only meaningful for the current month.
 */
export function projectMonth(
  txs: FinTx[], summary: MonthSummary, lines: BudgetLine[], now = new Date(),
  debt: { bucket: 'needs' | 'wants' | 'none'; due: number } = { bucket: 'none', due: 0 },
): Projection[] | null {
  if (summary.ym !== ymOf(now)) return null;
  const total = daysInMonth(summary.ym);
  const elapsed = Math.max(1, now.getDate());
  const remainingDays = total - elapsed;

  const recurring = detectRecurring(txs, now);
  const keys = new Set(recurring.map((r) => r.key));
  const endOfMonth = `${summary.ym}-${String(total).padStart(2, '0')}`;
  const today = dayKeyOf(now);

  return (['needs', 'wants'] as const).map((bucket): Projection => {
    const actual = summary.spending[bucket];
    const recurringPaid = txs
      .filter((t) => isLive(t) && t.kind === 'expense' && t.bucket === bucket && ymOf(t.occurredAt) === summary.ym && keys.has(recurringKey(t)))
      .reduce((s, t) => s + t.amountPaisa, 0);
    const due = recurring
      .filter((r) => r.bucket === bucket && !r.paidThisMonth && r.nextDate >= today && r.nextDate <= endOfMonth)
      .reduce((s, r) => s + r.amountPaisa, 0);
    const dailyVariable = Math.max(0, actual - recurringPaid) / elapsed;
    const expenseProjected = Math.round(actual + due + dailyVariable * remainingDays);
    const line = lines.find((l) => l.bucket === bucket);
    const planned = line?.planned ?? 0;
    const debtHere = debt.bucket === bucket;
    const projected = expenseProjected + (debtHere ? summary.debtPayments + debt.due : 0);
    return {
      bucket, actual: line?.actual ?? actual, projected, expenseActual: actual, expenseProjected, planned,
      over: planned > 0 && projected > planned, confidence: elapsed < 7 ? 'low' : 'ok',
    };
  });
}
