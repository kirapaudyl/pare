// Dates in these fixtures are interpreted in Nepal time, so the suite gives the same answer on any machine.
process.env.TZ = 'Asia/Kathmandu';

import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMoney, formatRs, paisaToInput, paisaToFixed } from '../src/finance/money';
import {
  accountBalances, balanceTotals, goalProgress, planBudget, summarizeMonth, validateTx, ymOf,
  type ValidationCtx,
} from '../src/finance/ledger';
import { detectRecurring, projectMonth, staleAccounts, uncategorized, unexplainedDiffs } from '../src/finance/insights';
import { DEFAULT_CATEGORIES, DEFAULT_SETTINGS, parseQuickLine, suggestCategory } from '../src/finance/quick';
import { csvCell, transactionsToCsv } from '../src/finance/exportCsv';
import type { FinAccount, FinCategory, FinGoal, FinSettings, FinTx, TxInput } from '../src/finance/types';

/* ---------- fixtures ---------- */
const acct = (id: string, type: FinAccount['type'], openingPaisa = 0): FinAccount =>
  ({ id, name: id, type, openingPaisa, position: 0, archived: false, lastCheckedAt: null, lastCheckedPaisa: null });
const cats: FinCategory[] = DEFAULT_CATEGORIES.map((c) => ({ ...c, archived: false }));
let n = 0;
const tx = (p: Partial<FinTx> & Pick<FinTx, 'kind' | 'amountPaisa' | 'accountId'>): FinTx => ({
  id: `t${++n}`, occurredAt: '2026-10-15T12:00:00Z', description: '', toAccountId: null, categoryId: null,
  bucket: null, refundOf: null, goalId: null, loanId: null, receivableId: null, note: null, createdAt: '2026-10-15T12:00:00Z', deletedAt: null, ...p,
});
const rs = (x: number) => Math.round(x * 100);
const settings = (p: Partial<FinSettings> = {}): FinSettings => ({ ...DEFAULT_SETTINGS, ...p });

/* ---------- money ---------- */
test('parseMoney is exact for decimals and shorthand', () => {
  assert.deepEqual(parseMoney('20'), { ok: true, paisa: 2000 });
  assert.deepEqual(parseMoney('1,250.50'), { ok: true, paisa: 125050 });
  assert.deepEqual(parseMoney('Rs 0.1'), { ok: true, paisa: 10 });
  assert.deepEqual(parseMoney('0.07'), { ok: true, paisa: 7 });
  assert.deepEqual(parseMoney('20k'), { ok: true, paisa: 2_000_000 });
  assert.deepEqual(parseMoney('1.5k'), { ok: true, paisa: 150_000 });
  assert.deepEqual(parseMoney('19.99'), { ok: true, paisa: 1999 }); // 19.99 * 100 would be 1998.9999999999998 in floats
});

test('parseMoney rejects bad input', () => {
  for (const bad of ['', 'abc', '1.234', '12..3', '0', '-5', '1e5', '99999999999999999']) assert.equal(parseMoney(bad).ok, false, bad);
  assert.deepEqual(parseMoney('-5', { allowNegative: true }), { ok: true, paisa: -500 });
  assert.deepEqual(parseMoney('0', { allowZero: true }), { ok: true, paisa: 0 });
});

test('formatRs and input formatting round-trip', () => {
  assert.equal(formatRs(2000), 'Rs 20');
  assert.equal(formatRs(125050), 'Rs 1,250.50');
  assert.equal(formatRs(-5), '\u2212Rs 0.05');
  assert.equal(formatRs(500, { signed: true }), '+Rs 5');
  assert.equal(paisaToInput(125050), '1250.50');
  assert.equal(paisaToInput(2000), '20');
  assert.equal(paisaToFixed(5), '0.05');
  assert.equal(paisaToFixed(-125050), '-1250.50');
});

