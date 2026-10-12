import { useState } from 'react';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { useApi } from '../../lib/useApi';
import CardShell, { ErrorNote, LivePill, Skeleton } from './CardShell';

interface Metal { tola: number; g10: number; change: number; pct: number }
interface MetalsResponse {
  asOf: string;
  gold: Metal;
  silver: Metal;
  history: { date: string; gold: number; silver: number }[];
  source: string;
  sourceUrl: string;
}

type MetalKey = 'gold' | 'silver';
type UnitKey = 'g10' | 'tola' | 'g100';
const UNITS: { id: UnitKey; label: string }[] = [
  { id: 'g10', label: '10 Grams' },
  { id: 'tola', label: '1 Tola' },
  { id: 'g100', label: '100 Grams' },
];
const GOLD = '#F5B301';
const num = (n: number) => Math.round(n).toLocaleString('en-US');
const nepalToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kathmandu' }).format(new Date());
const niceDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

const priceOf = (m: Metal, u: UnitKey) => (u === 'tola' ? m.tola : u === 'g10' ? m.g10 : m.g10 * 10);

function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const lo = Math.min(...values), hi = Math.max(...values), span = hi - lo || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 300},${38 - ((v - lo) / span) * 32}`);
  return (
    <svg viewBox="0 0 300 44" className="h-10 w-full" role="img" aria-label={`Last ${values.length} published days, per tola`} preserveAspectRatio="none">
      <polyline points={pts.join(' ')} fill="none" stroke={GOLD} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={300} cy={Number(pts[pts.length - 1].split(',')[1])} r="3.5" fill={GOLD} />
    </svg>
  );
}

export default function MetalsCard() {
  const { data, error, loading, refresh } = useApi<MetalsResponse>('/api/metals', 15 * 60_000);
  const [metal, setMetal] = useState<MetalKey>('gold');
  const [unit, setUnit] = useState<UnitKey>('tola');

  const m = data?.[metal];
  const price = m ? priceOf(m, unit) : 0;
  // The source gives the change per tola; scale it to the chosen unit.
  const change = m ? Math.round(m.change * (price / m.tola)) : 0;
  const up = change >= 0;
  const pulse = !data ? 'offline' : data.asOf >= nepalToday() ? 'live' : 'delayed';

  return (
    <CardShell
      dark
      eyebrow={`${metal === 'gold' ? 'Gold' : 'Silver'} rate`}
      title="Live market"
      pill={<LivePill dark state={pulse} />}
      loading={loading}
      onRefresh={() => void refresh()}
      footer={data ? <span>{data.source} &middot; {niceDate(data.asOf)}. Shop prices add making charges.</span> : <span>FENEGOSIDA daily rate</span>}
    >
      {loading && !data ? <Skeleton dark /> : error && !data ? (
        <ErrorNote dark message={error} href="https://www.fenegosida.org" />
      ) : data && m ? (
        <div className="flex h-full flex-col">
          <div role="tablist" aria-label="Metal" className="grid grid-cols-2 gap-1 rounded-xl bg-white/5 p-1">
            {(['gold', 'silver'] as const).map((k) => (
              <button
                key={k} role="tab" aria-selected={metal === k} onClick={() => setMetal(k)}
                className={`rounded-lg py-1.5 text-sm font-semibold transition-colors ${metal === k ? 'bg-white/15 text-white' : 'text-slate-400 hover:text-white'}`}
              >
                {k === 'gold' ? 'Gold 24K' : 'Silver'}
              </button>
            ))}
          </div>

          <div className="mt-3">
            <p className="font-display text-3xl font-bold leading-none tracking-tight">NPR {num(price)}</p>
            <p className={`mt-1.5 inline-flex items-center gap-1 text-sm font-semibold ${change === 0 ? 'text-slate-400' : up ? 'text-emerald-400' : 'text-red-400'}`}>
              {change !== 0 && (up ? <ArrowUpRight size={15} /> : <ArrowDownRight size={15} />)}
              {change === 0 ? 'No change today' : `${up ? '+' : '\u2212'}${num(Math.abs(change))} (${m.pct > 0 ? '+' : ''}${m.pct}%)`}
              <span className="font-normal text-slate-500">vs previous day</span>
            </p>
          </div>

          <ul className="mt-3 divide-y divide-white/10" role="radiogroup" aria-label="Weight unit">
            {UNITS.map((u) => {
              const active = unit === u.id;
              return (
                <li key={u.id}>
                  <button
                    role="radio" aria-checked={active} onClick={() => setUnit(u.id)}
                    className="flex w-full items-center justify-between py-2.5 text-left"
                  >
                    <span className={active ? 'font-semibold text-white' : 'text-slate-400'}>{u.label}</span>
                    <span className="font-display text-lg font-semibold" style={{ color: active ? GOLD : '#E5E7EB' }}>NPR {num(priceOf(m, u.id))}</span>
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="mt-auto pt-2">
            <Spark values={data.history.map((h) => h[metal])} />
          </div>
        </div>
      ) : null}
    </CardShell>
  );
}
