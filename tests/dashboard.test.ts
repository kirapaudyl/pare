// Dates in these fixtures are interpreted in Nepal time, so the suite gives the same answer on any machine.
process.env.TZ = 'Asia/Kathmandu';

import test from 'node:test';
import assert from 'node:assert/strict';
import { accountBalances, balanceTotals, summarizeMonth, validateTx, type ValidationCtx } from '../src/finance/ledger';
import { cashForecast, computeNetWorth, debtFreeDate, dueBefore, loanStatus } from '../src/finance/debts';
import { computeGap, computeProjections } from '../src/finance/dashboard';
import { projectMonth } from '../src/finance/insights';
import { planBudget } from '../src/finance/ledger';
import { DEFAULT_CATEGORIES, DEFAULT_SETTINGS } from '../src/finance/quick';
import type { FinAccount, FinGapItem, FinLoan, FinTx, TxInput } from '../src/finance/types';

const rs = (x: number) => Math.round(x * 100);
const NOW = new Date('2026-10-25T06:00:00Z');   // Sunday 25 Oct 2026, 11:45 in Kathmandu
let n = 0;
const tx = (p: Partial<FinTx> & Pick<FinTx, 'kind' | 'amountPaisa' | 'accountId'>): FinTx => ({
  id: `x${++n}`, occurredAt: '2026-10-25T06:00:00Z', description: '', toAccountId: null, categoryId: null, bucket: null, refundOf: null,
  goalId: null, loanId: null, receivableId: null, note: null, createdAt: '2026-10-25T06:00:00Z', deletedAt: null, ...p,
});
const acct = (id: string, type: FinAccount['type'], opening = 0): FinAccount =>
  ({ id, name: id, type, openingPaisa: rs(opening), position: 0, archived: false, lastCheckedAt: null, lastCheckedPaisa: null });

const ravi: FinLoan = {
  id: 'ravi', name: 'Loan from Ravi', lender: 'Ravi', kind: 'personal', openingOutstandingPaisa: rs(4000), openingDate: '2026-10-25',
  emiPaisa: null, firstDueOn: null, returnBy: null, emisPaidBefore: 0, originalPaisa: null, note: null, archived: false,
};
const bank: FinLoan = {
  id: 'bank', name: 'Nabil fone loan', lender: 'Nabil Bank', kind: 'bank', openingOutstandingPaisa: rs(19351), openingDate: '2026-10-19',
  emiPaisa: rs(2237.71), firstDueOn: '2026-11-21', returnBy: null, emisPaidBefore: 9, originalPaisa: null, note: null, archived: false,
};
const pay = (loanId: string, amount: number, date = '2026-10-25T06:00:00Z') => tx({ kind: 'loan_payment', amountPaisa: rs(amount), accountId: 'cash', loanId, occurredAt: date });

/* ---------- loans from a friend ---------- */
test('a friend loan has no EMI, no schedule and no due installments', () => {
  const s = loanStatus(ravi, [], NOW);
  assert.equal(s.outstanding, rs(4000));
  assert.equal(s.next, null);
  assert.equal(s.emisLeft, 0); assert.equal(s.emisTotal, 0);
  assert.deepEqual(dueBefore(s, '2099-12-31'), []);          // nothing is ever "due" on a schedule
  assert.equal(s.returnBy, null);
  assert.equal(s.progressPct, 0);
});

test('you can repay a friend in any amounts, any time, until it is paid off', () => {
  const s1 = loanStatus(ravi, [pay('ravi', 500)], NOW);
  assert.equal(s1.outstanding, rs(3500)); assert.equal(s1.progressPct, 12);          // 500 of 4,000 = 12.5%
  const s2 = loanStatus(ravi, [pay('ravi', 500), pay('ravi', 1250.5, '2026-11-20T06:00:00Z'), pay('ravi', 7, '2026-12-01T06:00:00Z')], NOW);
  assert.equal(s2.outstanding, rs(4000 - 500 - 1250.5 - 7));
  assert.equal(s2.payments.length, 3);
  const done = loanStatus(ravi, [pay('ravi', 1000), pay('ravi', 3000)], NOW);
  assert.equal(done.outstanding, 0); assert.equal(done.paidOff, true); assert.equal(done.progressPct, 100);
});

