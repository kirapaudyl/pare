// Dates in these fixtures are interpreted in Nepal time, so the suite gives the same answer on any machine.
process.env.TZ = 'Asia/Kathmandu';

import test from 'node:test';
import assert from 'node:assert/strict';
import { accountBalances, balanceTotals, planBudget, summarizeMonth, validateTx, ymOf, type ValidationCtx } from '../src/finance/ledger';
import { cashForecast, computeNetWorth, dueBefore, dueDateFor, loanStatus, receivableStatus } from '../src/finance/debts';
import { detectRecurring, projectMonth } from '../src/finance/insights';
import { DEFAULT_CATEGORIES, DEFAULT_SETTINGS } from '../src/finance/quick';
import { transactionsToCsv } from '../src/finance/exportCsv';
import type { FinAccount, FinLoan, FinReceivable, FinSettings, FinTx, TxInput } from '../src/finance/types';

const rs = (x: number) => Math.round(x * 100);
const NOW = new Date('2026-10-19T06:00:00Z');                  // Monday 19 Oct 2026, 11:45 in Kathmandu
const acct = (id: string, type: FinAccount['type'], opening = 0): FinAccount =>
  ({ id, name: id, type, openingPaisa: rs(opening), position: 0, archived: false, lastCheckedAt: null, lastCheckedPaisa: null });
let n = 0;
const tx = (p: Partial<FinTx> & Pick<FinTx, 'kind' | 'amountPaisa' | 'accountId'>): FinTx => ({
  id: `d${++n}`, occurredAt: '2026-10-19T06:00:00Z', description: '', toAccountId: null, categoryId: null, bucket: null, refundOf: null,
  goalId: null, loanId: null, receivableId: null, note: null, createdAt: '2026-10-19T06:00:00Z', deletedAt: null, ...p,
});

// The loan from the request: 2 EMIs already paid, Rs 21,000 still owed. (The EMI and due date are examples; the real ones are entered in the app.)
const fone: FinLoan = {
  id: 'fone', name: 'Nabil Fone Loan', lender: 'Nabil Bank', kind: 'bank', openingOutstandingPaisa: rs(21000), openingDate: '2026-10-19',
  emiPaisa: rs(3500), firstDueOn: '2026-11-05', returnBy: null, emisPaidBefore: 2, originalPaisa: null, note: null, archived: false,
};
const friend: FinReceivable = { id: 'r1', person: 'Ram', amountPaisa: rs(10000), lentOn: '2026-09-01', expectedOn: '2026-10-25', note: null, writtenOffPaisa: 0, archived: false };
const settings = (p: Partial<FinSettings> = {}): FinSettings => ({ ...DEFAULT_SETTINGS, ...p });
const emi = (amount: number, date = '2026-10-19T06:00:00Z', id?: string) =>
  tx({ kind: 'loan_payment', amountPaisa: rs(amount), accountId: 'bank', loanId: 'fone', occurredAt: date, ...(id ? { id } : {}) });

/* ---------- the loan from the request ---------- */
test('Nabil Fone Loan: 2 EMIs paid, Rs 21,000 left, progress is counted in EMIs', () => {
  const s = loanStatus(fone, [], NOW);
  assert.equal(s.outstanding, rs(21000));
  assert.equal(s.emisPaid, 2);
  assert.equal(s.emisLeft, 6);                 // 21,000 / 3,500
  assert.equal(s.emisTotal, 8);
  assert.equal(s.progressPct, 25);             // 2 of 8
  assert.deepEqual(s.next, { dueDate: '2026-11-05', amountPaisa: rs(3500), dueInDays: 17, overdue: false });
  assert.equal(s.paidOff, false);
});

