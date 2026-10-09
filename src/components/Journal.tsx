import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Copy, Check, Search, Trash2, Plus } from 'lucide-react';
import { useBrainStore } from '../store/useBrainStore';

export default function Journal() {
  const journal = useBrainStore((s) => s.journal);
  const addJournal = useBrainStore((s) => s.addJournal);
  const deleteJournal = useBrainStore((s) => s.deleteJournal);

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [query, setQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleSave = () => {
    if (!content.trim()) return;
    addJournal(content, title);
    setTitle('');
    setContent('');
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filtered = journal.filter(
    (j) =>
      j.content.toLowerCase().includes(query.toLowerCase()) ||
      (j.title && j.title.toLowerCase().includes(query.toLowerCase())),
  );

  return (
    <div className="space-y-8">
      {/* Note Creator Input */}
      <section className="rounded-xl2 bg-card p-6 shadow-lift">
        <h2 className="font-display text-xl font-bold">New Note / Thought</h2>
        <p className="mt-1 text-sm text-muted">Write anything down. Saved notes are stored securely in your brain view.</p>

        <div className="mt-4 space-y-3">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title (optional)"
            className="w-full rounded-xl border border-line bg-paper px-4 py-2.5 text-[15px] font-semibold outline-none focus:border-ink"
          />
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={4}
            placeholder="Take a note, quick thought, phone number, snippet..."
            className="w-full resize-none rounded-xl border border-line bg-paper p-4 text-[15px] outline-none focus:border-ink"
          />
          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-muted">Ctrl / Cmd + Enter supported in Quick Dump</span>
            <button
              onClick={handleSave}
              disabled={!content.trim()}
              className="flex items-center gap-1.5 rounded-lg bg-ink px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-30"
            >
              <Plus size={16} /> Save entry
            </button>
          </div>
        </div>
      </section>

      {/* Journal Notes Gallery */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-xl font-bold">Your Notes</h2>
            <p className="text-sm text-muted">{journal.length} saved entries</p>
          </div>
          <div className="relative w-full sm:w-64">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search notes..."
              className="h-10 w-full rounded-lg border border-line bg-card pl-9 pr-4 text-sm outline-none focus:border-ink"
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-xl2 bg-card p-12 text-center text-sm text-muted shadow-lift">
            {query ? 'No notes matching your search.' : 'No notes saved yet. Write your first thought above!'}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <AnimatePresence>
              {filtered.map((j) => (
                <motion.article
                  key={j.id}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="group relative flex flex-col justify-between rounded-2xl border border-line bg-card p-5 shadow-lift hover:border-ink/30 transition-all"
                >
                  <div>
                    {j.title && <h3 className="font-display text-base font-bold mb-2 text-ink">{j.title}</h3>}
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink/90 font-mono sm:font-sans">
                      {j.content}
                    </p>
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t border-line/60 pt-3 text-xs text-muted">
                    <span>
                      {new Date(j.timestamp).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                      <button
                        onClick={() => handleCopy(j.id, `${j.title ? j.title + '\n' : ''}${j.content}`)}
                        aria-label="Copy note text"
                        className="rounded-md p-1.5 text-muted hover:bg-paper hover:text-ink"
                      >
                        {copiedId === j.id ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
                      </button>
                      <button
                        onClick={() => deleteJournal(j.id)}
                        aria-label="Delete note"
                        className="rounded-md p-1.5 text-muted hover:bg-paper hover:text-red-600"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </motion.article>
              ))}
            </AnimatePresence>
          </div>
        )}
      </section>
    </div>
  );
}