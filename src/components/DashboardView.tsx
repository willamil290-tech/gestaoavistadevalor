import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from "recharts";
import { CircularProgress } from "./CircularProgress";
import { EditableValue } from "./EditableValue";
import { isSupabaseConfigured } from "@/lib/supabase";
import { listDailyEvents } from "@/lib/persistence";
import { getBusinessDate, getBusinessDayStart, getYesterdayBusinessDate } from "@/lib/businessDate";
import { ChartContainer } from "@/components/ui/chart";

interface DashboardViewProps {
  metaMes: number;
  metaDia: number;
  atingidoMes: number;
  atingidoDia: number;
  onMetaMesChange: (value: number) => void;
  onMetaDiaChange: (value: number) => void;
  onAtingidoMesChange: (value: number) => void;
  onAtingidoDiaChange: (value: number) => void;
  tvMode?: boolean;
  readOnly?: boolean;
}

const pollInterval = Number(import.meta.env.VITE_SYNC_POLL_INTERVAL ?? 5000);

export const DashboardView = ({
  metaMes,
  metaDia,
  atingidoMes,
  atingidoDia,
  onMetaMesChange,
  onMetaDiaChange,
  onAtingidoMesChange,
  onAtingidoDiaChange,
  tvMode = false,
  readOnly = false,
}: DashboardViewProps) => {
  const percentualMes = (atingidoMes / metaMes) * 100;
  const percentualDia = (atingidoDia / metaDia) * 100;

  const circleSize = tvMode ? 170 : 200;

  const analytics = useQuery({
    queryKey: ["daily-analytics"],
    enabled: isSupabaseConfigured,
    queryFn: async () => {
      const now = new Date();
      const bd = getBusinessDate(now);
      const yd = getYesterdayBusinessDate(now);

      const todayStart = getBusinessDayStart(bd);
      const elapsedMs = Math.max(0, now.getTime() - todayStart.getTime());

      const yesterdayStart = getBusinessDayStart(yd);
      const yesterdayCutoff = new Date(yesterdayStart.getTime() + elapsedMs);

      const [todayEvents, yesterdayEvents] = await Promise.all([
        listDailyEvents(bd, now.toISOString()),
        listDailyEvents(yd, yesterdayCutoff.toISOString()),
      ]);

      return { bd, yd, nowIso: now.toISOString(), todayEvents, yesterdayEvents };
    },
    refetchInterval: pollInterval,
    staleTime: 0,
  });

  const computed = useMemo(() => {
    const now = new Date();
    const bd = getBusinessDate(now);

    const todayEvents = analytics.data?.todayEvents ?? [];
    const yesterdayEvents = analytics.data?.yesterdayEvents ?? [];

    const sumActions = (events: any[]) =>
      events
        .filter((e) => e.scope === "empresas" || e.scope === "leads")
        .filter((e) => e.kind !== "reset")
        .reduce((acc, e) => acc + (Number(e.deltaMorning ?? 0) + Number(e.deltaAfternoon ?? 0)), 0);

    const sumBordero = (events: any[]) =>
      events
        .filter((e) => e.scope === "bordero")
        .reduce((acc, e) => acc + Number(e.deltaBorderoDia ?? 0), 0);

    const actionsToday = sumActions(todayEvents);
    const actionsYesterday = sumActions(yesterdayEvents);

    const borderoYesterday = sumBordero(yesterdayEvents);

    // Trend per hour (06 -> now hour)
    const startHour = 6;
    const endHour = Math.max(startHour, now.getHours());

    const buckets = new Map<number, number>();
    for (let h = startHour; h <= endHour; h++) buckets.set(h, 0);

    for (const e of todayEvents) {
      if (!(e.scope === "empresas" || e.scope === "leads")) continue;
      if (e.kind === "reset") continue;
      const h = new Date(e.createdAt).getHours();
      if (!buckets.has(h)) continue;
      const v = (Number(e.deltaMorning ?? 0) + Number(e.deltaAfternoon ?? 0));
      buckets.set(h, (buckets.get(h) ?? 0) + v);
    }

    const trendData = Array.from(buckets.entries()).map(([hour, actions]) => ({
      hour: String(hour).padStart(2, "0"),
      actions,
    }));

    return { bd, actionsToday, actionsYesterday, borderoYesterday, trendData };
  }, [analytics.data]);

  const fmtBRL = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  return (
    <div className={tvMode ? "space-y-4" : "space-y-6"}>
      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        {/* Month Section */}
        <div className="bg-card rounded-2xl p-4 md:p-6 border border-border">
          <div className="flex flex-col items-center gap-4">
            <EditableValue
              value={atingidoMes}
              onChange={onAtingidoMesChange}
              label="Vl. Borderô (mês)"
              readOnly={readOnly}
            />
            <CircularProgress
              percentage={percentualMes}
              label="Meta (mês)"
              variant="primary"
              size={circleSize}
            />
            <div className="w-full pt-4 border-t border-border">
              <EditableValue
                value={metaMes}
                onChange={onMetaMesChange}
                label="Meta do Mês"
                size="sm"
                readOnly={readOnly}
              />
            </div>
          </div>
        </div>

        {/* Day Section */}
        <div className="bg-card rounded-2xl p-4 md:p-6 border border-border">
          <div className="flex flex-col items-center gap-4">
            <EditableValue
              value={atingidoDia}
              onChange={onAtingidoDiaChange}
              label="Vl. Borderô (dia)"
              readOnly={readOnly}
            />
            <CircularProgress
              percentage={percentualDia}
              label="Meta (dia)"
              variant="secondary"
              size={circleSize}
            />
            <div className="w-full pt-4 border-t border-border">
              <EditableValue
                value={metaDia}
                onChange={onMetaDiaChange}
                label="Meta do Dia"
                size="sm"
                readOnly={readOnly}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <div className="bg-card rounded-xl p-4 border border-border text-center">
          <p className="text-sm md:text-base text-muted-foreground mb-2">% Mês</p>
          <p className="text-2xl md:text-3xl font-bold text-primary">{percentualMes.toFixed(1)}%</p>
        </div>
        <div className="bg-card rounded-xl p-4 border border-border text-center">
          <p className="text-sm md:text-base text-muted-foreground mb-2">% Dia</p>
          <p className="text-2xl md:text-3xl font-bold text-secondary">{percentualDia.toFixed(1)}%</p>
        </div>
        <div className="bg-card rounded-xl p-4 border border-border text-center">
          <p className="text-sm md:text-base text-muted-foreground mb-2">Falta (Mês)</p>
          <p className="text-xl md:text-2xl font-bold text-foreground">
            {fmtBRL(Math.max(0, metaMes - atingidoMes))}
          </p>
        </div>
        <div className="bg-card rounded-xl p-4 border border-border text-center">
          <p className="text-sm md:text-base text-muted-foreground mb-2">Falta (Dia)</p>
          <p className="text-xl md:text-2xl font-bold text-foreground">
            {fmtBRL(Math.max(0, metaDia - atingidoDia))}
          </p>
        </div>
      </div>

      {/* Analytics */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Comparison */}
        <div className="bg-card rounded-2xl p-4 md:p-6 border border-border">
          <div className="flex items-baseline justify-between">
            <h3 className="text-lg md:text-xl font-semibold">Ontem vs Hoje (até agora)</h3>
            <div className="text-xs text-muted-foreground">
              {computed?.bd ? `Dia útil: ${computed.bd} (vira às 06:00)` : ""}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-4">
            <div className="rounded-2xl bg-muted/50 border border-border p-4">
              <div className="text-sm text-muted-foreground">Acionamentos (Hoje)</div>
              <div className="text-3xl md:text-4xl font-bold text-foreground">{computed?.actionsToday ?? 0}</div>
            </div>
            <div className="rounded-2xl bg-muted/50 border border-border p-4">
              <div className="text-sm text-muted-foreground">Acionamentos (Ontem)</div>
              <div className="text-3xl md:text-4xl font-bold text-foreground">{computed?.actionsYesterday ?? 0}</div>
            </div>

            <div className="rounded-2xl bg-muted/50 border border-border p-4 col-span-2">
              <div className="text-sm text-muted-foreground">Borderô (Hoje)</div>
              <div className="text-2xl md:text-3xl font-bold text-foreground">{fmtBRL(atingidoDia)}</div>
              <div className="mt-2 text-sm text-muted-foreground">Borderô (Ontem até agora): {fmtBRL(computed?.borderoYesterday ?? 0)}</div>
              {(!analytics.data?.todayEvents?.length || !analytics.data?.yesterdayEvents?.length) && (
                <div className="mt-2 text-xs text-muted-foreground">
                  *O comparativo/tendência começa a ficar mais preciso conforme esta versão vai registrando eventos.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Trend */}
        <div className="bg-card rounded-2xl p-4 md:p-6 border border-border">
          <h3 className="text-lg md:text-xl font-semibold">Tendência do dia</h3>
          <p className="text-sm text-muted-foreground mt-1">Acionamentos por hora (06:00 → agora)</p>

          <div className="mt-4 h-[260px]">
            <ChartContainer
              config={{
                actions: { label: "Acionamentos", color: "hsl(var(--secondary))" },
              }}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={computed?.trendData ?? []} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="hour" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
                  <RTooltip />
                  <Bar dataKey="actions" fill="var(--color-actions)" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </div>
        </div>
      </div>
    </div>
  );
};
