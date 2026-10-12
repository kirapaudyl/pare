import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, BellRing, ExternalLink, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useBrainStore } from '../store/useBrainStore';
import { useSettingsStore } from '../store/useSettingsStore';

interface ForexResponse {
  fetchedAt: string;
  nabil: { cashBuy: number; nonCashBuy: number; sell: number; asOf: string; time?: string } | null;
  nrb: { buy: number; sell: number; asOf: string } | null;
  errors: { nabil?: string; nrb?: string };
}
interface HistoryRow { day: string; sell: number }

const rs = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const niceDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const nepalToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kathmandu' }).format(new Date());

function Sparkline({ rows }: { rows: HistoryRow[] }) {
  if (rows.length < 2) return <p className="text-xs text-muted">The trend line appears once two different days have been saved.</p>;
  const ys = rows.map((r) => r.sell);
  const lo = Math.min(...ys), hi = Math.max(...ys);
  const span = hi - lo || 1;
  const pts = rows.map((r, i) => [(i / (rows.length - 1)) * 300, 52 - ((r.sell - lo) / span) * 44] as const);
  const lowIdx = ys.indexOf(lo);
  return (
    <svg viewBox="0 0 300 60" className="h-16 w-full" role="img" aria-label={`Nabil selling rate, last ${rows.length} days. Low ${rs(lo)}, high ${rs(hi)}.`}>
      <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke="#12141F" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={pts[lowIdx][0]} cy={pts[lowIdx][1]} r="4" fill="#0F9D6B" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="4" fill="#12141F" />
    </svg>
  );
}

