import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { useBrainStore } from './useBrainStore';
import { uid } from './seed';
import { accountBalances, dayKeyOf, isLive, validateTx } from '../finance/ledger';
import { receivableStatus } from '../finance/debts';
import { DEFAULT_CATEGORIES, DEFAULT_SETTINGS } from '../finance/quick';
import { MAX_PAISA } from '../finance/money';
import type { AccountType, Bucket, DebtBucket, FinAccount, FinCategory, FinGapItem, FinGoal, FinLoan, FinReceivable, FinSettings, FinTx, LoanKind, TxInput } from '../finance/types';

export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

/* ---------- row <-> model ---------- */
interface AccountRow { id: string; name: string; type: AccountType; opening_paisa: number; position: number; archived: boolean; last_checked_at: string | null; last_checked_paisa: number | null }
interface CategoryRow { id: string; name: string; kind: 'expense' | 'income'; bucket: Bucket | null; keywords: string[]; position: number; archived: boolean }
interface TxRow { id: string; kind: FinTx['kind']; amount_paisa: number; occurred_at: string; description: string; account_id: string; to_account_id: string | null; category_id: string | null; bucket: Bucket | null; refund_of: string | null; goal_id: string | null; loan_id: string | null; receivable_id: string | null; note: string | null; created_at: string; deleted_at: string | null }
interface GoalRow { id: string; name: string; target_paisa: number; deadline: string | null; planned_monthly_paisa: number; account_id: string | null; archived: boolean }
interface LoanRow { id: string; name: string; lender: string | null; kind?: LoanKind; opening_outstanding_paisa: number; opening_date: string; emi_paisa: number | null; first_due_on: string | null; return_by?: string | null; emis_paid_before: number; original_paisa: number | null; note: string | null; archived: boolean }
interface GapRow { id: string; kind: 'resource' | 'option'; title: string; expected_paisa: number; note: string | null; done: boolean; position: number }
interface ReceivableRow { id: string; person: string; amount_paisa: number; lent_on: string; expected_on: string | null; note: string | null; written_off_paisa: number; archived: boolean }
interface SettingsRow { income_target_paisa: number; expected_income_paisa: number; needs_pct: number; wants_pct: number; savings_pct: number; budget_base: FinSettings['budgetBase']; default_account_id: string | null; debt_bucket?: DebtBucket }

const accountFrom = (r: AccountRow): FinAccount => ({ id: r.id, name: r.name, type: r.type, openingPaisa: Number(r.opening_paisa), position: r.position, archived: r.archived, lastCheckedAt: r.last_checked_at, lastCheckedPaisa: r.last_checked_paisa == null ? null : Number(r.last_checked_paisa) });
const categoryFrom = (r: CategoryRow): FinCategory => ({ id: r.id, name: r.name, kind: r.kind, bucket: r.bucket, keywords: r.keywords ?? [], position: r.position, archived: r.archived });
const txFrom = (r: TxRow): FinTx => ({ id: r.id, kind: r.kind, amountPaisa: Number(r.amount_paisa), occurredAt: r.occurred_at, description: r.description, accountId: r.account_id, toAccountId: r.to_account_id, categoryId: r.category_id, bucket: r.bucket, refundOf: r.refund_of, goalId: r.goal_id, loanId: r.loan_id ?? null, receivableId: r.receivable_id ?? null, note: r.note, createdAt: r.created_at, deletedAt: r.deleted_at });
const goalFrom = (r: GoalRow): FinGoal => ({ id: r.id, name: r.name, targetPaisa: Number(r.target_paisa), deadline: r.deadline, plannedMonthlyPaisa: Number(r.planned_monthly_paisa), accountId: r.account_id, archived: r.archived });
const settingsFrom = (r: SettingsRow): FinSettings => ({ incomeTargetPaisa: Number(r.income_target_paisa), expectedIncomePaisa: Number(r.expected_income_paisa), needsPct: r.needs_pct, wantsPct: r.wants_pct, savingsPct: r.savings_pct, budgetBase: r.budget_base, defaultAccountId: r.default_account_id, debtBucket: r.debt_bucket ?? 'needs' });
const gapFrom = (r: GapRow): FinGapItem => ({ id: r.id, kind: r.kind, title: r.title, expectedPaisa: Number(r.expected_paisa), note: r.note, done: r.done, position: r.position });
const loanFrom = (r: LoanRow): FinLoan => ({ id: r.id, name: r.name, lender: r.lender, kind: r.kind ?? 'bank', openingOutstandingPaisa: Number(r.opening_outstanding_paisa), openingDate: r.opening_date, emiPaisa: r.emi_paisa == null ? null : Number(r.emi_paisa), firstDueOn: r.first_due_on, returnBy: r.return_by ?? null, emisPaidBefore: r.emis_paid_before, originalPaisa: r.original_paisa == null ? null : Number(r.original_paisa), note: r.note, archived: r.archived });
const receivableFrom = (r: ReceivableRow): FinReceivable => ({ id: r.id, person: r.person, amountPaisa: Number(r.amount_paisa), lentOn: r.lent_on, expectedOn: r.expected_on, note: r.note, writtenOffPaisa: Number(r.written_off_paisa ?? 0), archived: r.archived });

