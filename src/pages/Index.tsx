import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LayoutDashboard, Phone, FileText, Calendar, PieChart, BarChart3, Play, Pause, Tv2, RotateCcw, List } from "lucide-react";
import { Logo } from "@/components/Logo";
import { DashboardView } from "@/components/DashboardView";
import { AcionamentosView } from "@/components/AcionamentosView";
import { AcionamentoDetalhadoView, ColaboradorAcionamento, defaultCategorias } from "@/components/AcionamentoDetalhadoView";
import { FaixaVencimentoView, FaixaVencimento } from "@/components/FaixaVencimentoView";
import { BorderoDiarioView, ClienteBordero } from "@/components/BorderoDiarioView";
import { BorderoCategorizadoView, CategoriaData } from "@/components/BorderoCategorizadoView";
import { AgendadasRealizadasView, AgendadaRealizada } from "@/components/AgendadasRealizadasView";
import { cn } from "@/lib/utils";
import { isSupabaseConfigured } from "@/lib/supabase";
import { useDashboardSettings } from "@/hooks/useDashboardSettings";
import { DEFAULT_SETTINGS, getLastActivityIso, insertDailyEvent, listTeamMembers, resetDayCounters, updateDashboardSettings, upsertTeamMember } from "@/lib/persistence";
import { formatDateTimeBR, getBusinessDate } from "@/lib/businessDate";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useUndoToast } from "@/hooks/useUndoToast";

type TabType = "dashboard" | "acionamentos" | "acionamento-detalhado" | "faixa-vencimento" | "bordero-diario" | "bordero-categorizado" | "agendadas-realizadas";

const pollInterval = Number(import.meta.env.VITE_SYNC_POLL_INTERVAL ?? 5000);

// Initial data
const initialAcionamentoDetalhado: ColaboradorAcionamento[] = [
  { id: "ad1", name: "Alessandra", total: 0, categorias: defaultCategorias.map(t => ({ tipo: t, quantidade: 0 })) },
  { id: "ad2", name: "Luciane", total: 0, categorias: defaultCategorias.map(t => ({ tipo: t, quantidade: 0 })) },
  { id: "ad3", name: "Samara", total: 0, categorias: defaultCategorias.map(t => ({ tipo: t, quantidade: 0 })) },
];

const initialFaixas: FaixaVencimento[] = [
  { faixa: "0-30", valorMes: 0, valorDia: 0 },
  { faixa: "31-60", valorMes: 0, valorDia: 0 },
  { faixa: "61-120", valorMes: 0, valorDia: 0 },
  { faixa: "121-180", valorMes: 0, valorDia: 0 },
  { faixa: "181-360", valorMes: 0, valorDia: 0 },
  { faixa: "361-720", valorMes: 0, valorDia: 0 },
  { faixa: "721+", valorMes: 0, valorDia: 0 },
];

