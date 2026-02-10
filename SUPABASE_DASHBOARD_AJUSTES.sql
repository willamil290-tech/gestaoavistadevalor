-- Adiciona campos de ajuste (sincronizados) para corrigir valores do mês/dia
-- Rode no SQL Editor do Supabase

alter table public.dashboard_settings
add column if not exists ajuste_mes numeric not null default 0;

alter table public.dashboard_settings
add column if not exists ajuste_dia numeric not null default 0;

-- Garante que o registro padrão (key='default') exista
update public.dashboard_settings
set ajuste_mes = 0,
    ajuste_dia = 0
where key = 'default';