test('paying EMIs reduces the balance, advances the due date and the progress', () => {
  const s1 = loanStatus(fone, [emi(3500)], NOW);
  assert.equal(s1.outstanding, rs(17500));
  assert.equal(s1.emisPaid, 3);
  assert.equal(s1.next!.dueDate, '2026-12-05');
  assert.equal(s1.progressPct, 37);            // 3 of 8
  assert.equal(s1.payments.length, 1);

  // A partial payment: the same installment stays due, for what is left of it.
  const part = loanStatus(fone, [emi(1000)], NOW);
  assert.equal(part.outstanding, rs(20000));
  assert.equal(part.next!.dueDate, '2026-11-05');
  assert.equal(part.next!.amountPaisa, rs(2500));
  // ...and finishing it moves on.
  const done = loanStatus(fone, [emi(1000), emi(2500)], NOW);
  assert.equal(done.next!.dueDate, '2026-12-05');
  assert.equal(done.next!.amountPaisa, rs(3500));

  // Paying everything off.
  const all = loanStatus(fone, Array.from({ length: 6 }, () => emi(3500)), NOW);
  assert.equal(all.outstanding, 0); assert.equal(all.paidOff, true); assert.equal(all.next, null); assert.equal(all.progressPct, 100);
  // The last installment is smaller when the balance is not a multiple of the EMI.
  const odd = { ...fone, openingOutstandingPaisa: rs(20000) };
  const last = loanStatus(odd, [emi(3500), emi(3500), emi(3500), emi(3500), emi(3500)], NOW);
  assert.equal(last.outstanding, rs(2500)); assert.equal(last.next!.amountPaisa, rs(2500));
});

test('payments that are deleted, or dated before the balance was set, do not count', () => {
  assert.equal(loanStatus(fone, [{ ...emi(3500), deletedAt: '2026-10-20T00:00:00Z' }], NOW).outstanding, rs(21000));
  assert.equal(loanStatus(fone, [emi(3500, '2026-09-05T06:00:00Z')], NOW).outstanding, rs(21000));
});

test('amount-based progress when the total loan amount is known', () => {
  const s = loanStatus({ ...fone, originalPaisa: rs(40000) }, [emi(3500)], NOW);
  assert.equal(s.progressPct, Math.floor(((40000 - 17500) * 100) / 40000));
});

test('due dates keep their day of month and clamp in short months', () => {
  assert.equal(dueDateFor('2026-01-31', 0), '2026-01-31');
  assert.equal(dueDateFor('2026-01-31', 1), '2026-02-28');
  assert.equal(dueDateFor('2026-01-31', 2), '2026-03-31');
  assert.equal(dueDateFor('2028-01-31', 1), '2028-02-29');          // leap year
  assert.equal(dueDateFor('2026-11-05', 2), '2027-01-05');          // rolls over the year
  assert.equal(dueDateFor('2026-12-15', 14), '2028-02-15');
});

test('overdue installments are flagged and still count as due', () => {
  const late = { ...fone, firstDueOn: '2026-10-10' };
  const s = loanStatus(late, [], NOW);
  assert.equal(s.next!.overdue, true);
  assert.equal(s.next!.dueInDays, -9);
  assert.deepEqual(dueBefore(s, '2026-10-31').map((d) => d.dueDate), ['2026-10-10']);
  assert.deepEqual(dueBefore(s, '2026-12-31').map((d) => d.dueDate), ['2026-10-10', '2026-11-10', '2026-12-10']);
  assert.equal(dueBefore(loanStatus(fone, [], NOW), '2026-10-31').length, 0);   // first one is not until 5 Nov
});

/* ---------- receivables ---------- */
test('receivables: repaid, remaining, progress, overdue, write-off', () => {
  const col = (amt: number) => tx({ kind: 'collection', amountPaisa: rs(amt), accountId: 'cash', receivableId: 'r1' });
  const s = receivableStatus(friend, [col(4000)], NOW);
  assert.equal(s.repaid, rs(4000)); assert.equal(s.remaining, rs(6000)); assert.equal(s.progressPct, 40);
  assert.equal(s.state, 'open'); assert.equal(s.overdue, false); assert.equal(s.dueInDays, 6);
  assert.equal(receivableStatus({ ...friend, expectedOn: '2026-10-10' }, [], NOW).overdue, true);
  assert.equal(receivableStatus(friend, [col(10000)], NOW).state, 'settled');
  const wo = receivableStatus({ ...friend, writtenOffPaisa: rs(6000) }, [col(4000)], NOW);
  assert.equal(wo.remaining, 0); assert.equal(wo.state, 'written-off');
  assert.equal(receivableStatus(friend, [{ ...col(4000), deletedAt: '2026-10-20T00:00:00Z' }], NOW).remaining, rs(10000));
});

