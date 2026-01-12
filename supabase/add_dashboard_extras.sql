-- Adiciona colunas JSONB em dashboard_settings para persistir novos campos editáveis
-- (comerciais, faixas de vencimento, clientes do borderô, acionamento detalhado, agendadas etc.)
-- Rode este SQL no Supabase (Database -> SQL Editor) 1 vez.

alter table public.dashboard_settings
  add column if not exists commercials jsonb not null default '[]'::jsonb,
  add column if not exists faixas jsonb not null default '[]'::jsonb,
  add column if not exists clientes jsonb not null default '[]'::jsonb,
  add column if not exists acionamento_detalhado jsonb not null default '[]'::jsonb,
  add column if not exists agendadas_mes jsonb not null default '[]'::jsonb,
  add column if not exists agendadas_dia jsonb not null default '[]'::jsonb,
  add column if not exists trend_data jsonb not null default '[]'::jsonb;

-- (Opcional) garante que o registro default exista.
insert into public.dashboard_settings (key, meta_mes, meta_dia, atingido_mes, atingido_dia, updated_at)
values ('default', 0, 0, 0, 0, now())
on conflict (key) do nothing;
