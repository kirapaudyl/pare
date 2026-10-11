import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowUpRight, ExternalLink, Network, Sparkles, X } from 'lucide-react';
import { useDomainNodes, type DomainStats } from '../store/useBrainStore';
import { USER_NAME } from '../store/seed';

type Position = { x: number; y: number };

/** A little asymmetry makes a radial map feel less like a static org chart. */
function calculatePosition(index: number, total: number): Position {
  const angle = (index / total) * Math.PI * 2 - Math.PI / 2;
  const radiusX = 33;
  const radiusY = 31;
  const drift = Math.sin(index * 1.7) * 2.5;
  return {
    x: 50 + (radiusX + drift) * Math.cos(angle),
    y: 50 + (radiusY + drift) * Math.sin(angle),
  };
}

function curvedPath(pos: Position, index: number): string {
  const start = { x: 50, y: 50 };
  const dx = pos.x - start.x;
  const dy = pos.y - start.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const bend = (index % 2 === 0 ? 1 : -1) * (3.5 + (index % 3) * 1.35);
  const perpendicular = { x: -dy / length, y: dx / length };
  const c1 = {
    x: start.x + dx * 0.32 + perpendicular.x * bend,
    y: start.y + dy * 0.32 + perpendicular.y * bend,
  };
  const c2 = {
    x: start.x + dx * 0.76 + perpendicular.x * bend,
    y: start.y + dy * 0.76 + perpendicular.y * bend,
  };
  return `M ${start.x} ${start.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${pos.x} ${pos.y}`;
}

