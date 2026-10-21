import { useState } from 'react';
import { HandCoins, Landmark, Plus } from 'lucide-react';
import { useFinanceStore } from '../../store/useFinanceStore';
import { formatRs, paisaToInput, parseMoney } from '../../finance/money';
import { dayKeyOf } from '../../finance/ledger';
import { useFinanceDerived } from '../../finance/useFinanceDerived';
import type { LoanStatus, ReceivableStatus } from '../../finance/debts';
import type { FinLoan, FinReceivable } from '../../finance/types';
import { Bar, Empty, Field, Modal, btnGhost, btnPrimary, cardCls, fromLocalInput, inputCls, toLocalInput, useToast } from './ui';

const niceDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const today = () => dayKeyOf(new Date());
const dueText = (days: number) => (days < 0 ? `${-days} day${days === -1 ? '' : 's'} overdue` : days === 0 ? 'due today' : `due in ${days} day${days === 1 ? '' : 's'}`);

function Badge({ tone, children }: { tone: 'red' | 'amber' | 'green' | 'grey'; children: React.ReactNode }) {
  const cls = { red: 'bg-red-100 text-red-700', amber: 'bg-amber-100 text-amber-800', green: 'bg-emerald-100 text-emerald-800', grey: 'bg-slate-100 text-slate-600' }[tone];
  return <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${cls}`}>{children}</span>;
}

export default function Debts({ ym }: { ym: string }) {
  const loans = useFinanceStore((s) => s.loans);
  const receivables = useFinanceStore((s) => s.receivables);
  const d = useFinanceDerived(ym);
  const [loanForm, setLoanForm] = useState<FinLoan | 'new' | null>(null);
  const [recForm, setRecForm] = useState<FinReceivable | 'new' | null>(null);
  const [paying, setPaying] = useState<LoanStatus | null>(null);
  const [collecting, setCollecting] = useState<ReceivableStatus | null>(null);

  const archivedLoans = loans.filter((l) => l.archived);
  const archivedRecs = receivables.filter((r) => r.archived);
  const nw = d.netWorth;

  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ['Loans outstanding', formatRs(nw.loans), 'What you still owe on loans'],
          ['Loan payments due this month', formatRs(d.loanDueTotal), 'Reduces your projected cash'],
          ['Receivables outstanding', formatRs(nw.receivables), 'Owed to you. Not cash until received'],
          ['Net worth', formatRs(nw.netWorth), 'Cash + receivables \u2212 debt'],
        ].map(([label, value, sub]) => (
          <div key={label} className={cardCls}>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
            <p className={`mt-1 font-display text-2xl font-bold ${label === 'Net worth' && nw.netWorth < 0 ? 'text-red-600' : ''}`}>{value}</p>
            <p className="mt-1 text-xs text-muted">{sub}</p>
          </div>
        ))}
      </div>

      {/* ---------------- loans ---------------- */}
      <section aria-label="Loans" className="space-y-4">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-display text-xl font-bold"><Landmark size={18} /> Loans</h2>
          <button onClick={() => setLoanForm('new')} className={`${btnPrimary} flex items-center gap-1.5`}><Plus size={16} /> Add loan</button>
        </header>
        {d.loanList.length === 0 ? (
          <Empty title="No loans tracked">Add a loan to see its balance, next EMI and progress, and to have upcoming EMIs reduce your projected cash.</Empty>
        ) : (
          <ul className="grid gap-4 lg:grid-cols-2">
            {d.loanList.map((s) => <LoanCard key={s.loan.id} s={s} onPay={() => setPaying(s)} onEdit={() => setLoanForm(s.loan)} />)}
          </ul>
        )}
        {archivedLoans.length > 0 && <ArchivedList label="Archived loans" items={archivedLoans.map((l) => ({ id: l.id, name: l.name }))} restore={(id) => useFinanceStore.getState().archiveLoan(id, false)} />}
      </section>

      {/* ---------------- receivables ---------------- */}
      <section aria-label="Receivables" className="space-y-4">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-display text-xl font-bold"><HandCoins size={18} /> Receivables</h2>
          <button onClick={() => setRecForm('new')} className={`${btnPrimary} flex items-center gap-1.5`}><Plus size={16} /> Add receivable</button>
        </header>
        <p className="-mt-2 text-sm text-muted">Money other people owe you. It counts toward net worth, but never toward available cash until it actually arrives.</p>
        {d.receivableList.length === 0 ? (
          <Empty title="Nobody owes you anything right now">Record money you have lent so you remember to collect it.</Empty>
        ) : (
          <ul className="grid gap-4 lg:grid-cols-2">
            {d.receivableList.map((s) => <ReceivableCard key={s.rec.id} s={s} onCollect={() => setCollecting(s)} onEdit={() => setRecForm(s.rec)} />)}
          </ul>
        )}
        {archivedRecs.length > 0 && <ArchivedList label="Archived receivables" items={archivedRecs.map((r) => ({ id: r.id, name: r.person }))} restore={(id) => useFinanceStore.getState().archiveReceivable(id, false)} />}
      </section>

      {loanForm && <LoanForm key={loanForm === 'new' ? 'new' : loanForm.id} initial={loanForm === 'new' ? null : loanForm} onClose={() => setLoanForm(null)} />}
      {recForm && <ReceivableForm key={recForm === 'new' ? 'new' : recForm.id} initial={recForm === 'new' ? null : recForm} onClose={() => setRecForm(null)} />}
      {paying && <PayDialog key={paying.loan.id} s={paying} onClose={() => setPaying(null)} />}
      {collecting && <CollectDialog key={collecting.rec.id} s={collecting} onClose={() => setCollecting(null)} />}
    </div>
  );
}

function ArchivedList({ label, items, restore }: { label: string; items: { id: string; name: string }[]; restore: (id: string) => { ok: boolean } }) {
  return (
    <details className="text-sm"><summary className="cursor-pointer font-semibold text-muted">{label} ({items.length})</summary>
      <ul className={`${cardCls} mt-2 divide-y divide-line`}>{items.map((i) => <li key={i.id} className="flex items-center gap-3 py-2"><span className="flex-1">{i.name}</span><button onClick={() => restore(i.id)} className="font-semibold text-muted hover:text-ink">Restore</button></li>)}</ul>
    </details>
  );
}

/* ---------------- loan card ---------------- */
function LoanCard({ s, onPay, onEdit }: { s: LoanStatus; onPay: () => void; onEdit: () => void }) {
  const archiveLoan = useFinanceStore((st) => st.archiveLoan);
  const accounts = useFinanceStore((st) => st.accounts);
  const toast = useToast();
  const [showAll, setShowAll] = useState(false);
  const { loan, next } = s;
  const accName = new Map(accounts.map((a) => [a.id, a.name]));
  const shown = showAll ? s.payments : s.payments.slice(0, 3);

  return (
    <li className={cardCls}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-display text-lg font-bold">{loan.name}</h3>
          <p className="text-xs text-muted">{loan.lender ? `${loan.lender} \u00B7 ` : ''}EMI {formatRs(loan.emiPaisa)}</p>
        </div>
        {s.paidOff ? <Badge tone="green">Paid off</Badge> : next && (next.overdue ? <Badge tone="red">{dueText(next.dueInDays)}</Badge> : next.dueInDays <= 7 ? <Badge tone="amber">{dueText(next.dueInDays)}</Badge> : null)}
      </div>

      <p className="mt-3 font-display text-3xl font-bold">{formatRs(s.outstanding)} <span className="text-base font-normal text-muted">still owed</span></p>
      <div className="my-3"><Bar ratio={s.progressPct / 100} state={s.paidOff ? 'met' : next?.overdue ? 'warn' : 'ok'} /></div>
      <p className="text-sm text-muted">
        {s.emisPaid} of {s.emisTotal} EMIs paid &middot; {s.emisLeft} left
        {loan.originalPaisa ? <> &middot; {s.progressPct}% of {formatRs(loan.originalPaisa)} repaid</> : null}
      </p>
      {next && <p className="mt-1 text-sm">Next: <b>{formatRs(next.amountPaisa)}</b> on {niceDate(next.dueDate)}</p>}
      {loan.note && <p className="mt-1 text-xs text-muted">{loan.note}</p>}

      <div className="mt-4 flex flex-wrap gap-2 text-sm font-semibold">
        <button onClick={onPay} disabled={s.paidOff} className={`${btnPrimary} h-9`}>Pay EMI</button>
        <button onClick={onEdit} className="rounded-lg px-3 text-muted hover:text-ink">Edit</button>
        {s.paidOff && <button onClick={() => { const r = archiveLoan(loan.id, true); if (!r.ok) toast(r.error); }} className="rounded-lg px-3 text-muted hover:text-ink">Archive</button>}
      </div>

      {s.payments.length > 0 && (
        <div className="mt-4 border-t border-line pt-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Payments ({s.payments.length}) &middot; {formatRs(s.paidSinceOpening)} paid since {niceDate(loan.openingDate)}</p>
          <ul className="space-y-1 text-sm">
            {shown.map((p) => <li key={p.id} className="flex justify-between gap-3"><span className="text-muted">{niceDate(dayKeyOf(p.occurredAt))} &middot; {accName.get(p.accountId) ?? ''}</span><span className="font-semibold">{formatRs(p.amountPaisa)}</span></li>)}
          </ul>
          {s.payments.length > 3 && <button onClick={() => setShowAll((v) => !v)} className="mt-2 text-xs font-semibold text-muted hover:text-ink">{showAll ? 'Show fewer' : `Show all ${s.payments.length}`}</button>}
        </div>
      )}
    </li>
  );
}

/* ---------------- receivable card ---------------- */
function ReceivableCard({ s, onCollect, onEdit }: { s: ReceivableStatus; onCollect: () => void; onEdit: () => void }) {
  const accounts = useFinanceStore((st) => st.accounts);
  const writeOff = useFinanceStore((st) => st.writeOffReceivable);
  const archive = useFinanceStore((st) => st.archiveReceivable);
  const toast = useToast();
  const [showAll, setShowAll] = useState(false);
  const { rec } = s;
  const accName = new Map(accounts.map((a) => [a.id, a.name]));
  const shown = showAll ? s.collections : s.collections.slice(0, 3);
  const done = s.remaining === 0;

  return (
    <li className={cardCls}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-display text-lg font-bold">{rec.person}</h3>
          <p className="text-xs text-muted">Lent {niceDate(rec.lentOn)}{rec.expectedOn ? ` \u00B7 expected back ${niceDate(rec.expectedOn)}` : ''}</p>
        </div>
        {done ? <Badge tone={s.state === 'written-off' ? 'grey' : 'green'}>{s.state === 'written-off' ? 'Written off' : 'Settled'}</Badge>
          : s.overdue ? <Badge tone="red">{dueText(s.dueInDays!)}</Badge> : s.dueInDays !== null && s.dueInDays <= 7 ? <Badge tone="amber">{dueText(s.dueInDays)}</Badge> : null}
      </div>

      <p className="mt-3 font-display text-3xl font-bold">{formatRs(s.remaining)} <span className="text-base font-normal text-muted">still owed to you</span></p>
      <div className="my-3"><Bar ratio={s.progressPct / 100} state={done ? 'met' : s.overdue ? 'warn' : 'ok'} /></div>
      <p className="text-sm text-muted">
        {formatRs(s.repaid)} repaid of {formatRs(rec.amountPaisa)}
        {rec.writtenOffPaisa > 0 && <> &middot; {formatRs(rec.writtenOffPaisa)} written off</>}
      </p>
      {rec.note && <p className="mt-1 text-xs text-muted">{rec.note}</p>}

      <div className="mt-4 flex flex-wrap gap-2 text-sm font-semibold">
        <button onClick={onCollect} disabled={done} className={`${btnPrimary} h-9`}>Record repayment</button>
        <button onClick={onEdit} className="rounded-lg px-3 text-muted hover:text-ink">Edit</button>
        {!done && <button onClick={() => { if (window.confirm(`Write off the remaining ${formatRs(s.remaining)} from ${rec.person}? It will stop counting toward your net worth.`)) { const r = writeOff(rec.id); if (!r.ok) toast(r.error); } }} className="rounded-lg px-3 text-muted hover:text-red-600">Write off</button>}
        {done && <button onClick={() => { const r = archive(rec.id, true); if (!r.ok) toast(r.error); }} className="rounded-lg px-3 text-muted hover:text-ink">Archive</button>}
      </div>

      {s.collections.length > 0 && (
        <div className="mt-4 border-t border-line pt-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Repayments ({s.collections.length})</p>
          <ul className="space-y-1 text-sm">
            {shown.map((p) => <li key={p.id} className="flex justify-between gap-3"><span className="text-muted">{niceDate(dayKeyOf(p.occurredAt))} &middot; into {accName.get(p.accountId) ?? ''}</span><span className="font-semibold text-money">{formatRs(p.amountPaisa)}</span></li>)}
          </ul>
          {s.collections.length > 3 && <button onClick={() => setShowAll((v) => !v)} className="mt-2 text-xs font-semibold text-muted hover:text-ink">{showAll ? 'Show fewer' : `Show all ${s.collections.length}`}</button>}
        </div>
      )}
    </li>
  );
}

/* ---------------- forms ---------------- */
const optMoney = (s: string) => (s.trim() ? parseMoney(s) : null);

function LoanForm({ initial, onClose }: { initial: FinLoan | null; onClose: () => void }) {
  const accounts = useFinanceStore((s) => s.accounts).filter((a) => !a.archived);
  const addLoan = useFinanceStore((s) => s.addLoan);
  const updateLoan = useFinanceStore((s) => s.updateLoan);
  const deleteLoan = useFinanceStore((s) => s.deleteLoan);
  const hasPayments = useFinanceStore((s) => !!initial && s.txs.some((t) => t.kind === 'loan_payment' && t.loanId === initial.id));
  const toast = useToast();

  const [name, setName] = useState(initial?.name ?? '');
  const [lender, setLender] = useState(initial?.lender ?? '');
  const [owed, setOwed] = useState(initial ? paisaToInput(initial.openingOutstandingPaisa) : '');
  const [asOf, setAsOf] = useState(initial?.openingDate ?? today());
  const [emi, setEmi] = useState(initial ? paisaToInput(initial.emiPaisa) : '');
  const [nextDue, setNextDue] = useState(initial?.firstDueOn ?? '');
  const [paidBefore, setPaidBefore] = useState(String(initial?.emisPaidBefore ?? 0));
  const [original, setOriginal] = useState(initial?.originalPaisa ? paisaToInput(initial.originalPaisa) : '');
  const [note, setNote] = useState(initial?.note ?? '');
  const [isNew, setIsNew] = useState(false);
  const [receivedInto, setReceivedInto] = useState(accounts[0]?.id ?? '');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const o = parseMoney(owed), e = parseMoney(emi), orig = optMoney(original);
    if (!o.ok) { setError(`Amount still owed: ${o.error}`); return; }
    if (!e.ok) { setError(`EMI: ${e.error}`); return; }
    if (orig && !orig.ok) { setError(`Total loan amount: ${orig.error}`); return; }
    if (!/^\d+$/.test(paidBefore.trim() || '0')) { setError('EMIs already paid must be a whole number'); return; }
    const v = {
      name, lender: lender.trim() || null, openingOutstandingPaisa: o.paisa, openingDate: asOf, emiPaisa: e.paisa, firstDueOn: nextDue,
      emisPaidBefore: Number(paidBefore || 0), originalPaisa: orig && orig.ok ? orig.paisa : null, note: note.trim() || null,
    };
    const r = initial ? updateLoan(initial.id, v) : addLoan({ ...v, receivedInto: isNew ? receivedInto : null });
    if (!r.ok) { setError(r.error); return; }
    onClose();
  };

  return (
    <Modal open onClose={onClose} title={initial ? 'Edit loan' : 'Add a loan'} wide>
      <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Loan name"><input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Nabil Fone Loan" className={inputCls} /></Field>
          <Field label="Lender (optional)"><input value={lender} onChange={(e) => setLender(e.target.value)} placeholder="Nabil Bank" className={inputCls} /></Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Still owed (Rs)" hint="The whole remaining balance you must pay back."><input inputMode="decimal" value={owed} onChange={(e) => setOwed(e.target.value)} className={inputCls} /></Field>
          <Field label="Balance is as of" hint="Payments from this date on reduce it."><input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className={inputCls} /></Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="EMI (Rs)"><input inputMode="decimal" value={emi} onChange={(e) => setEmi(e.target.value)} className={inputCls} /></Field>
          <Field
            label={hasPayments ? 'First EMI due on (after balance date)' : 'Next EMI due on'}
            hint={hasPayments ? 'Your next EMI is worked out from this date and the payments you have recorded. Only change it to move the monthly due day.' : 'Later EMIs fall on the same day each month.'}
          >
            <input type="date" value={nextDue} onChange={(e) => setNextDue(e.target.value)} className={inputCls} />
          </Field>
          <Field label="EMIs already paid"><input inputMode="numeric" value={paidBefore} onChange={(e) => setPaidBefore(e.target.value.replace(/\D/g, ''))} className={inputCls} /></Field>
        </div>
        <Field label="Total loan amount (optional)" hint="If you enter it, progress is shown in rupees. Otherwise it is counted in EMIs."><input inputMode="decimal" value={original} onChange={(e) => setOriginal(e.target.value)} className={inputCls} /></Field>
        <Field label="Note"><input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} className={inputCls} /></Field>

        {!initial && (
          <div className="space-y-3 rounded-xl bg-paper p-3">
            <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={isNew} onChange={(e) => setIsNew(e.target.checked)} className="h-4 w-4 accent-[#12141F]" /> I just borrowed this and the money arrived in an account</label>
            <p className="text-xs text-muted">Leave this off for a loan you were already repaying. The cash for it came in long ago and is already in your balances.</p>
            {isNew && <Field label="Money arrived in"><select value={receivedInto} onChange={(e) => setReceivedInto(e.target.value)} className={inputCls}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>}
          </div>
        )}
        {initial && <p className="text-xs text-muted">Changing the amount still owed or its date changes the balance from that date forward.</p>}

        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className={btnPrimary}>{initial ? 'Save changes' : 'Add loan'}</button>
          <button type="button" onClick={onClose} className={btnGhost}>Cancel</button>
          {initial && <button type="button" onClick={() => { if (!window.confirm(`Delete ${initial.name}? This cannot be undone.`)) return; const r = deleteLoan(initial.id); if (!r.ok) setError(r.error); else { toast('Loan deleted'); onClose(); } }} className="ml-auto text-sm font-semibold text-muted hover:text-red-600">Delete</button>}
        </div>
      </form>
    </Modal>
  );
}

function ReceivableForm({ initial, onClose }: { initial: FinReceivable | null; onClose: () => void }) {
  const accounts = useFinanceStore((s) => s.accounts).filter((a) => !a.archived);
  const addReceivable = useFinanceStore((s) => s.addReceivable);
  const updateReceivable = useFinanceStore((s) => s.updateReceivable);
  const deleteReceivable = useFinanceStore((s) => s.deleteReceivable);
  const toast = useToast();

  const [person, setPerson] = useState(initial?.person ?? '');
  const [amount, setAmount] = useState(initial ? paisaToInput(initial.amountPaisa) : '');
  const [lentOn, setLentOn] = useState(initial?.lentOn ?? today());
  const [expectedOn, setExpectedOn] = useState(initial?.expectedOn ?? '');
  const [note, setNote] = useState(initial?.note ?? '');
  const [recordCash, setRecordCash] = useState(false);
  const [from, setFrom] = useState(accounts[0]?.id ?? '');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const a = parseMoney(amount);
    if (!a.ok) { setError(a.error); return; }
    const v = { person, amountPaisa: a.paisa, lentOn, expectedOn: expectedOn || null, note: note.trim() || null };
    const r = initial ? updateReceivable(initial.id, v) : addReceivable({ ...v, lentFrom: recordCash ? from : null });
    if (!r.ok) { setError(r.error); return; }
    onClose();
  };

  return (
    <Modal open onClose={onClose} title={initial ? 'Edit receivable' : 'Add a receivable'}>
      <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="space-y-4">
        <Field label="Who owes you"><input autoFocus value={person} onChange={(e) => setPerson(e.target.value)} maxLength={80} className={inputCls} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Amount (Rs)"><input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputCls} /></Field>
          <Field label="Lent on"><input type="date" value={lentOn} onChange={(e) => setLentOn(e.target.value)} className={inputCls} /></Field>
        </div>
        <Field label="Expected back by (optional)"><input type="date" value={expectedOn} onChange={(e) => setExpectedOn(e.target.value)} className={inputCls} /></Field>
        <Field label="Note"><input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="What it was for" className={inputCls} /></Field>

        {!initial && (
          <div className="space-y-3 rounded-xl bg-paper p-3">
            <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={recordCash} onChange={(e) => setRecordCash(e.target.checked)} className="h-4 w-4 accent-[#12141F]" /> I lent this just now. Take it out of an account.</label>
            <p className="text-xs text-muted">Leave this off if the money left your hands before you started tracking, so it is not subtracted twice.</p>
            {recordCash && <Field label="Taken from"><select value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>}
          </div>
        )}

        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className={btnPrimary}>{initial ? 'Save changes' : 'Add'}</button>
          <button type="button" onClick={onClose} className={btnGhost}>Cancel</button>
          {initial && <button type="button" onClick={() => { if (!window.confirm(`Delete ${initial.person}? This cannot be undone.`)) return; const r = deleteReceivable(initial.id); if (!r.ok) setError(r.error); else { toast('Receivable deleted'); onClose(); } }} className="ml-auto text-sm font-semibold text-muted hover:text-red-600">Delete</button>}
        </div>
      </form>
    </Modal>
  );
}

/* ---------------- pay an EMI / record a repayment ---------------- */
function useAccountDefault() {
  const accounts = useFinanceStore((s) => s.accounts).filter((a) => !a.archived);
  const def = useFinanceStore((s) => s.settings.defaultAccountId);
  return { accounts, first: accounts.find((a) => a.id === def)?.id ?? accounts[0]?.id ?? '' };
}

function PayDialog({ s, onClose }: { s: LoanStatus; onClose: () => void }) {
  const payLoan = useFinanceStore((st) => st.payLoan);
  const { accounts, first } = useAccountDefault();
  const toast = useToast();
  const [amount, setAmount] = useState(s.next ? paisaToInput(s.next.amountPaisa) : '');
  const [account, setAccount] = useState(first);
  const [when, setWhen] = useState(toLocalInput(new Date()));
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const a = parseMoney(amount);
    if (!a.ok) { setError(a.error); return; }
    const occurredAt = fromLocalInput(when);
    if (!occurredAt) { setError('Date is not valid'); return; }
    const r = payLoan(s.loan.id, { accountId: account, amountPaisa: a.paisa, occurredAt, note });
    if (!r.ok) { setError(r.error); return; }
    toast(`Paid ${formatRs(a.paisa)} toward ${s.loan.name}`);
    onClose();
  };

  return (
    <Modal open onClose={onClose} title={`Pay ${s.loan.name}`}>
      <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="space-y-4">
        <p className="text-sm text-muted">{s.next ? `Next EMI: ${formatRs(s.next.amountPaisa)}, ${dueText(s.next.dueInDays)} (${niceDate(s.next.dueDate)}). ` : ''}Still owed: {formatRs(s.outstanding)}. This is a loan payment, so it is not counted as an expense.</p>
        <Field label="Amount (Rs)"><input autoFocus inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputCls} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Paid from"><select value={account} onChange={(e) => setAccount(e.target.value)} className={inputCls}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
          <Field label="When"><input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className={inputCls} /></Field>
        </div>
        <Field label="Note"><input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} className={inputCls} /></Field>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-3"><button type="submit" className={btnPrimary}>Record payment</button><button type="button" onClick={onClose} className={btnGhost}>Cancel</button></div>
      </form>
    </Modal>
  );
}

function CollectDialog({ s, onClose }: { s: ReceivableStatus; onClose: () => void }) {
  const collect = useFinanceStore((st) => st.collect);
  const { accounts, first } = useAccountDefault();
  const toast = useToast();
  const [amount, setAmount] = useState(paisaToInput(s.remaining));
  const [account, setAccount] = useState(first);
  const [when, setWhen] = useState(toLocalInput(new Date()));
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const a = parseMoney(amount);
    if (!a.ok) { setError(a.error); return; }
    const occurredAt = fromLocalInput(when);
    if (!occurredAt) { setError('Date is not valid'); return; }
    const r = collect(s.rec.id, { accountId: account, amountPaisa: a.paisa, occurredAt, note });
    if (!r.ok) { setError(r.error); return; }
    toast(`${s.rec.person} repaid ${formatRs(a.paisa)}`);
    onClose();
  };

  return (
    <Modal open onClose={onClose} title={`Repayment from ${s.rec.person}`}>
      <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="space-y-4">
        <p className="text-sm text-muted">{formatRs(s.remaining)} is still owed. Once recorded, it becomes available cash in the account you choose. It is not counted as income.</p>
        <Field label="Amount received (Rs)"><input autoFocus inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputCls} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Received in"><select value={account} onChange={(e) => setAccount(e.target.value)} className={inputCls}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
          <Field label="When"><input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className={inputCls} /></Field>
        </div>
        <Field label="Note"><input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} className={inputCls} /></Field>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-3"><button type="submit" className={btnPrimary}>Record repayment</button><button type="button" onClick={onClose} className={btnGhost}>Cancel</button></div>
      </form>
    </Modal>
  );
}
