-- Pare Finance module (accounts, ledger, budget, goals, loans, receivables).
-- Run in Supabase: SQL Editor -> New query -> paste -> Run.
-- SAFE TO RE-RUN, and it also upgrades a database that already ran an earlier version of this file.
--
-- Money is stored as integer paisa (1 Rs = 100 paisa) in bigint columns: no floating-point rounding, ever.
-- fin_transactions is the single source of truth. Balances, budgets, goals, loan and receivable balances
-- are all derived from it, so nothing can drift out of step.

create table if not exists public.fin_accounts (
  user_id            uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id                 text not null,
  name               text not null check (length(btrim(name)) between 1 and 60),
  type               text not null check (type in ('cash', 'bank', 'wallet', 'card')),
  opening_paisa      bigint not null default 0 check (abs(opening_paisa) <= 1000000000000),
  position           int not null default 0,
  archived           boolean not null default false,
  last_checked_at    timestamptz,
  last_checked_paisa bigint,
  created_at         timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.fin_categories (
  user_id  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id       text not null,
  name     text not null check (length(btrim(name)) between 1 and 60),
  kind     text not null check (kind in ('expense', 'income')),
  bucket   text check (bucket in ('needs', 'wants', 'savings')),
  keywords text[] not null default '{}',
  position int not null default 0,
  archived boolean not null default false,
  primary key (user_id, id),
  check ((kind = 'expense' and bucket is not null) or (kind = 'income' and bucket is null))
);

-- Loans you are repaying. 'bank' loans have an EMI and due dates. 'personal' loans (from a friend or family) have neither:
-- you repay whatever you can, whenever, and an optional "return by" date is only a reminder.
create table if not exists public.fin_loans (
  user_id                   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id                        text not null,
  name                      text not null check (length(btrim(name)) between 1 and 80),
  lender                    text,
  kind                      text not null default 'bank',
  opening_outstanding_paisa bigint not null check (opening_outstanding_paisa > 0 and opening_outstanding_paisa <= 1000000000000),
  opening_date              date not null,
  emi_paisa                 bigint check (emi_paisa is null or (emi_paisa > 0 and emi_paisa <= 1000000000000)),
  first_due_on              date check (first_due_on is null or first_due_on >= opening_date),
  return_by                 date,
  emis_paid_before          int not null default 0 check (emis_paid_before between 0 and 600),
  original_paisa            bigint check (original_paisa is null or original_paisa >= opening_outstanding_paisa),
  note                      text check (length(note) <= 500),
  archived                  boolean not null default false,
  created_at                timestamptz not null default now(),
  primary key (user_id, id)
);

-- Money other people owe you. An asset in net worth, but never available cash until it is collected.
create table if not exists public.fin_receivables (
  user_id             uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id                  text not null,
  person              text not null check (length(btrim(person)) between 1 and 80),
  amount_paisa        bigint not null check (amount_paisa > 0 and amount_paisa <= 1000000000000),
  lent_on             date not null,
  expected_on         date check (expected_on is null or expected_on >= lent_on),
  note                text check (length(note) <= 500),
  written_off_paisa   bigint not null default 0 check (written_off_paisa >= 0 and written_off_paisa <= amount_paisa),
  archived            boolean not null default false,
  created_at          timestamptz not null default now(),
  primary key (user_id, id)
);

-- Upgrade an existing fin_loans: add the new columns and let EMI / due date be empty for personal loans.
alter table public.fin_loans add column if not exists kind      text not null default 'bank';
alter table public.fin_loans add column if not exists return_by date;
alter table public.fin_loans alter column emi_paisa    drop not null;
alter table public.fin_loans alter column first_due_on drop not null;
alter table public.fin_loans drop constraint if exists fin_loans_kind_ck;
alter table public.fin_loans drop constraint if exists fin_loans_shape_ck;
alter table public.fin_loans drop constraint if exists fin_loans_return_by_ck;
alter table public.fin_loans drop constraint if exists fin_loans_return_only_personal_ck;
alter table public.fin_loans add constraint fin_loans_kind_ck check (kind in ('bank', 'personal'));
-- A bank loan always has an EMI and a next due date; a personal loan never does.
alter table public.fin_loans add constraint fin_loans_shape_ck check (
  (kind = 'bank' and emi_paisa is not null and first_due_on is not null) or (kind = 'personal' and emi_paisa is null and first_due_on is null)
);
alter table public.fin_loans add constraint fin_loans_return_by_ck check (return_by is null or return_by >= opening_date);
alter table public.fin_loans add constraint fin_loans_return_only_personal_ck check (return_by is null or kind = 'personal');

create table if not exists public.fin_transactions (
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id             text not null,
  kind           text not null,
  amount_paisa   bigint not null,
  occurred_at    timestamptz not null,
  description    text not null default '',
  account_id     text not null,
  to_account_id  text,
  category_id    text,
  bucket         text,
  refund_of      text,
  goal_id        text,
  note           text,
  created_at     timestamptz not null default now(),
  deleted_at     timestamptz,
  primary key (user_id, id)
);
alter table public.fin_transactions add column if not exists loan_id       text;
alter table public.fin_transactions add column if not exists receivable_id text;
create index if not exists fin_tx_user_time on public.fin_transactions (user_id, occurred_at desc);

-- All rules on the ledger live here as named checks. Dropping every old check first is what lets this script
-- upgrade an earlier install (whose checks were unnamed and did not know about loans and receivables).
do $$
declare c record;
begin
  for c in select conname from pg_constraint where conrelid = 'public.fin_transactions'::regclass and contype = 'c' loop
    execute format('alter table public.fin_transactions drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.fin_transactions
  add constraint fin_tx_kind_ck check (kind in ('expense', 'income', 'transfer', 'refund', 'adjustment', 'loan_payment', 'loan_received', 'lend', 'collection')),
  add constraint fin_tx_amount_ck check (abs(amount_paisa) <= 1000000000000),
  -- amounts are positive; only reconciliation adjustments are signed
  add constraint fin_tx_sign_ck check ((kind = 'adjustment' and amount_paisa <> 0) or (kind <> 'adjustment' and amount_paisa > 0)),
  add constraint fin_tx_desc_ck check (length(description) <= 200),
  add constraint fin_tx_note_ck check (note is null or length(note) <= 500),
  add constraint fin_tx_bucket_ck check (bucket is null or bucket in ('needs', 'wants', 'savings')),
  -- a transfer has two different accounts; nothing else has a destination
  add constraint fin_tx_transfer_ck check ((kind = 'transfer') = (to_account_id is not null)),
  add constraint fin_tx_transfer_diff_ck check (to_account_id is null or to_account_id <> account_id),
  add constraint fin_tx_expense_bucket_ck check (kind <> 'expense' or bucket is not null),
  add constraint fin_tx_goal_ck check (goal_id is null or kind = 'transfer'),
  add constraint fin_tx_refund_ck check (refund_of is null or kind = 'refund'),
  -- loan and receivable movements always point at their loan or person, and are never categorised
  add constraint fin_tx_loan_ck check ((kind in ('loan_payment', 'loan_received')) = (loan_id is not null)),
  add constraint fin_tx_receivable_ck check ((kind in ('lend', 'collection')) = (receivable_id is not null)),
  add constraint fin_tx_debt_plain_ck check (kind not in ('loan_payment', 'loan_received', 'lend', 'collection') or (category_id is null and bucket is null));

-- Ways to close the gap between your monthly income target and what you have earned: a "resource" (something you already
-- have or are owed) or an "option" (something you could do), with the amount you expect it to bring in.
create table if not exists public.fin_gap_items (
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id             text not null,
  kind           text not null check (kind in ('resource', 'option')),
  title          text not null check (length(btrim(title)) between 1 and 120),
  expected_paisa bigint not null default 0 check (expected_paisa >= 0 and expected_paisa <= 1000000000000),
  note           text check (note is null or length(note) <= 500),
  done           boolean not null default false,
  position       int not null default 0,
  created_at     timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.fin_goals (
  user_id               uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id                    text not null,
  name                  text not null check (length(btrim(name)) between 1 and 80),
  target_paisa          bigint not null check (target_paisa > 0 and target_paisa <= 1000000000000),
  deadline              date,
  planned_monthly_paisa bigint not null default 0 check (planned_monthly_paisa >= 0),
  account_id            text,
  archived              boolean not null default false,
  created_at            timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.fin_settings (
  user_id               uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  income_target_paisa   bigint not null default 0 check (income_target_paisa >= 0),
  expected_income_paisa bigint not null default 0 check (expected_income_paisa >= 0),
  needs_pct             int not null default 50 check (needs_pct between 0 and 100),
  wants_pct             int not null default 30 check (wants_pct between 0 and 100),
  savings_pct           int not null default 20 check (savings_pct between 0 and 100),
  budget_base           text not null default 'expected' check (budget_base in ('target', 'expected', 'actual')),
  default_account_id    text,
  updated_at            timestamptz not null default now(),
  check (needs_pct + wants_pct + savings_pct = 100)
);
-- Which budget bucket loan payments count against. 'none' keeps them out of the 50/30/20 entirely.
alter table public.fin_settings add column if not exists debt_bucket text not null default 'needs';
alter table public.fin_settings drop constraint if exists fin_settings_debt_bucket_ck;
alter table public.fin_settings add constraint fin_settings_debt_bucket_ck check (debt_bucket in ('needs', 'wants', 'none'));

-- Row Level Security: every row belongs to one user, and each user only ever sees their own.
do $$
declare t text;
begin
  foreach t in array array['fin_accounts', 'fin_categories', 'fin_transactions', 'fin_goals', 'fin_settings', 'fin_loans', 'fin_receivables', 'fin_gap_items'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format(
      'create policy "own rows" on public.%I for all to authenticated
         using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t);
  end loop;
end $$;
