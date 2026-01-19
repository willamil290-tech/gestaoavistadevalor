import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LayoutDashboard, Phone, FileText, BarChart3, Play, Pause, Tv2, RotateCcw, List, TrendingUp, Users } from "lucide-react";
import { Logo } from "@/components/Logo";
import { DashboardView } from "@/components/DashboardView";
import { AcionamentosView } from "@/components/AcionamentosView";
import { AcionamentoDetalhadoView, ColaboradorAcionamento, defaultCategorias } from "@/components/AcionamentoDetalhadoView";
import type { FaixaVencimento } from "@/components/FaixaVencimentoView";
import { BorderoDiarioView, ClienteBordero } from "@/components/BorderoDiarioView";
import { AgendadasRealizadasView, AgendadaRealizada } from "@/components/AgendadasRealizadasView";
import { TendenciaDiaView } from "@/components/TendenciaDiaView";
import { BulkPasteUpdater } from "@/components/BulkPasteUpdater";
import { BitrixLogsAnalyzerView } from "@/components/BitrixLogsAnalyzerView";
import { Commercial, CommercialProgressView } from "@/components/CommercialProgressView";
import { cn } from "@/lib/utils";
import { isSupabaseConfigured } from "@/lib/supabase";
import { useDashboardSettings } from "@/hooks/useDashboardSettings";
import { useDashboardExtras } from "@/hooks/useDashboardExtras";
import { useAutoScroll } from "@/hooks/useAutoScroll";
import { DEFAULT_SETTINGS, getLastActivityIso, insertDailyEvent, listTeamMembers, resetDayCounters, updateDashboardSettings, upsertTeamMember } from "@/lib/persistence";
import { formatDateTimeBR, getBusinessDate } from "@/lib/businessDate";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useUndoToast } from "@/hooks/useUndoToast";
import { parseDashboardBulk, parseClienteTable, parseDetailedAcionamento, parseHourlyTrend, parseBulkTeamText, normalizeName, type DetailedEntry, type HourlyTrend, type BulkEntry } from "@/lib/bulkParse";
import { loadJson, saveJson, removeKey } from "@/lib/localStore";
import { type BitrixReport } from "@/lib/bitrixLogs";
import { isIgnoredCommercial } from "@/lib/ignoredCommercials";

