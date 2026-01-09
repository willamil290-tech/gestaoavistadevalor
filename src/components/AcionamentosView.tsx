import { useEffect, useMemo, useRef, useState } from "react";
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
import { BulkPasteUpdater } from "./BulkPasteUpdater";
import { parseBulkTeamText, parseHourlyTrend, parseDetailedAcionamento, type BulkEntry, type HourlyTrend, type DetailedEntry } from "@/lib/bulkParse";
import { toast } from "sonner";

interface AcionamentosViewProps {
  tvMode?: boolean;
  trendData?: HourlyTrend[];
  onTrendUpdate?: (data: HourlyTrend[]) => void;
  onBulkUpdate?: (entries: BulkEntry[]) => void;
  onDetailedUpdate?: (entries: DetailedEntry[]) => void;
}

const pollInterval = Number(import.meta.env.VITE_SYNC_POLL_INTERVAL ?? 5000);

export const AcionamentosView = ({ 
  tvMode = false, 
  trendData: externalTrendData,
  onTrendUpdate,
  onBulkUpdate,
  onDetailedUpdate,
}: AcionamentosViewProps) => {
  const [activeSubTab, setActiveSubTab] = useState<"empresas" | "leads">("empresas");
  const scrollRef = useRef<HTMLDivElement>(null);
  const tabIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const scrollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [manualTrendData, setManualTrendData] = useState<HourlyTrend[]>([]);

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

  // Use external or manual trend data
  const displayTrendData = externalTrendData?.length ? externalTrendData : (manualTrendData.length ? manualTrendData : computed?.trendData ?? []);
  const totalActions = displayTrendData.reduce((sum, t) => sum + t.actions, 0);

  // Auto-rotate tabs in TV mode
  useEffect(() => {
    if (!tvMode) {
      if (tabIntervalRef.current) clearInterval(tabIntervalRef.current);
      return;
    }

    tabIntervalRef.current = setInterval(() => {
      setActiveSubTab((prev) => (prev === "empresas" ? "leads" : "empresas"));
    }, 15000); // Switch every 15 seconds

    return () => {
      if (tabIntervalRef.current) clearInterval(tabIntervalRef.current);
    };
  }, [tvMode]);

  // Auto-scroll in TV mode
  useEffect(() => {
    if (!tvMode || !scrollRef.current) {
      if (scrollIntervalRef.current) clearInterval(scrollIntervalRef.current);
      return;
    }

    let scrollingDown = true;
    const scrollStep = 2;
    const scrollDelay = 50;

    scrollIntervalRef.current = setInterval(() => {
      const el = scrollRef.current;
      if (!el) return;

      const maxScroll = el.scrollHeight - el.clientHeight;
      
      if (scrollingDown) {
        el.scrollTop += scrollStep;
        if (el.scrollTop >= maxScroll) {
          scrollingDown = false;
        }
      } else {
        el.scrollTop -= scrollStep;
        if (el.scrollTop <= 0) {
          scrollingDown = true;
        }
      }
    }, scrollDelay);

    return () => {
      if (scrollIntervalRef.current) clearInterval(scrollIntervalRef.current);
    };
  }, [tvMode]);

  const handleBulkPaste = async (text: string) => {
    // Parse all three types from the text
    const sections = text.split(/\(\d+\)\s+RESUMO/i);
    
    // Hourly trend
    const trendMatch = text.match(/Acionamentos por hora[^\n]*\n([\s\S]*?)(?=\(\d\)|$)/i);
    if (trendMatch) {
      const trendEntries = parseHourlyTrend(trendMatch[1]);
      if (trendEntries.length > 0) {
        setManualTrendData(trendEntries);
        onTrendUpdate?.(trendEntries);
      }
    }

    // Basic entries (morning/afternoon)
    const basicMatch = text.match(/RESUMO NUMÉRICO[^\n]*\n([\s\S]*?)(?=\(\d\)\s+RESUMO|$)/i);
    if (basicMatch) {
      const entries = parseBulkTeamText(basicMatch[1]);
      if (entries.length > 0) {
        onBulkUpdate?.(entries);
      }
    }

    // Detailed entries
    const detailedMatch = text.match(/RESUMO DETALHADO[^\n]*\n([\s\S]*?)$/i);
    if (detailedMatch) {
      const detailedEntries = parseDetailedAcionamento(detailedMatch[1]);
      if (detailedEntries.length > 0) {
        onDetailedUpdate?.(detailedEntries);
      }
    }

    toast.success("Dados de acionamento atualizados!");
  };

  const showDailyEventsHint = isSupabaseConfigured && !isDailyEventsEnabled();

  return (
    <div ref={scrollRef} className={cn("animate-fade-in-up space-y-6", tvMode ? "h-[calc(100vh-120px)] overflow-y-auto" : "")}>
      <div className="flex items-center gap-3 mb-5">
        <div className="w-3 h-3 rounded-full bg-secondary" />
        <h2 className={cn("font-semibold text-foreground", tvMode ? "text-3xl" : "text-2xl md:text-3xl")}>
          Acionamentos
        </h2>
      </div>

      {/* Bulk paste for updating */}
      {!tvMode && (
        <BulkPasteUpdater
          title="Atualizar Acionamentos"
          subtitle="Cole o texto completo com tendência, resumo numérico e detalhado"
          onApply={handleBulkPaste}
        />
      )}

      {/* Abas Empresas / Leads */}
      <Tabs value={activeSubTab} onValueChange={(v) => setActiveSubTab(v as "empresas" | "leads")} className="space-y-4">
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

      {/* Tendência do Dia - moved to bottom */}
      <div className="bg-card rounded-2xl p-4 md:p-6 border border-border">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className={cn("font-semibold", tvMode ? "text-xl" : "text-lg md:text-xl")}>Tendência do Dia</h3>
            <p className="text-sm text-muted-foreground mt-1">Acionamentos por hora</p>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Total</div>
            <div className={cn("font-bold text-foreground", tvMode ? "text-3xl" : "text-2xl md:text-3xl")}>
              {totalActions}
            </div>
          </div>
        </div>

        {showDailyEventsHint && !externalTrendData?.length && !manualTrendData.length ? (
          <div className="mt-4 text-sm text-muted-foreground">
            Cole os dados de acionamento acima ou rode o SQL <span className="font-semibold">SUPABASE_DAILY_EVENTS.sql</span> no Supabase.
          </div>
        ) : (
          <div className={tvMode ? "mt-4 h-[320px]" : "mt-4 h-[260px]"}>
            <ChartContainer config={{ actions: { label: "Acionamentos", color: "hsl(var(--secondary))" } }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={displayTrendData} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
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
    </div>
  );
};