/* ---------- balances: every kind moves money exactly once ---------- */
test('account balances derive from the ledger, and transfers conserve money', () => {
  const accounts = [acct('cash', 'cash', rs(500)), acct('bank', 'bank', rs(10000)), acct('card', 'card', 0)];
  const txs = [
    tx({ kind: 'income', amountPaisa: rs(50000), accountId: 'bank', categoryId: 'cat-salary' }),
    tx({ kind: 'expense', amountPaisa: rs(20), accountId: 'cash', bucket: 'needs' }),
    tx({ kind: 'transfer', amountPaisa: rs(2000), accountId: 'bank', toAccountId: 'cash' }),
    tx({ kind: 'expense', amountPaisa: rs(1500), accountId: 'card', bucket: 'wants' }),
    tx({ kind: 'adjustment', amountPaisa: -rs(30), accountId: 'cash' }),
  ];
  const bal = accountBalances(accounts, txs);
  assert.equal(bal.get('cash'), rs(500) - rs(20) + rs(2000) - rs(30));
  assert.equal(bal.get('bank'), rs(10000) + rs(50000) - rs(2000));
  assert.equal(bal.get('card'), -rs(1500));
  const totals = balanceTotals(accounts, bal);
  assert.equal(totals.available, bal.get('cash')! + bal.get('bank')!);
  assert.equal(totals.cards, -rs(1500));

  // Transfers must not change total money: compare with and without the transfer.
  const without = accountBalances(accounts, txs.filter((t) => t.kind !== 'transfer'));
  const sum = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);
  assert.equal(sum(bal), sum(without));
});

test('deleted transactions are ignored everywhere', () => {
  const accounts = [acct('cash', 'cash', 0)];
  const txs = [
    tx({ kind: 'income', amountPaisa: rs(100), accountId: 'cash' }),
    tx({ kind: 'expense', amountPaisa: rs(40), accountId: 'cash', bucket: 'needs', deletedAt: '2026-10-16T00:00:00Z' }),
  ];
  assert.equal(accountBalances(accounts, txs).get('cash'), rs(100));
  assert.equal(summarizeMonth(txs, '2026-10').spendingTotal, 0);
});

/* ---------- month summary: no double counting ---------- */
test('transfers, savings contributions and refunds are not double counted', () => {
  const txs = [
    tx({ kind: 'income', amountPaisa: rs(60000), accountId: 'bank' }),
    tx({ kind: 'expense', amountPaisa: rs(1000), accountId: 'bank', bucket: 'wants', categoryId: 'cat-eating', id: 'meal' }),
    tx({ kind: 'refund', amountPaisa: rs(300), accountId: 'bank', refundOf: 'meal', bucket: 'wants' }),
    tx({ kind: 'transfer', amountPaisa: rs(5000), accountId: 'bank', toAccountId: 'cash' }),                       // ATM: not saving
    tx({ kind: 'transfer', amountPaisa: rs(8000), accountId: 'bank', toAccountId: 'sav', bucket: 'savings', goalId: 'g1' }),
    tx({ kind: 'expense', amountPaisa: rs(2000), accountId: 'bank', bucket: 'needs', categoryId: 'cat-transport' }),
  ];
  const s = summarizeMonth(txs, '2026-10');
  assert.equal(s.income, rs(60000));                 // the refund is not income
  assert.equal(s.spending.wants, rs(700));           // 1000 - 300
  assert.equal(s.spending.needs, rs(2000));
  assert.equal(s.spendingTotal, rs(2700));           // the transfers are not spending
  assert.equal(s.saved, rs(8000));                   // only the savings-flagged transfer
  assert.equal(s.netCashFlow, rs(60000) - rs(2700));
  assert.equal(s.unallocated, rs(60000) - rs(2700) - rs(8000));
  assert.equal(s.byCategory.get('cat-eating'), rs(700));
  // The per-bucket category breakdown ties out to the bucket totals.
  const sumMap = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);
  assert.equal(sumMap(s.byBucketCategory.wants), s.spending.wants);
  assert.equal(sumMap(s.byBucketCategory.needs), s.spending.needs);
  assert.equal(sumMap(s.byBucketCategory.savings), 0); // the savings transfer is a transfer, not a categorised expense
});

test('a refund follows its expense when the expense is re-categorised', () => {
  const exp = tx({ id: 'e1', kind: 'expense', amountPaisa: rs(500), accountId: 'a', bucket: 'needs', categoryId: 'cat-groceries' });
  const ref = tx({ kind: 'refund', amountPaisa: rs(500), accountId: 'a', refundOf: 'e1', bucket: 'wants' /* stale */ });
  const s = summarizeMonth([exp, ref], '2026-10');
  assert.equal(s.spending.needs, 0);
  assert.equal(s.spending.wants, 0);
});