export default function ForexCard() {
  const userId = useBrainStore((s) => s.userId);
  const target = useSettingsStore((s) => s.forexTarget);
  const loadSettings = useSettingsStore((s) => s.load);
  const setTarget = useSettingsStore((s) => s.setForexTarget);

  const [data, setData] = useState<ForexResponse | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usd, setUsd] = useState('100');
  const [targetDraft, setTargetDraft] = useState('');

  useEffect(() => { void loadSettings(); }, [loadSettings]);
  useEffect(() => { setTargetDraft(target != null ? String(target) : ''); }, [target]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/forex');
      if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) {
        throw new Error('The rate service only runs on Vercel (or with "vercel dev"), not in plain npm run dev.');
      }
      const j = (await res.json()) as ForexResponse;
      setData(j);

      if (j.nabil && userId) {
        // One snapshot per published day; re-saving the same day just updates it.
        await supabase.from('forex_rates').upsert(
          { user_id: userId, day: j.nabil.asOf, source: 'nabil', cash_buy: j.nabil.cashBuy, non_cash_buy: j.nabil.nonCashBuy, sell: j.nabil.sell },
          { onConflict: 'user_id,day,source' },
        );
      }
      const { data: rows } = await supabase.from('forex_rates').select('day,sell').eq('source', 'nabil').order('day', { ascending: false }).limit(30);
      setHistory((rows ?? []).map((r) => ({ day: String(r.day), sell: Number(r.sell) })).reverse());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load rates');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
    const onVis = () => document.visibilityState === 'visible' && void refresh();
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [refresh]);

  const n = data?.nabil ?? null;
  const prev = useMemo(() => (n ? [...history].reverse().find((h) => h.day < n.asOf) ?? null : null), [history, n]);
  const low = history.length ? Math.min(...history.map((h) => h.sell)) : null;
  const delta = n && prev ? n.sell - prev.sell : null;
  const hit = n != null && target != null && n.sell <= target;
  const amount = Number(usd) || 0;

  const commitTarget = () => {
    const v = Number(targetDraft);
    setTarget(targetDraft.trim() && Number.isFinite(v) && v > 0 ? v : null);
  };

  return (
    <section aria-label="USD to NPR" className="rounded-xl2 bg-card p-6 shadow-lift">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-xl font-bold">USD &rarr; NPR &middot; Nabil Bank</h2>
        <div className="flex items-center gap-3 text-sm">
          <a href="https://www.nabilbank.com/currency" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-muted hover:text-ink">
            Nabil page <ExternalLink size={13} />
          </a>
          <button onClick={() => void refresh()} disabled={loading} aria-label="Refresh rates" className="rounded-md p-1 text-muted hover:text-ink disabled:opacity-40">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </header>

      {hit && (
        <div role="status" className="mt-4 flex items-center gap-2 rounded-xl bg-money/10 px-4 py-2.5 text-sm font-semibold text-money">
          <BellRing size={16} /> Target hit: Nabil is selling at Rs {rs(n!.sell)}, at or below your Rs {rs(target!)}.
        </div>
      )}

      {error && <p role="alert" className="mt-4 text-sm text-red-600">{error}</p>}
      {!error && !n && !loading && (
        <p className="mt-4 text-sm text-muted">
          Couldn&rsquo;t read Nabil&rsquo;s rates{data?.errors.nabil ? ` (${data.errors.nabil})` : ''}.
          {data?.nrb && <> NRB&rsquo;s official rate is Rs {rs(data.nrb.sell)} (sell) as of {niceDate(data.nrb.asOf)}.</>}
        </p>
      )}

      {n && (
        <div className="mt-4 grid gap-6 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <p className="text-sm text-muted">To buy $1 you pay Nabil&rsquo;s selling rate</p>
            <p className="mt-1 flex flex-wrap items-baseline gap-3">
              <span className="font-display text-4xl font-bold tracking-tight">Rs {rs(n.sell)}</span>
              {delta != null && delta !== 0 && (
                <span className={`inline-flex items-center gap-1 text-sm font-semibold ${delta < 0 ? 'text-money' : 'text-red-600'}`}>
                  {delta < 0 ? <ArrowDownRight size={16} /> : <ArrowUpRight size={16} />}
                  {rs(Math.abs(delta))} {delta < 0 ? 'cheaper' : 'dearer'} than {niceDate(prev!.day)}
                </span>
              )}
            </p>
            <p className="mt-1 text-xs text-muted">
              Published {niceDate(n.asOf)}{n.time ? ` at ${n.time}` : ''}
              {n.asOf !== nepalToday() && <> &middot; <span className="font-semibold">no newer rate from Nabil yet</span></>}
            </p>

            <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
              {[['Bank buys (cash)', n.cashBuy], ['Bank buys (non-cash)', n.nonCashBuy], ['Bank sells', n.sell]].map(([label, v]) => (
                <div key={label as string} className="rounded-xl bg-paper px-3 py-2">
                  <dt className="text-xs text-muted">{label}</dt>
                  <dd className="font-semibold">{rs(v as number)}</dd>
                </div>
              ))}
            </dl>
            {data?.nrb && (
              <p className="mt-3 text-xs text-muted">NRB official reference: buy {rs(data.nrb.buy)} / sell {rs(data.nrb.sell)} ({niceDate(data.nrb.asOf)})</p>
            )}
          </div>

          <div className="space-y-4">
            <div>
              <Sparkline rows={history} />
              {low != null && history.length > 1 && (
                <p className="text-xs text-muted">Lowest sell in {history.length} saved days: Rs {rs(low)}{n.sell > low ? ` (today is ${rs(n.sell - low)} above it)` : ' (today is the low)'}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="mb-1 block font-semibold">Alert when sell is at or below</span>
                <input
                  inputMode="decimal" value={targetDraft} placeholder="e.g. 153.50"
                  onChange={(e) => setTargetDraft(e.target.value)} onBlur={commitTarget} onKeyDown={(e) => e.key === 'Enter' && commitTarget()}
                  className="h-10 w-full rounded-lg border border-line bg-paper px-3 outline-none focus:border-ink"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-semibold">Cost of USD</span>
                <input inputMode="decimal" value={usd} onChange={(e) => setUsd(e.target.value)} className="h-10 w-full rounded-lg border border-line bg-paper px-3 outline-none focus:border-ink" />
              </label>
            </div>
            <p className="text-sm">${amount.toLocaleString()} costs <span className="font-semibold">Rs {rs(amount * n.sell)}</span> at Nabil&rsquo;s selling rate.</p>
          </div>
        </div>
      )}
    </section>
  );
}
