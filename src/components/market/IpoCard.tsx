import { useApi } from '../../lib/useApi';
import CardShell, { ErrorNote, LivePill, Skeleton } from './CardShell';

type Status = 'Closing today' | 'Open' | 'Upcoming' | 'Pipeline';
interface IpoItem { id: string; company: string; type: string; status: Status; dateText: string; url: string; title: string }
interface IpoResponse { items: IpoItem[]; sourceUrl: string; source: string }

const STATUS_STYLE: Record<Status, string> = {
  'Closing today': 'bg-amber-100 text-amber-800',
  Open: 'bg-emerald-100 text-emerald-800',
  Upcoming: 'bg-indigo-100 text-indigo-800',
  Pipeline: 'bg-slate-100 text-slate-600',
};
const TYPE_STYLE: Record<string, string> = {
  Ordinary: 'border-line text-muted',
  Right: 'border-fuchsia-300 text-fuchsia-700',
  FPO: 'border-sky-300 text-sky-700',
};

export default function IpoCard() {
  const { data, error, loading, refresh } = useApi<IpoResponse>('/api/ipo', 30 * 60_000);
  const live = data?.items.filter((i) => i.status !== 'Pipeline').length ?? 0;

  return (
    <CardShell
      eyebrow="NEPSE \u00B7 SEBON"
      title="IPOs & issues"
      pill={<LivePill state={data ? (live > 0 ? 'live' : 'delayed') : 'offline'} label={data ? (live > 0 ? `${live} active` : 'None open') : undefined} />}
      loading={loading}
      onRefresh={() => void refresh()}
      footer={
        <span>
          Inferred from Sharesansar news.{' '}
          <a href="https://www.sharesansar.com/upcoming-issue" target="_blank" rel="noopener noreferrer" className="font-semibold text-ink underline">Full issue list</a>
        </span>
      }
    >
      {loading && !data ? <Skeleton rows={4} /> : error && !data ? (
        <ErrorNote message={error} href="https://www.sharesansar.com/upcoming-issue" />
      ) : !data || data.items.length === 0 ? (
        <ErrorNote message="No open or upcoming issues found in the latest IPO news." href="https://www.sharesansar.com/upcoming-issue" />
      ) : (
        <ul className="h-full space-y-2 overflow-y-auto pr-1">
          {data.items.map((i) => (
            <li key={i.id}>
              <a href={i.url} target="_blank" rel="noopener noreferrer" title={i.title} className="block rounded-xl bg-paper px-3 py-2.5 transition-colors hover:bg-line/60">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 flex-1 truncate text-sm font-semibold">{i.company}</p>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${STATUS_STYLE[i.status]}`}>{i.status}</span>
                </div>
                <div className="mt-1.5 flex items-center gap-2 text-xs text-muted">
                  <span className={`rounded border px-1.5 py-px font-semibold ${TYPE_STYLE[i.type] ?? 'border-line text-muted'}`}>{i.type}</span>
                  <span className="truncate">{i.dateText}</span>
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}
    </CardShell>
  );
}
