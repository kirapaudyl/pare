import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useBrainStore } from '../store/useBrainStore';
import { DOMAINS } from '../store/seed';
import type { DomainId } from '../types';
import { guessDomain } from './TaskList';

export default function ThoughtInput() {
  const addTask = useBrainStore((s) => s.addTask);
  const [text, setText] = useState('');
  const [picked, setPicked] = useState<DomainId | null>(null);
  const domain: DomainId = picked ?? guessDomain(text) ?? 'career';

  const submit = () => {
    if (!text.trim()) return;
    addTask(text, domain);
    setText('');
    setPicked(null);
  };

  return (
    <section className="flex flex-col rounded-xl2 bg-card p-6 shadow-lift">
      <h2 className="font-display text-xl font-bold">What&rsquo;s on your mind</h2>
      <p className="mt-1 text-sm text-muted">Press Enter and it becomes a pending task.</p>

      <div className="mt-4 flex items-center gap-2 rounded-xl border border-line bg-paper px-3 focus-within:border-ink">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="Book the SQL mock interview&hellip;"
          aria-label="Add a thought as a task"
          className="h-12 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted/70"
        />
        <button
          onClick={submit}
          disabled={!text.trim()}
          aria-label="Add task"
          className="grid h-8 w-8 place-items-center rounded-lg bg-ink text-white transition-opacity disabled:opacity-30"
        >
          <Plus size={18} />
        </button>
      </div>

      <fieldset className="mt-4">
        <legend className="mb-2 text-sm font-semibold">Domain</legend>
        <div className="flex flex-wrap gap-2">
          {DOMAINS.map((d) => {
            const active = d.id === domain;
            return (
              <button
                key={d.id}
                type="button"
                aria-pressed={active}
                onClick={() => setPicked(d.id)}
                className="rounded-full border px-3 py-1 text-sm font-semibold transition-colors"
                style={active ? { color: '#fff', backgroundColor: d.color, borderColor: d.color } : { color: d.color, borderColor: `${d.color}55` }}
              >
                {d.name}
              </button>
            );
          })}
        </div>
        {!picked && text.trim() && guessDomain(text) && (
          <p className="mt-2 text-xs text-muted">Domain picked from your wording. Tap another to override.</p>
        )}
      </fieldset>
    </section>
  );
}