const txRow = (t: Omit<FinTx, never>) => ({
  id: t.id, kind: t.kind, amount_paisa: t.amountPaisa, occurred_at: t.occurredAt, description: t.description,
  account_id: t.accountId, to_account_id: t.toAccountId, category_id: t.categoryId, bucket: t.bucket,
  refund_of: t.refundOf, goal_id: t.goalId, loan_id: t.loanId, receivable_id: t.receivableId, note: t.note, deleted_at: t.deletedAt,
});
const settingsRow = (s: FinSettings) => ({
  income_target_paisa: s.incomeTargetPaisa, expected_income_paisa: s.expectedIncomePaisa, needs_pct: s.needsPct,
  wants_pct: s.wantsPct, savings_pct: s.savingsPct, budget_base: s.budgetBase, default_account_id: s.defaultAccountId, debt_bucket: s.debtBucket,
  updated_at: new Date().toISOString(),
});

const msg = (e: unknown) => (e instanceof Error ? e.message : (e as { message?: string })?.message ?? 'Something went wrong');
const isMissingTable = (m: string) => /relation .* does not exist|schema cache|Could not find the table/i.test(m);

/** Supabase returns at most 1000 rows per request, so page through everything. */
async function fetchAll<T>(table: string, orders: [string, boolean][], filter?: (q: any) => any): Promise<T[]> {
  const out: T[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    let q: any = supabase.from(table).select('*');
    if (filter) q = filter(q);
    for (const [col, asc] of orders) q = q.order(col, { ascending: asc });
    const { data, error } = await q.range(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...(data as T[]));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

const byDateDesc = (a: FinTx, b: FinTx) => b.occurredAt.localeCompare(a.occurredAt) || b.createdAt.localeCompare(a.createdAt);
const normKeywords = (kws: string[]) => [...new Set(kws.map((k) => k.trim().toLowerCase()).filter(Boolean))].slice(0, 40);


const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(`${s}T00:00:00`).getTime());
const localNoon = (day: string) => new Date(`${day}T12:00:00`).toISOString();

function validateLoan(l: Pick<FinLoan, 'name' | 'kind' | 'openingOutstandingPaisa' | 'openingDate' | 'emiPaisa' | 'firstDueOn' | 'returnBy' | 'emisPaidBefore' | 'originalPaisa'>): string | null {
  if (!l.name.trim()) return 'Give the loan a name';
  if (l.kind !== 'bank' && l.kind !== 'personal') return 'Choose whether this is a bank loan or a loan from a person';
  if (!(l.openingOutstandingPaisa > 0)) return 'Enter how much is still owed';
  if (!isDay(l.openingDate)) return 'The date is not valid';
  if (l.originalPaisa !== null && l.originalPaisa < l.openingOutstandingPaisa) return 'The total borrowed cannot be less than what is still owed';
  if (l.kind === 'personal') {
    if (l.emiPaisa !== null || l.firstDueOn !== null) return 'A loan from a person has no EMI or fixed due date';
    if (l.returnBy !== null && (!isDay(l.returnBy) || l.returnBy < l.openingDate)) return 'The return-by date cannot be before the date you borrowed it';
    return null;
  }
  if (l.emiPaisa === null || !(l.emiPaisa > 0)) return 'Enter the EMI amount';
  if (l.firstDueOn === null || !isDay(l.firstDueOn)) return 'Enter the date your next EMI is due';
  if (l.firstDueOn < l.openingDate) return 'The next EMI date cannot be before the date the balance is as of';
  if (l.returnBy !== null) return 'A bank loan is repaid by EMIs, not a return-by date';
  if (!Number.isInteger(l.emisPaidBefore) || l.emisPaidBefore < 0 || l.emisPaidBefore > 600) return 'EMIs already paid must be a whole number';
  return null;
}

function validateReceivable(r: Pick<FinReceivable, 'person' | 'amountPaisa' | 'lentOn' | 'expectedOn' | 'writtenOffPaisa'>): string | null {
  if (!r.person.trim()) return 'Enter who owes you';
  if (!(r.amountPaisa > 0)) return 'Enter the amount';
  if (!isDay(r.lentOn)) return 'The date is not valid';
  if (r.expectedOn !== null && !isDay(r.expectedOn)) return 'The expected date is not valid';
  if (r.expectedOn !== null && r.expectedOn < r.lentOn) return 'The expected date cannot be before the date it was lent';
  if (r.writtenOffPaisa < 0 || r.writtenOffPaisa > r.amountPaisa) return 'Written-off amount is not valid';
  return null;
}

/* ---------- store ---------- */
interface FinanceState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;       // why loading failed
  notice: string | null;      // a save that failed (data was reloaded from the server)
  needsSchema: boolean;
  accounts: FinAccount[];
  categories: FinCategory[];
  txs: FinTx[];               // live (not deleted) transactions
  trash: FinTx[];             // deleted in the last 30 days, restorable
  goals: FinGoal[];
  loans: FinLoan[];
  receivables: FinReceivable[];
  gapItems: FinGapItem[];
  settings: FinSettings;
  loadedAt: number;

  load: (force?: boolean) => Promise<void>;
  dismissNotice: () => void;

  addTx: (input: TxInput) => Result<{ id: string }>;
  updateTx: (id: string, input: TxInput) => Result;
  deleteTx: (id: string) => Result;
  restoreTx: (id: string) => Result;

  addAccount: (a: { name: string; type: AccountType; openingPaisa: number }) => Result<{ id: string }>;
  updateAccount: (id: string, patch: { name?: string; type?: AccountType; openingPaisa?: number }) => Result;
  setAccountArchived: (id: string, archived: boolean) => Result;
  deleteAccount: (id: string) => Result;
  reconcile: (accountId: string, countedPaisa: number) => Result<{ diff: number }>;
  /** Make the account show what you really have by correcting its starting balance. Records no transaction. */
  fixStartingBalance: (accountId: string, actualPaisa: number) => Result<{ diff: number }>;

  addCategory: (c: { name: string; kind: 'expense' | 'income'; bucket: Bucket | null; keywords: string[] }) => Result;
  updateCategory: (id: string, patch: Partial<Pick<FinCategory, 'name' | 'bucket' | 'keywords' | 'archived'>>) => Result;

  addGoal: (g: Omit<FinGoal, 'id' | 'archived'>) => Result;
  updateGoal: (id: string, patch: Partial<Omit<FinGoal, 'id'>>) => Result;
  contribute: (goalId: string, c: { fromAccountId: string; toAccountId: string; amountPaisa: number; occurredAt: string }) => Result;

  addLoan: (l: Omit<FinLoan, 'id' | 'archived'> & { receivedInto?: string | null }) => Result;
  updateLoan: (id: string, patch: Partial<Omit<FinLoan, 'id'>>) => Result;
  payLoan: (loanId: string, p: { accountId: string; amountPaisa: number; occurredAt: string; note?: string | null }) => Result;
  archiveLoan: (id: string, archived: boolean) => Result;
  deleteLoan: (id: string) => Result;

  addReceivable: (r: Omit<FinReceivable, 'id' | 'archived' | 'writtenOffPaisa'> & { lentFrom?: string | null }) => Result;
  updateReceivable: (id: string, patch: Partial<Omit<FinReceivable, 'id'>>) => Result;
  collect: (recId: string, p: { accountId: string; amountPaisa: number; occurredAt: string; note?: string | null }) => Result;
  writeOffReceivable: (id: string) => Result;
  archiveReceivable: (id: string, archived: boolean) => Result;
  deleteReceivable: (id: string) => Result;

  addGapItem: (g: { kind: 'resource' | 'option'; title: string; expectedPaisa: number; note?: string | null }) => Result;
  updateGapItem: (id: string, patch: Partial<Pick<FinGapItem, 'kind' | 'title' | 'expectedPaisa' | 'note' | 'done'>>) => Result;
  deleteGapItem: (id: string) => Result;

  saveSettings: (patch: Partial<FinSettings>) => Result;
}

