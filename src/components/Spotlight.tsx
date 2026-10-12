import { useEffect, useState } from 'react';
import { ExternalLink, Settings2, Star } from 'lucide-react';
import { useBrainStore } from '../store/useBrainStore';
import { useSettingsStore, type FeaturedEntry, type FeaturedStyle } from '../store/useSettingsStore';
import type { Resource } from '../types';

const host = (url: string) => {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
};

function Favicon({ url, color }: { url: string; color: string }) {
  const [failed, setFailed] = useState(false);
  const h = host(url);
  if (failed) {
    return (
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-sm font-bold text-white" style={{ backgroundColor: color }}>
        {h.charAt(0).toUpperCase()}
      </span>
    );
  }
  return (
    <img
      src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(h)}&sz=64`}
      alt="" width={32} height={32} loading="lazy" onError={() => setFailed(true)}
      className="h-8 w-8 shrink-0 rounded-lg bg-paper object-contain p-1"
    />
  );
}

function Tiles({ items, color }: { items: Resource[]; color: string }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((r) => (
        <li key={r.id}>
          <a
            href={r.url} target="_blank" rel="noopener noreferrer"
            className="group flex h-full items-center gap-3 rounded-xl border border-line p-3.5 transition-colors hover:border-ink"
          >
            <Favicon url={r.url} color={color} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-semibold">{r.title}</span>
              <span className="block truncate text-xs text-muted">{host(r.url)}</span>
            </span>
            <ExternalLink size={15} className="shrink-0 text-muted group-hover:text-ink" />
          </a>
        </li>
      ))}
    </ul>
  );
}

function ReadingList({ items, color }: { items: Resource[]; color: string }) {
  return (
    <ol className="divide-y divide-line">
      {items.map((r, i) => (
        <li key={r.id}>
          <a href={r.url} target="_blank" rel="noopener noreferrer" className="group flex items-center gap-4 py-3 hover:bg-paper/60">
            <span className="w-6 shrink-0 text-right font-display text-lg font-bold" style={{ color }}>{i + 1}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-semibold">{r.title}</span>
              <span className="block truncate text-xs text-muted">{r.platform} &middot; {host(r.url)}</span>
            </span>
            <ExternalLink size={15} className="shrink-0 text-muted group-hover:text-ink" />
          </a>
        </li>
      ))}
    </ol>
  );
}

export default function Spotlight() {
  const domains = useBrainStore((s) => s.domains);
  const resources = useBrainStore((s) => s.resources);
  const featured = useSettingsStore((s) => s.featured);
  const loaded = useSettingsStore((s) => s.loaded);
  const load = useSettingsStore((s) => s.load);
  const setFeatured = useSettingsStore((s) => s.setFeatured);
  const [editing, setEditing] = useState(false);

  useEffect(() => { void load(); }, [load]);
  if (!loaded) return null;

  const entries = featured
    .map((f) => ({ f, d: domains.find((x) => x.id === f.domainId) }))
    .filter((x): x is { f: FeaturedEntry; d: NonNullable<typeof x.d> } => !!x.d);

  const toggle = (domainId: string) =>
    setFeatured(featured.some((f) => f.domainId === domainId)
      ? featured.filter((f) => f.domainId !== domainId)
      : [...featured, { domainId, style: 'tiles' }]);

  const setStyle = (domainId: string, style: FeaturedStyle) =>
    setFeatured(featured.map((f) => (f.domainId === domainId ? { ...f, style } : f)));

  return (
    <div className="space-y-6">
      {entries.map(({ f, d }) => {
        const items = resources.filter((r) => r.domainId === d.id);
        return (
          <section key={d.id} aria-label={`${d.name} spotlight`} className="rounded-xl2 bg-card p-6 shadow-lift" style={{ borderTop: `4px solid ${d.color}` }}>
            <header className="mb-4 flex items-baseline justify-between gap-3">
              <h2 className="flex items-center gap-2 font-display text-xl font-bold">
                <Star size={18} style={{ color: d.color }} fill={d.color} /> {d.name}
              </h2>
              <span className="text-sm text-muted">{items.length} {items.length === 1 ? 'resource' : 'resources'}</span>
            </header>
            {items.length === 0
              ? <p className="text-sm text-muted">Nothing here yet. Add resources to this domain from the Resources tab.</p>
              : f.style === 'list' ? <ReadingList items={items} color={d.color} /> : <Tiles items={items} color={d.color} />}
          </section>
        );
      })}

      <div className={entries.length === 0 ? 'rounded-xl2 border-2 border-dashed border-line p-6 text-center' : 'text-right'}>
        {entries.length === 0 && (
          <p className="mb-3 text-sm text-muted">Spotlight a domain to pin its resources to your dashboard (a daily-check list, a reading list, anything).</p>
        )}
        <button onClick={() => setEditing((v) => !v)} aria-expanded={editing} className="inline-flex items-center gap-2 text-sm font-semibold text-muted hover:text-ink">
          <Settings2 size={15} /> {editing ? 'Done' : 'Choose spotlight domains'}
        </button>
      </div>

      {editing && (
        <div className="rounded-xl2 bg-card p-5 shadow-lift">
          <p className="mb-3 text-sm text-muted">Tick a domain to pin it. Tiles suit quick-launch sites; List suits a numbered reading list.</p>
          <ul className="space-y-2">
            {domains.map((d) => {
              const f = featured.find((x) => x.domainId === d.id);
              return (
                <li key={d.id} className="flex flex-wrap items-center gap-3">
                  <label className="flex min-w-[180px] flex-1 cursor-pointer items-center gap-3">
                    <input type="checkbox" checked={!!f} onChange={() => toggle(d.id)} className="h-4 w-4 accent-[#12141F]" />
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                    <span className="text-[15px] font-semibold">{d.name}</span>
                  </label>
                  {f && (
                    <div className="flex overflow-hidden rounded-lg border border-line text-sm font-semibold" role="group" aria-label={`${d.name} layout`}>
                      {(['tiles', 'list'] as const).map((s) => (
                        <button key={s} aria-pressed={f.style === s} onClick={() => setStyle(d.id, s)}
                          className={`px-3 py-1 ${f.style === s ? 'bg-ink text-white' : 'text-muted hover:text-ink'}`}>
                          {s === 'tiles' ? 'Tiles' : 'List'}
                        </button>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
