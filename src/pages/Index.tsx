import { useState } from "react";
import { Logo } from "@/components/Logo";
import { DashboardView } from "@/components/DashboardView";
import { EmpresasView } from "@/components/EmpresasView";
import { LayoutDashboard, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const Index = () => {
  const [activeTab, setActiveTab] = useState<"dashboard" | "empresas">("dashboard");
  
  // Meta values
  const [metaMes, setMetaMes] = useState(15800000);
  const [metaDia, setMetaDia] = useState(1053333.33);
  
  // Achieved values
  const [atingidoMes, setAtingidoMes] = useState(5556931.10);
  const [atingidoDia, setAtingidoDia] = useState(292434.31);

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
              <span className="hidden sm:inline">Empresas Acionadas</span>
            </button>
          </div>

          <div className="w-16 h-16 md:w-20 md:h-20" /> {/* Spacer for centering */}
        </header>

        {/* Content */}
        {activeTab === "dashboard" ? (
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
        ) : (
          <EmpresasView />
        )}
      </div>
    </div>
  );
};

export default Index;
