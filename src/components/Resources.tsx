import { useMemo, useState } from 'react';
import { ExternalLink, Plus, Trash2 } from 'lucide-react';
import { useBrainStore } from '../store/useBrainStore';
import type { DomainId } from '../types';
import DomainPill from './DomainPill';

export default function Resources() {
  const resources = useBrainStore((s) => s.resources);
  const addResource = useBrainStore((s) => s.addResource);
  const domains = useBrainStore((s) => s.domains);
  const removeResource = useBrainStore((s) => s.removeResource);

  const [filter, setFilter] = useState<DomainId | 'all'>('all');
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ title: '', platform: '', url: '', domainId: (domains[0]?.id ?? '') as DomainId });

  const visible = useMemo(
    () =>
      resources.filter(
        (r) =>
          (filter === 'all' || r.domainId === filter) &&
          `${r.title} ${r.platform}`.toLowerCase().includes(query.toLowerCase()),
      ),
    [resources, filter, query],
  );

  const normalizeUrl = (u: string) => (/^https?:\/\//i.test(u) ? u : `https://${u}`);
  const canSave = form.title.trim() && form.url.trim();
  const save = () => {
    if (!canSave) return;
    addResource({ ...form, title: form.title.trim(), platform: form.platform.trim() || 'Web', url: normalizeUrl(form.url.trim()) });
    setForm({ title: '', platform: '', url: '', domainId: form.domainId });
    setAdding(false);
  };

  const field = 'h-10 rounded-lg border border-line bg-paper px-3 text-sm outline-none focus:border-ink';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by domain">
          {[{ id: 'all' as const, name: 'All', color: '#12141F' }, ...domains].map((d) => {
            const active = filter === d.id;
            return (
              <button
                key={d.id} aria-pressed={active} onClick={() => setFilter(d.id)}
                className="rounded-full border px-3.5 py-1.5 text-sm font-semibold"
                style={active ? { color: '#fff', backgroundColor: d.color, borderColor: d.color } : { color: d.color, borderColor: `${d.color}55` }}
              >
                {d.name}
              </button>
            );
          })}
        </div>
        <input
          value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search resources" aria-label="Search resources"
          className={`${field} ml-auto w-full sm:w-60`}
        />
        <button onClick={() => setAdding((v) => !v)} className="flex h-10 items-center gap-1.5 rounded-lg bg-ink px-4 text-sm font-semibold text-white">
          <Plus size={16} /> Add resource
        </button>
      </div>

      {adding && (
        <div className="grid gap-3 rounded-xl2 bg-card p-5 shadow-lift sm:grid-cols-2 lg:grid-cols-5">
          <input className={field} placeholder="Title" aria-label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <input className={field} placeholder="Platform (e.g. YouTube)" aria-label="Platform" value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })} />
          <input className={field} placeholder="Link" aria-label="Link" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
          <select className={field} aria-label="Domain" value={form.domainId} onChange={(e) => setForm({ ...form, domainId: e.target.value as DomainId })}>
            {domains.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <button onClick={save} disabled={!canSave} className="h-10 rounded-lg bg-ink text-sm font-semibold text-white disabled:opacity-30">Save resource</button>
        </div>
      )}

      {visible.length === 0 ? (
        <p className="rounded-xl2 bg-card p-10 text-center text-sm text-muted shadow-lift">No resources match. Clear the filter or add a new one.</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((r) => (
            <li key={r.id} className="group relative rounded-xl2 bg-card p-5 shadow-lift">
              <a href={r.url} target="_blank" rel="noopener noreferrer" className="block">
                <div className="mb-3 flex items-center justify-between">
                  <DomainPill domainId={r.domainId} />
                  <ExternalLink size={16} className="text-muted group-hover:text-ink" />
                </div>
                <h3 className="font-display text-lg font-bold leading-snug">{r.title}</h3>
                <p className="mt-1 text-sm text-muted">{r.platform}</p>
              </a>
              <button
                onClick={() => removeResource(r.id)} aria-label={`Remove ${r.title}`}
                className="absolute bottom-4 right-4 rounded-md p-1 text-muted opacity-0 hover:text-ink focus-visible:opacity-100 group-hover:opacity-100"
              >
                <Trash2 size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
