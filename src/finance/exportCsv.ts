import { paisaToFixed } from './money';
import { dayKeyOf } from './ledger';
import type { FinAccount, FinCategory, FinTx } from './types';

/** RFC 4180 quoting, plus a leading apostrophe on text that spreadsheets would run as a formula. */
export function csvCell(v: string): string {
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function transactionsToCsv(
  txs: FinTx[], accounts: FinAccount[], categories: FinCategory[],
  linked: Map<string, string> = new Map(),
): string {
  const acc = new Map(accounts.map((a) => [a.id, a.name]));
  const cat = new Map(categories.map((c) => [c.id, c.name]));
  const head = ['Date', 'Time', 'Type', 'Amount (Rs)', 'Account', 'To account', 'Category', 'Bucket', 'Linked loan or person', 'Description', 'Note'];
  const rows = txs.map((t) => {
    const d = new Date(t.occurredAt);
    const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    return [
      csvCell(dayKeyOf(d)), time, t.kind, paisaToFixed(t.amountPaisa), csvCell(acc.get(t.accountId) ?? ''),
      csvCell(t.toAccountId ? acc.get(t.toAccountId) ?? '' : ''), csvCell(t.categoryId ? cat.get(t.categoryId) ?? '' : ''),
      t.bucket ?? '', csvCell(linked.get(t.loanId ?? t.receivableId ?? '') ?? ''), csvCell(t.description), csvCell(t.note ?? ''),
    ].join(',');
  });
  return '\uFEFF' + [head.join(','), ...rows].join('\r\n'); // BOM so Excel reads UTF-8 correctly
}