test('adjustments change balances but never income, spending or budgets', () => {
  const s = summarizeMonth([tx({ kind: 'adjustment', amountPaisa: -rs(45), accountId: 'cash' })], '2026-10');
  assert.equal(s.income + s.spendingTotal + s.saved, 0);
  assert.equal(s.adjustments, -rs(45));
});

test('months are filtered by local date', () => {
  const s = summarizeMonth([
    tx({ kind: 'income', amountPaisa: rs(10), accountId: 'a', occurredAt: '2026-09-15T12:00:00Z' }),
    tx({ kind: 'income', amountPaisa: rs(20), accountId: 'a', occurredAt: '2026-10-15T12:00:00Z' }),
  ], '2026-10');
  assert.equal(s.income, rs(20));
  assert.equal(ymOf('2026-10-15T12:00:00Z'), '2026-10');
});

/* ---------- 50/30/20 ---------- */
test('budget buckets always add up to the base, even when it does not divide evenly', () => {
  for (const income of [rs(100000), rs(33333.33), 1, 99999, rs(77777.77)]) {
    const { base, lines } = planBudget(settings({ expectedIncomePaisa: income }), summarizeMonth([], '2026-10'));
    assert.equal(lines.reduce((s, l) => s + l.planned, 0), base);
    assert.equal(base, income);
  }
});

test('budget base can be target, expected or actual income', () => {
  const s = summarizeMonth([tx({ kind: 'income', amountPaisa: rs(40000), accountId: 'a' })], '2026-10');
  const cfg = settings({ incomeTargetPaisa: rs(100000), expectedIncomePaisa: rs(70000) });
  assert.equal(planBudget({ ...cfg, budgetBase: 'target' }, s).base, rs(100000));
  assert.equal(planBudget({ ...cfg, budgetBase: 'expected' }, s).base, rs(70000));
  assert.equal(planBudget({ ...cfg, budgetBase: 'actual' }, s).base, rs(40000));
  assert.equal(planBudget({ ...cfg, expectedIncomePaisa: 0, budgetBase: 'expected' }, s).base, rs(100000)); // falls back to target
});

test('overspending states', () => {
  const cfg = settings({ expectedIncomePaisa: rs(100000) }); // needs 50k, wants 30k, savings 20k
  const mk = (needs: number) => planBudget(cfg, summarizeMonth([tx({ kind: 'expense', amountPaisa: rs(needs), accountId: 'a', bucket: 'needs' })], '2026-10')).lines[0];
  assert.equal(mk(10000).state, 'ok');
  assert.equal(mk(40000).state, 'warn');
  assert.equal(mk(50001).state, 'over');
  assert.equal(mk(50001).remaining, -rs(1));
  const zero = planBudget(settings(), summarizeMonth([tx({ kind: 'expense', amountPaisa: rs(5), accountId: 'a', bucket: 'wants' })], '2026-10'));
  assert.equal(zero.lines[1].state, 'over'); // spending with no budget set
});

/* ---------- goals ---------- */
test('goal progress counts only that goal\'s contributions', () => {
  const goal: FinGoal = { id: 'g1', name: 'Laptop', targetPaisa: rs(100000), deadline: '2027-01-15', plannedMonthlyPaisa: rs(30000), accountId: 'sav', archived: false };
  const txs = [
    tx({ kind: 'transfer', amountPaisa: rs(20000), accountId: 'bank', toAccountId: 'sav', goalId: 'g1', bucket: 'savings' }),
    tx({ kind: 'transfer', amountPaisa: rs(5000), accountId: 'bank', toAccountId: 'sav', goalId: 'other', bucket: 'savings' }),
    tx({ kind: 'transfer', amountPaisa: rs(1000), accountId: 'bank', toAccountId: 'sav', goalId: 'g1', bucket: 'savings', deletedAt: '2026-10-16T00:00:00Z' }),
  ];
  const p = goalProgress(goal, txs, new Date('2026-10-15T12:00:00Z'));
  assert.equal(p.saved, rs(20000));
  assert.equal(p.remaining, rs(80000));
  assert.equal(p.pct, 20);
  assert.equal(p.status, 'on-track'); // 20k + 30k x 3 months >= 100k
  assert.equal(goalProgress({ ...goal, plannedMonthlyPaisa: rs(1000) }, txs, new Date('2026-10-15T12:00:00Z')).status, 'behind');
  assert.equal(goalProgress({ ...goal, deadline: '2026-09-01' }, txs, new Date('2026-10-15T12:00:00Z')).status, 'overdue');
  assert.equal(goalProgress({ ...goal, deadline: null }, txs).status, 'open');
  assert.equal(goalProgress({ ...goal, targetPaisa: rs(15000) }, txs).status, 'done');
});

