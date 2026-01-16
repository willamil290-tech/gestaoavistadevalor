import { useEffect, useRef } from "react";
import { CircularProgress } from "./CircularProgress";
import { EditableValue } from "./EditableValue";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

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
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playedRef = useRef({ day: false, month: false });

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const a = new Audio("/audio/tema-da-vitoria.mp3");
      a.preload = "auto";
      audioRef.current = a;
    } catch {}
  }, []);


  const playTheme = (which: "dia" | "mes") => {
    const a = audioRef.current;
    if (!a) {
      toast(`Meta do ${which} atingida!`);
      return;
    }
    try {
      a.currentTime = 0;
      a.play().catch(() => {
        toast(`Meta do ${which} atingida!`, {
          action: { label: "Tocar tema", onClick: () => { a.currentTime = 0; a.play().catch(() => {}); } },
        });
      });
    } catch {}
  };

  const percentualMes = metaMes > 0 ? (atingidoMes / metaMes) * 100 : 0;
  const percentualDia = metaDia > 0 ? (atingidoDia / metaDia) * 100 : 0;

  useEffect(() => {
    if (percentualDia >= 100 && !playedRef.current.day) {
      playedRef.current.day = true;
      playTheme("dia");
    }
    if (percentualMes >= 100 && !playedRef.current.month) {
      playedRef.current.month = true;
      playTheme("mes");
    }
  }, [percentualDia, percentualMes]);

  const circleSize = tvMode ? 170 : 200;
  const fmtBRL = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  return (
    <div className={cn(tvMode ? "space-y-4" : "space-y-6")}>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        {/* Month Section */}
        <div className="bg-card rounded-2xl p-4 md:p-6 border border-border">
          <div className="flex flex-col items-center gap-4">
            <EditableValue value={atingidoMes} onChange={onAtingidoMesChange} label="Vl. Borderô (mês)" readOnly={readOnly} />
            <CircularProgress percentage={percentualMes} label="Meta (mês)" variant="primary" size={circleSize} />
            <div className="w-full pt-4 border-t border-border">
              <EditableValue value={metaMes} onChange={onMetaMesChange} label="Meta do Mês" size="sm" readOnly={readOnly} />
            </div>
          </div>
        </div>

        {/* Day Section */}
        <div className="bg-card rounded-2xl p-4 md:p-6 border border-border">
          <div className="flex flex-col items-center gap-4">
            <EditableValue value={atingidoDia} onChange={onAtingidoDiaChange} label="Vl. Borderô (dia)" readOnly={readOnly} />
            <CircularProgress percentage={percentualDia} label="Meta (dia)" variant="secondary" size={circleSize} />
            <div className="w-full pt-4 border-t border-border">
              <EditableValue value={metaDia} onChange={onMetaDiaChange} label="Meta do Dia" size="sm" readOnly={readOnly} />
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
          <p className="text-xl md:text-2xl font-bold text-foreground">{fmtBRL(Math.max(0, metaMes - atingidoMes))}</p>
        </div>
        <div className="bg-card rounded-xl p-4 border border-border text-center">
          <p className="text-sm md:text-base text-muted-foreground mb-2">Falta (Dia)</p>
          <p className="text-xl md:text-2xl font-bold text-foreground">{fmtBRL(Math.max(0, metaDia - atingidoDia))}</p>
        </div>
      </div>
    </div>
  );
};