/* ---------- net worth: nothing is counted twice ---------- */
const accounts = [acct('cash', 'cash', 10000), acct('bank', 'bank', 30000), acct('card', 'card', 0)];
const worth = (txs: FinTx[], loans = [fone], recs = [friend]) => {
  const totals = balanceTotals(accounts, accountBalances(accounts, txs));
  return computeNetWorth(totals, loans.map((l) => loanStatus(l, txs, NOW)), recs.map((r) => receivableStatus(r, txs, NOW)));
};

test('net worth separates cash, receivables and debt', () => {
  const w = worth([]);
  assert.equal(w.availableCash, rs(40000));
  assert.equal(w.receivables, rs(10000));          // owed to you, but not cash
  assert.equal(w.loans, rs(21000));
  assert.equal(w.netWorth, rs(40000 + 10000 - 21000));
  assert.equal(w.netWorthWithoutReceivables, rs(40000 - 21000));
  assert.equal(balanceTotals(accounts, accountBalances(accounts, [])).available, rs(40000));   // receivables never reach available cash
});

test('EMI, lending, repayment and borrowing move value around but never change net worth', () => {
  const base = worth([]).netWorth;
  const loan2: FinLoan = { ...fone, id: 'new', name: 'New loan', openingOutstandingPaisa: rs(50000), openingDate: '2026-10-19' };
  const cases: [string, FinTx[], Parameters<typeof worth>[1]?][] = [
    ['EMI paid',              [emi(3500)]],
    ['EMI paid (twice)',      [emi(3500), emi(3500)]],
    ['money lent out',        [tx({ kind: 'lend', amountPaisa: rs(1000), accountId: 'cash', receivableId: 'r1' })]],
    ['repayment received',    [tx({ kind: 'collection', amountPaisa: rs(2000), accountId: 'bank', receivableId: 'r1' })]],
    ['transfer between accounts', [tx({ kind: 'transfer', amountPaisa: rs(5000), accountId: 'bank', toAccountId: 'cash' })]],
  ];
  for (const [label, txs] of cases) {
    // lending raises the receivable by the same amount it takes out of cash, so give the receivable the extra rupees
    const recs = txs[0].kind === 'lend' ? [{ ...friend, amountPaisa: friend.amountPaisa + txs[0].amountPaisa }] : [friend];
    assert.equal(worth(txs, [fone], recs).netWorth, base, label);
  }
  // Borrowing a new loan: cash arrives and the debt appears together.
  const borrowed = worth([tx({ kind: 'loan_received', amountPaisa: rs(50000), accountId: 'bank', loanId: 'new' })], [fone, loan2]);
  assert.equal(borrowed.availableCash, rs(90000)); assert.equal(borrowed.loans, rs(71000)); assert.equal(borrowed.netWorth, base);

  // Real changes do move it.
  assert.equal(worth([tx({ kind: 'expense', amountPaisa: rs(200), accountId: 'cash', bucket: 'wants' })]).netWorth, base - rs(200));
  assert.equal(worth([tx({ kind: 'income', amountPaisa: rs(500), accountId: 'bank' })]).netWorth, base + rs(500));
  assert.equal(worth([], [fone], [{ ...friend, writtenOffPaisa: friend.amountPaisa }]).netWorth, base - rs(10000));   // a write-off is a real loss
});

test('card balances are counted once', () => {
  const owing = [acct('cash', 'cash', 1000), acct('card', 'card', -300)];
  const w = computeNetWorth(balanceTotals(owing, accountBalances(owing, [])), [], []);
  assert.equal(w.availableCash, rs(1000)); assert.equal(w.cardsOwed, rs(300)); assert.equal(w.netWorth, rs(700));
});

