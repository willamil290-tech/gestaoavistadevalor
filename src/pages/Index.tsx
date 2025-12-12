import { supabase } from "@/lib/supabaseClient";
import { useState, useEffect } from "react";
import { Logo } from "@/components/Logo";
import { DashboardView } from "@/components/DashboardView";
import { EmpresasView } from "@/components/EmpresasView";
import { LeadsView } from "@/components/LeadsView";
import { LayoutDashboard, Users, Target, Play, Pause } from "lucide-react";
import { cn } from "@/lib/utils";

type TabType = "dashboard" | "empresas" | "leads";

const tabs: TabType[] = ["dashboard", "empresas", "leads"];

const Index = () => {
  const [activeTab, setActiveTab] = useState<TabType>("dashboard");
  const [autoRotate, setAutoRotate] = useState(false);
  const [rotateInterval, setRotateInterval] = useState(1); // minutes

  // Meta values
  const [metaMes, setMetaMes] = useState(15800000);
  const [metaDia, setMetaDia] = useState(1053333.33);

  // Achieved values
  const [atingidoMes, setAtingidoMes] = useState(5556931.1);
  const [atingidoDia, setAtingidoDia] = useState(292434.31);

  // 🔥 Carrega do Supabase + atualiza ao vivo (Realtime)
  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase
        .from("kpis")
        .select("meta_mes, meta_dia, atingido_mes, atingido_dia")
        .eq("id", 1)
        .single();

      if (error) {
        console.error("Erro ao carregar KPIs:", error);
        return;
      }

      setMetaMes(Number(data.meta_mes));
      setMetaDia(Number(data.meta_dia));
      setAtingidoMes(Number(data.atingido_mes));
      setAtingidoDia(Number(data.atingido_dia));
    };

    load();

    const channel = supabase
      .channel("kpis-live")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "kpis", filter: "id=eq.1" },
        (payload) => {
          const n: any = payload.new;
          setMetaMes(Number(n.meta_mes));
          setMetaDia(Number(n.meta_dia));
          setAtingidoMes(Number(n.atingido_mes));
          setAtingidoDia(Number(n.atingido_dia));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Auto-rotate tabs
  useEffect(() => {
    if (!autoRotate) return;

    const interval = setInterval(() => {
      setActiveTab((current) => {
        const currentIndex = tabs.indexOf(current);
        const nextIndex = (currentIndex + 1) % tabs.length;
        return tabs[nextIndex];
      });
    }, rotateInterval * 60 * 1000);

    return () => clearInterval(interval);
  }, [autoRotate, rotateInterval]);

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <header className="flex flex-col md:flex-row items-center justify-between gap-4 mb-8">
          <Logo className="w-16 h-16 md:w-20 md:h-20" />

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

          {/* Auto-rotate controls */}
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
        </header>

        {/* Content */}
        {activeTab === "dashboard" && (
          <DashboardView
            metaMes={metaMes}
            metaDia={metaDia}
            atingidoMes={atingidoMes}
            atingidoDia={atingidoDia}
            onMetaMesChange={setMetaMes}
            onMetaDiaChange={setMetaDia}
            onAtingidoMesChange={setAtingidoMes}
            onAtingidoDiaChange={setAtingidoDia}
          />
        )}
        {activeTab === "empresas" && <EmpresasView />}
        {activeTab === "leads" && <LeadsView />}
      </div>
    </div>
  );
};

export default Index;
