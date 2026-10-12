import type { ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';

export type Pulse = 'live' | 'delayed' | 'offline';

export function LivePill({ state, label, dark }: { state: Pulse; label?: string; dark?: boolean }) {
  const palette = {
    live: dark ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300' : 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700',
    delayed: dark ? 'border-amber-400/30 bg-amber-400/10 text-amber-300' : 'border-amber-500/25 bg-amber-500/10 text-amber-700',
    offline: dark ? 'border-white/15 bg-white/5 text-slate-400' : 'border-line bg-paper text-muted',
  }[state];
  const dot = { live: 'bg-emerald-500', delayed: 'bg-amber-500', offline: 'bg-slate-400' }[state];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${palette}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot} ${state === 'live' ? 'animate-pulse' : ''}`} />
      {label ?? (state === 'live' ? 'Live' : state === 'delayed' ? 'Last published' : 'Offline')}
    </span>
  );
}

interface Props {
  eyebrow: string;
  title: string;
  pill?: ReactNode;
  dark?: boolean;
  loading?: boolean;
  onRefresh?: () => void;
  footer?: ReactNode;
  children: ReactNode;
}

/** Same footprint for every market card so the row of four lines up. */
export default function CardShell({ eyebrow, title, pill, dark, loading, onRefresh, footer, children }: Props) {
  return (
    <section
      aria-label={title}
      className={`flex h-[440px] min-w-0 flex-col overflow-hidden rounded-xl2 p-5 shadow-lift ${
        dark ? 'bg-gradient-to-br from-[#1c1c1f] via-[#0f0f11] to-[#2d2d31] text-white' : 'bg-card'
      }`}
    >
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={`text-[11px] font-bold uppercase tracking-[0.14em] ${dark ? 'text-slate-400' : 'text-muted'}`}>{eyebrow}</p>
          <h2 className="truncate font-display text-lg font-bold leading-tight">{title}</h2>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {pill}
          {onRefresh && (
            <button
              onClick={onRefresh} aria-label={`Refresh ${title}`}
              className={`rounded-md p-1 ${dark ? 'text-slate-400 hover:text-white' : 'text-muted hover:text-ink'}`}
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
          )}
        </div>
      </header>
      <div className="mt-3 min-h-0 flex-1">{children}</div>
      {footer && <footer className={`mt-3 border-t pt-2.5 text-xs ${dark ? 'border-white/10 text-slate-400' : 'border-line text-muted'}`}>{footer}</footer>}
    </section>
  );
}

export function Skeleton({ rows = 3, dark }: { rows?: number; dark?: boolean }) {
  return (
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className={`h-16 animate-pulse rounded-xl ${dark ? 'bg-white/5' : 'bg-paper'}`} />
      ))}
    </div>
  );
}

export function ErrorNote({ message, href, dark }: { message: string; href?: string; dark?: boolean }) {
  return (
    <div className={`rounded-xl p-3 text-sm ${dark ? 'bg-white/5 text-slate-300' : 'bg-paper text-muted'}`} role="alert">
      <p>{message}</p>
      {href && <a href={href} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block font-semibold underline">Open the source</a>}
    </div>
  );
}