/* ---------- month summary and budget ---------- */
test('loan payments are not expenses or income; receivable and loan cash has its own lines', () => {
  const txs = [
    tx({ kind: 'income', amountPaisa: rs(60000), accountId: 'bank', occurredAt: '2026-10-10T06:00:00Z' }),
    tx({ kind: 'expense', amountPaisa: rs(5000), accountId: 'bank', bucket: 'needs', occurredAt: '2026-10-11T06:00:00Z' }),
    emi(3500, '2026-10-19T06:00:00Z'),
    tx({ kind: 'collection', amountPaisa: rs(2000), accountId: 'cash', receivableId: 'r1' }),
    tx({ kind: 'lend', amountPaisa: rs(700), accountId: 'cash', receivableId: 'r1' }),
    tx({ kind: 'loan_received', amountPaisa: rs(9000), accountId: 'bank', loanId: 'fone' }),
  ];
  const s = summarizeMonth(txs, '2026-10');
  assert.equal(s.income, rs(60000));               // collection and borrowing are not income
  assert.equal(s.spendingTotal, rs(5000));         // EMI and lending are not expenses
  assert.equal(s.debtPayments, rs(3500)); assert.equal(s.collections, rs(2000)); assert.equal(s.lent, rs(700)); assert.equal(s.borrowed, rs(9000));
  assert.equal(s.netCashFlow, rs(60000 - 5000 - 3500));          // debt service comes out once
  assert.equal(s.saved, 0);
});

test('the plan counts loan payments once, in the chosen bucket, or not at all', () => {
  const txs = [emi(3500), tx({ kind: 'expense', amountPaisa: rs(1000), accountId: 'bank', bucket: 'needs' })];
  const s = summarizeMonth(txs, '2026-10');
  const cfg = settings({ expectedIncomePaisa: rs(60000) });
  const needs = (c: FinSettings) => planBudget(c, s).lines[0];
  assert.equal(needs({ ...cfg, debtBucket: 'needs' }).actual, rs(4500));
  assert.equal(needs({ ...cfg, debtBucket: 'needs' }).debt, rs(3500));
  assert.equal(needs({ ...cfg, debtBucket: 'wants' }).actual, rs(1000));
  assert.equal(planBudget({ ...cfg, debtBucket: 'wants' }, s).lines[1].actual, rs(3500));
  assert.equal(needs({ ...cfg, debtBucket: 'none' }).actual, rs(1000));
  // either way, the money counted across buckets plus 'none' equals spending plus debt exactly once
  const total = (c: FinSettings) => planBudget(c, s).lines.slice(0, 2).reduce((a, l) => a + l.actual, 0);
  assert.equal(total({ ...cfg, debtBucket: 'needs' }), s.spendingTotal + s.debtPayments);
  assert.equal(total({ ...cfg, debtBucket: 'none' }), s.spendingTotal);
});

/* ---------- cash forecast ---------- */
const forecast = (txs: FinTx[], loans: FinLoan[] = [fone], recs: FinReceivable[] = [friend], income = 0) => {
  const accs = [acct('cash', 'cash', 10000), acct('bank', 'bank', 30000)];
  const totals = balanceTotals(accs, accountBalances(accs, txs));
  const summary = summarizeMonth(txs, ymOf(NOW));
  const cfg = settings({ expectedIncomePaisa: rs(60000) });
  const { lines } = planBudget(cfg, summary);
  const ls = loans.map((l) => loanStatus(l, txs, NOW));
  const f = cashForecast({
    now: NOW, availableNow: totals.available, loans: ls, receivables: recs.map((r) => receivableStatus(r, txs, NOW)),
    projection: projectMonth(txs, summary, lines, NOW, { bucket: 'needs', due: ls.flatMap((l) => dueBefore(l, '2026-10-31')).reduce((a, d) => a + d.amountPaisa, 0) }),
    expectedIncomePaisa: cfg.expectedIncomePaisa, incomeSoFar: income,
  });
  return f;
};