/* ---------- validation ---------- */
const ctx = (txs: FinTx[] = []): ValidationCtx => ({
  accounts: [acct('cash', 'cash'), acct('bank', 'bank')], categories: cats, txs, loans: [], receivables: [],
  goals: [{ id: 'g1', name: 'G', targetPaisa: 1, deadline: null, plannedMonthlyPaisa: 0, accountId: null, archived: false }],
});
const input = (p: Partial<TxInput>): TxInput => ({
  kind: 'expense', amountPaisa: 2000, occurredAt: '2026-10-15T12:00:00Z', description: 'ride', accountId: 'cash',
  toAccountId: null, categoryId: null, bucket: 'needs', refundOf: null, goalId: null, loanId: null, receivableId: null, note: null, ...p,
});

test('validation catches unsafe transactions', () => {
  assert.equal(validateTx(input({}), ctx()), null);
  assert.match(validateTx(input({ amountPaisa: 0 }), ctx())!, /more than 0/);
  assert.match(validateTx(input({ amountPaisa: 1.5 }), ctx())!, /not valid/);
  assert.match(validateTx(input({ accountId: 'nope' }), ctx())!, /account/i);
  assert.match(validateTx(input({ bucket: null }), ctx())!, /Needs, Wants or Savings/);
  assert.match(validateTx(input({ occurredAt: 'garbage' }), ctx())!, /Date/);
  assert.match(validateTx(input({ categoryId: 'cat-salary' }), ctx())!, /expense category/);
  assert.match(validateTx(input({ kind: 'transfer', bucket: null }), ctx())!, /goes to/);
  assert.match(validateTx(input({ kind: 'transfer', bucket: null, toAccountId: 'cash' }), ctx())!, /two different/);
  assert.equal(validateTx(input({ kind: 'transfer', bucket: null, toAccountId: 'bank' }), ctx()), null);
  assert.match(validateTx(input({ kind: 'transfer', toAccountId: 'bank', goalId: 'g1', bucket: null }), ctx())!, /Savings/);
  assert.match(validateTx(input({ kind: 'expense', goalId: 'g1' }), ctx())!, /Only transfers/);
  assert.match(validateTx(input({ toAccountId: 'bank' }), ctx())!, /Only transfers/);
});

test('refunds cannot exceed the original expense', () => {
  const orig = tx({ id: 'o1', kind: 'expense', amountPaisa: rs(1000), accountId: 'cash', bucket: 'wants' });
  const r1 = tx({ id: 'r1', kind: 'refund', amountPaisa: rs(600), accountId: 'cash', refundOf: 'o1', bucket: 'wants' });
  const refund = (amt: number) => input({ kind: 'refund', amountPaisa: rs(amt), refundOf: 'o1', bucket: 'wants' });
  assert.equal(validateTx(refund(1000), ctx([orig])), null);
  assert.match(validateTx(refund(1001), ctx([orig]))!, /exceed/);
  assert.match(validateTx(refund(500), ctx([orig, r1]))!, /exceed/);       // 600 + 500 > 1000
  assert.equal(validateTx(refund(400), ctx([orig, r1])), null);             // exactly the remainder
  assert.equal(validateTx(refund(900), { ...ctx([orig, r1]), editingId: 'r1' }), null); // editing r1 itself
  assert.match(validateTx(input({ kind: 'refund', refundOf: 'missing', bucket: 'wants' }), ctx([orig]))!, /not found/);
});

