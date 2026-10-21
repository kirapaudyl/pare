import { parseMoney } from './money';
import { normalizeDesc } from './text';
import type { Bucket, FinCategory, FinSettings, FinTx } from './types';

/* ---------------- defaults (seeded once, all editable) ---------------- */
type Seed = Omit<FinCategory, 'archived'>;
const c = (id: string, name: string, kind: 'expense' | 'income', bucket: Bucket | null, position: number, keywords: string[]): Seed =>
  ({ id, name, kind, bucket, position, keywords });

export const DEFAULT_CATEGORIES: Seed[] = [
  c('cat-rent', 'Rent', 'expense', 'needs', 0, ['rent', 'room rent', 'flat']),
  c('cat-groceries', 'Groceries', 'expense', 'needs', 1, ['grocery', 'vegetable', 'tarkari', 'milk', 'dairy', 'bhatbhateni', 'saleways', 'fruit', 'rice', 'dal', 'eggs']),
  c('cat-utilities', 'Utilities', 'expense', 'needs', 2, ['electricity', 'nea', 'water', 'lpg', 'gas', 'cylinder', 'bill']),
  c('cat-transport', 'Transport', 'expense', 'needs', 3, ['ride', 'pathao', 'indrive', 'tootle', 'taxi', 'bus', 'micro', 'fuel', 'petrol', 'diesel', 'parking']),
  c('cat-health', 'Health', 'expense', 'needs', 4, ['medicine', 'pharmacy', 'doctor', 'hospital', 'clinic', 'lab test']),
  c('cat-phone', 'Phone & Internet', 'expense', 'needs', 5, ['ncell', 'ntc', 'recharge', 'internet', 'wifi', 'worldlink', 'subisu', 'data pack']),
  c('cat-education', 'Education', 'expense', 'needs', 6, ['course', 'tuition', 'exam', 'udemy', 'book']),
  c('cat-eating', 'Eating out', 'expense', 'wants', 7, ['momo', 'khaja', 'restaurant', 'cafe', 'coffee', 'tea', 'chiya', 'lunch', 'dinner', 'pizza', 'burger', 'snack']),
  c('cat-fun', 'Entertainment', 'expense', 'wants', 8, ['movie', 'netflix', 'game', 'concert', 'outing']),
  c('cat-shopping', 'Shopping', 'expense', 'wants', 9, ['shopping', 'clothes', 'shoes', 'daraz', 'amazon', 'gadget']),
  c('cat-subs', 'Subscriptions', 'expense', 'wants', 10, ['subscription', 'spotify', 'youtube premium', 'chatgpt', 'claude', 'icloud']),
  c('cat-care', 'Personal care', 'expense', 'wants', 11, ['haircut', 'salon', 'spa', 'gym']),
  c('cat-social', 'Gifts & social', 'expense', 'wants', 12, ['gift', 'party', 'birthday', 'donation']),
  c('cat-invest', 'Investments', 'expense', 'savings', 13, ['sip', 'mutual fund', 'share purchase', 'nepse', 'epf', 'cit']),
  c('cat-salary', 'Salary', 'income', null, 14, ['salary', 'payroll']),
  c('cat-freelance', 'Freelance', 'income', null, 15, ['freelance', 'client', 'invoice']),
  c('cat-interest', 'Interest', 'income', null, 16, ['interest']),
  c('cat-otherinc', 'Other income', 'income', null, 17, ['other income', 'bonus', 'gift received']),
];

export const DEFAULT_SETTINGS: FinSettings = {
  incomeTargetPaisa: 0,
  expectedIncomePaisa: 0,
  needsPct: 50,
  wantsPct: 30,
  savingsPct: 20,
  budgetBase: 'expected',
  defaultAccountId: null,
  debtBucket: 'needs',
};

/* ---------------- one-line entry: "ride 20", "20 momo", "+50000 salary", "rs 1,250.50 groceries" ---------------- */
export interface QuickParse {
  kind: 'expense' | 'income';
  amountPaisa: number | null;
  description: string;
  error: string | null;
}

const AMOUNT_TOKEN = /^(?:rs\.?|npr)?\d[\d,]*(?:\.\d+)?k?$/i;

export function parseQuickLine(text: string): QuickParse {
  let s = text.trim();
  let kind: 'expense' | 'income' = 'expense';
  if (s.startsWith('+')) { kind = 'income'; s = s.slice(1).trim(); }
  const tokens = s.split(/\s+/).filter(Boolean);
  const candidates = tokens.map((t, i) => (AMOUNT_TOKEN.test(t) ? i : -1)).filter((i) => i >= 0);
  if (candidates.length === 0) return { kind, amountPaisa: null, description: tokens.join(' '), error: tokens.length ? 'Add an amount, e.g. ride 20' : null };

  // A leading number wins ("20 ride"); otherwise the last number ("ride 20", "room rent 15000").
  const idx = candidates[0] === 0 ? 0 : candidates[candidates.length - 1];
  const parsed = parseMoney(tokens[idx]);
  const rest = tokens.filter((_, i) => i !== idx);
  if (idx > 0 && /^(rs\.?|npr)$/i.test(tokens[idx - 1])) rest.splice(idx - 1, 1);
  return {
    kind,
    amountPaisa: parsed.ok ? parsed.paisa : null,
    description: rest.join(' '),
    error: parsed.ok ? null : parsed.error,
  };
}

/* ---------------- category suggestion ---------------- */
export interface Suggestion { categoryId: string; bucket: Bucket | null; reason: 'history' | 'keyword' }

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** What you did last time with the same description wins; otherwise the longest matching keyword rule. */
export function suggestCategory(
  description: string,
  kind: 'expense' | 'income',
  categories: FinCategory[],
  txs: FinTx[],
): Suggestion | null {
  const norm = normalizeDesc(description);
  if (!norm) return null;
  const usable = new Map(categories.filter((x) => !x.archived && x.kind === kind).map((x) => [x.id, x]));

  let latest: FinTx | null = null;
  for (const t of txs) {
    if (t.deletedAt || t.kind !== kind || !t.categoryId || !usable.has(t.categoryId)) continue;
    if (normalizeDesc(t.description) === norm && (!latest || t.occurredAt > latest.occurredAt)) latest = t;
  }
  if (latest) return { categoryId: latest.categoryId!, bucket: usable.get(latest.categoryId!)!.bucket, reason: 'history' };

  let best: { cat: FinCategory; len: number } | null = null;
  for (const cat of usable.values()) {
    for (const raw of cat.keywords) {
      const kw = normalizeDesc(raw);
      if (!kw) continue;
      if (new RegExp(`(^|\\s)${esc(kw)}(s|es)?(\\s|$)`).test(norm) && (!best || kw.length > best.len)) best = { cat, len: kw.length };
    }
  }
  return best ? { categoryId: best.cat.id, bucket: best.cat.bucket, reason: 'keyword' } : null;
}