test('a friend loan can have an optional return-by reminder', () => {
  const soon = loanStatus({ ...ravi, returnBy: '2026-10-30' }, [], NOW);
  assert.deepEqual(soon.returnBy, { date: '2026-10-30', dueInDays: 5, overdue: false });
  assert.equal(loanStatus({ ...ravi, returnBy: '2026-10-20' }, [], NOW).returnBy!.overdue, true);
  assert.equal(loanStatus({ ...ravi, returnBy: '2026-10-30' }, [pay('ravi', 4000)], NOW).returnBy, null);   // nothing left to remind about
});

test('progress for a friend loan uses the total borrowed when it is known', () => {
  const s = loanStatus({ ...ravi, originalPaisa: rs(10000), openingOutstandingPaisa: rs(4000) }, [pay('ravi', 1000)], NOW);
  assert.equal(s.progressPct, Math.floor(((6000 + 1000) * 100) / 10000));                 // 6,000 was repaid before tracking
});

test('friend loan payments are validated like any loan payment', () => {
  const ctx = (txs: FinTx[] = []): ValidationCtx => ({ accounts: [acct('cash', 'cash')], categories: DEFAULT_CATEGORIES.map((c) => ({ ...c, archived: false })), goals: [], loans: [ravi], receivables: [], txs });
  const input = (amount: number, date = '2026-10-25T06:00:00Z'): TxInput => ({ kind: 'loan_payment', amountPaisa: rs(amount), occurredAt: date, description: '', accountId: 'cash', toAccountId: null, categoryId: null, bucket: null, refundOf: null, goalId: null, loanId: 'ravi', receivableId: null, note: null });
  assert.equal(validateTx(input(1), ctx()), null);
  assert.equal(validateTx(input(4000), ctx()), null);
  assert.match(validateTx(input(4000.01), ctx())!, /more than what is still owed/);
  assert.match(validateTx(input(100, '2026-10-01T06:00:00Z'), ctx())!, /already included/);
  assert.match(validateTx(input(2500), ctx([pay('ravi', 2000)]))!, /more than what is still owed/);
});

test('borrowing from a friend: cash arrives, debt appears, net worth does not change', () => {
  const accs = [acct('cash', 'cash', 1000)];
  const worth = (txs: FinTx[]) => computeNetWorth(balanceTotals(accs, accountBalances(accs, txs)), [loanStatus(ravi, txs, NOW)], []);
  const before = computeNetWorth(balanceTotals(accs, accountBalances(accs, [])), [], []);
  const got = worth([tx({ kind: 'loan_received', amountPaisa: rs(4000), accountId: 'cash', loanId: 'ravi' })]);
  assert.equal(got.availableCash, rs(5000)); assert.equal(got.loans, rs(4000)); assert.equal(got.netWorth, before.netWorth);
  // paying some back moves cash and debt together
  const back = worth([tx({ kind: 'loan_received', amountPaisa: rs(4000), accountId: 'cash', loanId: 'ravi' }), pay('ravi', 1500)]);
  assert.equal(back.availableCash, rs(3500)); assert.equal(back.loans, rs(2500)); assert.equal(back.netWorth, before.netWorth);
  // and none of it is income or spending
  const m = summarizeMonth([tx({ kind: 'loan_received', amountPaisa: rs(4000), accountId: 'cash', loanId: 'ravi' }), pay('ravi', 1500)], '2026-10');
  assert.equal(m.income, 0); assert.equal(m.spendingTotal, 0); assert.equal(m.debtPayments, rs(1500));
});

test('friend loans are never deducted from projected cash, only listed as reminders', () => {
  const accs = [acct('cash', 'cash', 10000)];
  const run = (loan: FinLoan) => {
    const txs: FinTx[] = [];
    const totals = balanceTotals(accs, accountBalances(accs, txs));
    const summary = summarizeMonth(txs, '2026-10');
    const { lines } = planBudget({ ...DEFAULT_SETTINGS }, summary);
    const ls = [loanStatus(loan, txs, NOW)];
    return cashForecast({ now: NOW, availableNow: totals.available, loans: ls, receivables: [], projection: projectMonth(txs, summary, lines, NOW), expectedIncomePaisa: 0, incomeSoFar: 0 });
  };
  const withDate = run({ ...ravi, returnBy: '2026-10-30' });
  const without = run(ravi);
  assert.equal(withDate.loanDueTotal, 0);
  assert.equal(withDate.projectedCash, without.projectedCash);
  assert.deepEqual(withDate.friendReturns.map((f) => [f.loan.name, f.remaining, f.overdue]), [['Loan from Ravi', rs(4000), false]]);
  assert.equal(withDate.friendReturnsTotal, rs(4000));
  assert.equal(without.friendReturns.length, 0);
  assert.equal(run({ ...ravi, returnBy: '2026-11-15' }).friendReturns.length, 0);          // not this month
});