function normalizeNameKeyLoose(name: string) {
  return name.toLowerCase().replace(/\s+/g, " ").trim();
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

type TabType = "dashboard" | "comerciais" | "acionamentos" | "acionamento-detalhado" | "tendencia" | "bordero-diario" | "bitrix";

const pollInterval = Number(import.meta.env.VITE_SYNC_POLL_INTERVAL ?? 5000);

// Initial data
const initialCommercials: Commercial[] = [
  { id: "c1", name: "Samara", currentValue: 0, goal: 50000, group: "closer" },
  { id: "c2", name: "Luciane", currentValue: 0, goal: 100000, group: "executivo" },
  { id: "c3", name: "Raissa", currentValue: 0, goal: 100000, group: "executivo" },
  { id: "c4", name: "Alessandra", currentValue: 0, goal: 100000, group: "executivo" },
  { id: "c5", name: "Rodrigo", currentValue: 0, goal: 100000, group: "executivo" },
  { id: "c6", name: "Bruna", currentValue: 0, goal: 50000, group: "cs" },
];

const initialAcionamentoDetalhado: ColaboradorAcionamento[] = [
  { id: "ad1", name: "Alessandra", total: 0, categorias: defaultCategorias.map(t => ({ tipo: t, quantidade: 0 })) },
  { id: "ad2", name: "Luciane", total: 0, categorias: defaultCategorias.map(t => ({ tipo: t, quantidade: 0 })) },
  { id: "ad3", name: "Samara", total: 0, categorias: defaultCategorias.map(t => ({ tipo: t, quantidade: 0 })) },
];

const initialFaixas: FaixaVencimento[] = [
  { faixa: "0-180", valorMes: 0, valorDia: 0 },
  { faixa: "181-360", valorMes: 0, valorDia: 0 },
  { faixa: "361-720", valorMes: 0, valorDia: 0 },
  { faixa: "720+", valorMes: 0, valorDia: 0 },
];

const initialAgendadasMes: AgendadaRealizada[] = [
  { label: "Semana 1", agendadas: 0, realizadas: 0 },
  { label: "Semana 2", agendadas: 0, realizadas: 0 },
  { label: "Semana 3", agendadas: 0, realizadas: 0 },
  { label: "Semana 4", agendadas: 0, realizadas: 0 },
];

const initialAgendadasDia: AgendadaRealizada[] = [
  { label: "Manhã", agendadas: 0, realizadas: 0 },
  { label: "Tarde", agendadas: 0, realizadas: 0 },
];

const Index = () => {
  const qc = useQueryClient();
  const showUndo = useUndoToast();

  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const tvFromUrl = params.get("tv") === "1";
  const [tvMode, setTvMode] = useState(() => tvFromUrl || localStorage.getItem("tvMode") === "1");

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const [activeTab, setActiveTab] = useState<TabType>("dashboard");
  const [autoRotate, setAutoRotate] = useState(false);
  const [rotateInterval, setRotateInterval] = useState(1);

  // Auto-scroll global (modo TV): desce ate o fim, pausa e volta ao topo.
  // Quando a aba muda (auto-rotate), reseta o scroll para o topo.
  useAutoScroll(scrollContainerRef, {
    enabled: tvMode,
    resetKey: activeTab,
    speedPxPerFrame: 1,
    bottomPauseMs: 2000,
    topPauseMs: 600,
  });

  // Dashboard values
  const remoteSettings = useDashboardSettings();
  const remoteExtras = useDashboardExtras();
  const [metaMes, setMetaMes] = useState(DEFAULT_SETTINGS.metaMes);
  const [metaDia, setMetaDia] = useState(DEFAULT_SETTINGS.metaDia);
  const [atingidoMes, setAtingidoMes] = useState(DEFAULT_SETTINGS.atingidoMes);
  const [atingidoDia, setAtingidoDia] = useState(DEFAULT_SETTINGS.atingidoDia);
  const [commercials, setCommercials] = useState<Commercial[]>(initialCommercials);

  // New views state
  const [acionamentoDetalhado, setAcionamentoDetalhado] = useState(initialAcionamentoDetalhado);
  const [faixas, setFaixas] = useState(initialFaixas);
  const [clientes, setClientes] = useState<ClienteBordero[]>([]);
  
  const [agendadasMes, setAgendadasMes] = useState(initialAgendadasMes);
  const [agendadasDia, setAgendadasDia] = useState(initialAgendadasDia);
  const [trendStorageKey] = useState(() => `trendData:${getBusinessDate()}`);
  const [trendData, setTrendData] = useState<HourlyTrend[]>(() => loadJson(trendStorageKey, [] as HourlyTrend[]));

  // Evita spam de toast caso o Supabase não esteja pronto para salvar trend_data
  const trendSyncWarnedRef = useRef(false);

  const [extrasHydrated, setExtrasHydrated] = useState(false);

  // Persist tendência por hora (localStorage)
  useEffect(() => {
    saveJson(trendStorageKey, trendData);
  }, [trendData, trendStorageKey]);

  // Hydrate extras once (avoid overwriting local edits on every poll)
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    if (extrasHydrated) return;

    // Evita hidratar com placeholderData do React Query (antes de buscar do Supabase)
    if (remoteExtras.isPlaceholderData || remoteExtras.isLoading) return;
    if (!remoteExtras.data) return;

    const ex = remoteExtras.data;

    if (Array.isArray(ex.commercials) && ex.commercials.length) setCommercials(ex.commercials as any);
    if (Array.isArray(ex.faixas) && ex.faixas.length) setFaixas(ex.faixas as any);
    if (Array.isArray(ex.clientes) && ex.clientes.length) setClientes(ex.clientes as any);
    if (Array.isArray(ex.acionamentoDetalhado) && ex.acionamentoDetalhado.length) setAcionamentoDetalhado(ex.acionamentoDetalhado as any);
    if (Array.isArray(ex.agendadasMes) && ex.agendadasMes.length) setAgendadasMes(ex.agendadasMes as any);
    if (Array.isArray(ex.agendadasDia) && ex.agendadasDia.length) setAgendadasDia(ex.agendadasDia as any);
    if (Array.isArray((ex as any).trendData) && (ex as any).trendData.length) setTrendData((ex as any).trendData as any);

    setExtrasHydrated(true);
  }, [remoteExtras.data, remoteExtras.isPlaceholderData, remoteExtras.isLoading, extrasHydrated]);

  // Persist extras with debounce
  useEffect(() => {
    if (!isSupabaseConfigured || !extrasHydrated) return;
    const t = setTimeout(() => {
      remoteExtras.update({ commercials });
    }, 700);
    return () => clearTimeout(t);
  }, [commercials, extrasHydrated]);

  useEffect(() => {
    if (!isSupabaseConfigured || !extrasHydrated) return;
    const t = setTimeout(() => {
      remoteExtras.update({ faixas: faixas as any });
    }, 700);
    return () => clearTimeout(t);
  }, [faixas, extrasHydrated]);

  useEffect(() => {
    if (!isSupabaseConfigured || !extrasHydrated) return;
    const t = setTimeout(() => {
      remoteExtras.update({ clientes: clientes as any });
    }, 700);
    return () => clearTimeout(t);
  }, [clientes, extrasHydrated]);

  useEffect(() => {
    if (!isSupabaseConfigured || !extrasHydrated) return;
    const t = setTimeout(() => {
      remoteExtras.update({ acionamentoDetalhado: acionamentoDetalhado as any });
    }, 700);
    return () => clearTimeout(t);
  }, [acionamentoDetalhado, extrasHydrated]);

  useEffect(() => {
    if (!isSupabaseConfigured || !extrasHydrated) return;
    const t = setTimeout(() => {
      remoteExtras.update({ agendadasMes: agendadasMes as any, agendadasDia: agendadasDia as any });
    }, 700);
    return () => clearTimeout(t);
  }, [agendadasMes, agendadasDia, extrasHydrated]);

  useEffect(() => {
    if (!isSupabaseConfigured || !extrasHydrated) return;
    const t = setTimeout(async () => {
      try {
        await remoteExtras.updateAsync({ trendData: trendData as any });
      } catch (e: any) {
        // Ex.: coluna trend_data não existe ou RLS bloqueando update
        if (!trendSyncWarnedRef.current) {
          trendSyncWarnedRef.current = true;
          toast.error(e?.message ?? "Falha ao salvar Tendência no Supabase");
        }
        console.error(e);
      }
    }, 700);
    return () => clearTimeout(t);
  }, [trendData, extrasHydrated]);

  useEffect(() => {
    if (!isSupabaseConfigured || !remoteSettings.data) return;
    setMetaMes(remoteSettings.data.metaMes);
    setMetaDia(remoteSettings.data.metaDia);
    setAtingidoMes(remoteSettings.data.atingidoMes);
    setAtingidoDia(remoteSettings.data.atingidoDia);
  }, [remoteSettings.data]);

  useEffect(() => {
    localStorage.setItem("tvMode", tvMode ? "1" : "0");
    if (tvMode) {
      setAutoRotate(true);
      setRotateInterval(0.5);
      try { document.documentElement.requestFullscreen?.(); } catch {}
    } else {
      try { if (document.fullscreenElement) document.exitFullscreen?.(); } catch {}
    }
  }, [tvMode]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && tvMode) setTvMode(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tvMode]);

  useEffect(() => {
    if (!autoRotate) return;
    const tabs: TabType[] = ["dashboard", "comerciais", "acionamentos", "acionamento-detalhado", "tendencia", "bordero-diario"];
    const interval = setInterval(() => {
      setActiveTab((current) => {
        const idx = tabs.indexOf(current);
        return tabs[(idx + 1) % tabs.length];
      });
    }, rotateInterval * 60 * 1000);
    return () => clearInterval(interval);
  }, [autoRotate, rotateInterval]);

  const lastActivity = useQuery({
    queryKey: ["last-activity"],
    enabled: isSupabaseConfigured,
    queryFn: getLastActivityIso,
    refetchInterval: pollInterval,
    staleTime: 0,
  });

  const doReset = async () => {
    if (!isSupabaseConfigured) return;
    try {
      const businessDate = getBusinessDate();
      const [empresas, leads] = await Promise.all([listTeamMembers("empresas"), listTeamMembers("leads")]);
      const oldAtingidoDia = atingidoDia;
      const oldTrendData = trendData;
      await resetDayCounters();
      setAtingidoDia(0);
      setTrendData([]);
      removeKey(trendStorageKey);
      try { await remoteExtras.updateAsync({ trendData: [] as any }); } catch {}
      await insertDailyEvent({ businessDate, scope: "bordero", kind: "reset", deltaBorderoDia: -oldAtingidoDia });
      toast.success("Reset do dia aplicado");
      showUndo({
        message: "Reset aplicado",
        onUndo: async () => {
          await updateDashboardSettings({ atingidoDia: oldAtingidoDia });
          setAtingidoDia(oldAtingidoDia);
          setTrendData(oldTrendData);
          saveJson(trendStorageKey, oldTrendData);
          try { await remoteExtras.updateAsync({ trendData: oldTrendData as any }); } catch {}
          for (const m of [...empresas, ...leads]) await upsertTeamMember(m);
          await insertDailyEvent({ businessDate, scope: "bordero", kind: "undo", deltaBorderoDia: oldAtingidoDia });
          qc.invalidateQueries({ queryKey: ["dashboard-settings"] });
          qc.invalidateQueries({ queryKey: ["team-members", "empresas"] });
          qc.invalidateQueries({ queryKey: ["team-members", "leads"] });
        },
        ttlMs: 45_000,
      });
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao resetar");
    }
  };

  // Handler for bulk dashboard data paste
  const handleBulkDashboardPaste = async (text: string) => {
    // Parse dashboard data
    const dashData = parseDashboardBulk(text);
    
    if (dashData) {
      // Update main values
      if (dashData.valorBorderoMes > 0) {
        setAtingidoMes(dashData.valorBorderoMes);
        if (isSupabaseConfigured) {
          try {
            await remoteSettings.updateAsync({ atingidoMes: dashData.valorBorderoMes });
          } catch (e: any) {
            console.error(e);
            toast.error(e?.message ?? "Falha ao salvar no Supabase");
          }
        }
      }
      if (dashData.valorBorderoDia > 0) {
        setAtingidoDia(dashData.valorBorderoDia);
        if (isSupabaseConfigured) {
          try {
            await remoteSettings.updateAsync({ atingidoDia: dashData.valorBorderoDia });
          } catch (e: any) {
            console.error(e);
            toast.error(e?.message ?? "Falha ao salvar no Supabase");
          }
        }
      }

      // Update commercials by matching first name
      if (dashData.commercials.length > 0) {
        setCommercials(prev => {
          const updated = [...prev];
          for (const parsed of dashData.commercials) {
            const parsedFirstName = normalizeName(parsed.name.split(" ")[0]);
            const idx = updated.findIndex(c => normalizeName(c.name) === parsedFirstName);
            if (idx !== -1) {
              updated[idx] = { ...updated[idx], currentValue: parsed.value };
            }
          }
          return updated;
        });
      }

      // Update faixas
      if (dashData.faixasMes.length > 0 || dashData.faixasDia.length > 0) {
        setFaixas(prev => {
          const updated = [...prev];
          for (const f of dashData.faixasMes) {
            const faixaKey = f.faixa.includes("720") && !f.faixa.includes("-") ? "720+" : f.faixa;
            const idx = updated.findIndex(u => u.faixa === faixaKey);
            if (idx !== -1) {
              updated[idx] = { ...updated[idx], valorMes: f.valor };
            }
          }
          for (const f of dashData.faixasDia) {
            const faixaKey = f.faixa.includes("720") && !f.faixa.includes("-") ? "720+" : f.faixa;
            const idx = updated.findIndex(u => u.faixa === faixaKey);
            if (idx !== -1) {
              updated[idx] = { ...updated[idx], valorDia: f.valor };
            }
          }
          return updated;
        });
      }

      toast.success("Dashboard e Comerciais atualizados!");
    }

    // Parse client table
    const clienteEntries = parseClienteTable(text);
    if (clienteEntries.length > 0) {
      const newClientes: ClienteBordero[] = clienteEntries.map((c, i) => ({
        id: `cli_${Date.now()}_${i}`,
        cliente: c.cliente,
        comercial: "",
        valor: c.valor,
        horario: "",
        observacao: "",
      }));
      setClientes(newClientes);
      toast.success(`${clienteEntries.length} clientes importados!`);
    }

    if (!dashData && clienteEntries.length === 0) {
      toast.error("Formato de texto não reconhecido");
    }
  };

  // Handler for detailed acionamento updates from AcionamentosView
  const handleDetailedUpdate = (entries: DetailedEntry[]) => {
    setAcionamentoDetalhado(prev => {
      const updated: ColaboradorAcionamento[] = [];
      
      for (const entry of entries) {
        if (isIgnoredCommercial(entry.name)) continue;
        const firstName = entry.name.split(" ")[0];
        const existing = prev.find(p => normalizeName(p.name) === normalizeName(firstName));
        
        updated.push({
          id: existing?.id ?? `ad_${Date.now()}_${Math.random().toString(16).slice(2)}`,
          name: firstName,
          total: entry.total,
          categorias: [
            { tipo: "ETAPA_ALTERADA", quantidade: entry.etapaAlterada },
            { tipo: "ATIVIDADE_CRIADA", quantidade: entry.atividadeCriada },
            { tipo: "STATUS_ATIVIDADE_ALTERADA", quantidade: entry.statusAlterada },
            { tipo: "CHAMADA_TELEFONICA", quantidade: entry.chamadaTelefonica },
            { tipo: "OUTROS", quantidade: entry.outros },
          ],
        });
      }
      
      return updated;
    });
  };

  // Apply Bitrix Analyzer result directly into the site (tendência + acionamentos + detalhado)
  const applyBitrixReportToSite = async (bitrix: BitrixReport) => {
    // 1) Tendência por hora
    const newTrend: HourlyTrend[] = Object.keys(bitrix.hourlyCounts)
      .map((h) => Number(h))
      .filter((h) => Number.isFinite(h) && (bitrix.hourlyCounts[h] ?? 0) > 0)
      .sort((a, b) => a - b)
      .map((h) => ({ hour: pad2(h), actions: bitrix.hourlyCounts[h] ?? 0 }));
    // Persistência remota fica no efeito debounce acima (evita duplicar writes)
    setTrendData(newTrend);

    // 2) Acionamento normal (Empresas/Leads)
    const byCategory: Record<"empresas" | "leads", Array<{ name: string; morning: number; afternoon: number }>> = {
      empresas: [],
      leads: [],
    };
    for (const r of bitrix.uniqueResumo) {
      if (isIgnoredCommercial(r.comercial)) continue;
      const category = r.entityType === "NEGÓCIO" ? "empresas" : "leads";
      byCategory[category].push({ name: r.comercial, morning: r.morning, afternoon: r.afternoon });
    }

    const businessDate = getBusinessDate();

    // Local-only fallback (sem Supabase): salva para as views lerem quando abrir a aba
    if (!isSupabaseConfigured) {
      const toLocal = (category: "empresas" | "leads") =>
        byCategory[category].map((e, i) => ({
          id: `tm_${category}_${Date.now()}_${i}`,
          name: e.name,
          morning: e.morning,
          afternoon: e.afternoon,
          total: e.morning + e.afternoon,
        }));
      saveJson(`teamMembers:${businessDate}:empresas`, toLocal("empresas"));
      saveJson(`teamMembers:${businessDate}:leads`, toLocal("leads"));
    }

    // Supabase: upsert + daily_events deltas
    if (isSupabaseConfigured) {
      for (const category of ["empresas", "leads"] as const) {
        const incoming = byCategory[category];
        if (!incoming.length) continue;

        const existing = await listTeamMembers(category);
        const existingByKey = new Map(existing.map((m) => [normalizeNameKeyLoose(m.name), m]));

        for (const e of incoming) {
          const key = normalizeNameKeyLoose(e.name);
          const old = existingByKey.get(key);
          const id = old?.id ?? ((globalThis.crypto as any)?.randomUUID?.() ? (globalThis.crypto as any).randomUUID() : `tm_${Date.now()}_${Math.random().toString(16).slice(2)}`);

          await upsertTeamMember({ id, category, name: e.name, morning: e.morning, afternoon: e.afternoon } as any);

          const dm = e.morning - (old?.morning ?? 0);
          const da = e.afternoon - (old?.afternoon ?? 0);
          if (dm !== 0 || da !== 0) {
            await insertDailyEvent({
              businessDate,
              scope: category,
              kind: "bulk",
              memberId: id,
              deltaMorning: dm,
              deltaAfternoon: da,
            });
          }
        }

        // Atualiza cache das views Empresas/Leads
        qc.invalidateQueries({ queryKey: ["team-members", category] });
      }
    }

    // 3) Acionamento detalhado
    const detailed = bitrix.actionResumo
      .filter((r) => !isIgnoredCommercial(r.comercial))
      .map((r) => {
      const total = defaultCategorias.reduce((sum, k) => sum + Number((r.counts as any)[k] ?? 0), 0);
      const match = acionamentoDetalhado.find(
        (x) => normalizeName(x.name) === normalizeName(r.comercial) || normalizeName(x.name) === normalizeName(r.comercial.split(" ")[0])
      );
      return {
        id: match?.id ?? `ad_${normalizeNameKeyLoose(r.comercial).replace(/[^a-z0-9]+/g, "_")}`,
        name: r.comercial,
        total,
        categorias: defaultCategorias.map((k) => ({ tipo: k, quantidade: Number((r.counts as any)[k] ?? 0) })),
      } as ColaboradorAcionamento;
    });
    setAcionamentoDetalhado(detailed);
    try {
      if (isSupabaseConfigured) await remoteExtras.updateAsync({ acionamentoDetalhado: detailed as any });
    } catch {}
  };

  const readOnly = tvMode;

  const tabs = [
    { id: "dashboard" as const, label: "Dashboard", icon: LayoutDashboard, color: "bg-primary" },
    { id: "comerciais" as const, label: "Comerciais", icon: Users, color: "bg-primary" },
    { id: "acionamentos" as const, label: "Acionamentos", icon: Phone, color: "bg-secondary" },
    { id: "acionamento-detalhado" as const, label: "Detalhado", icon: List, color: "bg-secondary" },
    { id: "tendencia" as const, label: "Tendência", icon: TrendingUp, color: "bg-accent" },
    { id: "bitrix" as const, label: "Bitrix", icon: BarChart3, color: "bg-primary" },
    { id: "bordero-diario" as const, label: "Borderô", icon: FileText, color: "bg-primary" },
  ];

  return (
    <div className={cn("bg-background", tvMode ? "h-screen overflow-hidden p-0" : "min-h-screen p-2 md:p-4")}>
      <div ref={scrollContainerRef} className={cn("mx-auto w-full", tvMode ? "max-w-none h-full overflow-y-auto" : "max-w-[1600px]")}>
        {!tvMode && (
          <header className="flex flex-col md:flex-row items-center justify-between gap-4 mb-4">
            <Logo className="w-14 h-14 md:w-16 md:h-16" />

            <div className="flex flex-wrap bg-card rounded-xl p-1 border border-border gap-1">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "flex items-center gap-1 px-3 py-2 rounded-lg font-medium transition-all duration-300 text-sm",
                    activeTab === tab.id
                      ? `${tab.color} text-white shadow-lg`
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                >
                  <tab.icon className="w-4 h-4" />
                  <span className="hidden lg:inline">{tab.label}</span>
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" className="rounded-xl" onClick={() => setTvMode(true)} title="Modo TV">
                <Tv2 className="w-4 h-4 mr-2" />TV
              </Button>

              {isSupabaseConfigured && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" className="rounded-xl" title="Reset do dia">
                      <RotateCcw className="w-4 h-4 mr-2" />Reset
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Resetar o dia?</AlertDialogTitle>
                      <AlertDialogDescription>Zera Borderô do dia e acionamentos de Empresas/Leads.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={doReset}>Resetar</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}

              <div className="flex items-center gap-2 bg-card rounded-xl p-2 border border-border">
                <button onClick={() => setAutoRotate(!autoRotate)} className={cn("p-2 rounded-lg transition-all duration-300", autoRotate ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted")}>
                  {autoRotate ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </button>
                <select value={rotateInterval} onChange={(e) => setRotateInterval(Number(e.target.value))} className="bg-muted text-foreground text-sm rounded-lg px-2 py-1 border-none focus:ring-2 focus:ring-primary">
                  <option value={0.5}>30s</option>
                  <option value={1}>1 min</option>
                  <option value={2}>2 min</option>
                  <option value={5}>5 min</option>
                </select>
              </div>
            </div>
          </header>
        )}

        {/* Bulk paste area - hidden in TV mode */}
        {!tvMode && (
          <BulkPasteUpdater
            title="Atualizar Dashboard e Borderô"
            subtitle="Cole os dados de borderô (mês/dia), comerciais e tabela de clientes"
            onApply={handleBulkDashboardPaste}
          />
        )}

        <div className={cn(tvMode ? "p-2 md:p-3" : "")}>
          {activeTab === "dashboard" && (
            <DashboardView 
              metaMes={metaMes} 
              metaDia={metaDia} 
              atingidoMes={atingidoMes} 
              atingidoDia={atingidoDia} 
              tvMode={tvMode} 
              readOnly={readOnly}
              onMetaMesChange={(v) => { setMetaMes(v); if (isSupabaseConfigured) remoteSettings.updateAsync({ metaMes: v }); }}
              onMetaDiaChange={(v) => { setMetaDia(v); if (isSupabaseConfigured) remoteSettings.updateAsync({ metaDia: v }); }}
              onAtingidoMesChange={(v) => { setAtingidoMes(v); if (isSupabaseConfigured) remoteSettings.updateAsync({ atingidoMes: v }); }}
              onAtingidoDiaChange={(v) => { const old = atingidoDia; setAtingidoDia(v); if (isSupabaseConfigured) { remoteSettings.updateAsync({ atingidoDia: v }); if (v - old !== 0) insertDailyEvent({ businessDate: getBusinessDate(), scope: "bordero", kind: "single", deltaBorderoDia: v - old }); } }}
            />
          )}
          {activeTab === "comerciais" && (
            <div className="animate-fade-in-up">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-3 h-3 rounded-full bg-primary" />
                <h2 className={cn("font-semibold text-foreground", tvMode ? "text-3xl" : "text-2xl md:text-3xl")}>
                  Progresso por Comercial
                </h2>
              </div>
              <div className="bg-card rounded-2xl p-4 md:p-6 border border-border">
                <CommercialProgressView
                  commercials={commercials}
                  onUpdate={(c) => setCommercials((prev) => prev.map((x) => (x.id === c.id ? c : x)))}
                  onAdd={() => setCommercials((prev) => [...prev, { id: `c_${Date.now()}`, name: "Novo", currentValue: 0, goal: 50000, group: "executivo" }])}
                  onDelete={(id) => setCommercials((prev) => prev.filter((x) => x.id !== id))}
                  readOnly={readOnly}
                  tvMode={tvMode}
                />
              </div>
            </div>
          )}
          {activeTab === "acionamentos" && <AcionamentosView tvMode={tvMode} onDetailedUpdate={handleDetailedUpdate} />}
          {activeTab === "acionamento-detalhado" && (
            <AcionamentoDetalhadoView colaboradores={acionamentoDetalhado} onUpdate={(c) => setAcionamentoDetalhado((prev) => prev.map((x) => (x.id === c.id ? c : x)))} onAdd={() => setAcionamentoDetalhado((prev) => [...prev, { id: `ad_${Date.now()}`, name: "Novo", total: 0, categorias: defaultCategorias.map((t) => ({ tipo: t, quantidade: 0 })) }])} onDelete={(id) => setAcionamentoDetalhado((prev) => prev.filter((x) => x.id !== id))} readOnly={readOnly} tvMode={tvMode} />
          )}
          {activeTab === "tendencia" && (
            <TendenciaDiaView 
              tvMode={tvMode} 
              trendData={trendData}
              onTrendUpdate={setTrendData}
              onDetailedUpdate={handleDetailedUpdate}
            />
          )}
          {activeTab === "bitrix" && (
            <BitrixLogsAnalyzerView tvMode={tvMode} onApplyToDashboard={applyBitrixReportToSite} />
          )}
          {activeTab === "bordero-diario" && (
            <BorderoDiarioView clientes={clientes} metaDia={metaDia} onClienteAdd={() => setClientes((prev) => [...prev, { id: `cli_${Date.now()}`, cliente: "Novo Cliente", comercial: "", valor: 0, horario: "", observacao: "" }])} onClienteUpdate={(c) => setClientes((prev) => prev.map((x) => (x.id === c.id ? c : x)))} onClienteDelete={(id) => setClientes((prev) => prev.filter((x) => x.id !== id))} onMetaChange={(v) => { setMetaDia(v); if (isSupabaseConfigured) remoteSettings.updateAsync({ metaDia: v }); }} readOnly={readOnly} tvMode={tvMode} />
          )}
        </div>

        <footer className={cn("mt-4 text-xs text-muted-foreground", tvMode ? "p-2" : "")}>
          <div className="flex items-center justify-between gap-3">
            <div>Última atualização: <span className="font-medium text-foreground">{lastActivity.data ? formatDateTimeBR(lastActivity.data) : "—"}</span></div>
            {tvMode && <button onClick={() => setTvMode(false)} className="px-3 py-1 rounded-full bg-muted hover:bg-muted/80 text-foreground transition">Sair do modo TV</button>}
          </div>
        </footer>
      </div>
    </div>
  );
};

export default Index;
