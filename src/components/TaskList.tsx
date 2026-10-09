import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CornerUpRight, Trash2 } from 'lucide-react';
import { useBrainStore } from '../store/useBrainStore';
import { DOMAINS } from '../store/seed';
import type { DomainId, Task } from '../types';
import DomainPill from './DomainPill';

const KEYWORDS: Record<DomainId, string[]> = {
  career: ['sql', 'work', 'client', 'report', 'dashboard', 'course', 'resume', 'interview', 'meeting', 'project', 'tracker'],
  money: ['pay', 'budget', 'invoice', 'save', 'saving', 'invest', 'tax', 'bill', 'loan', 'salary', 'rent', 'fund'],
  curiosity: ['read', 'learn', 'book', 'podcast', 'research', 'explore', 'paper', 'video', 'watch'],
  personal: ['gym', 'family', 'call', 'health', 'sleep', 'walk', 'friend', 'cook', 'clean', 'meal'],
};

export function guessDomain(text: string): DomainId | null {
  const lower = text.toLowerCase();
  for (const d of DOMAINS) if (KEYWORDS[d.id].some((k) => lower.includes(k))) return d.id;
  return null;
}

function CheckBox({ checked, onToggle, label }: { checked: boolean; onToggle: () => void; label: string }) {
  return (
    <motion.button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={onToggle}
      whileTap={{ scale: 0.82 }}
      animate={{ backgroundColor: checked ? '#12141F' : '#FFFFFF', borderColor: checked ? '#12141F' : '#C9CCDA' }}
      transition={{ duration: 0.15 }}
      className="grid h-6 w-6 shrink-0 place-items-center rounded-md border-2"
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="white" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round">
        <motion.path
          d="M5 12.5l4.5 4.5L19 7.5"
          initial={false}
          animate={{ pathLength: checked ? 1 : 0, opacity: checked ? 1 : 0 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
        />
      </svg>
    </motion.button>
  );
}

function Row({ task }: { task: Task }) {
  const toggle = useBrainStore((s) => s.toggleTask);
  const remove = useBrainStore((s) => s.deleteTask);
  const done = task.status === 'completed';
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.2 }}
      className="group flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-paper"
    >
      <CheckBox checked={done} onToggle={() => toggle(task.id)} label={`Mark "${task.title}" ${done ? 'pending' : 'completed'}`} />
      <div className="min-w-0 flex-1">
        <p className={`truncate text-[15px] ${done ? 'text-muted line-through' : 'font-medium'}`}>{task.title}</p>
        {task.isFromYesterday && !done && (
          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted">
            <CornerUpRight size={12} /> Carried over from yesterday
          </p>
        )}
      </div>
      <DomainPill domainId={task.domainId} />
      <button
        onClick={() => remove(task.id)}
        aria-label={`Delete "${task.title}"`}
        className="rounded-md p-1 text-muted opacity-0 transition-opacity hover:text-ink focus-visible:opacity-100 group-hover:opacity-100"
      >
        <Trash2 size={15} />
      </button>
    </motion.li>
  );
}

export default function TaskList() {
  const tasks = useBrainStore((s) => s.tasks);
  const [showDone, setShowDone] = useState(false);
  const pending = tasks.filter((t) => t.status === 'pending').sort((a, b) => Number(b.isFromYesterday) - Number(a.isFromYesterday));
  const completed = tasks.filter((t) => t.status === 'completed');

  return (
    <section className="flex flex-col rounded-xl2 bg-card p-6 shadow-lift">
      <header className="mb-3 flex items-baseline justify-between">
        <h2 className="font-display text-xl font-bold">Pending tasks</h2>
        <span className="text-sm text-muted">{pending.length} to do</span>
      </header>

      {pending.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">Nothing pending. Type a thought on the left to add a task.</p>
      ) : (
        <ul className="-mx-2 max-h-[340px] overflow-y-auto">
          <AnimatePresence initial={false}>
            {pending.map((t) => <Row key={t.id} task={t} />)}
          </AnimatePresence>
        </ul>
      )}

      {completed.length > 0 && (
        <div className="mt-3 border-t border-line pt-3">
          <button onClick={() => setShowDone((v) => !v)} className="text-sm font-semibold text-muted hover:text-ink" aria-expanded={showDone}>
            {showDone ? 'Hide' : 'Show'} completed ({completed.length})
          </button>
          {showDone && (
            <ul className="-mx-2 mt-2 max-h-[200px] overflow-y-auto">
              <AnimatePresence initial={false}>
                {completed.map((t) => <Row key={t.id} task={t} />)}
              </AnimatePresence>
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