/* ---------- quick entry ---------- */
test('parseQuickLine handles the shapes people actually type', () => {
  const p = (s: string) => parseQuickLine(s);
  assert.deepEqual(p('ride 20'), { kind: 'expense', amountPaisa: 2000, description: 'ride', error: null });
  assert.deepEqual(p('20 ride'), { kind: 'expense', amountPaisa: 2000, description: 'ride', error: null });
  assert.deepEqual(p('pathao ride 20'), { kind: 'expense', amountPaisa: 2000, description: 'pathao ride', error: null });
  assert.deepEqual(p('rs 1,250.50 groceries'), { kind: 'expense', amountPaisa: 125050, description: 'groceries', error: null });
  assert.deepEqual(p('room rent 15000'), { kind: 'expense', amountPaisa: 1_500_000, description: 'room rent', error: null });
  assert.deepEqual(p('+50000 salary'), { kind: 'income', amountPaisa: 5_000_000, description: 'salary', error: null });
  assert.deepEqual(p('lunch 7eleven 350'), { kind: 'expense', amountPaisa: 35000, description: 'lunch 7eleven', error: null });
  assert.equal(p('momo').error, 'Add an amount, e.g. ride 20');
  assert.equal(p('').error, null);
  assert.equal(p('ride 20.555').amountPaisa, null);
});

test('category suggestion: history beats keywords, longest keyword wins, kind is respected', () => {
  assert.equal(suggestCategory('Pathao ride', 'expense', cats, [])?.categoryId, 'cat-transport');
  assert.equal(suggestCategory('pathao rides', 'expense', cats, [])?.categoryId, 'cat-transport');   // plural
  assert.equal(suggestCategory('team lunch', 'expense', cats, [])?.categoryId, 'cat-eating');         // "tea" must not match "team"
  assert.equal(suggestCategory('youtube premium', 'expense', cats, [])?.categoryId, 'cat-subs');
  assert.equal(suggestCategory('salary', 'income', cats, [])?.categoryId, 'cat-salary');
  assert.equal(suggestCategory('salary', 'expense', cats, []), null);
  assert.equal(suggestCategory('xyzzy', 'expense', cats, []), null);

  const mine = tx({ kind: 'expense', amountPaisa: 100, accountId: 'a', description: 'Bhatbhateni', categoryId: 'cat-shopping', bucket: 'wants' });
  assert.deepEqual(suggestCategory('bhatbhateni', 'expense', cats, [mine]), { categoryId: 'cat-shopping', bucket: 'wants', reason: 'history' });
  assert.equal(suggestCategory('bhatbhateni', 'expense', cats, [])?.categoryId, 'cat-groceries'); // keyword fallback
  // Editable rules: user adds a keyword, it is used immediately.
  const custom = cats.map((c) => (c.id === 'cat-health' ? { ...c, keywords: [...c.keywords, 'physio'] } : c));
  assert.equal(suggestCategory('physio session', 'expense', custom, [])?.categoryId, 'cat-health');
});

/* ---------- insights ---------- */
const monthly = (desc: string, amount: number, dates: string[], cat: string | null = 'cat-rent', bucket: 'needs' | 'wants' = 'needs') =>
  dates.map((d) => tx({ kind: 'expense', amountPaisa: rs(amount), accountId: 'a', description: desc, categoryId: cat, bucket, occurredAt: `${d}T12:00:00Z` }));

test('recurring bills are detected, and noise is not', () => {
  const txs = [
    ...monthly('Room rent', 15000, ['2026-08-02', '2026-09-02', '2026-10-02']),
    ...monthly('NEA bill', 1200, ['2026-08-10', '2026-09-11'], 'cat-utilities'),                     // due soon
    ...monthly('Momo', 150, ['2026-10-01', '2026-10-03', '2026-10-09'], 'cat-eating', 'wants'),       // same month only
    ...monthly('Mystery', 100, ['2026-08-01', '2026-09-01']).map((t, i) => ({ ...t, amountPaisa: rs(i ? 400 : 100) })), // amounts vary wildly
    ...monthly('Old gym', 2000, ['2026-03-05', '2026-04-05', '2026-05-05'], 'cat-care', 'wants'),    // stopped long ago
  ];
  const r = detectRecurring(txs, new Date('2026-10-15T12:00:00Z'));
  assert.deepEqual(r.map((x) => x.label).sort(), ['NEA bill', 'Room rent']);
  const rent = r.find((x) => x.label === 'Room rent')!;
  assert.equal(rent.paidThisMonth, true);
  assert.equal(rent.amountPaisa, rs(15000));
  assert.equal(rent.occurrences, 3);
  assert.equal(r.find((x) => x.label === 'NEA bill')!.paidThisMonth, false);
});

