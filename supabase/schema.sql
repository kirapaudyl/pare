-- Pare schema. Run once in Supabase: SQL Editor -> New query -> paste -> Run.
-- Every row belongs to one user; Row Level Security makes each user see only their own rows.

create table if not exists public.domains (
  user_id  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id       text not null,
  name     text not null,
  color    text not null,
  position int  not null default 0,
  primary key (user_id, id)
);

create table if not exists public.tasks (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id         text not null,
  title      text not null,
  domain_id  text not null,
  status     text not null default 'pending' check (status in ('pending', 'completed')),
  date_added timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.resources (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id         text not null,
  title      text not null,
  platform   text not null default 'Web',
  url        text not null,
  domain_id  text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.journal (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id         text not null,
  title      text,
  content    text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.activity_days (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day     date not null,
  primary key (user_id, day)
);

-- Row Level Security: a signed-in user can only touch rows where user_id is their own id.
do $$
declare t text;
begin
  foreach t in array array['domains','tasks','resources','journal','activity_days'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format(
      'create policy "own rows" on public.%I for all to authenticated
         using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t);
  end loop;
end $$;

-- Realtime: lets an open tab pick up changes made in another tab or device.
do $$
declare t text;
begin
  foreach t in array array['domains','tasks','resources','journal','activity_days'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
