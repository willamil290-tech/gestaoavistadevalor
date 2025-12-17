-- Daily analytics table (tendência do dia + ontem vs hoje)
-- Execute this in Supabase SQL Editor once.

create extension if not exists "pgcrypto";

create table if not exists public.daily_events (
  id uuid primary key default gen_random_uuid(),
  business_date date not null,
  scope text not null check (scope in ('empresas','leads','bordero')),
  kind text not null check (kind in ('bulk','single','reset','undo')),
  member_id text null,
  delta_morning integer not null default 0,
  delta_afternoon integer not null default 0,
  delta_bordero_dia numeric not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists daily_events_business_date_idx on public.daily_events(business_date);
create index if not exists daily_events_created_at_idx on public.daily_events(created_at);

alter table public.daily_events enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'daily_events' and policyname = 'Allow read daily_events'
  ) then
    create policy "Allow read daily_events"
      on public.daily_events
      for select
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'daily_events' and policyname = 'Allow insert daily_events'
  ) then
    create policy "Allow insert daily_events"
      on public.daily_events
      for insert
      with check (true);
  end if;
end$$;
