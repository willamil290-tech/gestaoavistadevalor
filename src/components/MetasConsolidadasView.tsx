import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Target, TrendingUp, PhoneCall, Activity, Trophy, Pencil, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { loadJson, saveJson } from "@/lib/localStore";
import { getBusinessDate } from "@/lib/businessDate";
import { isIgnoredCommercial } from "@/lib/ignoredCommercials";
import { getTeamGroup } from "@/lib/teamGroups";
import type { ParsedCall } from "@/lib/callsParse";
import { CircularProgress } from "./CircularProgress";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type Props = {
  tvMode?: boolean;
  metaMes: number;
  metaDia: number;
  ajusteMes?: number;
  ajusteDia?: number;
  atingidoMes: number;
  atingidoDia: number;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function formatBRLShort(v: number) {
  if (Math.abs(v) >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1).replace(".", ",")}M`;
  if (Math.abs(v) >= 1_000) return `R$ ${(v / 1_000).toFixed(0)}k`;
  return formatBRL(v);
}

// ── Metas por colaborador ──────────────────────────────────────────────
type ColabUnit = "BRL" | "RR";
type ColabGoal = { name: string; meta: number; atingido: number; unit: ColabUnit };

const DEFAULT_COLAB_GOALS: ColabGoal[] = [
  { name: "Luciane",    meta: 4_500_000, atingido: 0, unit: "BRL" },
  { name: "Alessandra", meta: 4_500_000, atingido: 0, unit: "BRL" },
  { name: "Gisele",     meta: 1_250_000, atingido: 0, unit: "BRL" },
  { name: "Bruna",      meta: 1_800_000, atingido: 0, unit: "BRL" },
  { name: "Alana",      meta: 13,        atingido: 0, unit: "RR"  },
  { name: "Vanessa",    meta: 13,        atingido: 0, unit: "RR"  },
  { name: "Adriana",    meta: 10,        atingido: 0, unit: "RR"  },
  { name: "Maicon",     meta: 10,        atingido: 0, unit: "RR"  },
];

function colabGoalsKey(year: number, month: number) {
  return `metasColab:${year}-${pad2(month)}`;
}

function mergeWithDefaults(stored: ColabGoal[]): ColabGoal[] {
  // Garante que todos os nomes default existam mesmo se localStorage estiver desatualizado.
  const map = new Map<string, ColabGoal>();
  for (const g of DEFAULT_COLAB_GOALS) map.set(g.name, { ...g });
  for (const s of stored ?? []) {
    if (!s?.name) continue;
    const cur = map.get(s.name) ?? { name: s.name, meta: 0, atingido: 0, unit: "BRL" as ColabUnit };
    map.set(s.name, {
      name: s.name,
      meta: Number.isFinite(s.meta) ? s.meta : cur.meta,
      atingido: Number.isFinite(s.atingido) ? s.atingido : cur.atingido,
      unit: s.unit ?? cur.unit,
    });
  }
  return Array.from(map.values());
}

function colorForPct(pct: number): string {
  if (pct >= 120) return "hsl(280 85% 60%)";   // roxo (lendário)
  if (pct >= 115) return "hsl(35 95% 55%)";    // laranja brilhante
  if (pct >= 110) return "hsl(160 80% 45%)";   // verde esmeralda
  if (pct >= 105) return "hsl(190 90% 50%)";   // ciano
  if (pct >= 100) return "hsl(142 70% 45%)";   // verde
  if (pct >= 80)  return "hsl(48 95% 55%)";    // amarelo
  if (pct >= 50)  return "hsl(25 90% 55%)";    // laranja
  return "hsl(var(--muted-foreground))";
}

function badgeForPct(pct: number): string | null {
  if (pct >= 120) return "120%+";
  if (pct >= 115) return "115%+";
  if (pct >= 110) return "110%+";
  if (pct >= 105) return "105%+";
  if (pct >= 100) return "100%";
  return null;
}

function fmtValueByUnit(v: number, unit: ColabUnit): string {
  if (unit === "BRL") return formatBRLShort(v);
  return `${v.toLocaleString("pt-BR")} RR`;
}

type GeralDayPerson = { name: string; empresas: number; leads: number };
type GeralMonthData = Record<string, GeralDayPerson[]>;

function useMonthCalls(year: number, month: number) {
  const [calls, setCalls] = useState<ParsedCall[]>([]);

  useEffect(() => {
    const key = `calls:${year}-${pad2(month)}`;
    const raw = loadJson<any[]>(key, []);
    const parsed = raw.map((c) => ({ ...c, dateTime: new Date(c.dateTime) })) as ParsedCall[];
    setCalls(parsed);

    const onStorage = (e: StorageEvent) => {
      if (e.key === key) {
        const updated = loadJson<any[]>(key, []);
        setCalls(updated.map((c) => ({ ...c, dateTime: new Date(c.dateTime) })) as ParsedCall[]);
      }
    };
    window.addEventListener("storage", onStorage);
    const interval = setInterval(() => {
      const updated = loadJson<any[]>(key, []);
      setCalls(updated.map((c) => ({ ...c, dateTime: new Date(c.dateTime) })) as ParsedCall[]);
    }, 15_000);
    return () => {
      window.removeEventListener("storage", onStorage);
      clearInterval(interval);
    };
  }, [year, month]);

  return calls;
}

function useMonthGeral(year: number, month: number) {
  const [data, setData] = useState<GeralMonthData>({});
  useEffect(() => {
    const key = `acionGeral:${year}-${pad2(month)}`;
    setData(loadJson<GeralMonthData>(key, {}));
    const onStorage = (e: StorageEvent) => {
      if (e.key === key) setData(loadJson<GeralMonthData>(key, {}));
    };
    window.addEventListener("storage", onStorage);
    const interval = setInterval(() => setData(loadJson<GeralMonthData>(key, {})), 15_000);
    return () => {
      window.removeEventListener("storage", onStorage);
      clearInterval(interval);
    };
  }, [year, month]);
  return data;
}

function firstName(name: string) {
  return (name ?? "").trim().split(/\s+/)[0] ?? name;
}

// Paleta vibrante (HSL) consistente com tokens
const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--accent))",
  "hsl(var(--secondary))",
  "hsl(217 91% 60%)",
  "hsl(280 85% 60%)",
  "hsl(160 80% 45%)",
  "hsl(35 95% 55%)",
  "hsl(340 85% 55%)",
  "hsl(190 90% 50%)",
];

export function MetasConsolidadasView({
  tvMode,
  metaMes,
  metaDia,
  ajusteMes = 0,
  ajusteDia = 0,
  atingidoMes,
  atingidoDia,
}: Props) {
  const today = getBusinessDate();
  const [y, m, d] = today.split("-").map(Number);

  const calls = useMonthCalls(y, m);
  const geral = useMonthGeral(y, m);

  // ── Metas por colaborador (persistidas por mês) ──
  const colabKey = colabGoalsKey(y, m);
  const [colabGoals, setColabGoals] = useState<ColabGoal[]>(() =>
    mergeWithDefaults(loadJson<ColabGoal[]>(colabGoalsKey(y, m), DEFAULT_COLAB_GOALS))
  );
  useEffect(() => {
    setColabGoals(mergeWithDefaults(loadJson<ColabGoal[]>(colabKey, DEFAULT_COLAB_GOALS)));
    const onStorage = (e: StorageEvent) => {
      if (e.key === colabKey) setColabGoals(mergeWithDefaults(loadJson<ColabGoal[]>(colabKey, DEFAULT_COLAB_GOALS)));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [colabKey]);
  const updateColabGoal = (name: string, patch: Partial<ColabGoal>) => {
    setColabGoals((prev) => {
      const next = prev.map((g) => (g.name === name ? { ...g, ...patch } : g));
      saveJson(colabKey, next);
      return next;
    });
  };
  const [editing, setEditing] = useState<{ name: string; field: "meta" | "atingido" } | null>(null);
  const [tempVal, setTempVal] = useState<string>("");

  // ── Borderô do mês por comercial (vindo do Excel importado) ──
  const borderoComercialKey = `borderoComercial:${y}-${pad2(m)}`;
  const [borderoByComercial, setBorderoByComercial] = useState<Record<string, number>>(() =>
    loadJson<Record<string, number>>(borderoComercialKey, {})
  );
  useEffect(() => {
    setBorderoByComercial(loadJson<Record<string, number>>(borderoComercialKey, {}));
    const onStorage = (e: StorageEvent) => {
      if (e.key === borderoComercialKey) {
        setBorderoByComercial(loadJson<Record<string, number>>(borderoComercialKey, {}));
      }
    };
    window.addEventListener("storage", onStorage);
    const interval = setInterval(() => {
      setBorderoByComercial(loadJson<Record<string, number>>(borderoComercialKey, {}));
    }, 15_000);
    return () => {
      window.removeEventListener("storage", onStorage);
      clearInterval(interval);
    };
  }, [borderoComercialKey]);

  // Soma valores do mapa "Comercial -> valor" cujo primeiro nome bate com `targetFirstName`.
  const atingidoBRLForFirstName = (targetFirstName: string): number => {
    const target = targetFirstName.trim().toLowerCase();
    let sum = 0;
    for (const [name, value] of Object.entries(borderoByComercial)) {
      const fn = firstName(name).toLowerCase();
      if (fn === target) sum += Number(value) || 0;
    }
    return sum;
  };

  // ── SDRs: chamadas consolidadas do mês (filtradas) ──
  const sdrChartData = useMemo(() => {
    const byPerson = new Map<string, { name: string; chamadas: number; atendidas: number }>();
    for (const c of calls) {
      if (!c.name || isIgnoredCommercial(c.name)) continue;
      if (getTeamGroup(c.name) !== "SDRs") continue;
      const fn = firstName(c.name);
      const cur = byPerson.get(fn) ?? { name: fn, chamadas: 0, atendidas: 0 };
      cur.chamadas += 1;
      if (c.answered) cur.atendidas += 1;
      byPerson.set(fn, cur);
    }
    return Array.from(byPerson.values()).sort((a, b) => b.chamadas - a.chamadas);
  }, [calls]);

  const sdrTotalChamadas = sdrChartData.reduce((s, x) => s + x.chamadas, 0);
  const sdrTotalAtendidas = sdrChartData.reduce((s, x) => s + x.atendidas, 0);

  // ── Acionamentos consolidados do mês (Executivos + Closers + CS), excluindo ignorados ──
  const acionChartData = useMemo(() => {
    const byPerson = new Map<string, { name: string; group: string; empresas: number; leads: number; total: number }>();
    for (const dayList of Object.values(geral)) {
      for (const p of dayList) {
        if (!p.name || isIgnoredCommercial(p.name)) continue;
        const g = getTeamGroup(p.name);
        if (g === "SDRs") continue; // SDRs vão no gráfico de chamadas
        const fn = firstName(p.name);
        const cur = byPerson.get(fn) ?? { name: fn, group: g, empresas: 0, leads: 0, total: 0 };
        cur.empresas += Number(p.empresas ?? 0);
        cur.leads += Number(p.leads ?? 0);
        cur.total = cur.empresas + cur.leads;
        byPerson.set(fn, cur);
      }
    }
    return Array.from(byPerson.values()).sort((a, b) => b.total - a.total);
  }, [geral]);

  const acionTotal = acionChartData.reduce((s, x) => s + x.total, 0);

  // ── Distribuição por grupo (Pie) ──
  const groupPie = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of acionChartData) {
      map.set(a.group, (map.get(a.group) ?? 0) + a.total);
    }
    return Array.from(map, ([name, value]) => ({ name, value }));
  }, [acionChartData]);

  // ── Metas ──
  const metaMesAjustada = Math.max(0, metaMes - (ajusteMes ?? 0));
  const metaDiaAjustada = Math.max(0, metaDia - (ajusteDia ?? 0));
  const faltaMes = Math.max(0, metaMesAjustada - atingidoMes);
  const faltaDia = Math.max(0, metaDiaAjustada - atingidoDia);
  const pctMes = metaMesAjustada > 0 ? Math.min(100, (atingidoMes / metaMesAjustada) * 100) : 0;
  const pctDia = metaDiaAjustada > 0 ? Math.min(100, (atingidoDia / metaDiaAjustada) * 100) : 0;

  const radialMes = [{ name: "Mês", value: pctMes, fill: "hsl(var(--primary))" }];
  const radialDia = [{ name: "Dia", value: pctDia, fill: "hsl(var(--accent))" }];

  const titleClass = cn(
    "font-bold text-foreground",
    tvMode ? "text-3xl" : "text-xl"
  );

  const cardClass = cn(
    "rounded-2xl border border-border/60 bg-gradient-to-br from-card to-card/40 p-4 shadow-xl backdrop-blur",
    tvMode ? "p-6" : "p-4"
  );

  const bigNum = cn("font-extrabold tabular-nums tracking-tight", tvMode ? "text-5xl" : "text-3xl");

  return (
    <div className={cn("space-y-6", tvMode && "space-y-8")}>
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-primary/10 border border-primary/30">
          <Target className={cn("text-primary", tvMode ? "w-8 h-8" : "w-6 h-6")} />
        </div>
        <div>
          <h2 className={titleClass}>Metas & Performance Consolidada</h2>
          <p className={cn("text-muted-foreground", tvMode ? "text-lg" : "text-sm")}>
            Visão executiva — {today.split("-").reverse().join("/")}
          </p>
        </div>
      </div>

      {/* HERO: Borderô do Mês (esquerda) + Metas por Colaborador (direita) */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        {/* Esquerda: Círculo grande do borderô do mês */}
        <div className={cn(cardClass, "xl:col-span-2 relative overflow-hidden flex flex-col items-center justify-center")}>
          <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full bg-primary/15 blur-3xl" />
          <div className="absolute -bottom-16 -left-16 w-64 h-64 rounded-full bg-accent/10 blur-3xl" />
          <div className="relative flex flex-col items-center gap-4 w-full">
            <div className={cn("text-muted-foreground uppercase tracking-widest font-semibold", tvMode ? "text-lg" : "text-sm")}>
              Borderô do Mês
            </div>
            <CircularProgress
              percentage={pctMes}
              label="Meta (mês)"
              variant="primary"
              size={tvMode ? 380 : 300}
            />
            <div className="flex flex-col items-center gap-1 mt-2">
              <div className={cn("font-extrabold tabular-nums text-primary", tvMode ? "text-5xl" : "text-4xl")}>
                {formatBRL(atingidoMes)}
              </div>
              <div className={cn("text-muted-foreground", tvMode ? "text-lg" : "text-sm")}>
                de <span className="font-semibold text-foreground">{formatBRL(metaMesAjustada)}</span>
              </div>
              <div className={cn("mt-1 px-3 py-1 rounded-full bg-primary/10 border border-primary/30 text-primary font-bold", tvMode ? "text-xl" : "text-base")}>
                Falta {formatBRL(faltaMes)}
              </div>
            </div>
          </div>
        </div>

        {/* Direita: Barras de meta por colaborador */}
        <div className={cn(cardClass, "xl:col-span-3")}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30">
                <Trophy className={cn("text-amber-500", tvMode ? "w-7 h-7" : "w-5 h-5")} />
              </div>
              <div>
                <h3 className={cn("font-bold", tvMode ? "text-2xl" : "text-lg")}>Metas por Colaborador</h3>
                <p className={cn("text-muted-foreground", tvMode ? "text-base" : "text-xs")}>
                  Marcações em 100% · 105% · 110% · 115% · 120%
                </p>
              </div>
            </div>
          </div>

          <div className={cn("space-y-3", tvMode && "space-y-4")}>
            {colabGoals.map((g) => {
              // BRL: vem da planilha (coluna Comercial). RR: manual.
              const atingidoEffective = g.unit === "BRL" ? atingidoBRLForFirstName(g.name) : g.atingido;
              const pct = g.meta > 0 ? (atingidoEffective / g.meta) * 100 : 0;
              const visualPct = Math.min(pct, 130); // cap visual em 130%
              const widthPct = (visualPct / 130) * 100;
              const color = colorForPct(pct);
              const badge = badgeForPct(pct);
              const milestones = [100, 105, 110, 115, 120];
              const isEditingMeta = editing?.name === g.name && editing.field === "meta";
              const isEditingAt = editing?.name === g.name && editing.field === "atingido";
              const startEdit = (field: "meta" | "atingido") => {
                setEditing({ name: g.name, field });
                setTempVal(String(field === "meta" ? g.meta : g.atingido));
              };
              // RR é manualmente editável; BRL não (vem da planilha).
              const canEditAtingido = g.unit === "RR";
              const commit = () => {
                if (!editing) return;
                const num = Number(String(tempVal).replace(/\./g, "").replace(",", "."));
                if (Number.isFinite(num)) {
                  updateColabGoal(editing.name, { [editing.field]: num } as Partial<ColabGoal>);
                }
                setEditing(null);
              };
              return (
                <div
                  key={g.name}
                  className={cn(
                    "rounded-xl border bg-background/40 p-3",
                    tvMode ? "p-4" : "p-3",
                    pct >= 100 ? "border-primary/40 shadow-md shadow-primary/10" : "border-border/60"
                  )}
                >
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={cn("font-bold truncate", tvMode ? "text-2xl" : "text-base")}>{g.name}</span>
                      {badge && (
                        <span
                          className={cn(
                            "px-2 py-0.5 rounded-full font-bold text-white",
                            tvMode ? "text-sm" : "text-[10px]"
                          )}
                          style={{ backgroundColor: color }}
                        >
                          {badge}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-right shrink-0">
                      {/* Atingido (editável) */}
                      {isEditingAt && canEditAtingido ? (
                        <div className="flex items-center gap-1">
                          <Input
                            autoFocus
                            value={tempVal}
                            onChange={(e) => setTempVal(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(null); }}
                            className="h-7 w-24 text-right text-sm"
                          />
                          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={commit}><Check className="w-3 h-3" /></Button>
                          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditing(null)}><X className="w-3 h-3" /></Button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => { if (canEditAtingido) startEdit("atingido"); }}
                          className={cn(
                            "font-extrabold tabular-nums hover:underline cursor-pointer",
                            tvMode ? "text-2xl" : "text-base",
                            !canEditAtingido && "cursor-default hover:no-underline"
                          )}
                          style={{ color }}
                          title={canEditAtingido ? "Clique para editar atingido" : "Atualizado pela planilha (coluna Comercial)"}
                        >
                          {fmtValueByUnit(atingidoEffective, g.unit)}
                        </button>
                      )}
                      <span className={cn("text-muted-foreground", tvMode ? "text-lg" : "text-xs")}>/</span>
                      {/* Meta (editável) */}
                      {isEditingMeta ? (
                        <div className="flex items-center gap-1">
                          <Input
                            autoFocus
                            value={tempVal}
                            onChange={(e) => setTempVal(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(null); }}
                            className="h-7 w-28 text-right text-sm"
                          />
                          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={commit}><Check className="w-3 h-3" /></Button>
                          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditing(null)}><X className="w-3 h-3" /></Button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => startEdit("meta")}
                          className={cn("text-muted-foreground hover:text-foreground hover:underline tabular-nums", tvMode ? "text-lg" : "text-xs")}
                          title="Clique para editar meta"
                        >
                          {fmtValueByUnit(g.meta, g.unit)}
                        </button>
                      )}
                      <span
                        className={cn("font-extrabold tabular-nums w-14 text-right", tvMode ? "text-xl" : "text-sm")}
                        style={{ color }}
                      >
                        {pct.toFixed(0)}%
                      </span>
                    </div>
                  </div>

                  {/* Barra com marcadores */}
                  <div className={cn("relative w-full rounded-full bg-muted/50 overflow-visible", tvMode ? "h-5" : "h-3")}>
                    {/* Marcadores em 100/105/110/115/120 (escala 0..130) */}
                    {milestones.map((mk) => {
                      const left = (mk / 130) * 100;
                      return (
                        <div
                          key={mk}
                          className="absolute top-1/2 -translate-y-1/2 h-[150%] w-px bg-foreground/40"
                          style={{ left: `${left}%` }}
                          title={`${mk}%`}
                        />
                      );
                    })}
                    {/* Barra de progresso */}
                    <div
                      className="h-full rounded-full transition-all duration-700 ease-out"
                      style={{
                        width: `${widthPct}%`,
                        backgroundColor: color,
                        boxShadow: pct >= 100 ? `0 0 12px ${color}` : undefined,
                      }}
                    />
                  </div>
                  {/* Legenda dos marcadores (só TV) */}
                  {tvMode && (
                    <div className="relative w-full mt-1 h-4 text-[10px] text-muted-foreground">
                      {milestones.map((mk) => (
                        <span
                          key={mk}
                          className="absolute -translate-x-1/2"
                          style={{ left: `${(mk / 130) * 100}%` }}
                        >
                          {mk}%
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Linha de Metas: Mês + Dia */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* META MÊS */}
        <div className={cn(cardClass, "relative overflow-hidden")}>
          <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full bg-primary/10 blur-3xl" />
          <div className="flex items-center justify-between mb-2 relative">
            <div>
              <div className={cn("text-muted-foreground uppercase tracking-wider", tvMode ? "text-base" : "text-xs")}>Meta do Mês</div>
              <div className={bigNum}>{formatBRL(atingidoMes)}</div>
              <div className={cn("text-muted-foreground", tvMode ? "text-lg" : "text-sm")}>de {formatBRL(metaMesAjustada)}</div>
            </div>
            <div className={cn("h-44 w-44", tvMode && "h-56 w-56")}>
              <ResponsiveContainer width="100%" height="100%">
                <RadialBarChart cx="50%" cy="50%" innerRadius="70%" outerRadius="100%" barSize={18} data={radialMes} startAngle={90} endAngle={-270}>
                  <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                  <RadialBar background={{ fill: "hsl(var(--muted))" }} dataKey="value" cornerRadius={10} />
                  <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" className="fill-foreground" style={{ fontSize: tvMode ? 32 : 24, fontWeight: 800 }}>
                    {pctMes.toFixed(0)}%
                  </text>
                </RadialBarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="mt-2 flex items-center gap-2 relative">
            <span className={cn("text-muted-foreground", tvMode ? "text-base" : "text-sm")}>Falta:</span>
            <span className={cn("font-bold text-primary", tvMode ? "text-2xl" : "text-lg")}>{formatBRL(faltaMes)}</span>
          </div>
        </div>

        {/* META DIA */}
        <div className={cn(cardClass, "relative overflow-hidden")}>
          <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full bg-accent/10 blur-3xl" />
          <div className="flex items-center justify-between mb-2 relative">
            <div>
              <div className={cn("text-muted-foreground uppercase tracking-wider", tvMode ? "text-base" : "text-xs")}>Meta do Dia</div>
              <div className={bigNum}>{formatBRL(atingidoDia)}</div>
              <div className={cn("text-muted-foreground", tvMode ? "text-lg" : "text-sm")}>de {formatBRL(metaDiaAjustada)}</div>
            </div>
            <div className={cn("h-44 w-44", tvMode && "h-56 w-56")}>
              <ResponsiveContainer width="100%" height="100%">
                <RadialBarChart cx="50%" cy="50%" innerRadius="70%" outerRadius="100%" barSize={18} data={radialDia} startAngle={90} endAngle={-270}>
                  <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                  <RadialBar background={{ fill: "hsl(var(--muted))" }} dataKey="value" cornerRadius={10} />
                  <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" className="fill-foreground" style={{ fontSize: tvMode ? 32 : 24, fontWeight: 800 }}>
                    {pctDia.toFixed(0)}%
                  </text>
                </RadialBarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="mt-2 flex items-center gap-2 relative">
            <span className={cn("text-muted-foreground", tvMode ? "text-base" : "text-sm")}>Falta:</span>
            <span className={cn("font-bold text-accent", tvMode ? "text-2xl" : "text-lg")}>{formatBRL(faltaDia)}</span>
          </div>
        </div>
      </div>

      {/* SDRs - Chamadas consolidadas */}
      <div className={cardClass}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/30">
              <PhoneCall className={cn("text-blue-500", tvMode ? "w-7 h-7" : "w-5 h-5")} />
            </div>
            <div>
              <h3 className={cn("font-bold", tvMode ? "text-2xl" : "text-lg")}>Chamadas dos SDRs — Mês</h3>
              <p className={cn("text-muted-foreground", tvMode ? "text-base" : "text-xs")}>Consolidado mensal</p>
            </div>
          </div>
          <div className="text-right">
            <div className={cn("font-extrabold text-blue-500 tabular-nums", tvMode ? "text-4xl" : "text-2xl")}>{sdrTotalChamadas.toLocaleString("pt-BR")}</div>
            <div className={cn("text-muted-foreground", tvMode ? "text-base" : "text-xs")}>{sdrTotalAtendidas.toLocaleString("pt-BR")} atendidas</div>
          </div>
        </div>
        <div className={cn("w-full", tvMode ? "h-[420px]" : "h-[300px]")}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={sdrChartData} margin={{ top: 16, right: 16, bottom: 8, left: 0 }}>
              <defs>
                <linearGradient id="sdrGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(217 91% 65%)" stopOpacity={0.95} />
                  <stop offset="100%" stopColor="hsl(217 91% 45%)" stopOpacity={0.85} />
                </linearGradient>
                <linearGradient id="sdrGradAt" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(160 80% 50%)" stopOpacity={0.95} />
                  <stop offset="100%" stopColor="hsl(160 80% 35%)" stopOpacity={0.85} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
              <XAxis dataKey="name" tick={{ fill: "hsl(var(--foreground))", fontSize: tvMode ? 18 : 12, fontWeight: 600 }} />
              <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: tvMode ? 14 : 11 }} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12 }} />
              <Legend wrapperStyle={{ fontSize: tvMode ? 16 : 12 }} />
              <Bar dataKey="chamadas" name="Total" fill="url(#sdrGrad)" radius={[8, 8, 0, 0]} />
              <Bar dataKey="atendidas" name="Atendidas" fill="url(#sdrGradAt)" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Acionamentos consolidados (Executivos / Closers / CS) */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className={cn(cardClass, "xl:col-span-2")}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-secondary/10 border border-secondary/30">
                <Activity className={cn("text-secondary", tvMode ? "w-7 h-7" : "w-5 h-5")} />
              </div>
              <div>
                <h3 className={cn("font-bold", tvMode ? "text-2xl" : "text-lg")}>Acionamentos — Executivos / Closer / CS</h3>
                <p className={cn("text-muted-foreground", tvMode ? "text-base" : "text-xs")}>Empresas + Leads no mês</p>
              </div>
            </div>
            <div className="text-right">
              <div className={cn("font-extrabold text-secondary tabular-nums", tvMode ? "text-4xl" : "text-2xl")}>{acionTotal.toLocaleString("pt-BR")}</div>
              <div className={cn("text-muted-foreground", tvMode ? "text-base" : "text-xs")}>total mês</div>
            </div>
          </div>
          <div className={cn("w-full", tvMode ? "h-[420px]" : "h-[300px]")}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={acionChartData} margin={{ top: 16, right: 16, bottom: 8, left: 0 }}>
                <defs>
                  <linearGradient id="empGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(280 85% 65%)" stopOpacity={0.95} />
                    <stop offset="100%" stopColor="hsl(280 85% 45%)" stopOpacity={0.85} />
                  </linearGradient>
                  <linearGradient id="leadGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(35 95% 60%)" stopOpacity={0.95} />
                    <stop offset="100%" stopColor="hsl(35 95% 45%)" stopOpacity={0.85} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                <XAxis dataKey="name" tick={{ fill: "hsl(var(--foreground))", fontSize: tvMode ? 18 : 12, fontWeight: 600 }} />
                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: tvMode ? 14 : 11 }} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12 }} />
                <Legend wrapperStyle={{ fontSize: tvMode ? 16 : 12 }} />
                <Bar dataKey="empresas" name="Empresas" stackId="a" fill="url(#empGrad)" radius={[0, 0, 0, 0]} />
                <Bar dataKey="leads" name="Leads" stackId="a" fill="url(#leadGrad)" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className={cardClass}>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-xl bg-accent/10 border border-accent/30">
              <TrendingUp className={cn("text-accent", tvMode ? "w-7 h-7" : "w-5 h-5")} />
            </div>
            <div>
              <h3 className={cn("font-bold", tvMode ? "text-2xl" : "text-lg")}>Por Time</h3>
              <p className={cn("text-muted-foreground", tvMode ? "text-base" : "text-xs")}>Distribuição</p>
            </div>
          </div>
          <div className={cn("w-full", tvMode ? "h-[400px]" : "h-[280px]")}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={groupPie}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={tvMode ? 70 : 50}
                  outerRadius={tvMode ? 130 : 95}
                  paddingAngle={3}
                  label={(e: any) => `${e.name}: ${e.value}`}
                  labelLine={false}
                >
                  {groupPie.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12 }} />
                <Legend wrapperStyle={{ fontSize: tvMode ? 16 : 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

export default MetasConsolidadasView;