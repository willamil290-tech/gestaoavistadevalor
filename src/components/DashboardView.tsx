import { useEffect, useRef } from "react";
import { CircularProgress } from "./CircularProgress";
import { EditableValue } from "./EditableValue";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getBusinessDate } from "@/lib/businessDate";
import { Button } from "@/components/ui/button";
import { Volume2 } from "lucide-react";

interface DashboardViewProps {
  metaMes: number;
  ajusteMes: number;
  metaDia: number;
  ajusteDia: number;
  atingidoMes: number;
  atingidoDia: number;
  onMetaMesChange: (value: number) => void;
  onAjusteMesChange: (value: number) => void;
  onMetaDiaChange: (value: number) => void;
  onAjusteDiaChange: (value: number) => void;
  onAtingidoMesChange: (value: number) => void;
  onAtingidoDiaChange: (value: number) => void;
  tvMode?: boolean;
  readOnly?: boolean;
}

export const DashboardView = ({
  metaMes,
  ajusteMes,
  metaDia,
  ajusteDia,
  atingidoMes,
  atingidoDia,
  onMetaMesChange,
  onAjusteMesChange,
  onMetaDiaChange,
  onAjusteDiaChange,
  onAtingidoMesChange,
  onAtingidoDiaChange,
  tvMode = false,
  readOnly = false,
}: DashboardViewProps) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playedRef = useRef({ day: false, month: false });
  const playedKeyRef = useRef({ dayKey: "", monthKey: "" });

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const a = new Audio("/audio/tema-da-vitoria.mp3");
      a.preload = "auto";
      audioRef.current = a;
    } catch {}
  }, []);

  // Avoid replaying across tab rotations / remounts: persist play state per business day / month.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const dayKey = getBusinessDate();
    const monthKey = dayKey.slice(0, 7);
    playedKeyRef.current.dayKey = dayKey;
    playedKeyRef.current.monthKey = monthKey;
    playedRef.current.day = localStorage.getItem(`themePlayed:day:${dayKey}`) === "1";
    playedRef.current.month = localStorage.getItem(`themePlayed:month:${monthKey}`) === "1";
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

  const atingidoMesLiquido = Math.max(0, atingidoMes - (ajusteMes || 0));
  const atingidoDiaLiquido = Math.max(0, atingidoDia - (ajusteDia || 0));

  const percentualMes = metaMes > 0 ? (atingidoMesLiquido / metaMes) * 100 : 0;
  const percentualDia = metaDia > 0 ? (atingidoDiaLiquido / metaDia) * 100 : 0;

  useEffect(() => {
    if (typeof window === "undefined") return;

    const dayKey = getBusinessDate();
    const monthKey = dayKey.slice(0, 7);

    // If the business date/month changed while the page is open, refresh the in-memory flags.
    if (playedKeyRef.current.dayKey !== dayKey) {
      playedKeyRef.current.dayKey = dayKey;
      playedRef.current.day = localStorage.getItem(`themePlayed:day:${dayKey}`) === "1";
    }
    if (playedKeyRef.current.monthKey !== monthKey) {
      playedKeyRef.current.monthKey = monthKey;
      playedRef.current.month = localStorage.getItem(`themePlayed:month:${monthKey}`) === "1";
    }

    if (percentualDia >= 100 && !playedRef.current.day) {
      playedRef.current.day = true;
      try {
        localStorage.setItem(`themePlayed:day:${dayKey}`, "1");
      } catch {}
      playTheme("dia");
    }

    if (percentualMes >= 100 && !playedRef.current.month) {
      playedRef.current.month = true;
      try {
        localStorage.setItem(`themePlayed:month:${monthKey}`, "1");
      } catch {}
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
            <EditableValue
              value={atingidoMesLiquido}
              onChange={() => {}}
              label="Vl. Borderô (mês) (corrigido)"
              readOnly
            />

            {!readOnly && (
              <EditableValue
                value={atingidoMes}
                onChange={onAtingidoMesChange}
                label="Vl. Borderô (mês) (bruto)"
                size="sm"
                readOnly={readOnly}
              />
            )}

            <CircularProgress percentage={percentualMes} label="Meta (mês)" variant="primary" size={circleSize} />
            {percentualMes >= 100 && (
              <Button
                type="button"
                variant="outline"
                size={tvMode ? "sm" : "default"}
                className="rounded-xl"
                onClick={() => playTheme("mes")}
                title="Tocar tema"
              >
                <Volume2 className="w-4 h-4 mr-2" />
                Tocar tema
              </Button>
            )}
            <div className="w-full pt-4 border-t border-border space-y-3">
              <EditableValue value={metaMes} onChange={onMetaMesChange} label="Meta do Mês" size="sm" readOnly={readOnly} />
              <EditableValue value={ajusteMes} onChange={onAjusteMesChange} label="Ajuste do mês (-)" size="sm" readOnly={readOnly} />
            </div>
          </div>
        </div>

        {/* Day Section */}
        <div className="bg-card rounded-2xl p-4 md:p-6 border border-border">
          <div className="flex flex-col items-center gap-4">
            <EditableValue
              value={atingidoDiaLiquido}
              onChange={() => {}}
              label="Vl. Borderô (dia) (corrigido)"
              readOnly
            />

            {!readOnly && (
              <EditableValue
                value={atingidoDia}
                onChange={onAtingidoDiaChange}
                label="Vl. Borderô (dia) (bruto)"
                size="sm"
                readOnly={readOnly}
              />
            )}

            <CircularProgress percentage={percentualDia} label="Meta (dia)" variant="secondary" size={circleSize} />
            {percentualDia >= 100 && (
              <Button
                type="button"
                variant="outline"
                size={tvMode ? "sm" : "default"}
                className="rounded-xl"
                onClick={() => playTheme("dia")}
                title="Tocar tema"
              >
                <Volume2 className="w-4 h-4 mr-2" />
                Tocar tema
              </Button>
            )}
            <div className="w-full pt-4 border-t border-border space-y-3">
              <EditableValue value={metaDia} onChange={onMetaDiaChange} label="Meta do Dia" size="sm" readOnly={readOnly} />
              <EditableValue value={ajusteDia} onChange={onAjusteDiaChange} label="Ajuste do dia (-)" size="sm" readOnly={readOnly} />
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
          <p className="text-xl md:text-2xl font-bold text-foreground">{fmtBRL(Math.max(0, metaMes - atingidoMesLiquido))}</p>
        </div>
        <div className="bg-card rounded-xl p-4 border border-border text-center">
          <p className="text-sm md:text-base text-muted-foreground mb-2">Falta (Dia)</p>
          <p className="text-xl md:text-2xl font-bold text-foreground">{fmtBRL(Math.max(0, metaDia - atingidoDiaLiquido))}</p>
        </div>
      </div>
    </div>
  );
};