let pendingWrites = 0;
let loading: Promise<void> | null = null;

export const useFinanceStore = create<FinanceState>()((set, get) => {
  const userId = () => useBrainStore.getState().userId;

  /** The UI is already updated; if the database refuses, show why and reload the truth. */
  const persist = async (what: string, op: () => PromiseLike<{ error: { message: string } | null }>) => {
    pendingWrites++;
    try {
      const { error } = await op();
      if (error) throw error;
    } catch (e) {
      set({ notice: `Couldn\u2019t save ${what}: ${msg(e)}. Your data was reloaded from the server.` });
      await get().load(true);
    } finally {
      pendingWrites--;
    }
  };

  const ctx = (editingId?: string) => ({ accounts: get().accounts, categories: get().categories, goals: get().goals, loans: get().loans, receivables: get().receivables, txs: get().txs, editingId });
  const nextPos = (xs: { position: number }[]) => xs.reduce((m, x) => Math.max(m, x.position), -1) + 1;

  const bootstrap = async (uidv: string) => {
    // First visit: default categories, a Cash account, and a 50/30/20 plan. Everything is editable afterwards.
    const ignore = { onConflict: 'user_id,id', ignoreDuplicates: true } as const;
    const a = await supabase.from('fin_accounts').upsert({ user_id: uidv, id: 'acc-cash', name: 'Cash', type: 'cash', opening_paisa: 0, position: 0 }, ignore);
    if (a.error) throw a.error;
    const c = await supabase.from('fin_categories').upsert(
      DEFAULT_CATEGORIES.map((x) => ({ user_id: uidv, id: x.id, name: x.name, kind: x.kind, bucket: x.bucket, keywords: x.keywords, position: x.position })), ignore);
    if (c.error) throw c.error;
    const s = await supabase.from('fin_settings').upsert({ user_id: uidv, ...settingsRow({ ...DEFAULT_SETTINGS, defaultAccountId: 'acc-cash' }) }, { onConflict: 'user_id', ignoreDuplicates: true });
    if (s.error) throw s.error;
  };

  const doLoad = async () => {
    const uidv = userId();
    if (!uidv) return;
    if (get().status === 'idle') set({ status: 'loading' });
    try {
      const since = new Date(Date.now() - 30 * 86400e3).toISOString();
      const core = async () => {
        const [accounts, categories, settings] = await Promise.all([
          fetchAll<AccountRow>('fin_accounts', [['position', true], ['id', true]]),
          fetchAll<CategoryRow>('fin_categories', [['position', true], ['id', true]]),
          supabase.from('fin_settings').select('*').maybeSingle(),
        ]);
        if (settings.error) throw settings.error;
        return { accounts, categories, settings: settings.data as SettingsRow | null };
      };

      let { accounts, categories, settings } = await core();
      if (!settings && categories.length === 0) {
        await bootstrap(uidv);
        ({ accounts, categories, settings } = await core());
      }
      const [txs, trash, goals, loans, receivables, gapItems] = await Promise.all([
        fetchAll<TxRow>('fin_transactions', [['occurred_at', false], ['id', true]], (q) => q.is('deleted_at', null)),
        fetchAll<TxRow>('fin_transactions', [['deleted_at', false], ['id', true]], (q) => q.not('deleted_at', 'is', null).gte('deleted_at', since)),
        fetchAll<GoalRow>('fin_goals', [['created_at', true], ['id', true]]),
        fetchAll<LoanRow>('fin_loans', [['created_at', true], ['id', true]]),
        fetchAll<ReceivableRow>('fin_receivables', [['created_at', true], ['id', true]]),
        fetchAll<GapRow>('fin_gap_items', [['position', true], ['created_at', true], ['id', true]]),
      ]);

      set({
        status: 'ready', error: null, needsSchema: false, loadedAt: Date.now(),
        accounts: accounts.map(accountFrom), categories: categories.map(categoryFrom),
        txs: txs.map(txFrom).sort(byDateDesc), trash: trash.map(txFrom), goals: goals.map(goalFrom),
        loans: loans.map(loanFrom), receivables: receivables.map(receivableFrom), gapItems: gapItems.map(gapFrom),
        settings: settings ? settingsFrom(settings) : DEFAULT_SETTINGS,
      });
    } catch (e) {
      const m = msg(e);
      set({ status: get().status === 'ready' ? 'ready' : 'error', error: m, needsSchema: isMissingTable(m) });
      if (get().status === 'ready') set({ notice: `Couldn\u2019t refresh: ${m}` });
    }
  };

  return {
    status: 'idle', error: null, notice: null, needsSchema: false,
    accounts: [], categories: [], txs: [], trash: [], goals: [], loans: [], receivables: [], gapItems: [], settings: DEFAULT_SETTINGS, loadedAt: 0,

    load: async (force = false) => {
      if (loading) return loading;
      if (!force && get().status === 'ready') return;
      loading = doLoad().finally(() => { loading = null; });
      return loading;
    },
    dismissNotice: () => set({ notice: null }),

    /* ----- transactions ----- */
    addTx: (input) => {
      const uidv = userId();
      if (!uidv) return fail('You are signed out');
      const problem = validateTx(input, ctx());
      if (problem) return fail(problem);
      const tx: FinTx = { ...input, description: input.description.trim(), id: uid(), createdAt: new Date().toISOString(), deletedAt: null };
      set((s) => ({ txs: [...s.txs, tx].sort(byDateDesc) }));
      void persist('the transaction', () => supabase.from('fin_transactions').insert({ user_id: uidv, ...txRow(tx) }));
      return { ok: true, id: tx.id };
    },

    updateTx: (id, input) => {
      const old = get().txs.find((t) => t.id === id);
      if (!old) return fail('That transaction no longer exists');
      const problem = validateTx(input, ctx(id));
      if (problem) return fail(problem);
      const tx: FinTx = { ...old, ...input, description: input.description.trim() };
      set((s) => ({ txs: s.txs.map((t) => (t.id === id ? tx : t)).sort(byDateDesc) }));
      const { id: _id, ...fields } = txRow(tx);
      void _id;
      void persist('your edit', () => supabase.from('fin_transactions').update(fields).eq('id', id));
      return { ok: true };
    },

    deleteTx: (id) => {
      const t = get().txs.find((x) => x.id === id);
      if (!t) return fail('That transaction no longer exists');
      if (t.kind === 'expense' && get().txs.some((x) => isLive(x) && x.kind === 'refund' && x.refundOf === id)) {
        return fail('This expense has refunds. Delete the refunds first.');
      }
      const deletedAt = new Date().toISOString();
      set((s) => ({ txs: s.txs.filter((x) => x.id !== id), trash: [{ ...t, deletedAt }, ...s.trash] }));
      void persist('the deletion', () => supabase.from('fin_transactions').update({ deleted_at: deletedAt }).eq('id', id));
      return { ok: true };
    },

    restoreTx: (id) => {
      const t = get().trash.find((x) => x.id === id);
      if (!t) return fail('That transaction is no longer in Recently deleted');
      const live: FinTx = { ...t, deletedAt: null };
      const problem = validateTx(live, ctx(id));
      if (problem) return fail(`Can\u2019t restore: ${problem}`);
      set((s) => ({ trash: s.trash.filter((x) => x.id !== id), txs: [...s.txs, live].sort(byDateDesc) }));
      void persist('the restore', () => supabase.from('fin_transactions').update({ deleted_at: null }).eq('id', id));
      return { ok: true };
    },

    /* ----- accounts ----- */
    addAccount: ({ name, type, openingPaisa }) => {
      const uidv = userId();
      const clean = name.trim();
      if (!uidv) return fail('You are signed out');
      if (!clean) return fail('Give the account a name');
      if (get().accounts.some((a) => a.name.toLowerCase() === clean.toLowerCase() && !a.archived)) return fail('You already have an account with that name');
      const a: FinAccount = { id: uid(), name: clean, type, openingPaisa, position: nextPos(get().accounts), archived: false, lastCheckedAt: null, lastCheckedPaisa: null };
      set((s) => ({ accounts: [...s.accounts, a] }));
      void persist('the account', () => supabase.from('fin_accounts').insert({ user_id: uidv, id: a.id, name: a.name, type: a.type, opening_paisa: a.openingPaisa, position: a.position }));
      return { ok: true, id: a.id };
    },

    updateAccount: (id, patch) => {
      if (patch.name !== undefined && !patch.name.trim()) return fail('Give the account a name');
      set((s) => ({ accounts: s.accounts.map((a) => (a.id === id ? { ...a, ...patch, name: patch.name?.trim() ?? a.name } : a)) }));
      const row: Record<string, unknown> = {};
      if (patch.name !== undefined) row.name = patch.name.trim();
      if (patch.type !== undefined) row.type = patch.type;
      if (patch.openingPaisa !== undefined) row.opening_paisa = patch.openingPaisa;
      void persist('the account', () => supabase.from('fin_accounts').update(row).eq('id', id));
      return { ok: true };
    },

    setAccountArchived: (id, archived) => {
      const bal = accountBalances(get().accounts, get().txs).get(id) ?? 0;
      if (archived && bal !== 0) return fail('Move this account\u2019s balance elsewhere (or reconcile it to zero) before archiving it.');
      if (archived && get().settings.defaultAccountId === id) return fail('This is your default account. Choose another default first.');
      set((s) => ({ accounts: s.accounts.map((a) => (a.id === id ? { ...a, archived } : a)) }));
      void persist('the account', () => supabase.from('fin_accounts').update({ archived }).eq('id', id));
      return { ok: true };
    },

    deleteAccount: (id) => {
      const used = [...get().txs, ...get().trash].some((t) => t.accountId === id || t.toAccountId === id);
      if (used) return fail('This account has transactions, so it can\u2019t be deleted. Archive it instead.');
      if (get().goals.some((g) => g.accountId === id && !g.archived)) return fail('A savings goal keeps its money here. Change the goal first.');
      if (get().settings.defaultAccountId === id) return fail('This is your default account. Choose another default first.');
      set((s) => ({ accounts: s.accounts.filter((a) => a.id !== id) }));
      void persist('the deletion', () => supabase.from('fin_accounts').delete().eq('id', id));
      return { ok: true };
    },

    reconcile: (accountId, countedPaisa) => {
      const acc = get().accounts.find((a) => a.id === accountId);
      if (!acc) return fail('Account not found');
      const ledger = accountBalances(get().accounts, get().txs).get(accountId) ?? 0;
      const diff = countedPaisa - ledger;
      const now = new Date().toISOString();
      if (diff !== 0) {
        const r = get().addTx({
          kind: 'adjustment', amountPaisa: diff, occurredAt: now, description: 'Balance reconciliation', accountId,
          toAccountId: null, categoryId: null, bucket: null, refundOf: null, goalId: null, loanId: null, receivableId: null,
          note: `Counted ${countedPaisa / 100}, ledger had ${ledger / 100}`,
        });
        if (!r.ok) return r;
      }
      set((s) => ({ accounts: s.accounts.map((a) => (a.id === accountId ? { ...a, lastCheckedAt: now, lastCheckedPaisa: countedPaisa } : a)) }));
      void persist('the reconciliation', () => supabase.from('fin_accounts').update({ last_checked_at: now, last_checked_paisa: countedPaisa }).eq('id', accountId));
      return { ok: true, diff };
    },

    fixStartingBalance: (accountId, actualPaisa) => {
      const acc = get().accounts.find((a) => a.id === accountId);
      if (!acc) return fail('Account not found');
      if (!Number.isSafeInteger(actualPaisa) || Math.abs(actualPaisa) > MAX_PAISA) return fail('That amount is not valid');
      const ledger = accountBalances(get().accounts, get().txs).get(accountId) ?? 0;
      const diff = actualPaisa - ledger;
      const openingPaisa = acc.openingPaisa + diff;
      if (Math.abs(openingPaisa) > MAX_PAISA) return fail('That amount is not valid');
      const now = new Date().toISOString();
      // Only the starting balance moves, so every past transaction stays exactly as recorded.
      set((s) => ({ accounts: s.accounts.map((a) => (a.id === accountId ? { ...a, openingPaisa, lastCheckedAt: now, lastCheckedPaisa: actualPaisa } : a)) }));
      void persist('the balance', () => supabase.from('fin_accounts').update({ opening_paisa: openingPaisa, last_checked_at: now, last_checked_paisa: actualPaisa }).eq('id', accountId));
      return { ok: true, diff };
    },

    /* ----- categories ----- */
    addCategory: ({ name, kind, bucket, keywords }) => {
      const uidv = userId();
      const clean = name.trim();
      if (!uidv) return fail('You are signed out');
      if (!clean) return fail('Give the category a name');
      if (kind === 'expense' && !bucket) return fail('Choose Needs, Wants or Savings');
      if (get().categories.some((c) => c.kind === kind && !c.archived && c.name.toLowerCase() === clean.toLowerCase())) return fail('That category already exists');
      const cat: FinCategory = { id: `cat-${uid().slice(0, 8)}`, name: clean, kind, bucket: kind === 'income' ? null : bucket, keywords: normKeywords(keywords), position: nextPos(get().categories), archived: false };
      set((s) => ({ categories: [...s.categories, cat] }));
      void persist('the category', () => supabase.from('fin_categories').insert({ user_id: uidv, id: cat.id, name: cat.name, kind: cat.kind, bucket: cat.bucket, keywords: cat.keywords, position: cat.position }));
      return { ok: true };
    },

    updateCategory: (id, patch) => {
      const cur = get().categories.find((c) => c.id === id);
      if (!cur) return fail('Category not found');
      if (patch.name !== undefined && !patch.name.trim()) return fail('Give the category a name');
      const next = { ...cur, ...patch, name: patch.name?.trim() ?? cur.name, keywords: patch.keywords ? normKeywords(patch.keywords) : cur.keywords };
      set((s) => ({ categories: s.categories.map((c) => (c.id === id ? next : c)) }));
      void persist('the category', () => supabase.from('fin_categories').update({ name: next.name, bucket: next.bucket, keywords: next.keywords, archived: next.archived }).eq('id', id));
      return { ok: true };
    },

    /* ----- goals ----- */
    addGoal: (g) => {
      const uidv = userId();
      if (!uidv) return fail('You are signed out');
      if (!g.name.trim()) return fail('Give the goal a name');
      if (g.targetPaisa <= 0) return fail('The target must be more than 0');
      const goal: FinGoal = { ...g, name: g.name.trim(), id: uid(), archived: false };
      set((s) => ({ goals: [...s.goals, goal] }));
      void persist('the goal', () => supabase.from('fin_goals').insert({ user_id: uidv, id: goal.id, name: goal.name, target_paisa: goal.targetPaisa, deadline: goal.deadline, planned_monthly_paisa: goal.plannedMonthlyPaisa, account_id: goal.accountId }));
      return { ok: true };
    },

    updateGoal: (id, patch) => {
      const cur = get().goals.find((g) => g.id === id);
      if (!cur) return fail('Goal not found');
      const next = { ...cur, ...patch };
      if (!next.name.trim()) return fail('Give the goal a name');
      if (next.targetPaisa <= 0) return fail('The target must be more than 0');
      set((s) => ({ goals: s.goals.map((g) => (g.id === id ? next : g)) }));
      void persist('the goal', () => supabase.from('fin_goals').update({ name: next.name.trim(), target_paisa: next.targetPaisa, deadline: next.deadline, planned_monthly_paisa: next.plannedMonthlyPaisa, account_id: next.accountId, archived: next.archived }).eq('id', id));
      return { ok: true };
    },

    /** A contribution is a transfer into the goal's account: money moves, nothing is spent. */
    contribute: (goalId, c) => {
      const goal = get().goals.find((g) => g.id === goalId);
      if (!goal) return fail('Goal not found');
      const r = get().addTx({
        kind: 'transfer', amountPaisa: c.amountPaisa, occurredAt: c.occurredAt, description: `Goal: ${goal.name}`,
        accountId: c.fromAccountId, toAccountId: c.toAccountId, categoryId: null, bucket: 'savings', refundOf: null, goalId, loanId: null, receivableId: null, note: null,
      });
      return r.ok ? { ok: true } : r;
    },

    /* ----- loans ----- */
    addLoan: ({ receivedInto, ...l }) => {
      const uidv = userId();
      if (!uidv) return fail('You are signed out');
      const problem = validateLoan(l);
      if (problem) return fail(problem);
      const loan: FinLoan = { ...l, name: l.name.trim(), lender: l.lender?.trim() || null, note: l.note?.trim() || null, id: uid(), archived: false };
      // All or nothing: check the cash entry too before anything is saved.
      const received: TxInput | null = receivedInto ? {
        kind: 'loan_received', amountPaisa: loan.openingOutstandingPaisa, occurredAt: localNoon(loan.openingDate), description: `Loan received: ${loan.name}`,
        accountId: receivedInto, toAccountId: null, categoryId: null, bucket: null, refundOf: null, goalId: null, loanId: loan.id, receivableId: null, note: null,
      } : null;
      if (received) {
        const bad = validateTx(received, { ...ctx(), loans: [...get().loans, loan] });
        if (bad) return fail(bad);
      }
      set((s) => ({ loans: [...s.loans, loan] }));
      void persist('the loan', () => supabase.from('fin_loans').insert({
        user_id: uidv, id: loan.id, name: loan.name, lender: loan.lender, opening_outstanding_paisa: loan.openingOutstandingPaisa,
        kind: loan.kind, opening_date: loan.openingDate, emi_paisa: loan.emiPaisa, first_due_on: loan.firstDueOn, return_by: loan.returnBy, emis_paid_before: loan.emisPaidBefore,
        original_paisa: loan.originalPaisa, note: loan.note,
      }));
      if (received) {
        // A brand-new loan: the borrowed money arrived in an account. This is cash, not income.
        const r = get().addTx(received);
        if (!r.ok) return r;
      }
      return { ok: true };
    },

    updateLoan: (id, patch) => {
      const cur = get().loans.find((l) => l.id === id);
      if (!cur) return fail('Loan not found');
      if (patch.kind && patch.kind !== cur.kind) return fail('A loan\u2019s type cannot be changed. Add a new loan instead.');
      const next: FinLoan = { ...cur, ...patch };
      const problem = validateLoan(next);
      if (problem) return fail(problem);
      const early = get().txs.find((t) => t.kind === 'loan_payment' && t.loanId === id && dayKeyOf(t.occurredAt) < next.openingDate);
      if (early) return fail(`A payment on ${dayKeyOf(early.occurredAt)} is before that date. Delete it or keep the earlier date.`);
      set((s) => ({ loans: s.loans.map((l) => (l.id === id ? next : l)) }));
      void persist('the loan', () => supabase.from('fin_loans').update({
        name: next.name.trim(), lender: next.lender, opening_outstanding_paisa: next.openingOutstandingPaisa, opening_date: next.openingDate,
        emi_paisa: next.emiPaisa, first_due_on: next.firstDueOn, return_by: next.returnBy, emis_paid_before: next.emisPaidBefore, original_paisa: next.originalPaisa, note: next.note, archived: next.archived,
      }).eq('id', id));
      return { ok: true };
    },

    /** An EMI is a loan payment: money leaves the account and the debt shrinks. It is never an expense. */
    payLoan: (loanId, p) => {
      const loan = get().loans.find((l) => l.id === loanId);
      if (!loan) return fail('Loan not found');
      const r = get().addTx({
        kind: 'loan_payment', amountPaisa: p.amountPaisa, occurredAt: p.occurredAt, description: loan.kind === 'bank' ? `EMI: ${loan.name}` : `Paid back: ${loan.name}`, accountId: p.accountId,
        toAccountId: null, categoryId: null, bucket: null, refundOf: null, goalId: null, loanId, receivableId: null, note: p.note?.trim() || null,
      });
      return r.ok ? { ok: true } : r;
    },

    archiveLoan: (id, archived) => {
      const loan = get().loans.find((l) => l.id === id);
      if (!loan) return fail('Loan not found');
      if (archived) {
        const paid = get().txs.filter((t) => t.kind === 'loan_payment' && t.loanId === id && dayKeyOf(t.occurredAt) >= loan.openingDate).reduce((s, t) => s + t.amountPaisa, 0);
        if (loan.openingOutstandingPaisa - paid > 0) return fail('This loan still has a balance. Archive it once it is paid off.');
      }
      set((s) => ({ loans: s.loans.map((l) => (l.id === id ? { ...l, archived } : l)) }));
      void persist('the loan', () => supabase.from('fin_loans').update({ archived }).eq('id', id));
      return { ok: true };
    },

    deleteLoan: (id) => {
      if ([...get().txs, ...get().trash].some((t) => t.loanId === id)) return fail('This loan has payments recorded. Archive it once it is paid off instead.');
      set((s) => ({ loans: s.loans.filter((l) => l.id !== id) }));
      void persist('the deletion', () => supabase.from('fin_loans').delete().eq('id', id));
      return { ok: true };
    },

    /* ----- receivables ----- */
    addReceivable: ({ lentFrom, ...r }) => {
      const uidv = userId();
      if (!uidv) return fail('You are signed out');
      const problem = validateReceivable({ ...r, writtenOffPaisa: 0 });
      if (problem) return fail(problem);
      const rec: FinReceivable = { ...r, person: r.person.trim(), note: r.note?.trim() || null, writtenOffPaisa: 0, id: uid(), archived: false };
      // All or nothing: check the cash entry too before anything is saved.
      const lend: TxInput | null = lentFrom ? {
        kind: 'lend', amountPaisa: rec.amountPaisa, occurredAt: localNoon(rec.lentOn), description: `Lent to ${rec.person}`, accountId: lentFrom,
        toAccountId: null, categoryId: null, bucket: null, refundOf: null, goalId: null, loanId: null, receivableId: rec.id, note: null,
      } : null;
      if (lend) {
        const bad = validateTx(lend, { ...ctx(), receivables: [...get().receivables, rec] });
        if (bad) return fail(bad);
      }
      set((s) => ({ receivables: [...s.receivables, rec] }));
      void persist('the receivable', () => supabase.from('fin_receivables').insert({
        user_id: uidv, id: rec.id, person: rec.person, amount_paisa: rec.amountPaisa, lent_on: rec.lentOn, expected_on: rec.expectedOn, note: rec.note,
      }));
      if (lend) {
        // Only when the cash really left an account just now. Money lent before you started tracking is already out of your balances.
        const t = get().addTx(lend);
        if (!t.ok) return t;
      }
      return { ok: true };
    },

    updateReceivable: (id, patch) => {
      const cur = get().receivables.find((r) => r.id === id);
      if (!cur) return fail('Receivable not found');
      const next: FinReceivable = { ...cur, ...patch };
      const problem = validateReceivable(next);
      if (problem) return fail(problem);
      const repaid = get().txs.filter((t) => t.kind === 'collection' && t.receivableId === id).reduce((s, t) => s + t.amountPaisa, 0);
      if (next.amountPaisa - next.writtenOffPaisa < repaid) return fail('The amount cannot be less than what has already been repaid');
      set((s) => ({ receivables: s.receivables.map((r) => (r.id === id ? next : r)) }));
      void persist('the receivable', () => supabase.from('fin_receivables').update({
        person: next.person.trim(), amount_paisa: next.amountPaisa, lent_on: next.lentOn, expected_on: next.expectedOn, note: next.note, written_off_paisa: next.writtenOffPaisa, archived: next.archived,
      }).eq('id', id));
      return { ok: true };
    },

    /** A repayment is cash coming back, not income. */
    collect: (recId, p) => {
      const rec = get().receivables.find((r) => r.id === recId);
      if (!rec) return fail('Receivable not found');
      const r = get().addTx({
        kind: 'collection', amountPaisa: p.amountPaisa, occurredAt: p.occurredAt, description: `Repaid by ${rec.person}`, accountId: p.accountId,
        toAccountId: null, categoryId: null, bucket: null, refundOf: null, goalId: null, loanId: null, receivableId: recId, note: p.note?.trim() || null,
      });
      return r.ok ? { ok: true } : r;
    },

    writeOffReceivable: (id) => {
      const rec = get().receivables.find((r) => r.id === id);
      if (!rec) return fail('Receivable not found');
      const remaining = receivableStatus(rec, get().txs).remaining;
      if (remaining === 0) return fail('Nothing is left to write off');
      return get().updateReceivable(id, { writtenOffPaisa: rec.writtenOffPaisa + remaining });
    },

    archiveReceivable: (id, archived) => {
      const rec = get().receivables.find((r) => r.id === id);
      if (!rec) return fail('Receivable not found');
      if (archived && receivableStatus(rec, get().txs).remaining > 0) return fail('Something is still owed. Record the repayment or write it off first.');
      set((s) => ({ receivables: s.receivables.map((r) => (r.id === id ? { ...r, archived } : r)) }));
      void persist('the receivable', () => supabase.from('fin_receivables').update({ archived }).eq('id', id));
      return { ok: true };
    },

    deleteReceivable: (id) => {
      if ([...get().txs, ...get().trash].some((t) => t.receivableId === id)) return fail('This has money movements recorded. Write it off or archive it instead.');
      set((s) => ({ receivables: s.receivables.filter((r) => r.id !== id) }));
      void persist('the deletion', () => supabase.from('fin_receivables').delete().eq('id', id));
      return { ok: true };
    },

    /* ----- ways to cover the income gap ----- */
    addGapItem: ({ kind, title, expectedPaisa, note }) => {
      const uidv = userId();
      if (!uidv) return fail('You are signed out');
      if (!title.trim()) return fail('Give it a name');
      if (!Number.isSafeInteger(expectedPaisa) || expectedPaisa < 0 || expectedPaisa > MAX_PAISA) return fail('The amount is not valid');
      const item: FinGapItem = { id: uid(), kind, title: title.trim(), expectedPaisa, note: note?.trim() || null, done: false, position: nextPos(get().gapItems) };
      set((s) => ({ gapItems: [...s.gapItems, item] }));
      void persist('the item', () => supabase.from('fin_gap_items').insert({ user_id: uidv, id: item.id, kind: item.kind, title: item.title, expected_paisa: item.expectedPaisa, note: item.note, done: false, position: item.position }));
      return { ok: true };
    },

    updateGapItem: (id, patch) => {
      const cur = get().gapItems.find((g) => g.id === id);
      if (!cur) return fail('That item no longer exists');
      const next = { ...cur, ...patch, title: (patch.title ?? cur.title).trim() };
      if (!next.title) return fail('Give it a name');
      if (!Number.isSafeInteger(next.expectedPaisa) || next.expectedPaisa < 0 || next.expectedPaisa > MAX_PAISA) return fail('The amount is not valid');
      set((s) => ({ gapItems: s.gapItems.map((g) => (g.id === id ? next : g)) }));
      void persist('the item', () => supabase.from('fin_gap_items').update({ kind: next.kind, title: next.title, expected_paisa: next.expectedPaisa, note: next.note?.trim() || null, done: next.done }).eq('id', id));
      return { ok: true };
    },

    deleteGapItem: (id) => {
      set((s) => ({ gapItems: s.gapItems.filter((g) => g.id !== id) }));
      void persist('the deletion', () => supabase.from('fin_gap_items').delete().eq('id', id));
      return { ok: true };
    },

    /* ----- plan ----- */
    saveSettings: (patch) => {
      const uidv = userId();
      if (!uidv) return fail('You are signed out');
      const next = { ...get().settings, ...patch };
      const pcts = [next.needsPct, next.wantsPct, next.savingsPct];
      if (!pcts.every((p) => Number.isInteger(p) && p >= 0 && p <= 100)) return fail('Percentages must be whole numbers from 0 to 100');
      if (pcts.reduce((a, b) => a + b, 0) !== 100) return fail(`Needs, Wants and Savings must add up to 100% (now ${pcts.reduce((a, b) => a + b, 0)}%)`);
      if (next.incomeTargetPaisa < 0 || next.expectedIncomePaisa < 0) return fail('Income cannot be negative');
      if (!['needs', 'wants', 'none'].includes(next.debtBucket)) return fail('Choose where loan payments count in your budget');
      set({ settings: next });
      void persist('the plan', () => supabase.from('fin_settings').upsert({ user_id: uidv, ...settingsRow(next) }, { onConflict: 'user_id' }));
      return { ok: true };
    },
  };
});
