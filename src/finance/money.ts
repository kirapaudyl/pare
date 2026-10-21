export const MAX_PAISA = 1_000_000_000_000; // Rs 10 billion: far inside Number's safe-integer range

export type MoneyParse = { ok: true; paisa: number } | { ok: false; error: string };

/** Strict decimal parser using integer arithmetic only. Accepts "20", "1,250.50", "Rs 20", "20k". */
export function parseMoney(input: string, opts: { allowNegative?: boolean; allowZero?: boolean } = {}): MoneyParse {
  let s = input.trim().toLowerCase();
  if (!s) return { ok: false, error: 'Enter an amount' };
  let neg = false;
  if (s.startsWith('-') || s.startsWith('\u2212')) { neg = true; s = s.slice(1).trim(); }
  s = s.replace(/^(npr|rs\.?|\u0930\u0941\.?)\s*/, '').replace(/,/g, '').replace(/\s+/g, '');
  const m = /^(\d+)(?:\.(\d{1,2}))?(k)?$/.exec(s);
  if (!m) return { ok: false, error: 'Use digits with at most 2 decimals, e.g. 1250.50 or 20k' };
  let paisa = Number(m[1]) * 100 + (m[2] ? Number(m[2].padEnd(2, '0')) : 0);
  if (m[3]) paisa *= 1000;
  if (!Number.isSafeInteger(paisa) || paisa > MAX_PAISA) return { ok: false, error: 'That amount is too large' };
  if (neg) {
    if (!opts.allowNegative) return { ok: false, error: 'Amount cannot be negative' };
    paisa = -paisa;
  }
  if (paisa === 0 && !opts.allowZero) return { ok: false, error: 'Amount must be more than 0' };
  return { ok: true, paisa };
}

const grouped = (n: number) => n.toLocaleString('en-US');

/** "Rs 1,250.50", whole rupees without decimals, negatives with a true minus sign. */
export function formatRs(paisa: number, opts: { signed?: boolean } = {}): string {
  const abs = Math.abs(paisa);
  const whole = Math.trunc(abs / 100);
  const cents = abs % 100;
  const body = cents ? `${grouped(whole)}.${String(cents).padStart(2, '0')}` : grouped(whole);
  const sign = paisa < 0 ? '\u2212' : opts.signed && paisa > 0 ? '+' : '';
  return `${sign}Rs ${body}`;
}

/** Value for an <input>: "1250" or "1250.5" style, no grouping. */
export function paisaToInput(paisa: number): string {
  const abs = Math.abs(paisa);
  const whole = Math.trunc(abs / 100);
  const cents = abs % 100;
  return `${paisa < 0 ? '-' : ''}${whole}${cents ? `.${String(cents).padStart(2, '0')}` : ''}`;
}

/** Always two decimals, for CSV. */
export function paisaToFixed(paisa: number): string {
  const abs = Math.abs(paisa);
  return `${paisa < 0 ? '-' : ''}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

export const ratio = (part: number, whole: number) => (whole > 0 ? part / whole : 0);
