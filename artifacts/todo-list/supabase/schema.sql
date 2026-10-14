-- Run this once in the Supabase SQL Editor for the project used by this app.
create table if not exists public.tasks (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tasks enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.tasks to authenticated;

drop policy if exists "todo tasks are visible to their owner" on public.tasks;
create policy "todo tasks are visible to their owner"
  on public.tasks for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "todo tasks can be added by their owner" on public.tasks;
create policy "todo tasks can be added by their owner"
  on public.tasks for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "todo tasks can be changed by their owner" on public.tasks;
create policy "todo tasks can be changed by their owner"
  on public.tasks for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "todo tasks can be removed by their owner" on public.tasks;
create policy "todo tasks can be removed by their owner"
  on public.tasks for delete to authenticated
  using ((select auth.uid()) = user_id);
