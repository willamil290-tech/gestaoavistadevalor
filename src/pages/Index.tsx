import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LayoutDashboard, Users, Target, Play, Pause, Tv2, RotateCcw } from "lucide-react";
import { Logo } from "@/components/Logo";
import { DashboardView } from "@/components/DashboardView";
import { EmpresasView } from "@/components/EmpresasView";
import { LeadsView } from "@/components/LeadsView";
import { cn } from "@/lib/utils";
import { isSupabaseConfigured } from "@/lib/supabase";
import { useDashboardSettings } from "@/hooks/useDashboardSettings";
import {
  DEFAULT_SETTINGS,
  getLastActivityIso,
  insertDailyEvent,
  listTeamMembers,
  resetDayCounters,
  updateDashboardSettings,
  upsertTeamMember,
} from "@/lib/persistence";
import { formatDateTimeBR, getBusinessDate } from "@/lib/businessDate";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useUndoToast } from "@/hooks/useUndoToast";

type TabType = "dashboard" | "empresas" | "leads";

const pollInterval = Number(import.meta.env.VITE_SYNC_POLL_INTERVAL ?? 5000);

const Index = () => {
  const qc = useQueryClient();
  const showUndo = useUndoToast();

  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const tvFromUrl = params.get("tv") === "1";
  const [tvMode, setTvMode] = useState(() => tvFromUrl || localStorage.getItem("tvMode") === "1");

  const [activeTab, setActiveTab] = useState<TabType>("dashboard");
  const [autoRotate, setAutoRotate] = useState(false);
  const [rotateInterval, setRotateInterval] = useState(1); // minutes

  // Dashboard values (local state + remote sync)
  const remoteSettings = useDashboardSettings();

  const [metaMes, setMetaMes] = useState(DEFAULT_SETTINGS.metaMes);
  const [metaDia, setMetaDia] = useState(DEFAULT_SETTINGS.metaDia);
  const [atingidoMes, setAtingidoMes] = useState(DEFAULT_SETTINGS.atingidoMes);
  const [atingidoDia, setAtingidoDia] = useState(DEFAULT_SETTINGS.atingidoDia);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    if (!remoteSettings.data) return;
    setMetaMes(remoteSettings.data.metaMes);
    setMetaDia(remoteSettings.data.metaDia);
    setAtingidoMes(remoteSettings.data.atingidoMes);
    setAtingidoDia(remoteSettings.data.atingidoDia);
  }, [remoteSettings.data]);

  // Persist TV mode locally
  useEffect(() => {
    localStorage.setItem("tvMode", tvMode ? "1" : "0");
    if (tvMode) {
      setAutoRotate(true);
      setRotateInterval(0.5);
      // Try fullscreen (best-effort)
      try {
        document.documentElement.requestFullscreen?.();
      } catch (_) {}
    } else {
      try {
        document.exitFullscreen?.();
      } catch (_) {}
    }
  }, [tvMode]);

  // ESC to exit TV mode
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && tvMode) setTvMode(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tvMode]);

  // Auto rotate tabs
  useEffect(() => {
    if (!autoRotate) return;

    const tabs: TabType[] = ["dashboard", "empresas", "leads"];
    const interval = setInterval(() => {
      setActiveTab((current) => {
        const currentIndex = tabs.indexOf(current);
        const nextIndex = (currentIndex + 1) % tabs.length;
        return tabs[nextIndex];
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

      // Log reset (delta negative)
      await insertDailyEvent({
        businessDate,
        scope: "bordero",
        kind: "reset",
        deltaBorderoDia: -oldAtingidoDia,
      });

      toast.success("Reset do dia aplicado");

      showUndo({
        message: "Reset aplicado",
        onUndo: async () => {
          await updateDashboardSettings({ atingidoDia: oldAtingidoDia });
          setAtingidoDia(oldAtingidoDia);

          // Restore members
          for (const m of [...empresas, ...leads]) {
            await upsertTeamMember(m);
          }

          await insertDailyEvent({
            businessDate,
            scope: "bordero",
            kind: "undo",
            deltaBorderoDia: oldAtingidoDia,
          });

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

  return (
    <div className={cn("min-h-screen bg-background", tvMode ? "p-0" : "p-2 md:p-4")}>
      <div className={cn("mx-auto w-full", tvMode ? "max-w-none" : "max-w-[1600px]")}>
        {!tvMode && (
          <header className="flex flex-col md:flex-row items-center justify-between gap-4 mb-4">
            <Logo className="w-14 h-14 md:w-16 md:h-16" />

            {/* Tab Navigation */}
            <div className="flex bg-card rounded-xl p-1 border border-border">
              <button
                onClick={() => setActiveTab("dashboard")}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all duration-300",
                  activeTab === "dashboard"
                    ? "bg-primary text-primary-foreground shadow-lg"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >
                <LayoutDashboard className="w-4 h-4" />
                <span className="hidden sm:inline">Dashboard</span>
              </button>
              <button
                onClick={() => setActiveTab("empresas")}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all duration-300",
                  activeTab === "empresas"
                    ? "bg-secondary text-secondary-foreground shadow-lg"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >
                <Users className="w-4 h-4" />
                <span className="hidden sm:inline">Empresas</span>
              </button>
              <button
                onClick={() => setActiveTab("leads")}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all duration-300",
                  activeTab === "leads"
                    ? "bg-gold text-background shadow-lg"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >
                <Target className="w-4 h-4" />
                <span className="hidden sm:inline">Leads</span>
              </button>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-2">
              {/* TV mode */}
              <Button variant="outline" className="rounded-xl" onClick={() => setTvMode(true)} title="Modo TV">
                <Tv2 className="w-4 h-4 mr-2" />
                TV
              </Button>

              {/* Reset */}
              {isSupabaseConfigured && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" className="rounded-xl" title="Reset do dia">
                      <RotateCcw className="w-4 h-4 mr-2" />
                      Reset
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Resetar o dia?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Isso zera o Borderô do dia e os acionamentos (manhã/tarde) de Empresas e Leads. O Borderô do mês permanece.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={doReset}>Resetar</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}

              {/* Auto-rotate */}
              <div className="flex items-center gap-2 bg-card rounded-xl p-2 border border-border">
                <button
                  onClick={() => setAutoRotate(!autoRotate)}
                  className={cn(
                    "p-2 rounded-lg transition-all duration-300",
                    autoRotate
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                  title={autoRotate ? "Pausar rotação" : "Iniciar rotação"}
                >
                  {autoRotate ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </button>

                <select
                  value={rotateInterval}
                  onChange={(e) => setRotateInterval(Number(e.target.value))}
                  className="bg-muted text-foreground text-sm rounded-lg px-2 py-1 border-none focus:ring-2 focus:ring-primary"
                >
                  <option value={0.5}>30s</option>
                  <option value={1}>1 min</option>
                  <option value={2}>2 min</option>
                  <option value={5}>5 min</option>
                  <option value={10}>10 min</option>
                </select>
              </div>
            </div>
          </header>
        )}

        {/* Content */}
        <div className={cn(tvMode ? "p-2 md:p-3" : "")}>
          {activeTab === "dashboard" && (
            <DashboardView
              metaMes={metaMes}
              metaDia={metaDia}
              atingidoMes={atingidoMes}
              atingidoDia={atingidoDia}
              tvMode={tvMode}
              readOnly={readOnly}
              onMetaMesChange={(v) => {
                setMetaMes(v);
                if (isSupabaseConfigured) remoteSettings.updateAsync({ metaMes: v });
              }}
              onMetaDiaChange={(v) => {
                setMetaDia(v);
                if (isSupabaseConfigured) remoteSettings.updateAsync({ metaDia: v });
              }}
              onAtingidoMesChange={(v) => {
                setAtingidoMes(v);
                if (isSupabaseConfigured) remoteSettings.updateAsync({ atingidoMes: v });
              }}
              onAtingidoDiaChange={(v) => {
                const old = atingidoDia;
                setAtingidoDia(v);

                if (isSupabaseConfigured) {
                  remoteSettings.updateAsync({ atingidoDia: v });
                  const delta = v - old;
                  if (delta !== 0) {
                    insertDailyEvent({
                      businessDate: getBusinessDate(),
                      scope: "bordero",
                      kind: "single",
                      deltaBorderoDia: delta,
                    });
                  }
                }
              }}
            />
          )}

          {activeTab === "empresas" && <EmpresasView tvMode={tvMode} />}
          {activeTab === "leads" && <LeadsView tvMode={tvMode} />}
        </div>

        {/* Footer */}
        <footer className={cn("mt-4 text-xs text-muted-foreground", tvMode ? "p-2" : "")}>
          <div className="flex items-center justify-between gap-3">
            <div>
              Última atualização:{" "}
              <span className="font-medium text-foreground">
                {lastActivity.data ? formatDateTimeBR(lastActivity.data) : "—"}
              </span>
            </div>

            {tvMode && (
              <button
                onClick={() => setTvMode(false)}
                className="px-3 py-1 rounded-full bg-muted hover:bg-muted/80 text-foreground transition"
                title="Sair do modo TV (ESC)"
              >
                Sair do modo TV
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
};

export default Index;
