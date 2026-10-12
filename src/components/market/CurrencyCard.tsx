import { useEffect, useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, BellRing, Minus } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useApi } from '../../lib/useApi';
import { useBrainStore } from '../../store/useBrainStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import CardShell, { ErrorNote, LivePill, Skeleton } from './CardShell';

interface Row { cashBuy: number; nonCashBuy: number; sell: number }
interface Nrb { buy: number; sell: number; prevBuy?: number; prevSell?: number }
interface ForexResponse {
  asOf: string | null;
  time: string | null;
  rates: Record<string, Row> | null;
  nrb: { asOf: string; rates: Record<string, Nrb> } | null;
  errors: { nabil?: string; nrb?: string };
}

const CURRENCIES = [
  { code: 'USD', name: 'US Dollar', color: '#4F46E5' },
  { code: 'GBP', name: 'Pound Sterling', color: '#D6336C' },
  { code: 'EUR', name: 'Euro', color: '#0F9D6B' },
];

const rs = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const niceDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const nepalToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kathmandu' }).format(new Date());

/** Arrow colour is from a buyer's view: green = cheaper to buy foreign currency, red = dearer. */
function Delta({ delta, source }: { delta: number | null; source: string }) {
  if (delta === null) return <span className="text-[11px] text-muted" title="Change appears once a previous day is available">no prior day</span>;
  if (Math.abs(delta) < 0.005) return <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-muted"><Minus size={12} /> unchanged</span>;
  const down = delta < 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${down ? 'text-money' : 'text-red-600'}`}
      title={`Change vs previous day (${source})`}
    >
      {down ? <ArrowDownRight size={13} /> : <ArrowUpRight size={13} />}
      {rs(Math.abs(delta))}
    </span>
  );
}

export default function CurrencyCard() {
  const { data, error, loading, refresh } = useApi<ForexResponse>('/api/forex', 10 * 60_000);
  const userId = useBrainStore((s) => s.userId);
  const target = useSettingsStore((s) => s.forexTarget);
  const loadSettings = useSettingsStore((s) => s.load);
  const setTarget = useSettingsStore((s) => s.setForexTarget);
  const [draft, setDraft] = useState('');
  const [prevUsd, setPrevUsd] = useState<number | null>(null);

  useEffect(() => { void loadSettings(); }, [loadSettings]);
  useEffect(() => { setDraft(target != null ? String(target) : ''); }, [target]);

  // Nabil's own day-over-day for USD: save today's sell, read the latest earlier day.
  const usd = data?.rates?.USD;
  const asOf = data?.asOf;
  useEffect(() => {
    if (!usd || !asOf || !userId) return;
    let live = true;
    (async () => {
      await supabase.from('forex_rates').upsert(
        { user_id: userId, day: asOf, source: 'nabil', cash_buy: usd.cashBuy, non_cash_buy: usd.nonCashBuy, sell: usd.sell },
        { onConflict: 'user_id,day,source' },
      );
      const { data: rows } = await supabase.from('forex_rates').select('day,sell').eq('source', 'nabil').lt('day', asOf).order('day', { ascending: false }).limit(1);
      if (live) setPrevUsd(rows?.[0] ? Number(rows[0].sell) : null);
    })();
    return () => { live = false; };
  }, [usd, asOf, userId]);

  const hit = usd != null && target != null && usd.sell <= target;
  const pulse = useMemo(() => (!data?.rates ? 'offline' : data.asOf === nepalToday() ? 'live' : 'delayed') as 'live' | 'delayed' | 'offline', [data]);

  const commit = () => {
    const v = Number(draft);
    setTarget(draft.trim() && Number.isFinite(v) && v > 0 ? v : null);
  };

  const deltaFor = (code: string): { d: number | null; src: string } => {
    if (code === 'USD' && prevUsd != null && usd) return { d: usd.sell - prevUsd, src: 'Nabil' };
    const n = data?.nrb?.rates[code];
    if (n && n.prevSell != null) return { d: n.sell - n.prevSell, src: 'NRB official' };
    return { d: null, src: '' };
  };

  return (
    <CardShell
      eyebrow="Forex \u00B7 NPR"
      title="Foreign currency"
      pill={<LivePill state={pulse} />}
      loading={loading}
      onRefresh={() => void refresh()}
      footer={
        <div className="space-y-2">
          {hit && (
            <p role="status" className="flex items-center gap-1.5 rounded-lg bg-money/10 px-2.5 py-1.5 font-semibold text-money">
              <BellRing size={13} /> USD is Rs {rs(usd!.sell)}, at or below your Rs {rs(target!)}
            </p>
          )}
          <label className="flex items-center justify-between gap-2">
            <span className="font-semibold text-ink">Alert when USD sell &le;</span>
            <input
              inputMode="decimal" value={draft} placeholder="153.50" aria-label="USD alert target"
              onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && commit()}
              className="h-8 w-24 rounded-lg border border-line bg-paper px-2 text-right text-sm text-ink outline-none focus:border-ink"
            />
          </label>
          <p>
            {data?.asOf ? `Nabil, published ${niceDate(data.asOf)}${data.time ? ` ${data.time.slice(0, 5)}` : ''}` : 'Nabil Bank'}
            {' \u00B7 '}Buy = non-cash. Green = cheaper to buy.
          </p>
        </div>
      }
    >
      {loading && !data ? <Skeleton /> : error && !data ? (
        <ErrorNote message={error} href="https://www.nabilbank.com/currency" />
      ) : !data?.rates ? (
        <ErrorNote message={`Couldn\u2019t read Nabil\u2019s rates${data?.errors.nabil ? ` (${data.errors.nabil})` : ''}.`} href="https://www.nabilbank.com/currency" />
      ) : (
        <ul className="space-y-2.5">
          {CURRENCIES.map((c) => {
            const r = data.rates![c.code];
            if (!r) return null;
            const { d, src } = deltaFor(c.code);
            return (
              <li key={c.code} className="flex items-center gap-3 rounded-xl bg-paper px-3 py-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white" style={{ backgroundColor: c.color }}>{c.code}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{c.name}</p>
                  <p className="text-xs text-muted" title={`Cash buy ${rs(r.cashBuy)}`}>Buy {rs(r.nonCashBuy)}</p>
                </div>
                <div className="text-right">
                  <p className="font-display text-xl font-bold leading-none">{rs(r.sell)}</p>
                  <div className="mt-1"><Delta delta={d} source={src} /></div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </CardShell>
  );
}