test('upcoming EMIs reduce projected cash; receivables never raise it', () => {
  const due = { ...fone, firstDueOn: '2026-10-25' };                       // due before month end
  const f = forecast([], [due]);
  assert.equal(f.availableNow, rs(40000));
  assert.equal(f.loanDueTotal, rs(3500));
  assert.deepEqual(f.loanDue.map((d) => d.dueDate), ['2026-10-25']);
  assert.equal(f.projectedCash, f.availableNow - rs(3500) - f.spendingRemaining);
  // Ram's rupees are due on the 25th, but they are listed apart and change no total until collected.
  assert.equal(f.receivablesDueTotal, rs(10000));
  assert.equal(forecast([], [due], []).projectedCash, f.projectedCash);
  assert.equal(forecast([], [due], [{ ...friend, amountPaisa: rs(999999) }]).projectedCash, f.projectedCash);
  // Once he pays, it is real cash and the projection rises by exactly that.
  const paid = forecast([tx({ kind: 'collection', amountPaisa: rs(10000), accountId: 'cash', receivableId: 'r1' })], [due]);
  assert.equal(paid.projectedCash, f.projectedCash + rs(10000));
  assert.equal(paid.receivablesDueTotal, 0);
  // An EMI due after month end is not deducted yet.
  assert.equal(forecast([], [fone]).loanDueTotal, 0);
});

test('paying an EMI that was due does not change projected cash (no double deduction)', () => {
  const due = { ...fone, firstDueOn: '2026-10-25' };
  const before = forecast([], [due]);
  const after = forecast([emi(3500)], [due]);
  assert.equal(after.availableNow, before.availableNow - rs(3500));       // cash really left
  assert.equal(after.loanDueTotal, 0);                                    // and it is no longer outstanding
  assert.equal(after.projectedCash, before.projectedCash);                // so the projection is the same
});

test('overdue EMIs count as due now, and expected income is shown apart', () => {
  const late = { ...fone, firstDueOn: '2026-10-10' };
  assert.equal(forecast([], [late]).loanDueTotal, rs(3500));
  const f = forecast([], [fone], [], rs(20000));
  assert.equal(f.expectedIncomeRemaining, rs(40000));                      // 60,000 expected - 20,000 received
  assert.equal(f.projectedWithExpectedIncome, f.projectedCash + rs(40000));
});

test('budget projection counts the EMIs still due this month once', () => {
  const due = { ...fone, firstDueOn: '2026-10-25' };
  const txs = [emi(3500, '2026-10-02T06:00:00Z'), tx({ kind: 'expense', amountPaisa: rs(1500), accountId: 'bank', bucket: 'needs', occurredAt: '2026-10-05T06:00:00Z' })];
  const summary = summarizeMonth(txs, '2026-10');
  const { lines } = planBudget(settings({ expectedIncomePaisa: rs(60000) }), summary);
  const proj = projectMonth(txs, summary, lines, NOW, { bucket: 'needs', due: rs(3500) })!.find((p) => p.bucket === 'needs')!;
  assert.equal(proj.actual, rs(5000));                                      // 1,500 spent + 3,500 EMI paid
  assert.equal(proj.expenseActual, rs(1500));                               // expenses on their own
  assert.equal(proj.projected, proj.expenseProjected + rs(3500) + rs(3500)); // + paid EMI + EMI still due
  void due;
});

test('loan payments never show up as recurring expense bills', () => {
  const txs = [emi(3500, '2026-08-05T06:00:00Z'), emi(3500, '2026-09-05T06:00:00Z'), emi(3500, '2026-10-05T06:00:00Z')];
  assert.deepEqual(detectRecurring(txs, NOW), []);
});

