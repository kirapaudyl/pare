-- Run once in Supabase: SQL Editor -> New query -> paste -> Run. Safe to re-run.

-- One row per user: forex alert target + which domains are spotlighted on the dashboard.
create table if not exists public.user_settings (
  user_id      uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  forex_target numeric,
  featured     jsonb not null default '[]'::jsonb,
  updated_at   timestamptz not null default now()
);

-- Daily snapshot of the Nabil USD rate, so you can see the trend.
create table if not exists public.forex_rates (
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day           date not null,
  source        text not null default 'nabil',
  cash_buy      numeric,
  non_cash_buy  numeric,
  sell          numeric not null,
  primary key (user_id, day, source)
);

do $$
declare t text;
begin
  foreach t in array array['user_settings','forex_rates'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format(
      'create policy "own rows" on public.%I for all to authenticated
         using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t);
  end loop;
end $$;