const initialCategorias: CategoriaData[] = [
  { categoria: "Efetivo", valorMes: 0, valorDia: 0 },
  { categoria: "Indevido", valorMes: 0, valorDia: 0 },
  { categoria: "Campanha", valorMes: 0, valorDia: 0 },
  { categoria: "Repique", valorMes: 0, valorDia: 0 },
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

  const [activeTab, setActiveTab] = useState<TabType>("dashboard");
  const [autoRotate, setAutoRotate] = useState(false);
  const [rotateInterval, setRotateInterval] = useState(1);

  // Dashboard values
  const remoteSettings = useDashboardSettings();
  const [metaMes, setMetaMes] = useState(DEFAULT_SETTINGS.metaMes);
  const [metaDia, setMetaDia] = useState(DEFAULT_SETTINGS.metaDia);
  const [atingidoMes, setAtingidoMes] = useState(DEFAULT_SETTINGS.atingidoMes);
  const [atingidoDia, setAtingidoDia] = useState(DEFAULT_SETTINGS.atingidoDia);

  // New views state
  const [acionamentoDetalhado, setAcionamentoDetalhado] = useState(initialAcionamentoDetalhado);
  const [faixas, setFaixas] = useState(initialFaixas);
  const [clientes, setClientes] = useState<ClienteBordero[]>([]);
  const [categorias, setCategorias] = useState(initialCategorias);
  const [agendadasMes, setAgendadasMes] = useState(initialAgendadasMes);
  const [agendadasDia, setAgendadasDia] = useState(initialAgendadasDia);

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
    const tabs: TabType[] = ["dashboard", "acionamentos", "acionamento-detalhado", "faixa-vencimento", "bordero-diario", "bordero-categorizado", "agendadas-realizadas"];
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
      await resetDayCounters();
      setAtingidoDia(0);
      await insertDailyEvent({ businessDate, scope: "bordero", kind: "reset", deltaBorderoDia: -oldAtingidoDia });
      toast.success("Reset do dia aplicado");
      showUndo({
        message: "Reset aplicado",
        onUndo: async () => {
          await updateDashboardSettings({ atingidoDia: oldAtingidoDia });
          setAtingidoDia(oldAtingidoDia);
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

  const readOnly = tvMode;

  const tabs = [
    { id: "dashboard" as const, label: "Dashboard", icon: LayoutDashboard, color: "bg-primary" },
    { id: "acionamentos" as const, label: "Acionamentos", icon: Phone, color: "bg-secondary" },
    { id: "acionamento-detalhado" as const, label: "Detalhado", icon: List, color: "bg-secondary" },
    { id: "faixa-vencimento" as const, label: "Faixa Venc.", icon: Calendar, color: "bg-gold" },
    { id: "bordero-diario" as const, label: "Borderô", icon: FileText, color: "bg-primary" },
    { id: "bordero-categorizado" as const, label: "Categorizado", icon: PieChart, color: "bg-primary" },
    { id: "agendadas-realizadas" as const, label: "Agendadas", icon: BarChart3, color: "bg-secondary" },
  ];

  return (
    <div className={cn("min-h-screen bg-background", tvMode ? "p-0" : "p-2 md:p-4")}>
      <div className={cn("mx-auto w-full", tvMode ? "max-w-none" : "max-w-[1600px]")}>
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

        <div className={cn(tvMode ? "p-2 md:p-3" : "")}>
          {activeTab === "dashboard" && (
            <DashboardView metaMes={metaMes} metaDia={metaDia} atingidoMes={atingidoMes} atingidoDia={atingidoDia} tvMode={tvMode} readOnly={readOnly}
              onMetaMesChange={(v) => { setMetaMes(v); if (isSupabaseConfigured) remoteSettings.updateAsync({ metaMes: v }); }}
              onMetaDiaChange={(v) => { setMetaDia(v); if (isSupabaseConfigured) remoteSettings.updateAsync({ metaDia: v }); }}
              onAtingidoMesChange={(v) => { setAtingidoMes(v); if (isSupabaseConfigured) remoteSettings.updateAsync({ atingidoMes: v }); }}
              onAtingidoDiaChange={(v) => { const old = atingidoDia; setAtingidoDia(v); if (isSupabaseConfigured) { remoteSettings.updateAsync({ atingidoDia: v }); if (v - old !== 0) insertDailyEvent({ businessDate: getBusinessDate(), scope: "bordero", kind: "single", deltaBorderoDia: v - old }); } }}
            />
          )}
          {activeTab === "acionamentos" && <AcionamentosView tvMode={tvMode} />}
          {activeTab === "acionamento-detalhado" && (
            <AcionamentoDetalhadoView colaboradores={acionamentoDetalhado} onUpdate={(c) => setAcionamentoDetalhado((prev) => prev.map((x) => (x.id === c.id ? c : x)))} onAdd={() => setAcionamentoDetalhado((prev) => [...prev, { id: `ad_${Date.now()}`, name: "Novo", total: 0, categorias: defaultCategorias.map((t) => ({ tipo: t, quantidade: 0 })) }])} onDelete={(id) => setAcionamentoDetalhado((prev) => prev.filter((x) => x.id !== id))} readOnly={readOnly} tvMode={tvMode} />
          )}
          {activeTab === "faixa-vencimento" && <FaixaVencimentoView faixas={faixas} onUpdate={setFaixas} readOnly={readOnly} tvMode={tvMode} />}
          {activeTab === "bordero-diario" && (
            <BorderoDiarioView clientes={clientes} metaDia={metaDia} onClienteAdd={() => setClientes((prev) => [...prev, { id: `cli_${Date.now()}`, cliente: "Novo Cliente", comercial: "", valor: 0, horario: "", observacao: "" }])} onClienteUpdate={(c) => setClientes((prev) => prev.map((x) => (x.id === c.id ? c : x)))} onClienteDelete={(id) => setClientes((prev) => prev.filter((x) => x.id !== id))} onMetaChange={(v) => { setMetaDia(v); if (isSupabaseConfigured) remoteSettings.updateAsync({ metaDia: v }); }} readOnly={readOnly} tvMode={tvMode} />
          )}
          {activeTab === "bordero-categorizado" && <BorderoCategorizadoView categorias={categorias} onUpdate={setCategorias} readOnly={readOnly} tvMode={tvMode} />}
          {activeTab === "agendadas-realizadas" && <AgendadasRealizadasView dadosMes={agendadasMes} dadosDia={agendadasDia} onUpdateMes={setAgendadasMes} onUpdateDia={setAgendadasDia} readOnly={readOnly} tvMode={tvMode} />}
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
