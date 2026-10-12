// GET /api/forex  ->  Nabil Bank rates for USD, GBP, EUR (+ NRB official rates with the previous day for the up/down arrow)
const NABIL_URL = 'https://www.nabilbank.com/currency';
const UA = 'Mozilla/5.0 (compatible; PareRateCheck/1.0)';
const CODES = ['USD', 'GBP', 'EUR'] as const;

const nepalToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kathmandu' }).format(new Date());

async function fetchText(url: string, accept: string): Promise<string> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 8000);
  try {
    const res = await fetch(url, { headers: { 'user-agent': UA, accept }, signal: ctl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

const toText = (html: string) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

const sane = (a: number, b: number, c: number) => [a, b, c].every((n) => Number.isFinite(n) && n > 10 && n < 1000) && c >= a;

interface Row { cashBuy: number; nonCashBuy: number; sell: number }

function rowFor(text: string, html: string, code: string): Row | null {
  const num = '(\\d+(?:\\.\\d+)?)';
  let m = new RegExp(`\\b${code}\\b.{0,80}?Cash\\s*Buy\\s*${num}\\s*Non\\s*Cash\\s*Buy\\s*${num}\\s*Sell\\s*${num}`, 'i').exec(text);
  if (!m) m = new RegExp(`${code}[^}]{0,300}?cash_?buy\\W{1,6}${num}[^}]{0,200}?non_?cash_?buy\\W{1,6}${num}[^}]{0,200}?sell\\W{1,6}${num}`, 'i').exec(html);
  if (!m) return null;
  const row = { cashBuy: Number(m[1]), nonCashBuy: Number(m[2]), sell: Number(m[3]) };
  return sane(row.cashBuy, row.nonCashBuy, row.sell) ? row : null;
}

function parseNabil(html: string) {
  const text = toText(html);
  const rates: Record<string, Row> = {};
  for (const c of CODES) {
    const r = rowFor(text, html, c);
    if (r) rates[c] = r;
  }
  if (!rates.USD) throw new Error('Could not find the USD row on Nabil\u2019s page (layout may have changed)');
  const asOf =
    /latest available data from\s*(\d{4}-\d{2}-\d{2})/i.exec(text)?.[1] ??
    /Exchange Rate of\s*(\d{4}-\d{2}-\d{2})/i.exec(text)?.[1] ??
    nepalToday();
  const time = /As of\s*(\d{2}:\d{2}:\d{2})/i.exec(text)?.[1];
  return { rates, asOf, time, _text: text };
}

interface NrbRate { buy: number; sell: number; prevBuy?: number; prevSell?: number }

async function getNrb() {
  const to = nepalToday();
  const from = new Date(Date.now() - 8 * 86400e3).toISOString().slice(0, 10);
  const raw = await fetchText(`https://www.nrb.org.np/api/forex/v1/rates?from=${from}&to=${to}&per_page=10&page=1`, 'application/json');
  const days: any[] = JSON.parse(raw)?.data?.payload ?? [];
  days.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const out: Record<string, NrbRate> = {};
  let asOf = '';
  for (const code of CODES) {
    const found = days
      .map((d) => ({ date: String(d.date), r: (d.rates ?? []).find((x: any) => x?.currency?.iso3 === code) }))
      .filter((x) => x.r && Number(x.r.sell) > 10);
    if (!found.length) continue;
    const [cur, prev] = found;
    out[code] = { buy: Number(cur.r.buy), sell: Number(cur.r.sell), prevBuy: prev ? Number(prev.r.buy) : undefined, prevSell: prev ? Number(prev.r.sell) : undefined };
    if (!asOf) asOf = cur.date;
  }
  if (!out.USD) throw new Error('No USD rate in NRB response');
  return { asOf, rates: out };
}

export async function GET(request: Request) {
  const debug = new URL(request.url).searchParams.has('debug');
  const errors: { nabil?: string; nrb?: string } = {};
  let nabil: ReturnType<typeof parseNabil> | null = null;
  let nrb: Awaited<ReturnType<typeof getNrb>> | null = null;
  let rawText = '';

  const [a, b] = await Promise.allSettled([
    fetchText(NABIL_URL, 'text/html').then((html) => { rawText = toText(html); return parseNabil(html); }),
    getNrb(),
  ]);
  if (a.status === 'fulfilled') nabil = a.value; else errors.nabil = String(a.reason?.message ?? a.reason);
  if (b.status === 'fulfilled') nrb = b.value; else errors.nrb = String(b.reason?.message ?? b.reason);

  const body: Record<string, unknown> = {
    fetchedAt: new Date().toISOString(),
    asOf: nabil?.asOf ?? null,
    time: nabil?.time ?? null,
    rates: nabil?.rates ?? null,
    nrb: nrb ? { asOf: nrb.asOf, rates: nrb.rates } : null,
    errors,
  };
  if (debug) {
    const i = rawText.search(/\bUSD\b/i);
    body.debug = { textLength: rawText.length, aroundUSD: i >= 0 ? rawText.slice(Math.max(0, i - 80), i + 320) : rawText.slice(0, 400) };
  }
  return Response.json(body, { headers: { 'Cache-Control': debug ? 'no-store' : 'public, s-maxage=300, stale-while-revalidate=600' } });
}
