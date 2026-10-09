import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ExternalLink, X } from 'lucide-react';
import { useDomainNodes, type DomainStats } from '../store/useBrainStore';
import { USER_NAME } from '../store/seed';

function calculatePosition(index: number, total: number) {
  const angle = (index / total) * 2 * Math.PI - Math.PI / 2;
  const radiusX = 32;
  const radiusY = 32;
  return {
    x: 50 + radiusX * Math.cos(angle),
    y: 50 + radiusY * Math.sin(angle),
  };
}

function Node({ d, pos, selected, dimmed, onClick }: { d: DomainStats; pos: { x: number; y: number }; selected: boolean; dimmed: boolean; onClick: () => void }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-expanded={selected}
      aria-label={`${d.name}, ${d.progressPercentage}% complete`}
      className="absolute w-[160px] -translate-x-1/2 -translate-y-1/2 rounded-2xl border-2 bg-white p-3 text-left shadow-lift z-10"
      style={{ left: `${pos.x}%`, top: `${pos.y}%`, borderColor: selected ? d.color : `${d.color}40` }}
      animate={{ scale: selected ? 1.07 : 1, opacity: dimmed ? 0.45 : 1 }}
      whileHover={{ scale: selected ? 1.07 : 1.04 }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 320, damping: 24 }}
    >
      <span className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: d.color }} />
        <span className="font-display text-[14px] font-bold leading-tight truncate">{d.name}</span>
      </span>
      <span className="mt-2 flex items-center justify-between text-xs text-muted">
        <span>{d.done}/{d.total} done</span>
        <span className="font-semibold" style={{ color: d.color }}>{d.progressPercentage}%</span>
      </span>
      <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-paper">
        <motion.span
          className="block h-full rounded-full"
          style={{ backgroundColor: d.color }}
          animate={{ width: `${d.progressPercentage}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </span>
    </motion.button>
  );
}

export default function MindMap() {
  const domains = useDomainNodes();
  const [openId, setOpenId] = useState<string | null>(null);
  const open = domains.find((d) => d.id === openId) ?? null;

  useEffect(() => {
    if (!openId) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpenId(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openId]);

  const domainPositions = domains.map((d, i) => ({
    domain: d,
    pos: calculatePosition(i, domains.length),
  }));

  return (
    <section aria-label="Brain view" className="rounded-xl2 bg-card p-6 shadow-lift">
      <header className="mb-2 flex items-baseline justify-between">
        <h2 className="font-display text-xl font-bold">Brain view</h2>
        <span className="text-sm text-muted">Tap a domain to see its resources</span>
      </header>

      <div className="relative h-[480px] overflow-hidden rounded-2xl bg-paper">
        <svg className="absolute inset-0 h-full w-full pointer-events-none" aria-hidden="true">
          {domainPositions.map(({ domain: d, pos }) => {
            const active = openId === d.id;
            return (
              <line
                key={d.id}
                x1="50%"
                y1="50%"
                x2={`${pos.x}%`}
                y2={`${pos.y}%`}
                stroke={d.color}
                strokeWidth={active ? 3 : 2}
                strokeDasharray="6 6"
                strokeLinecap="round"
                opacity={openId && !active ? 0.25 : 0.8}
                className="dash-flow"
              />
            );
          })}
        </svg>

        <motion.div
          className="absolute left-1/2 top-1/2 z-20 grid h-24 w-24 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-ink text-center text-white shadow-lift"
          animate={{ scale: [1, 1.04, 1] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        >
          <span className="font-display text-lg font-bold">{USER_NAME}</span>
        </motion.div>

        {domainPositions.map(({ domain: d, pos }) => (
          <Node
            key={d.id}
            d={d}
            pos={pos}
            selected={openId === d.id}
            dimmed={!!openId && openId !== d.id}
            onClick={() => setOpenId(openId === d.id ? null : d.id)}
          />
        ))}

        <AnimatePresence>
          {open && (
            <motion.aside
              key={open.id}
              aria-label={`${open.name} resources`}
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', stiffness: 300, damping: 32 }}
              className="absolute inset-y-0 right-0 z-30 flex w-full max-w-[320px] flex-col border-l border-line bg-white p-5 shadow-2xl"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-display text-lg font-bold" style={{ color: open.color }}>{open.name}</h3>
                  <p className="text-sm text-muted">{open.linkedResources.length} saved resources</p>
                </div>
                <button onClick={() => setOpenId(null)} aria-label="Close resources" className="rounded-md p-1 text-muted hover:text-ink">
                  <X size={18} />
                </button>
              </div>

              <ul className="mt-4 flex-1 space-y-2 overflow-y-auto">
                {open.linkedResources.length === 0 && (
                  <li className="text-sm text-muted">No resources yet. Add one from the Resources tab.</li>
                )}
                {open.linkedResources.map((r, i) => (
                  <motion.li key={r.id} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.05 * i }}>
                    <a
                      href={r.url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center justify-between gap-3 rounded-xl border border-line p-3 hover:border-ink"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[15px] font-semibold">{r.title}</span>
                        <span className="text-xs text-muted">{r.platform}</span>
                      </span>
                      <ExternalLink size={15} className="shrink-0 text-muted" />
                    </a>
                  </motion.li>
                ))}
              </ul>
            </motion.aside>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}