import { useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Trash2 } from 'lucide-react';
import { useBrainStore, useDomainNodes } from '../store/useBrainStore';
import { DOMAIN_PALETTE } from '../store/seed';

export default function ProgressByDomain() {
  const domains = useDomainNodes();
  const addDomain = useBrainStore((s) => s.addDomain);
  const deleteDomain = useBrainStore((s) => s.deleteDomain);

  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [selectedColor, setSelectedColor] = useState(DOMAIN_PALETTE[0]);

  const handleAdd = () => {
    if (!name.trim()) return;
    addDomain(name, selectedColor);
    setName('');
    setAdding(false);
  };

  return (
    <section aria-label="Progress by domain" className="rounded-xl2 bg-card p-6 shadow-lift">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-bold">Progress by domain</h2>
        <button
          onClick={() => setAdding((v) => !v)}
          className="flex items-center gap-1 text-xs font-semibold text-ink hover:underline"
        >
          <Plus size={14} /> Add Domain
        </button>
      </div>

      {adding && (
        <div className="mt-3 rounded-xl border border-line bg-paper p-3 space-y-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New Domain Name (e.g. Health, Side Project)"
            className="w-full rounded-lg border border-line bg-white px-3 py-1.5 text-sm outline-none focus:border-ink"
          />
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-muted mr-1">Color:</span>
            {DOMAIN_PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setSelectedColor(c)}
                className={`h-5 w-5 rounded-full border-2 transition-transform ${selectedColor === c ? 'scale-125 border-ink' : 'border-transparent'}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <button
            onClick={handleAdd}
            disabled={!name.trim()}
            className="w-full rounded-lg bg-ink py-1.5 text-xs font-semibold text-white disabled:opacity-30"
          >
            Create Domain
          </button>
        </div>
      )}

      <ul className="mt-4 space-y-5">
        {domains.map((d) => (
          <li key={d.id} className="group relative">
            <div className="mb-1.5 flex items-baseline justify-between text-sm">
              <span className="font-semibold">{d.name}</span>
              <div className="flex items-center gap-2">
                <span className="text-muted">
                  {d.done} of {d.total} tasks &middot;{' '}
                  <span className="font-semibold" style={{ color: d.color }}>
                    {d.progressPercentage}%
                  </span>
                </span>
                {domains.length > 1 && (
                  <button
                    onClick={() => deleteDomain(d.id)}
                    title="Delete domain"
                    className="opacity-0 group-hover:opacity-100 text-muted hover:text-red-600 transition-opacity"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            </div>
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={d.progressPercentage}
              aria-label={`${d.name} progress`}
              className="h-2.5 overflow-hidden rounded-full bg-paper"
            >
              <motion.div
                className="h-full rounded-full"
                style={{ backgroundColor: d.color }}
                initial={false}
                animate={{ width: `${d.progressPercentage}%` }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}