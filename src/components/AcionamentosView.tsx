import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from "recharts";
import { isSupabaseConfigured } from "@/lib/supabase";
import { isDailyEventsEnabled, listDailyEvents } from "@/lib/persistence";
import { getBusinessDate } from "@/lib/businessDate";
import { ChartContainer } from "@/components/ui/chart";
import { cn } from "@/lib/utils";
import { EmpresasView } from "./EmpresasView";
import { LeadsView } from "./LeadsView";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface AcionamentosViewProps {
  tvMode?: boolean;
}

const pollInterval = Number(import.meta.env.VITE_SYNC_POLL_INTERVAL ?? 5000);

export const AcionamentosView = ({ tvMode = false }: AcionamentosViewProps) => {
  const analytics = useQuery({
    queryKey: ["daily-analytics", "08h"],
    enabled: isSupabaseConfigured && isDailyEventsEnabled(),
    queryFn: async () => {
      const now = new Date();
      const bd = getBusinessDate(now);
      const beforeIso = now.toISOString();
      const events = await listDailyEvents(bd, beforeIso);
      return { bd, events, beforeIso };
    },
    refetchInterval: pollInterval,
    staleTime: 0,
  });

  const computed = useMemo(() => {
    const now = new Date();
    const startHour = 8;
    const endHour = Math.max(startHour, now.getHours());

    const events = analytics.data?.events ?? [];

    const actionEvents = events
      .filter((e: any) => e.scope === "empresas" || e.scope === "leads")
      .filter((e: any) => e.kind !== "reset")
      .filter((e: any) => {
        const h = new Date(e.createdAt).getHours();
        return h >= startHour && h <= endHour;
      });

    const totalActionsSince8 = actionEvents.reduce(
      (acc: number, e: any) => acc + Number(e.deltaMorning ?? 0) + Number(e.deltaAfternoon ?? 0),
      0
    );

    const trendData = Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i).map((hour) => {
      const actions = actionEvents
        .filter((e: any) => new Date(e.createdAt).getHours() === hour)
        .reduce((acc: number, e: any) => acc + Number(e.deltaMorning ?? 0) + Number(e.deltaAfternoon ?? 0), 0);

      return { hour: String(hour).padStart(2, "0"), actions };
    });

    return { totalActionsSince8, trendData, endHour };
  }, [analytics.data]);

  const showDailyEventsHint = isSupabaseConfigured && !isDailyEventsEnabled();

  return (
    <div className="animate-fade-in-up space-y-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-3 h-3 rounded-full bg-secondary" />
        <h2 className={cn("font-semibold text-foreground", tvMode ? "text-3xl" : "text-2xl md:text-3xl")}>
          Acionamentos
        </h2>
      </div>

      {/* Tendência do Dia */}
      <div className="bg-card rounded-2xl p-4 md:p-6 border border-border">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className={cn("font-semibold", tvMode ? "text-xl" : "text-lg md:text-xl")}>Tendência do Dia</h3>
            <p className="text-sm text-muted-foreground mt-1">Acionamentos por hora (08:00 → agora)</p>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Total (08:00 → agora)</div>
            <div className={cn("font-bold text-foreground", tvMode ? "text-3xl" : "text-2xl md:text-3xl")}>
              {computed?.totalActionsSince8 ?? 0}
            </div>
          </div>
        </div>

        {showDailyEventsHint ? (
          <div className="mt-4 text-sm text-muted-foreground">
            Para habilitar a tendência, rode o SQL <span className="font-semibold">SUPABASE_DAILY_EVENTS.sql</span> no Supabase.
          </div>
        ) : (
          <div className={tvMode ? "mt-4 h-[320px]" : "mt-4 h-[260px]"}>
            <ChartContainer config={{ actions: { label: "Acionamentos", color: "hsl(var(--secondary))" } }}>
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
        )}
      </div>

      {/* Abas Empresas / Leads */}
      <Tabs defaultValue="empresas" className="space-y-4">
        <TabsList className="grid w-full max-w-[300px] grid-cols-2">
          <TabsTrigger value="empresas">Empresas</TabsTrigger>
          <TabsTrigger value="leads">Leads</TabsTrigger>
        </TabsList>

        <TabsContent value="empresas">
          <EmpresasView tvMode={tvMode} />
        </TabsContent>

        <TabsContent value="leads">
          <LeadsView tvMode={tvMode} />
        </TabsContent>
      </Tabs>
    </div>
  );
};