test('debt-free date comes from bank EMIs; friend loans are reported separately because they have no date', () => {
  const b = loanStatus(bank, [], NOW);
  const r = loanStatus(ravi, [], NOW);
  const df = debtFreeDate([b, r]);
  // 19,351 / 2,237.71 = 8.65 -> 9 EMIs left; first on 21 Nov 2026, the ninth on 21 Jul 2027
  assert.equal(b.emisLeft, 9);
  assert.equal(df.date, '2027-07-21');
  assert.equal(df.undatedPaisa, rs(4000));
  assert.equal(df.bankLoans, 1);
  assert.deepEqual(debtFreeDate([r]), { date: null, undatedPaisa: rs(4000), bankLoans: 0 });
  assert.deepEqual(debtFreeDate([]), { date: null, undatedPaisa: 0, bankLoans: 0 });
  // paying EMIs brings the date closer only when the balance actually falls
  const afterOne = debtFreeDate([loanStatus(bank, [pay('bank', 2237.71)], NOW)]);
  assert.equal(afterOne.date, '2027-07-21');                                                // same last due date: one fewer left, one covered
});

/* ---------- income target and the gap ---------- */
const item = (p: Partial<FinGapItem> & { title: string }): FinGapItem => ({ id: p.title, kind: 'option', expectedPaisa: 0, note: null, done: false, position: 0, ...p });

test('gap = target - current income, and open items show how much of it is covered', () => {
  const g = computeGap(rs(200000), rs(8700), [item({ title: 'Collect from Ram', kind: 'resource', expectedPaisa: rs(10000), position: 1 }), item({ title: 'Freelance', expectedPaisa: rs(50000), position: 0 })]);
  assert.equal(g.gap, rs(191300));
  assert.equal(g.pct, 4);
  assert.equal(g.planned, rs(60000));
  assert.equal(g.covered, rs(60000));
  assert.equal(g.uncovered, rs(131300));
  assert.deepEqual(g.open.map((i) => i.title), ['Freelance', 'Collect from Ram']);          // keeps your order
});

test('items that are done are not counted again (their money is already in current income)', () => {
  const g = computeGap(rs(100), rs(40), [item({ title: 'a', expectedPaisa: rs(30) }), item({ title: 'b', expectedPaisa: rs(500), done: true })]);
  assert.equal(g.planned, rs(30)); assert.equal(g.covered, rs(30)); assert.equal(g.uncovered, rs(30));
  assert.deepEqual(g.done.map((i) => i.title), ['b']);
});

test('plans can exceed the gap, and reaching the target closes it', () => {
  const over = computeGap(rs(100), rs(40), [item({ title: 'big', expectedPaisa: rs(500) })]);
  assert.equal(over.covered, rs(60)); assert.equal(over.uncovered, 0); assert.equal(over.planned, rs(500));
  const reached = computeGap(rs(100), rs(130), [item({ title: 'x', expectedPaisa: rs(9) })]);
  assert.equal(reached.gap, 0); assert.equal(reached.surplus, rs(30)); assert.equal(reached.pct, 100); assert.equal(reached.covered, 0);
  const none = computeGap(0, rs(500), []);
  assert.equal(none.gap, 0); assert.equal(none.pct, 0); assert.equal(none.target, 0);
});

