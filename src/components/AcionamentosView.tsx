import { useEffect, useMemo, useRef, useState, Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from "recharts";
import { isSupabaseConfigured } from "@/lib/supabase";
import { isDailyEventsEnabled, listDailyEvents, listTeamMembers } from "@/lib/persistence";
import { getBusinessDate, getYesterdayBusinessDate } from "@/lib/businessDate";
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
import {
  activeCollaboratorNameKey,
  canonicalizeActiveCollaboratorName,
  canonicalizeCollaboratorNameForDate,
  collaboratorNameKey,
  isMariaCollaboratorName,
} from "@/lib/collaboratorNames";
import { buildPreferredCollaboratorNameMap, getTeamGroup, groupByTeam, TEAM_GROUP_BADGE_COLORS, type TeamGroup } from "@/lib/teamGroups";
import { ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Building2, Users, CalendarDays, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

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

function normalizeGeralDayData(dayData: GeralDayPerson[], dateISO?: string) {
  const map = new Map<string, GeralDayPerson>();

  for (const person of dayData ?? []) {
    const name = canonicalizeCollaboratorNameForDate(person.name, dateISO);
    const key = collaboratorNameKey(name, dateISO);
    const current = map.get(key);

    if (current) {
      current.empresas += Number(person.empresas ?? 0);
      current.leads += Number(person.leads ?? 0);
    } else {
      map.set(key, {
        name,
        empresas: Number(person.empresas ?? 0),
        leads: Number(person.leads ?? 0),
      });
    }
  }

  return Array.from(map.values());
}

function normalizeGeralMonthData(data: GeralMonthData) {
  const normalized: GeralMonthData = {};

  for (const [date, dayData] of Object.entries(data ?? {})) {
    normalized[date] = normalizeGeralDayData(dayData, date);
  }

  return normalized;
}

function shouldHideAcionamentoName(name: string) {
  const firstName = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .split(/\s+/)[0];
  return isIgnoredCommercial(name) || isMariaCollaboratorName(name) || firstName === "filipe";
}

interface AcionamentosViewProps {
  tvMode?: boolean;
  trendData?: HourlyTrend[];
  onTrendUpdate?: (data: HourlyTrend[]) => void;
  onBulkUpdate?: (entries: BulkEntry[]) => void;
  onDetailedUpdate?: (entries: DetailedEntry[]) => void;
  saveDate?: string;
  onSaveDateChange?: (date: string) => void;
}

const pollInterval = Number(import.meta.env.VITE_SYNC_POLL_INTERVAL ?? 5000);

export const AcionamentosView = ({ 
  tvMode = false, 
  trendData: externalTrendData,
  onTrendUpdate,
  onBulkUpdate,
  onDetailedUpdate,
  saveDate: saveDateProp,
  onSaveDateChange,
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
        if (shouldHideAcionamentoName(m.name)) ids.add(String(m.id));
      }
      return Array.from(ids);
    },
    refetchInterval: pollInterval,
    staleTime: 0,
  });

  // Geral tab data: combine empresas + leads
  const businessDate = getBusinessDate();
  const effectiveSaveDate = saveDateProp ?? businessDate;
  const empresasRemote = useTeamMembers("empresas");
  const leadsRemote = useTeamMembers("leads");
  const [expandedGeral, setExpandedGeral] = useState<Set<string>>(new Set());
  const [showAverageRow, setShowAverageRow] = useState(false);

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
      empresas = ((loadJson(`teamMembers:${businessDate}:empresas`, []) as any[]) ?? [])
        .map((item) => ({ ...item, name: canonicalizeActiveCollaboratorName(item.name ?? "") }));
      leads = ((loadJson(`teamMembers:${businessDate}:leads`, []) as any[]) ?? [])
        .map((item) => ({ ...item, name: canonicalizeActiveCollaboratorName(item.name ?? "") }));
    }

    const map = new Map<string, PersonGeral>();

    for (const e of empresas) {
      if (shouldHideAcionamentoName(e.name)) continue;
      const name = canonicalizeActiveCollaboratorName(e.name);
      const key = activeCollaboratorNameKey(name);
      const empTotal = (e.morning ?? 0) + (e.afternoon ?? 0);
      map.set(key, { name, empresas: empTotal, leads: 0, total: empTotal });
    }

    for (const l of leads) {
      if (shouldHideAcionamentoName(l.name)) continue;
      const name = canonicalizeActiveCollaboratorName(l.name);
      const key = activeCollaboratorNameKey(name);
      const leadTotal = (l.morning ?? 0) + (l.afternoon ?? 0);
      const existing = map.get(key);
      if (existing) {
        existing.leads = leadTotal;
        existing.total = existing.empresas + leadTotal;
      } else {
        map.set(key, { name, empresas: 0, leads: leadTotal, total: leadTotal });
      }
    }

    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [empresasRemote.data, leadsRemote.data, businessDate]);

  const geralGrouped = useMemo(() => groupByTeam(geralData), [geralData]);

  const geralNameAliases = useMemo(() => {
    const totalsByName = new Map<string, number>();

    for (const dayData of Object.values(geralMonthData)) {
      for (const person of dayData) {
        if (shouldHideAcionamentoName(person.name)) continue;
        const total = Number(person.empresas ?? 0) + Number(person.leads ?? 0);
        totalsByName.set(person.name, (totalsByName.get(person.name) ?? 0) + total);
      }
    }

    return buildPreferredCollaboratorNameMap(
      Array.from(totalsByName, ([name, score]) => ({ name, score }))
    );
  }, [geralMonthData]);

  // Load monthly data on month change
  useEffect(() => {
    const key = `acionGeral:${geralYear}-${pad2(geralMonth)}`;
    setGeralMonthData(normalizeGeralMonthData(loadJson<GeralMonthData>(key, {})));
  }, [geralYear, geralMonth]);

  // Auto-save geral data to monthly storage — only when the reference date is
  // today's business date so that viewing historical dates never overwrites past data
  // with the current live values.
  useEffect(() => {
    if (geralData.length === 0) return;
    if (effectiveSaveDate !== businessDate) return; // ← guard: historical dates are read-only for auto-save
    const hasNonZero = geralData.some(g => g.total > 0);
    if (!hasNonZero) return;
    const [y, m] = effectiveSaveDate.split("-");
    const key = `acionGeral:${y}-${m}`;
    const stored = loadJson<GeralMonthData>(key, {});
    stored[effectiveSaveDate] = geralData.map(g => ({ name: g.name, empresas: g.empresas, leads: g.leads }));
    saveJson(key, stored);
    if (parseInt(y) === geralYear && parseInt(m) === geralMonth) {
      setGeralMonthData(prev => ({ ...prev, [effectiveSaveDate]: stored[effectiveSaveDate] }));
    }
  }, [geralData, effectiveSaveDate, businessDate]);

  const prevGeralMonth = () => {
    if (geralMonth === 1) { setGeralMonth(12); setGeralYear(y => y - 1); }
    else setGeralMonth(m => m - 1);
  };
  const nextGeralMonth = () => {
    if (geralMonth === 12) { setGeralMonth(1); setGeralYear(y => y + 1); }
    else setGeralMonth(m => m + 1);
  };

  const refreshGeralMonth = () => {
    setGeralMonthData(normalizeGeralMonthData(loadJson<GeralMonthData>(`acionGeral:${geralYear}-${pad2(geralMonth)}`, {})));
  };

  // ── Helper: save parsed data for a single date into localStorage (merge) ──
  const saveGeralForDate = (dateISO: string, entries: BulkEntry[]) => {
    const [y, m] = dateISO.split("-");
    const key = `acionGeral:${y}-${m}`;
    const stored = loadJson<GeralMonthData>(key, {});
    const dayData: GeralDayPerson[] = entries.map(e => ({
      name: canonicalizeCollaboratorNameForDate(e.name, dateISO), empresas: e.morning, leads: e.afternoon,
    }));
    const existingDay = normalizeGeralDayData(stored[dateISO] ?? [], dateISO);
    const incoming = new Set(dayData.map((d) => collaboratorNameKey(d.name, dateISO)));
    stored[dateISO] = normalizeGeralDayData([
      ...dayData,
      ...existingDay.filter((p) => !incoming.has(collaboratorNameKey(p.name, dateISO))),
    ], dateISO);
    saveJson(key, stored);
    return { y, m, stored, dateISO };
  };

  const saveDetForDate = (dateISO: string, detailedEntries: DetailedEntry[]) => {
    const [y, m] = dateISO.split("-");
    const detKey = `acionDet:${y}-${m}`;
    const detStored = loadJson<Record<string, any[]>>(detKey, {});
    const detDayData = detailedEntries.map(e => ({
      name: canonicalizeCollaboratorNameForDate(e.name, dateISO), total: e.total,
      categorias: [
        { tipo: "ETAPA_ALTERADA", quantidade: e.etapaAlterada },
        { tipo: "ATIVIDADE_CRIADA", quantidade: e.atividadeCriada },
        { tipo: "STATUS_ATIVIDADE_ALTERADA", quantidade: e.statusAlterada },
        { tipo: "CHAMADA_TELEFONICA", quantidade: e.chamadaTelefonica },
        { tipo: "OUTROS", quantidade: e.outros },
      ],
    }));
    const existingDet = detStored[dateISO] ?? [];
    const incomingDet = new Set(detDayData.map((d) => collaboratorNameKey(d.name, dateISO)));
    detStored[dateISO] = [
      ...detDayData,
      ...existingDet.filter((p: any) => !incomingDet.has(collaboratorNameKey(p.name ?? "", dateISO))),
    ];
    saveJson(detKey, detStored);
  };

  // -- Table data from monthly storage --
  const geralDaysWithData = useMemo(() => Object.keys(geralMonthData).sort(), [geralMonthData]);

  const geralAllPeople = useMemo(() => {
    const nameSet = new Set<string>();
    const excluded = ["Bianca", "Karina", "Nayad"];
    for (const preferredName of geralNameAliases.values()) {
      const firstName = preferredName.split(" ")[0];
      if (!shouldHideAcionamentoName(preferredName) && !excluded.includes(firstName)) nameSet.add(preferredName);
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
  }, [geralNameAliases]);

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
        if (!shouldHideAcionamentoName(person.name)) {
          const preferredName = geralNameAliases.get(person.name) ?? person.name;
          const current = personMap.get(preferredName) ?? { empresas: 0, leads: 0 };
          personMap.set(preferredName, {
            empresas: current.empresas + person.empresas,
            leads: current.leads + person.leads,
          });
        }
      }
      lookup.set(date, personMap);
    }
    return lookup;
  }, [geralMonthData, geralNameAliases]);

  // Daily sector subtotals for geral tab
  const geralDaySectorMetrics = useMemo(() => {
    const lookup = new Map<string, Map<TeamGroup, { empresas: number; leads: number }>>();

    for (const day of geralDaysWithData) {
      const dayMap = geralDataLookup.get(day);
      if (!dayMap) continue;

      const sectorMap = new Map<TeamGroup, { empresas: number; leads: number }>();
      const groupOrder: TeamGroup[] = ["SDRs", "Closers", "CS", "Grandes Contas", "Executivos"];
      for (const group of groupOrder) {
        sectorMap.set(group, { empresas: 0, leads: 0 });
      }

      for (const [name, metrics] of dayMap.entries()) {
        const group = getTeamGroup(name);
        const current = sectorMap.get(group);
        if (current) {
          current.empresas += metrics.empresas;
          current.leads += metrics.leads;
        }
      }

      lookup.set(day, sectorMap);
    }

    return lookup;
  }, [geralDaysWithData, geralDataLookup]);

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
        if (shouldHideAcionamentoName(person.name)) continue;
        const preferredName = geralNameAliases.get(person.name) ?? person.name;
        const prev = totals.get(preferredName) ?? { empresas: 0, leads: 0 };
        totals.set(preferredName, {
          empresas: prev.empresas + person.empresas,
          leads: prev.leads + person.leads,
        });
      }
    }
    return totals;
  }, [geralMonthData, geralNameAliases]);

  const geralPersonAverages = useMemo(() => {
    const averages = new Map<string, { empresas: number; leads: number }>();

    for (const name of geralAllPeople) {
      let empresas = 0;
      let leads = 0;
      let activeDays = 0;

      for (const day of geralDaysWithData) {
        const dayMap = geralDataLookup.get(day);
        const person = dayMap?.get(name);
        if (!person) continue;
        if (person.empresas + person.leads <= 0) continue;

        empresas += person.empresas;
        leads += person.leads;
        activeDays += 1;
      }

      if (activeDays > 0) {
        averages.set(name, {
          empresas: empresas / activeDays,
          leads: leads / activeDays,
        });
      }
    }

    return averages;
  }, [geralAllPeople, geralDaysWithData, geralDataLookup]);

  const geralAverageGrandTotal = useMemo(
    () => Array.from(geralPersonAverages.values()).reduce((s, v) => s + v.empresas + v.leads, 0),
    [geralPersonAverages]
  );

  const geralSectorTotals = useMemo(() => {
    const totals = new Map<TeamGroup, { empresas: number; leads: number }>();
    const groupOrder: TeamGroup[] = ["SDRs", "Closers", "CS", "Grandes Contas", "Executivos"];
    
    for (const group of groupOrder) {
      totals.set(group, { empresas: 0, leads: 0 });
    }

    for (const [name, total] of geralPersonTotals.entries()) {
      const group = getTeamGroup(name);
      const current = totals.get(group) ?? { empresas: 0, leads: 0 };
      totals.set(group, {
        empresas: current.empresas + total.empresas,
        leads: current.leads + total.leads,
      });
    }

    return totals;
  }, [geralPersonTotals]);

  const geralFirstName = (name: string) => name.split(" ")[0];
  const formatAverageNumber = (value: number) =>
    Number.isInteger(value)
      ? String(value)
      : value.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  const formatActionCategoryLabel = (category?: string) => {
    const labels: Record<string, string> = {
      ETAPA_ALTERADA: "Etapa alterada",
      ATIVIDADE_CRIADA: "Atividade criada",
      STATUS_ATIVIDADE_ALTERADA: "Status da atividade",
      CHAMADA_TELEFONICA: "Chamada telefônica",
      OUTROS: "Outros",
    };

    if (!category) return "";
    return labels[category] ?? category;
  };

  // -- Events drill-down dialog state --
  const [eventsDialog, setEventsDialog] = useState<{
    open: boolean;
    title: string;
    items: { empresa: string; tipo: string; hora: string; tipoEvento?: string }[];
  }>({ open: false, title: "", items: [] });

  const openGeralCellEvents = (name: string, day: string, filter?: "EMPRESA" | "LEAD") => {
    const stored = loadJson<any[]>(`bitrixEvents:${day}`, []);
    if (!stored || stored.length === 0) {
      toast.info("Sem logs de eventos salvos para este dia.");
      return;
    }
    const norm = name.toLowerCase().trim();
    const detail = stored.find(
      (d: any) => d.comercial?.toLowerCase().trim() === norm ||
        d.comercial?.toLowerCase().split(" ")[0] === norm.split(" ")[0]
    );
    if (!detail) {
      toast.info(`Nenhum evento encontrado para ${name} neste dia.`);
      return;
    }
    let items: { empresa: string; tipo: string; hora: string; tipoEvento?: string }[];
    if (filter === "EMPRESA") {
      items = (detail.uniqueEmpresas ?? []).map((e: any) => ({ empresa: e.empresa, tipo: "Negócio", hora: e.timeHHMM }));
    } else if (filter === "LEAD") {
      items = (detail.uniqueLeads ?? []).map((e: any) => ({ empresa: e.empresa, tipo: "Lead", hora: e.timeHHMM }));
    } else {
      items = (detail.events ?? []).map((e: any) => ({
        empresa: e.empresa,
        tipo: e.entityType,
        hora: e.timeHHMM,
        tipoEvento: e.actionCategory ?? e.actionLine,
      }));
    }
    const [, m, d] = day.split("-");
    const label = filter === "EMPRESA" ? "Negócios" : filter === "LEAD" ? "Leads" : "Todos";
    setEventsDialog({ open: true, title: `${name} — ${d}/${m} — ${label}`, items });
  };

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
    const isHistorical = effectiveSaveDate !== businessDate;

    // Hourly trend (only relevant for today)
    if (!isHistorical) {
      const trendMatch = text.match(/Acionamentos por hora[^\n]*\n([\s\S]*?)(?=\(\d\)|$)/i);
      if (trendMatch) {
        const trendEntries = parseHourlyTrend(trendMatch[1]);
        if (trendEntries.length > 0) {
          setManualTrendData(trendEntries);
          onTrendUpdate?.(trendEntries);
        }
      }
    }

    // Basic entries (morning/afternoon)
    const basicMatch = text.match(/RESUMO NUMÉRICO[^\n]*\n([\s\S]*?)(?=\(\d\)\s+RESUMO|$)/i);
    const basicEntries = parseBulkTeamText(basicMatch ? basicMatch[1] : text);

    if (basicEntries.length > 0) {
      if (isHistorical) {
        const { y, m, stored } = saveGeralForDate(effectiveSaveDate, basicEntries);
        if (parseInt(y) === geralYear && parseInt(m) === geralMonth) {
          setGeralMonthData(prev => ({ ...prev, [effectiveSaveDate]: stored[effectiveSaveDate] }));
        }
      } else {
        onBulkUpdate?.(basicEntries);
      }
    }

    // Detailed entries
    const detailedMatch = text.match(/RESUMO DETALHADO[^\n]*\n([\s\S]*?)$/i);
    if (detailedMatch) {
      const detailedEntries = parseDetailedAcionamento(detailedMatch[1]);
      if (detailedEntries.length > 0) {
        if (isHistorical) {
          saveDetForDate(effectiveSaveDate, detailedEntries);
        } else {
          onDetailedUpdate?.(detailedEntries);
        }
      }
    }

    const savedBasic = basicEntries.length > 0;
    const savedDetailed = detailedMatch ? parseDetailedAcionamento(detailedMatch[1]).length > 0 : false;

    if (!savedBasic && !savedDetailed) {
      toast.error("Nenhum dado encontrado no texto colado. Verifique o formato.");
      return;
    }

    toast.success(
      isHistorical
        ? `Dados históricos salvos para ${effectiveSaveDate.split("-").reverse().join("/")}!`
        : "Dados de acionamento atualizados!"
    );
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

      {/* Date picker for reference date */}
      {!tvMode && (
        <div className="flex flex-wrap items-center gap-3 p-4 rounded-xl border border-border bg-card mb-4">
          <CalendarDays className="w-5 h-5 text-muted-foreground" />
          <label className="text-sm font-medium text-muted-foreground whitespace-nowrap">Data de referência:</label>
          <input
            type="date"
            value={effectiveSaveDate}
            onChange={(e) => onSaveDateChange?.(e.target.value)}
            className="bg-muted text-foreground text-sm rounded-lg px-3 py-2 border border-border focus:ring-2 focus:ring-secondary outline-none"
          />
          <div className="flex gap-1">
            <Button variant="outline" size="sm" onClick={() => onSaveDateChange?.(getYesterdayBusinessDate())}>
              Ontem
            </Button>
            <Button variant="outline" size="sm" onClick={() => onSaveDateChange?.(businessDate)}>
              Hoje
            </Button>
          </div>
          {effectiveSaveDate !== businessDate && (
            <span className="text-xs text-amber-500 font-medium">
              ⚠ Dados serão salvos para {effectiveSaveDate.split("-").reverse().join("/")}
            </span>
          )}
        </div>
      )}

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

            <div className="flex justify-end mb-3">
              <Button
                variant={showAverageRow ? "default" : "outline"}
                size="sm"
                onClick={() => setShowAverageRow((prev) => !prev)}
              >
                Média
              </Button>
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
                      {/* Tier 3: Negóc / Lead */}
                      <tr className="bg-muted/20">
                        {geralAllPeople.map(name => (
                          <th key={`${name}-sub`} colSpan={2} className="border-b border-r border-border/30 p-0">
                            <div className="grid grid-cols-2 divide-x divide-border/30">
                              <span className="px-1 py-1 text-center text-[10px] text-secondary font-medium" title="Negócios">Negóc</span>
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
                          <Fragment key={day}>
                            <tr className={cn("border-b border-border/30 hover:bg-muted/20 transition-colors", rowIdx % 2 === 0 ? "" : "bg-muted/5")}>
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
                                    <button
                                      onClick={() => openGeralCellEvents(name, day)}
                                      className="w-full hover:bg-secondary/10 transition-colors cursor-pointer"
                                      title={`${name} — Dia ${parseInt(d)}: clique para ver logs`}
                                    >
                                      <div className="grid grid-cols-2 divide-x divide-border/20">
                                        <span className="px-1 py-2 text-center font-semibold text-secondary tabular-nums">{m.empresas}</span>
                                        <span className="px-1 py-2 text-center font-semibold text-amber-600 dark:text-amber-400 tabular-nums">{m.leads}</span>
                                      </div>
                                    </button>
                                  </td>
                                );
                              })}
                              <td className="text-center px-2 py-2 font-bold text-foreground tabular-nums">{dayTotal}</td>
                            </tr>

                            {/* Sector subtotals for this day */}
                            {geralPeopleByTeam.map(({ group, names }) => {
                              const sectorMetricsForDay = geralDaySectorMetrics.get(day)?.get(group);
                              if (!sectorMetricsForDay || (sectorMetricsForDay.empresas + sectorMetricsForDay.leads === 0)) return null;

                              return (
                                <tr key={`${day}-${group}`} className="bg-blue-500/5 border-b border-border/20 text-xs">
                                  <td className="text-center px-2 py-1.5 border-r border-border sticky left-0 z-10 bg-blue-500/5 text-[11px] font-medium text-muted-foreground">
                                    {group}
                                  </td>
                                  {geralAllPeople.map(name => {
                                    if (!names.includes(name)) {
                                      return <td key={name} colSpan={2} className="border-r border-border/20" />;
                                    }
                                    const m = dayMap?.get(name);
                                    if (!m) {
                                      return (
                                        <td key={name} colSpan={2} className="text-center px-1 py-1.5 text-muted-foreground/20 border-r border-border/20">
                                          —
                                        </td>
                                      );
                                    }
                                    return (
                                      <td key={name} colSpan={2} className="border-r border-border/20 p-0">
                                        <div className="grid grid-cols-2 divide-x divide-border/20">
                                          <span className="px-1 py-1 text-center text-xs text-secondary tabular-nums font-medium">
                                            {m.empresas}
                                          </span>
                                          <span className="px-1 py-1 text-center tabular-nums text-xs text-amber-500 font-medium">
                                            {m.leads}
                                          </span>
                                        </div>
                                      </td>
                                    );
                                  })}
                                  <td className="text-center px-2 py-1.5 font-bold text-secondary tabular-nums text-xs">
                                    {sectorMetricsForDay.empresas + sectorMetricsForDay.leads}
                                  </td>
                                </tr>
                              );
                            })}
                          </Fragment>
                        );
                      })}
                      {/* Sector subtotal rows */}
                      {geralPeopleByTeam.map(({ group, names }) => {
                        const st = geralSectorTotals.get(group);
                        if (!st) return null;
                        return (
                          <tr key={`sector-${group}`} className="bg-muted/20 font-semibold border-t border-border/50">
                            <td className="text-center px-2 py-2 border-r border-border sticky left-0 z-10 bg-muted/20 text-xs">
                              {group}
                            </td>
                            {geralAllPeople.map(name => {
                              if (!names.includes(name)) {
                                return <td key={name} colSpan={2} className="border-r border-border/30" />;
                              }
                              const pt = geralPersonTotals.get(name);
                              if (!pt) return <td key={name} colSpan={2} className="text-center px-1 py-2 border-r border-border/30">—</td>;
                              return (
                                <td key={name} colSpan={2} className="border-r border-border/30 p-0">
                                  <div className="grid grid-cols-2 divide-x divide-border/20">
                                    <span className="px-1 py-2 text-center text-secondary tabular-nums">{pt.empresas}</span>
                                    <span className="px-1 py-2 text-center text-amber-600 dark:text-amber-400 tabular-nums">{pt.leads}</span>
                                  </div>
                                </td>
                              );
                            })}
                            <td className="text-center px-2 py-2 font-bold text-foreground tabular-nums">
                              {st.empresas + st.leads}
                            </td>
                          </tr>
                        );
                      })}
                      {/* Grand total row */}
                      <tr className="bg-muted/30 font-semibold border-t-2 border-border">
                        <td className="text-center px-2 py-2 border-r border-border sticky left-0 z-10 bg-muted/30">
                          {showAverageRow ? "Média" : "Total"}
                        </td>
                        {geralAllPeople.map(name => {
                          if (showAverageRow) {
                            const pa = geralPersonAverages.get(name);
                            if (!pa) return <td key={name} colSpan={2} className="text-center px-1 py-2 border-r border-border/30">—</td>;
                            return (
                              <td key={name} colSpan={2} className="border-r border-border/30 p-0">
                                <div className="grid grid-cols-2 divide-x divide-border/20">
                                  <span className="px-1 py-2 text-center font-bold text-secondary tabular-nums">{formatAverageNumber(pa.empresas)}</span>
                                  <span className="px-1 py-2 text-center font-bold text-amber-600 dark:text-amber-400 tabular-nums">{formatAverageNumber(pa.leads)}</span>
                                </div>
                              </td>
                            );
                          }

                          const pt = geralPersonTotals.get(name);
                          if (!pt) return <td key={name} colSpan={2} className="text-center px-1 py-2 border-r border-border/30">—</td>
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
                          {showAverageRow
                            ? formatAverageNumber(geralAverageGrandTotal)
                            : Array.from(geralPersonTotals.values()).reduce((s, v) => s + v.empresas + v.leads, 0)}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="empresas">
          <EmpresasView tvMode={tvMode} saveDate={effectiveSaveDate} onHistoricalSave={refreshGeralMonth} />
        </TabsContent>

        <TabsContent value="leads">
          <LeadsView tvMode={tvMode} saveDate={effectiveSaveDate} onHistoricalSave={refreshGeralMonth} />
        </TabsContent>
      </Tabs>

      {/* Events drill-down dialog */}
      <Dialog open={eventsDialog.open} onOpenChange={(open) => setEventsDialog((prev) => ({ ...prev, open }))}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{eventsDialog.title}</DialogTitle>
            <DialogDescription>{eventsDialog.items.length} registro(s) encontrado(s)</DialogDescription>
          </DialogHeader>
          <div className="space-y-1 mt-2">
            {eventsDialog.items.length === 0 && (
              <p className="text-muted-foreground text-sm text-center py-4">Nenhum registro encontrado.</p>
            )}
            {eventsDialog.items.map((item, i) => (
              <div key={i} className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-2 px-3 py-2 rounded-lg bg-muted/30 text-sm">
                <span className="truncate min-w-0 font-medium">{item.empresa}</span>
                <span className="text-xs text-muted-foreground shrink-0">{item.tipo}</span>
                <span className="text-xs text-blue-600 dark:text-blue-400 shrink-0">{formatActionCategoryLabel(item.tipoEvento)}</span>
                <span className="text-xs text-muted-foreground shrink-0 tabular-nums">{item.hora}</span>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
