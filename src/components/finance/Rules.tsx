import { useState } from 'react';
import { useFinanceStore } from '../../store/useFinanceStore';
import { suggestCategory } from '../../finance/quick';
import type { Bucket, FinCategory } from '../../finance/types';
import { Card, Field, btnPrimary, inputCls, useToast } from './ui';

const GROUPS: { id: Bucket | 'income'; label: string }[] = [
  { id: 'needs', label: 'Needs' }, { id: 'wants', label: 'Wants' }, { id: 'savings', label: 'Savings' }, { id: 'income', label: 'Income' },
];

export default function Rules() {
  const categories = useFinanceStore((s) => s.categories);
  const txs = useFinanceStore((s) => s.txs);
  const addCategory = useFinanceStore((s) => s.addCategory);
  const toast = useToast();

  const [test, setTest] = useState('');
  const [name, setName] = useState('');
  const [group, setGroup] = useState<Bucket | 'income'>('needs');
  const [error, setError] = useState<string | null>(null);

  const testResult = test.trim() ? suggestCategory(test, 'expense', categories, txs) ?? suggestCategory(test, 'income', categories, txs) : null;
  const testName = testResult ? categories.find((c) => c.id === testResult.categoryId)?.name : null;

  const add = () => {
    const r = addCategory({ name, kind: group === 'income' ? 'income' : 'expense', bucket: group === 'income' ? null : group, keywords: [] });
    if (!r.ok) { setError(r.error); return; }
    setName(''); setError(null); toast('Category added. Add keywords so it is suggested automatically.');
  };

  return (
    <div className="space-y-6">
      <Card title="How categories get suggested">
        <p className="text-sm text-muted">When you type a description, Pare first looks at what you chose last time for the same description, then at the keywords below. You can always override it. Separate keywords with commas.</p>
        <div className="mt-4 max-w-md">
          <Field label="Try a description" hint={test.trim() ? (testName ? `Would suggest: ${testName} (${testResult!.reason === 'history' ? 'your history' : 'keyword rule'})` : 'No match. It would be saved as Uncategorized.') : undefined}>
            <input value={test} onChange={(e) => setTest(e.target.value)} placeholder="pathao ride" className={inputCls} />
          </Field>
        </div>
      </Card>

      {GROUPS.map((g) => {
        const list = categories.filter((c) => (g.id === 'income' ? c.kind === 'income' : c.kind === 'expense' && c.bucket === g.id));
        return (
          <Card key={g.id} title={g.label}>
            {list.length === 0 ? <p className="text-sm text-muted">No categories yet.</p> : (
              <ul className="space-y-3">{list.map((c) => <CategoryRow key={c.id} cat={c} />)}</ul>
            )}
          </Card>
        );
      })}

      <Card title="Add a category">
        <form onSubmit={(e) => { e.preventDefault(); add(); }} className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Pets" aria-label="Category name" className={inputCls} />
          <select value={group} onChange={(e) => setGroup(e.target.value as Bucket | 'income')} aria-label="Group" className={inputCls}>{GROUPS.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}</select>
          <button type="submit" className={btnPrimary}>Add</button>
        </form>
        {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
      </Card>
    </div>
  );
}

function CategoryRow({ cat }: { cat: FinCategory }) {
  const updateCategory = useFinanceStore((s) => s.updateCategory);
  const toast = useToast();
  const [name, setName] = useState(cat.name);
  const [kw, setKw] = useState(cat.keywords.join(', '));

  const commit = () => {
    const r = updateCategory(cat.id, { name, keywords: kw.split(/[,\n]/) });
    if (!r.ok) { toast(r.error); setName(cat.name); }
  };

  return (
    <li className={`grid gap-2 sm:grid-cols-[12rem_1fr_auto] sm:items-center ${cat.archived ? 'opacity-50' : ''}`}>
      <input value={name} onChange={(e) => setName(e.target.value)} onBlur={commit} aria-label={`${cat.name} name`} maxLength={60} className={inputCls} />
      <input value={kw} onChange={(e) => setKw(e.target.value)} onBlur={commit} aria-label={`${cat.name} keywords`} placeholder="keywords, separated, by commas" className={inputCls} />
      {cat.kind === 'expense' && (
        <select
          aria-label={`${cat.name} bucket`} value={cat.bucket ?? 'wants'} className="h-10 rounded-lg border border-line bg-paper px-2 text-sm"
          onChange={(e) => updateCategory(cat.id, { bucket: e.target.value as Bucket })}
        >
          <option value="needs">Needs</option><option value="wants">Wants</option><option value="savings">Savings</option>
        </select>
      )}
      <button onClick={() => updateCategory(cat.id, { archived: !cat.archived })} className="text-left text-sm font-semibold text-muted hover:text-ink sm:col-span-3 sm:text-right">{cat.archived ? 'Restore category' : 'Hide category'}</button>
    </li>
  );
}