/* ---------- projections ---------- */
const loansOf = (...l: FinLoan[]) => l.map((x) => loanStatus(x, [], NOW));
test('projections: month-end expenses and net worth, runway, debt-free date', () => {
  const txs = [
    tx({ kind: 'expense', amountPaisa: rs(6000), accountId: 'cash', bucket: 'needs', occurredAt: '2026-09-10T06:00:00Z' }),
    tx({ kind: 'expense', amountPaisa: rs(4000), accountId: 'cash', bucket: 'wants', occurredAt: '2026-08-10T06:00:00Z' }),
    tx({ kind: 'expense', amountPaisa: rs(1000), accountId: 'cash', bucket: 'wants', occurredAt: '2026-10-05T06:00:00Z' }),
  ];
  const p = computeProjections({ txs, ym: '2026-10', isCurrentMonth: true, availableNow: rs(30000), netWorth: rs(25000), spendingSoFar: rs(1000), spendingRemaining: rs(2000), loans: loansOf(bank) });
  assert.equal(p.expensesMonthEnd, rs(3000));
  assert.equal(p.netWorthMonthEnd, rs(23000));                          // net worth only falls by spending still to come
  assert.equal(p.avgMonthlyExpenses, rs(5000));                         // (6,000 + 4,000) / 2 past months with spending
  assert.equal(p.avgBasis, 'history');
  assert.equal(p.monthlyCommitments, rs(2237.71));
  assert.ok(Math.abs(p.runwayMonths! - 30000 / (5000 + 2237.71)) < 1e-9);
  assert.equal(p.debtFree.date, '2027-07-21');
});

test('projections: friend loans add no monthly commitment; new users fall back gracefully', () => {
  const p = computeProjections({ txs: [], ym: '2026-10', isCurrentMonth: true, availableNow: rs(1000), netWorth: rs(1000), spendingSoFar: 0, spendingRemaining: 0, loans: loansOf(ravi) });
  assert.equal(p.monthlyCommitments, 0);
  assert.equal(p.avgMonthlyExpenses, null); assert.equal(p.runwayMonths, null);        // nothing to measure yet, so no made-up number
  const pace = computeProjections({ txs: [], ym: '2026-10', isCurrentMonth: true, availableNow: rs(9000), netWorth: 0, spendingSoFar: rs(1000), spendingRemaining: rs(2000), loans: [] });
  assert.equal(pace.avgBasis, 'this-month'); assert.equal(pace.avgMonthlyExpenses, rs(3000)); assert.equal(pace.runwayMonths, 3);
  const past = computeProjections({ txs: [], ym: '2026-09', isCurrentMonth: false, availableNow: 0, netWorth: 0, spendingSoFar: 0, spendingRemaining: 0, loans: [] });
  assert.equal(past.expensesMonthEnd, null); assert.equal(past.netWorthMonthEnd, null);
  const broke = computeProjections({ txs: [tx({ kind: 'expense', amountPaisa: rs(100), accountId: 'cash', bucket: 'needs', occurredAt: '2026-09-10T06:00:00Z' })], ym: '2026-10', isCurrentMonth: true, availableNow: -rs(50), netWorth: 0, spendingSoFar: 0, spendingRemaining: 0, loans: [] });
  assert.equal(broke.runwayMonths, 0);                                                  // never negative months
});

test('Money Available adds cash, bank and wallet; a negative account is shown, not hidden', () => {
  const accs = [acct('cash', 'cash', 7570), acct('bank', 'bank', 877.34), acct('esewa', 'wallet', 0)];
  const txs = [tx({ kind: 'expense', amountPaisa: rs(1499.35), accountId: 'esewa', bucket: 'wants' })];
  const bal = accountBalances(accs, txs);
  assert.equal(bal.get('esewa'), -rs(1499.35));
  assert.equal(balanceTotals(accs, bal).available, rs(7570) + rs(877.34) - rs(1499.35));
});

test('the loan type decides the behaviour: a friend loan never gets a schedule, even with stray EMI data', () => {
  const stray: FinLoan = { ...ravi, emiPaisa: rs(1000), firstDueOn: '2026-11-01' };
  const s = loanStatus(stray, [], NOW);
  assert.equal(s.next, null);
  assert.equal(s.emisLeft, 0);
  assert.deepEqual(dueBefore(s, '2099-12-31'), []);
  assert.equal(debtFreeDate([s]).date, null);
  assert.equal(debtFreeDate([s]).undatedPaisa, rs(4000));
  assert.equal(computeProjections({ txs: [], ym: '2026-10', isCurrentMonth: true, availableNow: 0, netWorth: 0, spendingSoFar: 0, spendingRemaining: 0, loans: [s] }).monthlyCommitments, 0);
});
