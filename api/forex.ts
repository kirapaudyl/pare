// Vercel serverless function: GET /api/forex
// The browser can't read Nabil's page directly (CORS), so this runs on the server,
// reads the page, and returns clean JSON. NRB's official rate is included as a reference.

const NABIL_URL = 'https://www.nabilbank.com/currency';
const UA = 'Mozilla/5.0 (compatible; PareRateCheck/1.0)';

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

const sane = (cashBuy: number, nonCashBuy: number, sell: number) =>
  [cashBuy, nonCashBuy, sell].every((n) => Number.isFinite(n) && n > 50 && n < 500) && sell >= cashBuy;

function parseNabil(html: string) {
  const text = toText(html);
  const num = '(\\d+(?:\\.\\d+)?)';
  let m = new RegExp(`\\bUSD\\b.{0,80}?Cash\\s*Buy\\s*${num}\\s*Non\\s*Cash\\s*Buy\\s*${num}\\s*Sell\\s*${num}`, 'i').exec(text);
  // Fallback: the numbers may only exist inside the page's embedded JSON.
  if (!m) m = new RegExp(`USD[^}]{0,300}?cash_?buy\\W{1,6}${num}[^}]{0,200}?non_?cash_?buy\\W{1,6}${num}[^}]{0,200}?sell\\W{1,6}${num}`, 'i').exec(html);
  if (!m) throw new Error('Could not find the USD row on Nabil\u2019s page (layout may have changed)');

  const cashBuy = Number(m[1]), nonCashBuy = Number(m[2]), sell = Number(m[3]);
  if (!sane(cashBuy, nonCashBuy, sell)) throw new Error('USD numbers on Nabil\u2019s page looked wrong, ignoring them');

  // Nabil shows the last published day when today has no data; use that date, not today's.
  const asOf =
    /latest available data from\s*(\d{4}-\d{2}-\d{2})/i.exec(text)?.[1] ??
    /Exchange Rate of\s*(\d{4}-\d{2}-\d{2})/i.exec(text)?.[1] ??
    nepalToday();
  const time = /As of\s*(\d{2}:\d{2}:\d{2})/i.exec(text)?.[1];
  return { cashBuy, nonCashBuy, sell, asOf, time, _text: text };
}

async function getNrb() {
  const to = nepalToday();
  const from = new Date(Date.now() - 6 * 86400e3).toISOString().slice(0, 10);
  const raw = await fetchText(`https://www.nrb.org.np/api/forex/v1/rates?from=${from}&to=${to}&per_page=10&page=1`, 'application/json');
  const j = JSON.parse(raw);
  const days: any[] = j?.data?.payload ?? [];
  days.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  for (const d of days) {
    const usd = (d.rates ?? []).find((r: any) => r?.currency?.iso3 === 'USD');
    if (usd && Number(usd.sell) > 50) return { buy: Number(usd.buy), sell: Number(usd.sell), asOf: String(d.date) };
  }
  throw new Error('No USD rate in NRB response');
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
    nabil: nabil && { cashBuy: nabil.cashBuy, nonCashBuy: nabil.nonCashBuy, sell: nabil.sell, asOf: nabil.asOf, time: nabil.time },
    nrb,
    errors,
  };
  // /api/forex?debug=1 shows what the server actually received, to fix the parser if Nabil changes its page.
  if (debug) {
    const i = rawText.search(/\bUSD\b/i);
    body.debug = { textLength: rawText.length, aroundUSD: i >= 0 ? rawText.slice(Math.max(0, i - 80), i + 320) : rawText.slice(0, 400) };
  }
  return Response.json(body, {
    headers: { 'Cache-Control': debug ? 'no-store' : 'public, s-maxage=300, stale-while-revalidate=600' },
  });
}
