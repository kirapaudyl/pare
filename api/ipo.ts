// GET /api/ipo  ->  open / upcoming issues, inferred from Sharesansar's IPO/FPO news headlines.
// (Sharesansar's structured issue tables are loaded by scripts, so headlines are the dependable server-readable source.)
const SOURCE_URL = 'https://www.sharesansar.com/category/ipo-fpo-news';
const UA = 'Mozilla/5.0 (compatible; PareRateCheck/1.0)';

const nepalToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kathmandu' }).format(new Date());
const decode = (s: string) =>
  s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&#x27;|&rsquo;|&lsquo;/g, "'").replace(/&nbsp;/g, ' ').replace(/&#8217;/g, '\u2019').trim();

/** anchors become "[[text|href]]" so links survive tag stripping */
const linkify = (html: string) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<a\b[^>]*\bhref="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, inner: string) => ` [[${inner.replace(/<[^>]+>/g, '').trim()}|${href}]] `)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');

type Status = 'Closing today' | 'Open' | 'Upcoming' | 'Pipeline';

function classify(t: string): Status | null {
  if (/allot|result|listing|listed|refund|lock.?in|auction/i.test(t)) return null;
  if (/closing today|last day|closes today|closing on today/i.test(t)) return 'Closing today';
  if (/opening[^.]{0,60}today|opens today|is opening|oversubscribed|subscribed .*times/i.test(t)) return 'Open';
  if (/issuing|to issue|offer letter|will open|opens? (?:on|from)|opening (?:on|from)|from \w+ \d{1,2}\b/i.test(t)) return 'Upcoming';
  if (/approv|pipeline|appoint|rating|issue manager|draft|proposal|prospectus/i.test(t)) return 'Pipeline';
  return null;
}

function shareType(t: string): string {
  if (/right share/i.test(t)) return 'Right';
  if (/\bFPO\b/.test(t)) return 'FPO';
  if (/mutual fund/i.test(t)) return 'Mutual fund';
  if (/debenture|bond/i.test(t)) return 'Debenture';
  return 'Ordinary';
}

function company(title: string): string {
  let t = title.replace(/^.*?:\s+/, '').replace(/^(?:IPO (?:Issue|Proposal|Shares?) of|IPO of|SEBON (?:Approves|Adds)[^A-Z]*)\s+/i, '');
  const cut = t.search(/\s+(?:Issuing|Is Opening|Opening|Closing|Closes|Opens|Appoints|Appointed|Approved|Added|Receives|Reaffirms|Publishes|Gets|Issues|IPO\b|Right Share|FPO\b)/i);
  if (cut > 3) t = t.slice(0, cut);
  return t.replace(/[\u2019']s$/, '').trim();
}

function dateText(title: string, status: Status, published: string): string {
  const range = /from\s+((?:[A-Z][a-z]+ \d{1,2})|(?:\d{1,2}(?:st|nd|rd|th)? [A-Z][a-z]+))(?:\s+to\s+((?:[A-Z][a-z]+ \d{1,2})|(?:\d{1,2}(?:st|nd|rd|th)? [A-Z][a-z]+)))?/i.exec(title);
  const pub = new Date(`${published}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (status === 'Closing today') return 'Closes today';
  if (status === 'Upcoming' && range) return `Opens ${range[1]}${range[2] ? ` \u2192 ${range[2]}` : ''} (BS)`;
  if (status === 'Open') return `Open since ${pub}`;
  return `News ${pub}`;
}

function parse(html: string) {
  const text = linkify(html);
  const re = /\[\[([^|\]]+)\|(https?:\/\/[^\]\s]*newsdetail[^\]\s]+)\]\]\s*(?:\[\[[^\]]*\]\]\s*)?(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), ([A-Z][a-z]+) (\d{1,2}), (\d{4})/g;
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const today = Date.parse(nepalToday());
  const seen = new Set<string>();
  const out: { id: string; title: string; company: string; type: string; status: Status; dateText: string; url: string; published: string }[] = [];

  for (const m of text.matchAll(re)) {
    const title = decode(m[1]);
    const url = m[2];
    if (seen.has(url)) continue;
    seen.add(url);
    const mon = months.indexOf(m[3]);
    if (mon < 0) continue;
    const published = `${m[5]}-${String(mon + 1).padStart(2, '0')}-${String(Number(m[4])).padStart(2, '0')}`;
    const age = Math.round((today - Date.parse(published)) / 86400e3);
    const status = classify(title);
    if (!status) continue;
    if (status === 'Closing today' && age > 0) continue;
    if (status === 'Open' && age > 12) continue;
    if (status === 'Upcoming' && age > 25) continue;
    if (status === 'Pipeline' && age > 30) continue;
    out.push({ id: url, title, company: company(title), type: shareType(title), status, dateText: dateText(title, status, published), url, published });
  }
  const rank: Record<Status, number> = { 'Closing today': 0, Open: 1, Upcoming: 2, Pipeline: 3 };
  out.sort((a, b) => rank[a.status] - rank[b.status] || b.published.localeCompare(a.published));
  return out.filter((x) => x.status !== 'Pipeline').concat(out.filter((x) => x.status === 'Pipeline').slice(0, 3)).slice(0, 8);
}

export async function GET() {
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 8000);
    const res = await fetch(SOURCE_URL, { headers: { 'user-agent': UA, accept: 'text/html' }, signal: ctl.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const items = parse(await res.text());
    return Response.json(
      { fetchedAt: new Date().toISOString(), items, source: 'Sharesansar IPO/FPO news', sourceUrl: 'https://www.sharesansar.com/upcoming-issue' },
      { headers: { 'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=3600' } },
    );
  } catch (e: any) {
    return Response.json({ error: String(e?.message ?? e) }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
}