test('uncategorized and unexplained-difference detection', () => {
  const txs = [
    tx({ kind: 'expense', amountPaisa: 100, accountId: 'cash', bucket: 'wants' }),
    tx({ kind: 'expense', amountPaisa: 100, accountId: 'cash', bucket: 'wants', categoryId: 'cat-fun' }),
    tx({ kind: 'transfer', amountPaisa: 100, accountId: 'cash', toAccountId: 'bank' }), // transfers are never "uncategorized"
    tx({ kind: 'adjustment', amountPaisa: -rs(45), accountId: 'cash' }),
    tx({ kind: 'adjustment', amountPaisa: rs(5), accountId: 'cash' }),
  ];
  assert.equal(uncategorized(txs).length, 1);
  const diffs = unexplainedDiffs([acct('cash', 'cash'), acct('bank', 'bank')], txs, '2026-10');
  assert.deepEqual(diffs, [{ accountId: 'cash', name: 'cash', adjustmentPaisa: -rs(40), adjustments: 2 }]);

  const now = new Date('2026-10-15T12:00:00Z');
  const accounts = [
    { ...acct('cash', 'cash'), lastCheckedAt: '2026-10-10T00:00:00Z' },  // 5 days: fine
    { ...acct('old', 'cash'), lastCheckedAt: '2026-09-01T00:00:00Z' },   // stale
    acct('never', 'bank'),                                                // never counted
  ];
  assert.deepEqual(staleAccounts(accounts, now).map((x) => x.account.id), ['old', 'never']);
});

test('month-end projection blends recurring bills with the daily run-rate', () => {
  const now = new Date('2026-10-15T12:00:00Z'); // 15 of 31 days elapsed
  const txs = [
    ...monthly('Room rent', 15000, ['2026-08-20', '2026-09-20']),                         // due Oct 20, not yet paid
    ...monthly('Chiya', 100, ['2026-10-02', '2026-10-05', '2026-10-09', '2026-10-12'], 'cat-eating', 'wants'),
    ...monthly('Groceries', 3000, ['2026-10-04'], 'cat-groceries'),
  ];
  const summary = summarizeMonth(txs, '2026-10');
  const { lines } = planBudget(settings({ expectedIncomePaisa: rs(30000) }), summary); // needs 15,000 wants 9,000
  const proj = projectMonth(txs, summary, lines, now)!;
  const needs = proj.find((p) => p.bucket === 'needs')!;
  // needs so far: 3,000 (rent not paid yet) -> + 15,000 rent still due + 3,000/15 x 16 days
  assert.equal(needs.actual, rs(3000));
  assert.equal(needs.projected, Math.round(rs(3000) + rs(15000) + (rs(3000) / 15) * 16));
  assert.equal(needs.over, true);
  assert.equal(needs.confidence, 'ok');
  const wants = proj.find((p) => p.bucket === 'wants')!;
  assert.equal(wants.projected, Math.round(rs(400) + (rs(400) / 15) * 16));
  assert.equal(wants.over, false);
  assert.equal(projectMonth(txs, summarizeMonth(txs, '2026-09'), lines, now), null); // past months: no projection
  assert.equal(projectMonth(txs, summary, lines, new Date('2026-10-03T12:00:00Z'))![0].confidence, 'low');
});

/* ---------- export ---------- */
test('CSV export escapes quotes and blocks spreadsheet formula injection', () => {
  assert.equal(csvCell('plain'), 'plain');
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
  assert.equal(csvCell('+91 call'), "'+91 call");
  const csv = transactionsToCsv(
    [tx({ kind: 'expense', amountPaisa: 125050, accountId: 'cash', bucket: 'needs', description: 'Rent, October', categoryId: 'cat-rent' })],
    [acct('cash', 'cash')], cats,
  );
  const lines = csv.replace('\uFEFF', '').split('\r\n');
  assert.equal(lines.length, 2);
  assert.match(lines[1], /,expense,1250.50,cash,,Rent,needs,,"Rent, October",/);
});
