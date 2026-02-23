import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from "recharts";
import { isSupabaseConfigured } from "@/lib/supabase";
import { isDailyEventsEnabled, listDailyEvents, listTeamMembers } from "@/lib/persistence";
import { getBusinessDate } from "@/lib/businessDate";
import { isIgnoredCommercial } from "@/lib/ignoredCommercials";
import { ChartContainer } from "@/components/ui/chart";
import { cn } from "@/lib/utils";
import { EmpresasView } from "./EmpresasView";
import { LeadsView } from "./LeadsView";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BulkPasteUpdater } from "./BulkPasteUpdater";
import { parseBulkTeamText, parseHourlyTrend, parseDetailedAcionamento, type BulkEntry, type HourlyTrend, type DetailedEntry } from "@/lib/bulkParse";
import { toast } from "sonner";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import { loadJson, saveJson } from "@/lib/localStore";
import { getTeamGroup, groupByTeam, TEAM_GROUP_BADGE_COLORS, type TeamGroup } from "@/lib/teamGroups";
import { ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Building2, Users, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";

function pad2(n: number) { return String(n).padStart(2, "0"); }

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const TEAM_HEADER_COLORS: Record<TeamGroup, string> = {
  "SDRs": "bg-blue-600 text-white",
  "Closers": "bg-purple-600 text-white",
  "CS": "bg-green-600 text-white",
  "Grandes Contas": "bg-amber-600 text-white",
  "Executivos": "bg-slate-600 text-white",
};

interface GeralDayPerson { name: string; empresas: number; leads: number; }
type GeralMonthData = Record<string, GeralDayPerson[]>;

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
  const [activeSubTab, setActiveSubTab] = useState<"geral" | "empresas" | "leads">("geral");
  const tabIntervalRef = useRef<NodeJS.Timeout | null>(null);
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

  // IDs de colaboradores que devem ser ignorados nos totais/tendencia (apenas quando ha Supabase).
  const ignoredMemberIds = useQuery({
    queryKey: ["ignored-member-ids"],
    enabled: isSupabaseConfigured,
    queryFn: async () => {
      const [empresas, leads] = await Promise.all([
        listTeamMembers("empresas"),
        listTeamMembers("leads"),
      ]);
      const ids = new Set<string>();
      for (const m of [...empresas, ...leads]) {
        if (isIgnoredCommercial(m.name)) ids.add(String(m.id));
      }
      return Array.from(ids);
    },
    refetchInterval: pollInterval,
    staleTime: 0,
  });

  // Geral tab data: combine empresas + leads
  const businessDate = getBusinessDate();
  const empresasRemote = useTeamMembers("empresas");
  const leadsRemote = useTeamMembers("leads");
  const [expandedGeral, setExpandedGeral] = useState<Set<string>>(new Set());

  // -- Monthly table state --
  const todayDate = new Date();
  const [geralYear, setGeralYear] = useState(todayDate.getFullYear());
  const [geralMonth, setGeralMonth] = useState(todayDate.getMonth() + 1);
  const [geralMonthData, setGeralMonthData] = useState<GeralMonthData>({});

  const geralData = useMemo(() => {
    type PersonGeral = { name: string; empresas: number; leads: number; total: number };
    let empresas: { name: string; morning: number; afternoon: number }[] = [];
    let leads: { name: string; morning: number; afternoon: number }[] = [];

    if (isSupabaseConfigured) {
      empresas = (empresasRemote.data ?? []) as any[];
      leads = (leadsRemote.data ?? []) as any[];
    } else {
      empresas = (loadJson(`teamMembers:${businessDate}:empresas`, []) as any[]) ?? [];
      leads = (loadJson(`teamMembers:${businessDate}:leads`, []) as any[]) ?? [];
    }

    const normalize = (n: string) => n.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const map = new Map<string, PersonGeral>();

    for (const e of empresas) {
      if (isIgnoredCommercial(e.name)) continue;
      const key = normalize(e.name);
      const empTotal = (e.morning ?? 0) + (e.afternoon ?? 0);
      map.set(key, { name: e.name, empresas: empTotal, leads: 0, total: empTotal });
    }

    for (const l of leads) {
      if (isIgnoredCommercial(l.name)) continue;
      const key = normalize(l.name);
      const leadTotal = (l.morning ?? 0) + (l.afternoon ?? 0);
      const existing = map.get(key);
      if (existing) {
        existing.leads = leadTotal;
        existing.total = existing.empresas + leadTotal;
      } else {
        map.set(key, { name: l.name, empresas: 0, leads: leadTotal, total: leadTotal });
      }
    }

    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [empresasRemote.data, leadsRemote.data, businessDate]);

  const geralGrouped = useMemo(() => groupByTeam(geralData), [geralData]);

  // Load monthly data on month change
  useEffect(() => {
    const key = `acionGeral:${geralYear}-${pad2(geralMonth)}`;
    setGeralMonthData(loadJson<GeralMonthData>(key, {}));
  }, [geralYear, geralMonth]);

  // Auto-save today's geral data to monthly storage
  useEffect(() => {
    if (geralData.length === 0) return;
    const hasNonZero = geralData.some(g => g.total > 0);
    if (!hasNonZero) return;
    const [y, m] = businessDate.split("-");
    const key = `acionGeral:${y}-${m}`;
    const stored = loadJson<GeralMonthData>(key, {});
    stored[businessDate] = geralData.map(g => ({ name: g.name, empresas: g.empresas, leads: g.leads }));
    saveJson(key, stored);
    if (parseInt(y) === geralYear && parseInt(m) === geralMonth) {
      setGeralMonthData(prev => ({ ...prev, [businessDate]: stored[businessDate] }));
    }
  }, [geralData, businessDate]);

  const prevGeralMonth = () => {
    if (geralMonth === 1) { setGeralMonth(12); setGeralYear(y => y - 1); }
    else setGeralMonth(m => m - 1);
  };
  const nextGeralMonth = () => {
    if (geralMonth === 12) { setGeralMonth(1); setGeralYear(y => y + 1); }
    else setGeralMonth(m => m + 1);
  };

  // -- Table data from monthly storage --
  const geralDaysWithData = useMemo(() => Object.keys(geralMonthData).sort(), [geralMonthData]);

  const geralAllPeople = useMemo(() => {
    const nameSet = new Set<string>();
    for (const dayData of Object.values(geralMonthData)) {
      for (const person of dayData) {
        if (!isIgnoredCommercial(person.name)) nameSet.add(person.name);
      }
    }
    const names = Array.from(nameSet);
    const groupOrder: TeamGroup[] = ["SDRs", "Closers", "CS", "Grandes Contas", "Executivos"];
    names.sort((a, b) => {
      const ga = groupOrder.indexOf(getTeamGroup(a));
      const gb = groupOrder.indexOf(getTeamGroup(b));
      if (ga !== gb) return ga - gb;
      return a.localeCompare(b);
    });
    return names;
  }, [geralMonthData]);

  const geralPeopleByTeam = useMemo(() => {
    const groups: { group: TeamGroup; names: string[] }[] = [];
    const groupOrder: TeamGroup[] = ["SDRs", "Closers", "CS", "Grandes Contas", "Executivos"];
    const map = new Map<TeamGroup, string[]>();
    for (const name of geralAllPeople) {
      const g = getTeamGroup(name);
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(name);
    }
    for (const g of groupOrder) {
      if (map.has(g)) groups.push({ group: g, names: map.get(g)! });
    }
    return groups;
  }, [geralAllPeople]);

  const geralDataLookup = useMemo(() => {
    const lookup = new Map<string, Map<string, { empresas: number; leads: number }>>();
    for (const [date, dayData] of Object.entries(geralMonthData)) {
      const personMap = new Map<string, { empresas: number; leads: number }>();
      for (const person of dayData) {
        if (!isIgnoredCommercial(person.name)) {
          personMap.set(person.name, { empresas: person.empresas, leads: person.leads });
        }
      }
      lookup.set(date, personMap);
    }
    return lookup;
  }, [geralMonthData]);

  const geralDayTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const day of geralDaysWithData) {
      const dayMap = geralDataLookup.get(day);
      if (!dayMap) continue;
      let total = 0;
      for (const v of dayMap.values()) total += v.empresas + v.leads;
      totals.set(day, total);
    }
    return totals;
  }, [geralDaysWithData, geralDataLookup]);

  const geralPersonTotals = useMemo(() => {
    const totals = new Map<string, { empresas: number; leads: number }>();
    for (const dayData of Object.values(geralMonthData)) {
      for (const person of dayData) {
        if (isIgnoredCommercial(person.name)) continue;
        const prev = totals.get(person.name) ?? { empresas: 0, leads: 0 };
        totals.set(person.name, {
          empresas: prev.empresas + person.empresas,
          leads: prev.leads + person.leads,
        });
      }
    }
    return totals;
  }, [geralMonthData]);

  const geralFirstName = (name: string) => name.split(" ")[0];

  const toggleExpand = (name: string) => {
    setExpandedGeral((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const computed = useMemo(() => {
    const now = new Date();
    const startHour = 8;
    const endHour = Math.max(startHour, now.getHours());

    const events = analytics.data?.events ?? [];
    const ignoredIds = new Set<string>((ignoredMemberIds.data ?? []).map(String));

    const actionEvents = events
      .filter((e: any) => e.scope === "empresas" || e.scope === "leads")
      .filter((e: any) => e.kind !== "reset")
      .filter((e: any) => !ignoredIds.has(String(e.memberId ?? "")))
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
  }, [analytics.data, ignoredMemberIds.data]);

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
      setActiveSubTab((prev) => {
        if (prev === "geral") return "empresas";
        if (prev === "empresas") return "leads";
        return "geral";
      });
    }, 15000); // Switch every 15 seconds

    return () => {
      if (tabIntervalRef.current) clearInterval(tabIntervalRef.current);
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
    <div className={cn("animate-fade-in-up space-y-6")}>
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

      {/* Abas Geral / Empresas / Leads */}
      <Tabs value={activeSubTab} onValueChange={(v) => setActiveSubTab(v as "geral" | "empresas" | "leads")} className="space-y-4">
        <TabsList className="grid w-full max-w-[400px] grid-cols-3">
          <TabsTrigger value="geral">Geral</TabsTrigger>
          <TabsTrigger value="empresas">Empresas</TabsTrigger>
          <TabsTrigger value="leads">Leads</TabsTrigger>
        </TabsList>

        <TabsContent value="geral">
          <div className="animate-fade-in-up">
            {/* Month picker */}
            <div className="flex items-center justify-center gap-4 mb-6">
              <Button variant="ghost" size="icon" onClick={prevGeralMonth}><ChevronLeft className="w-5 h-5" /></Button>
              <div className="flex items-center gap-2">
                <CalendarDays className="w-5 h-5 text-muted-foreground" />
                <span className={cn("font-semibold", tvMode ? "text-xl" : "text-lg")}>
                  {MONTH_NAMES[geralMonth - 1]} {geralYear}
                </span>
              </div>
              <Button variant="ghost" size="icon" onClick={nextGeralMonth}><ChevronRight className="w-5 h-5" /></Button>
            </div>

            {geralDaysWithData.length === 0 ? (
              <div className="text-center text-muted-foreground py-16">
                <Building2 className="w-12 h-12 mx-auto mb-4 opacity-30" />
                <p className="text-lg">Nenhum dado de acionamento para este mês.</p>
                <p className="text-sm mt-2">Cole dados do Bitrix ou use o <strong>Importar</strong> acima.</p>
              </div>
            ) : (
              <div className="bg-card rounded-2xl border border-border overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse min-w-[600px]">
                    <thead>
                      {/* Tier 1: Team headers */}
                      <tr>
                        <th rowSpan={3} className="text-center px-2 py-2 font-semibold text-muted-foreground bg-muted/40 border-b border-r border-border sticky left-0 z-10 bg-card min-w-[50px]">
                          Dia
                        </th>
                        {geralPeopleByTeam.map(({ group, names }) => (
                          <th key={group} colSpan={names.length * 2} className={cn("text-center px-2 py-1.5 font-semibold border-b border-r border-border/50 text-xs", TEAM_HEADER_COLORS[group])}>
                            {group}
                          </th>
                        ))}
                        <th rowSpan={3} className="text-center px-2 py-2 font-semibold text-muted-foreground bg-muted/40 border-b border-border min-w-[60px]">
                          Total
                        </th>
                      </tr>
                      {/* Tier 2: Person names */}
                      <tr className="bg-muted/30">
                        {geralAllPeople.map(name => (
                          <th key={name} colSpan={2} className="text-center px-1 py-1.5 font-medium text-foreground border-b border-r border-border/50 whitespace-nowrap">
                            {geralFirstName(name)}
                          </th>
                        ))}
                      </tr>
                      {/* Tier 3: Emp / Lead */}
                      <tr className="bg-muted/20">
                        {geralAllPeople.map(name => (
                          <th key={`${name}-sub`} colSpan={2} className="border-b border-r border-border/30 p-0">
                            <div className="grid grid-cols-2 divide-x divide-border/30">
                              <span className="px-1 py-1 text-center text-[10px] text-secondary font-medium" title="Empresas">Emp</span>
                              <span className="px-1 py-1 text-center text-[10px] text-amber-500 font-medium" title="Leads">Lead</span>
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {geralDaysWithData.map((day, rowIdx) => {
                        const [, , d] = day.split("-");
                        const dayMap = geralDataLookup.get(day);
                        const dayTotal = geralDayTotals.get(day) ?? 0;
                        return (
                          <tr key={day} className={cn("border-b border-border/30 hover:bg-muted/20 transition-colors", rowIdx % 2 === 0 ? "" : "bg-muted/5")}>
                            <td className="text-center px-2 py-2 font-semibold border-r border-border sticky left-0 z-10 bg-card">
                              {parseInt(d)}
                            </td>
                            {geralAllPeople.map(name => {
                              const m = dayMap?.get(name);
                              if (!m) return (
                                <td key={name} colSpan={2} className="text-center px-1 py-2 text-muted-foreground/30 border-r border-border/30">—</td>
                              );
                              return (
                                <td key={name} colSpan={2} className="border-r border-border/30 p-0">
                                  <div className="grid grid-cols-2 divide-x divide-border/20">
                                    <span className="px-1 py-2 text-center font-semibold text-secondary tabular-nums">{m.empresas}</span>
                                    <span className="px-1 py-2 text-center font-semibold text-amber-600 dark:text-amber-400 tabular-nums">{m.leads}</span>
                                  </div>
                                </td>
                              );
                            })}
                            <td className="text-center px-2 py-2 font-bold text-foreground tabular-nums">{dayTotal}</td>
                          </tr>
                        );
                      })}
                      {/* Total row */}
                      <tr className="bg-muted/30 font-semibold border-t-2 border-border">
                        <td className="text-center px-2 py-2 border-r border-border sticky left-0 z-10 bg-muted/30">Total</td>
                        {geralAllPeople.map(name => {
                          const pt = geralPersonTotals.get(name);
                          if (!pt) return <td key={name} colSpan={2} className="text-center px-1 py-2 border-r border-border/30">—</td>;
                          return (
                            <td key={name} colSpan={2} className="border-r border-border/30 p-0">
                              <div className="grid grid-cols-2 divide-x divide-border/20">
                                <span className="px-1 py-2 text-center font-bold text-secondary tabular-nums">{pt.empresas}</span>
                                <span className="px-1 py-2 text-center font-bold text-amber-600 dark:text-amber-400 tabular-nums">{pt.leads}</span>
                              </div>
                            </td>
                          );
                        })}
                        <td className="text-center px-2 py-2 font-bold text-foreground tabular-nums">
                          {Array.from(geralPersonTotals.values()).reduce((s, v) => s + v.empresas + v.leads, 0)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </TabsContent>

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
