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
  const playedRef = useRef({ day100: false, day200: false, day300: false, month100: false, month200: false, month300: false });
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
    playedRef.current.day100 = localStorage.getItem(`themePlayed:day:100:${dayKey}`) === "1";
    playedRef.current.day200 = localStorage.getItem(`themePlayed:day:200:${dayKey}`) === "1";
    playedRef.current.day300 = localStorage.getItem(`themePlayed:day:300:${dayKey}`) === "1";
    playedRef.current.month100 = localStorage.getItem(`themePlayed:month:100:${monthKey}`) === "1";
    playedRef.current.month200 = localStorage.getItem(`themePlayed:month:200:${monthKey}`) === "1";
    playedRef.current.month300 = localStorage.getItem(`themePlayed:month:300:${monthKey}`) === "1";
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
      playedRef.current.day100 = localStorage.getItem(`themePlayed:day:100:${dayKey}`) === "1";
      playedRef.current.day200 = localStorage.getItem(`themePlayed:day:200:${dayKey}`) === "1";
      playedRef.current.day300 = localStorage.getItem(`themePlayed:day:300:${dayKey}`) === "1";
    }
    if (playedKeyRef.current.monthKey !== monthKey) {
      playedKeyRef.current.monthKey = monthKey;
      playedRef.current.month100 = localStorage.getItem(`themePlayed:month:100:${monthKey}`) === "1";
      playedRef.current.month200 = localStorage.getItem(`themePlayed:month:200:${monthKey}`) === "1";
      playedRef.current.month300 = localStorage.getItem(`themePlayed:month:300:${monthKey}`) === "1";
    }

    // Day milestones: 300% > 200% > 100% (play highest unplayed)
    if (percentualDia >= 300 && !playedRef.current.day300) {
      playedRef.current.day300 = true;
      try { localStorage.setItem(`themePlayed:day:300:${dayKey}`, "1"); } catch {}
      playTheme("dia");
    } else if (percentualDia >= 200 && !playedRef.current.day200) {
      playedRef.current.day200 = true;
      try { localStorage.setItem(`themePlayed:day:200:${dayKey}`, "1"); } catch {}
      playTheme("dia");
    } else if (percentualDia >= 100 && !playedRef.current.day100) {
      playedRef.current.day100 = true;
      try { localStorage.setItem(`themePlayed:day:100:${dayKey}`, "1"); } catch {}
      playTheme("dia");
    }

    // Month milestones: 300% > 200% > 100%
    if (percentualMes >= 300 && !playedRef.current.month300) {
      playedRef.current.month300 = true;
      try { localStorage.setItem(`themePlayed:month:300:${monthKey}`, "1"); } catch {}
      playTheme("mes");
    } else if (percentualMes >= 200 && !playedRef.current.month200) {
      playedRef.current.month200 = true;
      try { localStorage.setItem(`themePlayed:month:200:${monthKey}`, "1"); } catch {}
      playTheme("mes");
    } else if (percentualMes >= 100 && !playedRef.current.month100) {
      playedRef.current.month100 = true;
      try { localStorage.setItem(`themePlayed:month:100:${monthKey}`, "1"); } catch {}
      playTheme("mes");
    }
  }, [percentualDia, percentualMes]);

  const circleSize = tvMode ? 170 : 200;
  const fmtBRL = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  const pctDiaClass = percentualDia >= 300 ? "anim-rainbow-text" : percentualDia >= 200 ? "anim-pulse-text" : "";
  const pctMesClass = percentualMes >= 300 ? "anim-rainbow-text" : percentualMes >= 200 ? "anim-pulse-text" : "";

  return (
    <div className={cn(tvMode ? "space-y-4" : "space-y-6")}>
      <div className={cn("grid grid-cols-1 lg:grid-cols-2", tvMode ? "gap-4" : "gap-4 md:gap-6")}>
        {/* Month Section */}
        <div className={cn("bg-card rounded-2xl border border-border", tvMode ? "p-4" : "p-4 md:p-6")}>
          <div className={cn("flex flex-col items-center", tvMode ? "gap-3" : "gap-4")}>
            <EditableValue
              value={atingidoMesLiquido}
              onChange={() => {}}
              // Keep TV mode clean: show the corrected value without extra labels.
              label={tvMode ? "Vl. Borderô (mês)" : "Vl. Borderô (mês)"}
              readOnly
            />

            {!readOnly && !tvMode && (
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
              {!tvMode && (
                <EditableValue value={ajusteMes} onChange={onAjusteMesChange} label="Ajuste do mês (-)" size="sm" readOnly={readOnly} />
              )}
            </div>
          </div>
        </div>

        {/* Day Section */}
        <div className={cn("bg-card rounded-2xl border border-border", tvMode ? "p-4" : "p-4 md:p-6")}>
          <div className={cn("flex flex-col items-center", tvMode ? "gap-3" : "gap-4")}>
            <EditableValue
              value={atingidoDiaLiquido}
              onChange={() => {}}
              // Keep TV mode clean: show the corrected value without extra labels.
              label={tvMode ? "Vl. Borderô (dia)" : "Vl. Borderô (dia)"}
              readOnly
            />

            {!readOnly && !tvMode && (
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
              {!tvMode && (
                <EditableValue value={ajusteDia} onChange={onAjusteDiaChange} label="Ajuste do dia (-)" size="sm" readOnly={readOnly} />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className={cn("grid grid-cols-2 md:grid-cols-4", tvMode ? "gap-3" : "gap-3 md:gap-4")}>
        <div className={cn("bg-card rounded-xl border border-border text-center", tvMode ? "p-3" : "p-4")}>
          <p className={cn("text-muted-foreground", tvMode ? "text-sm mb-1" : "text-sm md:text-base mb-2")}>% Mês</p>
          <p className={cn("font-bold text-primary", tvMode ? "text-2xl" : "text-2xl md:text-3xl", pctMesClass)}>{percentualMes.toFixed(1)}%</p>
        </div>
        <div className={cn("bg-card rounded-xl border border-border text-center", tvMode ? "p-3" : "p-4")}>
          <p className={cn("text-muted-foreground", tvMode ? "text-sm mb-1" : "text-sm md:text-base mb-2")}>% Dia</p>
          <p className={cn("font-bold text-secondary", tvMode ? "text-2xl" : "text-2xl md:text-3xl", pctDiaClass)}>{percentualDia.toFixed(1)}%</p>
        </div>
        <div className={cn("bg-card rounded-xl border border-border text-center", tvMode ? "p-3" : "p-4")}>
          <p className={cn("text-muted-foreground", tvMode ? "text-sm mb-1" : "text-sm md:text-base mb-2")}>Falta (Mês)</p>
          <p className={cn("font-bold text-foreground", tvMode ? "text-xl" : "text-xl md:text-2xl")}>{fmtBRL(Math.max(0, metaMes - atingidoMesLiquido))}</p>
        </div>
        <div className={cn("bg-card rounded-xl border border-border text-center", tvMode ? "p-3" : "p-4")}>
          <p className={cn("text-muted-foreground", tvMode ? "text-sm mb-1" : "text-sm md:text-base mb-2")}>Falta (Dia)</p>
          <p className={cn("font-bold text-foreground", tvMode ? "text-xl" : "text-xl md:text-2xl")}>{fmtBRL(Math.max(0, metaDia - atingidoDiaLiquido))}</p>
        </div>
      </div>
    </div>
  );
};