/* ---------- validation ---------- */
const ctx = (txs: FinTx[] = [], recs: FinReceivable[] = [friend]): ValidationCtx => ({
  accounts: [acct('cash', 'cash'), acct('bank', 'bank')], categories: DEFAULT_CATEGORIES.map((c) => ({ ...c, archived: false })), goals: [],
  loans: [fone], receivables: recs, txs,
});
const input = (p: Partial<TxInput>): TxInput => ({
  kind: 'loan_payment', amountPaisa: rs(3500), occurredAt: '2026-10-19T06:00:00Z', description: '', accountId: 'bank',
  toAccountId: null, categoryId: null, bucket: null, refundOf: null, goalId: null, loanId: 'fone', receivableId: null, note: null, ...p,
});

test('loan payment validation', () => {
  assert.equal(validateTx(input({}), ctx()), null);
  assert.match(validateTx(input({ loanId: null }), ctx())!, /Choose a loan/);
  assert.match(validateTx(input({ loanId: 'nope' }), ctx())!, /Choose a loan/);
  assert.match(validateTx(input({ amountPaisa: rs(21001) }), ctx())!, /more than what is still owed/);
  assert.equal(validateTx(input({ amountPaisa: rs(21000) }), ctx()), null);               // paying it all off is fine
  assert.match(validateTx(input({ occurredAt: '2026-10-01T06:00:00Z' }), ctx())!, /already included/);
  assert.match(validateTx(input({ bucket: 'needs' }), ctx())!, /no category or bucket/);
  assert.match(validateTx(input({ kind: 'expense', bucket: 'needs' }), ctx())!, /Only loan payments/);
  // the second payment can only be for what is left
  const first = emi(20000, '2026-10-19T06:00:00Z', 'p1');
  assert.match(validateTx(input({ amountPaisa: rs(1001) }), ctx([first]))!, /more than what is still owed/);
  assert.equal(validateTx(input({ amountPaisa: rs(1000) }), ctx([first])), null);
  assert.equal(validateTx(input({ amountPaisa: rs(21000) }), { ...ctx([first]), editingId: 'p1' }), null);   // editing the payment itself
});

test('receivable validation', () => {
  const lend = (p: Partial<TxInput> = {}) => input({ kind: 'lend', loanId: null, receivableId: 'r1', ...p });
  const collect = (p: Partial<TxInput> = {}) => input({ kind: 'collection', loanId: null, receivableId: 'r1', ...p });
  assert.equal(validateTx(lend(), ctx()), null);
  assert.match(validateTx(lend({ receivableId: null }), ctx())!, /who this is for/);
  assert.match(validateTx(collect({ receivableId: 'ghost' }), ctx())!, /who this is for/);
  assert.equal(validateTx(collect({ amountPaisa: rs(10000) }), ctx()), null);
  assert.match(validateTx(collect({ amountPaisa: rs(10001) }), ctx())!, /still owes/);
  const got = tx({ kind: 'collection', amountPaisa: rs(7000), accountId: 'cash', receivableId: 'r1', id: 'c1' });
  assert.match(validateTx(collect({ amountPaisa: rs(3001) }), ctx([got]))!, /still owes/);
  assert.equal(validateTx(collect({ amountPaisa: rs(3000) }), ctx([got])), null);
  assert.equal(validateTx(collect({ amountPaisa: rs(10000) }), { ...ctx([got]), editingId: 'c1' }), null);
  assert.match(validateTx(collect({ amountPaisa: rs(1) }), ctx([], [{ ...friend, writtenOffPaisa: friend.amountPaisa }]))!, /still owes/);   // written off
  assert.match(validateTx(input({ kind: 'income', loanId: null, receivableId: 'r1', bucket: null }), ctx())!, /Only lending and repayments/);
});

/* ---------- export ---------- */
test('CSV names the loan or person each entry belongs to', () => {
  const csv = transactionsToCsv([emi(3500)], [acct('bank', 'bank')], [], new Map([['fone', 'Nabil Fone Loan']]));
  const lines = csv.replace('\uFEFF', '').split('\r\n');
  assert.match(lines[0], /Linked loan or person/);
  assert.match(lines[1], /loan_payment,3500\.00,bank,,,,Nabil Fone Loan,/);
});
