-- Reset diário (06:00 Brasil / UTC-3 = 09:00 UTC)
-- O objetivo é zerar:
-- - atingido_dia (Borderô do dia) em dashboard_settings
-- - morning/afternoon (acionamentos) em team_members
-- Mantém: atingido_mes (Borderô do mês)

-- 1) Ative a extensão pg_cron no Supabase (Database -> Extensions), ou rode:
-- create extension if not exists pg_cron;

create or replace function public.reset_daily_metrics()
returns void
language plpgsql
security definer
as $$
begin
  update public.dashboard_settings
    set atingido_dia = 0,
        updated_at = now()
    where key = 'default';

  update public.team_members
    set morning = 0,
        afternoon = 0,
        updated_at = now();
end;
$$;

-- 2) Agende para 09:00 UTC (equivale a 06:00 no Brasil -03:00)
-- Se sua operação estiver em outro fuso, ajuste aqui.
select cron.schedule(
  'reset-daily-0600-brazil',
  '0 9 * * *',
  $$select public.reset_daily_metrics();$$
);

-- Para listar jobs:
-- select * from cron.job;
-- Para remover:
-- select cron.unschedule('reset-daily-0600-brazil');
