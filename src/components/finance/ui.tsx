import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';

/* Class strings copied from the rest of Pare so Finance looks native. */
export const inputCls = 'h-10 w-full rounded-lg border border-line bg-paper px-3 text-sm outline-none focus:border-ink';
export const btnPrimary = 'h-10 rounded-lg bg-ink px-4 text-sm font-semibold text-white transition-transform active:scale-95 disabled:opacity-30';
export const btnGhost = 'h-10 rounded-lg border border-line px-4 text-sm font-semibold hover:border-ink disabled:opacity-30';
export const cardCls = 'rounded-xl2 bg-card p-6 shadow-lift';

export function Card({ title, aside, children, className = '' }: { title?: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`${cardCls} ${className}`}>
      {(title || aside) && (
        <header className="mb-4 flex items-baseline justify-between gap-3">
          {title && <h2 className="font-display text-xl font-bold">{title}</h2>}
          {aside}
        </header>
      )}
      {children}
    </section>
  );
}

export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { id: T; label: string }[]; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex overflow-hidden rounded-lg border border-line text-sm font-semibold">
      {options.map((o) => (
        <button
          key={o.id} type="button" aria-pressed={value === o.id} onClick={() => onChange(o.id)}
          className={`px-3 py-1.5 transition-colors ${value === o.id ? 'bg-ink text-white' : 'text-muted hover:text-ink'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string | null; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-semibold">{label}</span>
      {children}
      {error ? <span role="alert" className="mt-1 block text-xs text-red-600">{error}</span> : hint ? <span className="mt-1 block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

export function Bar({ ratio, state }: { ratio: number; state: 'ok' | 'warn' | 'over' | 'met' | 'open' }) {
  const color = state === 'over' ? '#DC2626' : state === 'warn' ? '#E08A00' : state === 'met' ? '#0F9D6B' : '#12141F';
  return (
    <div className="h-2.5 overflow-hidden rounded-full bg-paper" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.round(ratio * 100))}>
      <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.min(100, ratio * 100)}%`, backgroundColor: color }} />
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl2 border-2 border-dashed border-line p-8 text-center">
      <p className="font-display text-lg font-bold">{title}</p>
      {children && <div className="mt-2 text-sm text-muted">{children}</div>}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 grid place-items-end bg-ink/40 p-4 sm:place-items-center"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            role="dialog" aria-modal="true" aria-label={title}
            initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 340, damping: 30 }}
            className={`flex max-h-[90vh] w-full flex-col rounded-xl2 bg-card p-6 shadow-2xl ${wide ? 'max-w-2xl' : 'max-w-md'}`}
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="font-display text-xl font-bold">{title}</h2>
              <button onClick={onClose} aria-label="Close" className="rounded-md p-1 text-muted hover:text-ink"><X size={18} /></button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ---------- toast with undo ---------- */
interface ToastState { message: string; action?: { label: string; run: () => void } }
const ToastCtx = createContext<(message: string, action?: ToastState['action']) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const show = useCallback((message: string, action?: ToastState['action']) => {
    clearTimeout(timer.current);
    setToast({ message, action });
    timer.current = setTimeout(() => setToast(null), 8000);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-5 z-[60] flex justify-center px-4">
        <AnimatePresence>
          {toast && (
            <motion.div
              initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }}
              className="pointer-events-auto flex items-center gap-4 rounded-xl bg-ink px-4 py-3 text-sm text-white shadow-2xl"
            >
              <span>{toast.message}</span>
              {toast.action && (
                <button onClick={() => { toast.action!.run(); setToast(null); }} className="font-bold underline">{toast.action.label}</button>
              )}
              <button onClick={() => setToast(null)} aria-label="Dismiss" className="text-white/60 hover:text-white"><X size={14} /></button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}

/* ---------- date helpers for <input type="datetime-local"> ---------- */
const p2 = (n: number) => String(n).padStart(2, '0');
export const toLocalInput = (iso: string | Date) => {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`;
};
export const fromLocalInput = (v: string): string | null => {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};
