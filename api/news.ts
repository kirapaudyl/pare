// GET /api/news  ->  Nepal headlines (Aajako's aggregated English feed) + world headlines (BBC, Al Jazeera), with topic tags.
const UA = 'Mozilla/5.0 (compatible; PareRateCheck/1.0)';

const decode = (s: string) =>
  s.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&#x27;|&apos;/g, "'").replace(/&#8217;|&rsquo;/g, '\u2019').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();

async function get(url: string, accept: string): Promise<string> {
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

const TOPICS: [string, RegExp][] = [
  ['Disaster', /flood|landslide|earthquake|quake|wildfire|\bfire\b|storm|cyclone|avalanche|rescue|disaster|missing|death toll|drought|heatwave|hurricane|tsunami|dam breach|killed in/i],
  ['Politics', /minister|parliament|cabinet|election|congress|\buml\b|maoist|\bparty\b|prime minister|\bPM\b|president|vote|assembly|coalition|senate|convention|resign|opposition|leader/i],
  ['Policy', /budget|policy|\blaw\b|\bbill\b|directive|regulation|\btax\b|\bban\b|ordinance|supreme court|verdict|tariff|sanction|court|amend/i],
  ['Security', /\bwar\b|attack|strike|ceasefire|military|missile|police|arrest|terror|conflict|troops|army|gunmen|hostage|bomb/i],
  ['Economy', /economy|inflation|\bprice|\bbank|nepse|market|\bgold\b|trade|remittance|invest|stock|fuel|\blpg\b|\bgas\b|\boil\b|currency|\brates?\b|growth|\bgdp\b/i],
  ['Health', /health|disease|virus|outbreak|hospital|dengue|covid|vaccine|cholera/i],
];
const topicOf = (t: string) => TOPICS.find(([, re]) => re.test(t))?.[0] ?? 'Other';

const SOURCES: Record<string, string> = {
  'setopati.com': 'Setopati', 'ratopati.com': 'Ratopati', 'onlinekhabar.com': 'Onlinekhabar', 'risingnepaldaily.com': 'The Rising Nepal',
  'thehimalayantimes.com': 'Himalayan Times', 'myrepublica.nagariknetwork.com': 'My Republica', 'nepalnews.com': 'Nepal News',
  'theannapurnaexpress.com': 'Annapurna Express', 'b360nepal.com': 'Business 360', 'ictframe.com': 'ICT Frame', 'khabarhub.com': 'Khabarhub',
  'nepalpress.com': 'Nepalpress', 'kathmandupost.com': 'Kathmandu Post',
};
const SKIP_HOSTS = /aajako\.com|apple\.com|google\.com|facebook\.com|x\.com|twitter\.com|tiktok\.com|youtube\.com|instagram\.com/i;

interface Item { id: string; title: string; url: string; source: string; region: 'NP' | 'WORLD'; topic: string; published: string | null }

function parseAajako(html: string): Item[] {
  const out: Item[] = [];
  const seen = new Set<string>();
  for (const m of html.matchAll(/<a\b[^>]*\bhref="(https?:\/\/[^"]+)"[^>]*>([^<]{14,240})<\/a>/gi)) {
    let host = '';
    try { host = new URL(m[1]).hostname.replace(/^(www|english|en)\./, ''); } catch { continue; }
    if (SKIP_HOSTS.test(host)) continue;
    const title = decode(m[2]);
    const key = title.toLowerCase();
    if (seen.has(key) || seen.has(m[1])) continue;
    seen.add(key); seen.add(m[1]);
    const source = Object.entries(SOURCES).find(([h]) => host.endsWith(h))?.[1] ?? host;
    out.push({ id: m[1], title, url: m[1], source, region: 'NP', topic: topicOf(title), published: null });
  }
  return out;
}

function parseRss(xml: string, source: string): Item[] {
  const out: Item[] = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const block = m[1];
    const title = decode(/<title>([\s\S]*?)<\/title>/.exec(block)?.[1] ?? '');
    const url = decode(/<link>([\s\S]*?)<\/link>/.exec(block)?.[1] ?? '');
    const pub = /<pubDate>([\s\S]*?)<\/pubDate>/.exec(block)?.[1];
    const t = pub ? Date.parse(decode(pub)) : NaN;
    if (!title || !url) continue;
    out.push({ id: url, title, url, source, region: 'WORLD', topic: topicOf(title), published: Number.isFinite(t) ? new Date(t).toISOString() : null });
  }
  return out;
}

export async function GET() {
  const errors: Record<string, string> = {};
  const [aj, bbc, alj] = await Promise.allSettled([
    get('https://aajako.com/en/latest', 'text/html').then(parseAajako),
    get('https://feeds.bbci.co.uk/news/world/rss.xml', 'application/rss+xml,text/xml').then((x) => parseRss(x, 'BBC')),
    get('https://www.aljazeera.com/xml/rss/all.xml', 'application/rss+xml,text/xml').then((x) => parseRss(x, 'Al Jazeera')),
  ]);
  const ok = (r: PromiseSettledResult<Item[]>, name: string) => {
    if (r.status === 'fulfilled') return r.value;
    errors[name] = String((r.reason as Error)?.message ?? r.reason);
    return [] as Item[];
  };
  const np = ok(aj, 'nepal');
  const world = [...ok(bbc, 'bbc'), ...ok(alj, 'aljazeera')].sort((a, b) => (b.published ?? '').localeCompare(a.published ?? ''));

  // Nepal: critical topics first (disaster, politics, policy...), then everything else.
  const npPicked = [...np.filter((i) => i.topic !== 'Other'), ...np.filter((i) => i.topic === 'Other')].slice(0, 9);
  const worldPicked = world.slice(0, 7);
  const items: Item[] = [];
  for (let i = 0; i < Math.max(npPicked.length, worldPicked.length); i++) {
    if (npPicked[i]) items.push(npPicked[i]);
    if (worldPicked[i]) items.push(worldPicked[i]);
  }
  return Response.json(
    { fetchedAt: new Date().toISOString(), items, errors },
    { headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1200' } },
  );
}
