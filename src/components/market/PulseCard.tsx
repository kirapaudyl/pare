import { useMemo, useState } from 'react';
import { useApi } from '../../lib/useApi';
import CardShell, { ErrorNote, LivePill, Skeleton } from './CardShell';

interface NewsItem { id: string; title: string; url: string; source: string; region: 'NP' | 'WORLD'; topic: string; published: string | null }
interface NewsResponse { items: NewsItem[]; errors: Record<string, string> }

const TOPIC_STYLE: Record<string, string> = {
  Disaster: 'bg-red-100 text-red-700',
  Politics: 'bg-indigo-100 text-indigo-700',
  Policy: 'bg-amber-100 text-amber-800',
  Security: 'bg-rose-100 text-rose-700',
  Economy: 'bg-emerald-100 text-emerald-700',
  Health: 'bg-teal-100 text-teal-700',
  Other: 'bg-slate-100 text-slate-600',
};

function ago(iso: string | null): string {
  if (!iso) return '';
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  if (mins < 1440) return `${Math.round(mins / 60)}h`;
  return `${Math.round(mins / 1440)}d`;
}

export default function PulseCard() {
  const { data, error, loading, refresh } = useApi<NewsResponse>('/api/news', 10 * 60_000);
  const [filter, setFilter] = useState<'all' | 'NP' | 'WORLD'>('all');
  const items = useMemo(() => (data?.items ?? []).filter((i) => filter === 'all' || i.region === filter), [data, filter]);
  const failed = Object.keys(data?.errors ?? {});

  return (
    <CardShell
      eyebrow="Nepal & world"
      title="Pulse"
      pill={<LivePill state={data ? 'live' : 'offline'} />}
      loading={loading}
      onRefresh={() => void refresh()}
      footer={
        <span>
          Headlines link to the publisher.{failed.length > 0 && <span className="text-amber-700"> Unavailable: {failed.join(', ')}.</span>}
        </span>
      }
    >
      <div className="flex h-full flex-col">
        <div role="group" aria-label="Filter headlines" className="mb-2 flex gap-1.5">
          {([['all', 'All'], ['NP', 'Nepal'], ['WORLD', 'World']] as const).map(([k, label]) => (
            <button
              key={k} aria-pressed={filter === k} onClick={() => setFilter(k)}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${filter === k ? 'bg-ink text-white' : 'bg-paper text-muted hover:text-ink'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {loading && !data ? <Skeleton rows={4} /> : error && !data ? <ErrorNote message={error} /> : items.length === 0 ? (
          <ErrorNote message="No headlines right now." />
        ) : (
          <ul className="min-h-0 flex-1 space-y-2.5 overflow-y-auto pr-1">
            {items.map((i) => (
              <li key={i.id}>
                <a href={i.url} target="_blank" rel="noopener noreferrer" className="group block">
                  <div className="mb-1 flex flex-wrap items-center gap-1">
                    <span className={`rounded px-1.5 py-px text-[10px] font-bold ${i.region === 'NP' ? 'bg-ink text-white' : 'border border-line text-muted'}`}>{i.region === 'NP' ? 'NP' : 'WORLD'}</span>
                    {i.topic !== 'Other' && <span className={`rounded px-1.5 py-px text-[10px] font-bold ${TOPIC_STYLE[i.topic]}`}>{i.topic}</span>}
                  </div>
                  <p className="line-clamp-2 text-[13px] font-semibold leading-snug group-hover:underline">{i.title}</p>
                  <p className="mt-0.5 text-[11px] text-muted">{i.source}{i.published ? ` \u00B7 ${ago(i.published)}` : ''}</p>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </CardShell>
  );
}