function Node({ d, pos, selected, dimmed, onClick }: {
  d: DomainStats;
  pos: Position;
  selected: boolean;
  dimmed: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-expanded={selected}
      aria-label={`${d.name}, ${d.progressPercentage}% complete`}
      className="absolute z-10 w-[164px] -translate-x-1/2 -translate-y-1/2 rounded-2xl border bg-white/95 p-3.5 text-left shadow-[0_12px_34px_-22px_rgba(25,30,60,.34)] backdrop-blur-md transition-shadow hover:shadow-[0_18px_42px_-22px_rgba(25,30,60,.45)]"
      style={{ left: `${pos.x}%`, top: `${pos.y}%`, borderColor: selected ? d.color : `${d.color}45`, boxShadow: selected ? `0 0 0 3px ${d.color}12, 0 16px 38px -20px ${d.color}75` : undefined }}
      animate={{ scale: selected ? 1.045 : 1, opacity: dimmed ? 0.42 : 1, y: selected ? -2 : 0 }}
      whileHover={{ scale: selected ? 1.045 : 1.035, y: -2 }}
      whileTap={{ scale: 0.975 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
    >
      <span className="flex min-w-0 items-center gap-2.5">
        <span className="relative grid h-3 w-3 shrink-0 place-items-center rounded-full" style={{ backgroundColor: d.color }}>
          <span className="absolute inset-[-4px] rounded-full opacity-20" style={{ backgroundColor: d.color }} />
        </span>
        <span className="min-w-0 truncate font-display text-[14px] font-bold leading-tight">{d.name}</span>
      </span>
      <span className="mt-3 flex items-baseline justify-between gap-2 text-xs text-muted">
        <span>{d.done}/{d.total} done</span>
        <span className="font-semibold tabular-nums" style={{ color: d.color }}>{d.progressPercentage}%</span>
      </span>
      <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-paper/90">
        <motion.span
          className="block h-full rounded-full"
          style={{ backgroundColor: d.color }}
          animate={{ width: `${d.progressPercentage}%` }}
          transition={{ duration: 0.65, ease: 'easeOut' }}
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

  const domainPositions = useMemo(() => domains.map((domain, index) => ({
    domain,
    pos: calculatePosition(index, domains.length),
    path: curvedPath(calculatePosition(index, domains.length), index),
  })), [domains]);

  return (
    <section aria-label="Brain view" className="overflow-hidden rounded-xl2 border border-white/80 bg-card p-5 shadow-lift sm:p-6">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-[.16em] text-muted">
            <Sparkles size={13} className="text-career" /> Your personal network
          </div>
          <h2 className="font-display text-xl font-bold sm:text-2xl">Brain view</h2>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white/80 px-3 py-1.5 text-xs font-medium text-muted">
          <Network size={13} /> Tap a node to explore
        </span>
      </header>

      {/* Desktop canvas: smooth, restrained network aesthetic. */}
      <div className="brain-network relative hidden h-[570px] overflow-hidden rounded-2xl border border-white/80 md:block">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_48%,rgba(99,102,241,.09),transparent_42%),radial-gradient(ellipse_at_8%_90%,rgba(6,182,212,.08),transparent_33%),radial-gradient(ellipse_at_90%_8%,rgba(236,72,153,.07),transparent_32%)]" />
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-52 w-52 -translate-x-1/2 -translate-y-1/2 rounded-full bg-career/5 blur-3xl" />

        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <filter id="brain-edge-glow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="0.8" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <radialGradient id="brain-core-glow">
              <stop offset="0%" stopColor="#818cf8" stopOpacity=".32" />
              <stop offset="100%" stopColor="#818cf8" stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle cx="50" cy="50" r="16" fill="url(#brain-core-glow)" />
          {domainPositions.map(({ domain: d, pos, path }, index) => {
            const active = openId === d.id;
            const muted = !!openId && !active;
            return (
              <g key={d.id} opacity={muted ? 0.13 : active ? 1 : 0.77}>
                <motion.path
                  d={path}
                  fill="none"
                  stroke={d.color}
                  strokeWidth={active ? 0.62 : 0.34}
                  strokeLinecap="round"
                  opacity={active ? 0.34 : 0.15}
                  filter="url(#brain-edge-glow)"
                  animate={{ pathLength: [0.94, 1, 0.94] }}
                  transition={{ duration: 5 + index * 0.4, repeat: Infinity, ease: 'easeInOut' }}
                />
                <path
                  d={path}
                  fill="none"
                  stroke={d.color}
                  strokeWidth={active ? 0.42 : 0.22}
                  strokeLinecap="round"
                  strokeDasharray={active ? '1.1 1.2' : '0.5 1.8'}
                  className="dash-flow"
                />
                <circle cx={pos.x} cy={pos.y} r={active ? 0.7 : 0.42} fill={d.color} />
                <circle cx={50 + (pos.x - 50) * 0.68} cy={50 + (pos.y - 50) * 0.68} r="0.22" fill={d.color} opacity=".85" />
              </g>
            );
          })}
          <circle cx="50" cy="50" r="8.3" fill="none" stroke="#818cf8" strokeOpacity=".15" strokeWidth=".25" />
          <circle cx="50" cy="50" r="10.8" fill="none" stroke="#06b6d4" strokeOpacity=".11" strokeWidth=".2" strokeDasharray="1 2.4" />
        </svg>

        <motion.div
          className="absolute left-1/2 top-1/2 z-20 grid h-[104px] w-[104px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-white/15 bg-gradient-to-br from-[#242744] via-[#141725] to-[#0c0d16] text-center text-white shadow-[0_0_0_8px_rgba(99,102,241,.035),0_18px_52px_-18px_rgba(18,20,31,.7)]"
          animate={{ boxShadow: ['0 0 0 7px rgba(99,102,241,.025), 0 18px 52px -18px rgba(18,20,31,.7)', '0 0 0 13px rgba(99,102,241,.055), 0 18px 52px -18px rgba(18,20,31,.7)', '0 0 0 7px rgba(99,102,241,.025), 0 18px 52px -18px rgba(18,20,31,.7)'] }}
          transition={{ duration: 5.5, repeat: Infinity, ease: 'easeInOut' }}
        >
          <span className="relative z-10 font-display text-lg font-bold tracking-tight">{USER_NAME}</span>
          <span className="absolute inset-2 rounded-full border border-white/[.08]" />
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
              initial={{ x: '100%', opacity: 0.65 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: '100%', opacity: 0.65 }}
              transition={{ type: 'spring', stiffness: 280, damping: 30 }}
              className="absolute inset-y-0 right-0 z-30 flex w-full max-w-[330px] flex-col border-l border-line/80 bg-white/95 p-5 shadow-2xl backdrop-blur-xl"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="mb-1 text-[10px] font-bold uppercase tracking-[.16em] text-muted">Domain</div>
                  <h3 className="font-display text-lg font-bold" style={{ color: open.color }}>{open.name}</h3>
                  <p className="text-sm text-muted">{open.linkedResources.length} saved resources</p>
                </div>
                <button type="button" onClick={() => setOpenId(null)} aria-label="Close resources" className="rounded-lg p-2 text-muted hover:bg-paper hover:text-ink">
                  <X size={18} />
                </button>
              </div>

              <ul className="mt-4 flex-1 space-y-2 overflow-y-auto">
                {open.linkedResources.length === 0 && (
                  <li className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">No resources yet. Add one from the Resources tab.</li>
                )}
                {open.linkedResources.map((r, i) => (
                  <motion.li key={r.id} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.045 * i }}>
                    <a
                      href={r.url} target="_blank" rel="noopener noreferrer"
                      className="group flex items-center justify-between gap-3 rounded-xl border border-line bg-white p-3 transition-colors hover:border-career/40 hover:bg-career/[.025]"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[15px] font-semibold">{r.title}</span>
                        <span className="text-xs text-muted">{r.platform}</span>
                      </span>
                      <ExternalLink size={15} className="shrink-0 text-muted transition-colors group-hover:text-career" />
                    </a>
                  </motion.li>
                ))}
              </ul>
            </motion.aside>
          )}
        </AnimatePresence>
      </div>

      {/* A compact layout avoids overlapping nodes on phones. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:hidden">
        {domainPositions.map(({ domain: d }) => (
          <div key={d.id}>
            <button
              type="button"
              onClick={() => setOpenId(openId === d.id ? null : d.id)}
              aria-expanded={openId === d.id}
              className="w-full rounded-2xl border bg-white p-4 text-left shadow-sm transition-transform active:scale-[.99]"
              style={{ borderColor: openId === d.id ? d.color : `${d.color}45` }}
            >
              <span className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2.5">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: d.color }} />
                  <span className="truncate font-display text-sm font-bold">{d.name}</span>
                </span>
                <ArrowUpRight size={15} className="shrink-0 text-muted" />
              </span>
              <span className="mt-3 flex justify-between text-xs text-muted"><span>{d.done}/{d.total} done</span><span style={{ color: d.color }}>{d.progressPercentage}%</span></span>
              <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-paper"><span className="block h-full rounded-full" style={{ width: `${d.progressPercentage}%`, backgroundColor: d.color }} /></span>
            </button>
            {openId === d.id && (
              <div className="mt-2 rounded-xl border border-line bg-white p-3">
                {d.linkedResources.length ? d.linkedResources.map((r) => (
                  <a key={r.id} href={r.url} target="_blank" rel="noopener noreferrer" className="block truncate py-1 text-xs font-semibold text-career hover:underline">{r.title}</a>
                )) : <span className="text-xs text-muted">No saved resources yet.</span>}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
