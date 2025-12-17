import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from "recharts";
import { CircularProgress } from "./CircularProgress";
import { EditableValue } from "./EditableValue";
import { isSupabaseConfigured } from "@/lib/supabase";
import { isDailyEventsEnabled, listDailyEvents } from "@/lib/persistence";
import { getBusinessDate } from "@/lib/businessDate";
import { ChartContainer } from "@/components/ui/chart";
import { toast } from "sonner";

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

const pollInterval = Number(import.meta.env.VITE_SYNC_POLL_INTERVAL ?? 5000);

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
  // 🎵 Tema da vitória (Ayrton Senna)
  // Adicione um arquivo MP3 licenciado em: public/audio/tema-da-vitoria.mp3
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playedRef = useRef({ day: false, month: false });

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const a = new Audio("/audio/tema-da-vitoria.mp3");
      a.preload = "auto";
      audioRef.current = a;
    } catch {
      // ignore
    }
  }, []);

  const playTheme = (which: "dia" | "mes") => {
    const a = audioRef.current;
    if (!a) {
      toast(`Meta do ${which} atingida!`, {
        description: "Adicione um MP3 licenciado em /public/audio/tema-da-vitoria.mp3 para tocar o tema.",
      });
      return;
    }

    // Se não houver fonte disponível (arquivo ausente), avisa sem quebrar
    const anyA = a as any;
    if (typeof anyA.networkState === "number" && typeof anyA.NETWORK_NO_SOURCE === "number" && anyA.networkState === anyA.NETWORK_NO_SOURCE) {
      toast(`Meta do ${which} atingida!`, {
        description: "Arquivo não encontrado: /public/audio/tema-da-vitoria.mp3",
      });
      return;
    }

    try {
      a.currentTime = 0;
      const p = a.play();
      (p as any)?.catch?.(() => {
        toast(`Meta do ${which} atingida!`, {
          description: "O navegador bloqueou o autoplay. Clique para tocar.",
          action: {
            label: "Tocar tema",
            onClick: () => {
              try {
                a.currentTime = 0;
                a.play().catch(() => {
                  toast("Não foi possível tocar o áudio.", {
                    description: "Verifique se o arquivo existe em /public/audio/tema-da-vitoria.mp3",
                  });
                });
              } catch {}
            },
          },
        });
      });
    } catch {
      // ignore
    }
  };


  const percentualMes = metaMes > 0 ? (atingidoMes / metaMes) * 100 : 0;
  const percentualDia = metaDia > 0 ? (atingidoDia / metaDia) * 100 : 0;

  useEffect(() => {
    const hitDay = percentualDia >= 100;
    const hitMonth = percentualMes >= 100;

    if (hitDay && !playedRef.current.day) {
      playedRef.current.day = true;
      playTheme("dia");
    }
    if (hitMonth && !playedRef.current.month) {
      playedRef.current.month = true;
      playTheme("mes");
    }
  }, [percentualDia, percentualMes]);

  const circleSize = tvMode ? 170 : 200;

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

  const computed = useMemo(() => {
    const now = new Date();
    const startHour = 8;
    const endHour = Math.max(startHour, now.getHours());

    const events = analytics.data?.events ?? [];

    const actionEvents = events
      .filter((e: any) => e.scope === "empresas" || e.scope === "leads")
      .filter((e: any) => e.kind !== "reset")
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
  }, [analytics.data]);

  const fmtBRL = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  const showDailyEventsHint = isSupabaseConfigured && !isDailyEventsEnabled();

  return (
    <div className={tvMode ? "space-y-4" : "space-y-6"}>
      {/* Main Grid */}
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

      {/* Trend (full width / melhor para TV) */}
      <div className="bg-card rounded-2xl p-4 md:p-6 border border-border">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg md:text-xl font-semibold">Tendência do dia</h3>
            <p className="text-sm text-muted-foreground mt-1">Acionamentos por hora (08:00 → agora)</p>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Total (08:00 → agora)</div>
            <div className="text-2xl md:text-3xl font-bold text-foreground">{computed?.totalActionsSince8 ?? 0}</div>
          </div>
        </div>

        {showDailyEventsHint ? (
          <div className="mt-4 text-sm text-muted-foreground">
            Para habilitar a tendência, rode o SQL <span className="font-semibold">SUPABASE_DAILY_EVENTS.sql</span> no Supabase.
          </div>
        ) : (
          <div className={tvMode ? "mt-4 h-[320px]" : "mt-4 h-[260px]"}>
            <ChartContainer config={{ actions: { label: "Acionamentos", color: "hsl(var(--secondary))" } }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={computed?.trendData ?? []} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="hour" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
                  <RTooltip />
                  <Bar dataKey="actions" fill="var(--color-actions)" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </div>
        )}
      </div>
    </div>
  );
};
