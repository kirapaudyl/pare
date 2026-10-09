import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useBrainStore } from '../store/useBrainStore';

export default function QuickDump({ open, onClose }: { open: boolean; onClose: () => void }) {
  const addJournal = useBrainStore((s) => s.addJournal);
  const [text, setText] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const save = () => {
    if (!text.trim()) return;
    addJournal(text);
    setText('');
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 grid place-items-end bg-ink/40 p-4 sm:place-items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Quick dump"
            initial={{ y: 40, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 340, damping: 30 }}
            className="w-full max-w-lg rounded-xl2 bg-card p-6 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl font-bold">Quick dump</h2>
              <button onClick={onClose} aria-label="Close" className="rounded-md p-1 text-muted hover:text-ink">
                <X size={18} />
              </button>
            </div>
            <textarea
              ref={ref}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === 'Enter' && save()}
              rows={5}
              placeholder="Get it out of your head. No structure needed."
              className="mt-4 w-full resize-none rounded-xl border border-line bg-paper p-3 text-[15px] outline-none focus:border-ink"
            />
            <div className="mt-3 flex items-center justify-between">
              <span className="text-xs text-muted">Ctrl or Cmd + Enter to save to Journal</span>
              <button
                onClick={save}
                disabled={!text.trim()}
                className="h-10 rounded-lg bg-ink px-5 text-sm font-semibold text-white disabled:opacity-30"
              >
                Save entry
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}