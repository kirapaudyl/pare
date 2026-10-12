// GET /api/metals  ->  FENEGOSIDA gold/silver rates (read via Aajako, which republishes them with day-over-day change and a 7-day table)
const SOURCE_URL = 'https://aajako.com/en/gold';
const UA = 'Mozilla/5.0 (compatible; PareRateCheck/1.0)';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const toText = (html: string) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

const n = (s: string) => Number(s.replace(/,/g, ''));
const nepalToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kathmandu' }).format(new Date());

interface Metal { tola: number; g10: number; change: number; pct: number }

function parseMetal(text: string, label: string, lo: number, hi: number): { metal: Metal; end: number } {
  const re = new RegExp(
    `${label}[^%]{0,80}?([+-]?\\d+(?:\\.\\d+)?)%\\s*Rs\\s*([\\d,]+)\\s*(?:(Increased|Decreased)\\s*Rs\\s*([\\d,]+))?[\\s\\S]{0,160}?Per 10 Gram\\s*([\\d,]+)`,
    'i',
  );
  const m = re.exec(text);
  if (!m) throw new Error(`Could not find the ${label} block`);
  const tola = n(m[2]);
  const g10 = n(m[5]);
  if (!(tola > lo && tola < hi) || !(g10 > 0)) throw new Error(`${label} numbers looked wrong`);
  const amt = m[4] ? n(m[4]) : 0;
  const change = m[3]?.toLowerCase() === 'decreased' ? -amt : amt;
  return { metal: { tola, g10, change, pct: Number(m[1]) }, end: m.index + m[0].length };
}

function parse(html: string) {
  const text = toText(html);
  const gold = parseMetal(text, 'Fine Gold', 50_000, 2_000_000);
  const silver = parseMetal(text.slice(gold.end), 'Silver', 500, 100_000);

  // "11 Oct  Rs 2,96,500  Rs 4,440  +800"
  const rows: { day: number; mon: number; gold: number; silver: number }[] = [];
  const rowRe = new RegExp(`(\\d{1,2})\\s+(${MONTHS.join('|')})\\s+Rs\\s*([\\d,]+)\\s+Rs\\s*([\\d,]+)`, 'g');
  for (const m of text.matchAll(rowRe)) rows.push({ day: Number(m[1]), mon: MONTHS.indexOf(m[2]), gold: n(m[3]), silver: n(m[4]) });

  const today = nepalToday();
  const year = Number(today.slice(0, 4));
  const iso = (r: { day: number; mon: number }) => {
    let y = year;
    const d = new Date(Date.UTC(y, r.mon, r.day));
    if (d.getTime() > Date.now() + 2 * 86400e3) y -= 1; // a December row read in January
    return `${y}-${String(r.mon + 1).padStart(2, '0')}-${String(r.day).padStart(2, '0')}`;
  };
  const history = rows.slice(0, 7).reverse().map((r) => ({ date: iso(r), gold: r.gold, silver: r.silver }));

  // If the headline block lacked a change figure, fall back to the table.
  if (!gold.metal.change && rows.length > 1) gold.metal.change = rows[0].gold - rows[1].gold;
  if (!silver.metal.change && rows.length > 1) silver.metal.change = rows[0].silver - rows[1].silver;

  return { gold: gold.metal, silver: silver.metal, history, asOf: rows[0] ? iso(rows[0]) : today, _text: text };
}

export async function GET(request: Request) {
  const debug = new URL(request.url).searchParams.has('debug');
  let text = '';
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 8000);
    const res = await fetch(SOURCE_URL, { headers: { 'user-agent': UA, accept: 'text/html' }, signal: ctl.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    text = toText(html);
    const p = parse(html);
    return Response.json(
      { fetchedAt: new Date().toISOString(), asOf: p.asOf, gold: p.gold, silver: p.silver, history: p.history, source: 'FENEGOSIDA via Aajako', sourceUrl: SOURCE_URL },
      { headers: { 'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=1800' } },
    );
  } catch (e: any) {
    const i = text.search(/Fine Gold/i);
    return Response.json(
      { error: String(e?.message ?? e), ...(debug ? { debug: { textLength: text.length, aroundGold: i >= 0 ? text.slice(i, i + 500) : text.slice(0, 300) } } : {}) },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
