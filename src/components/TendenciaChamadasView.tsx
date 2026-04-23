import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, PhoneCall, TrendingUp, Users } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartContainer } from "@/components/ui/chart";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { loadJson } from "@/lib/localStore";
import { canonicalizeCollaboratorNameForDate, isMariaCollaboratorName } from "@/lib/collaboratorNames";
import { isIgnoredCommercial } from "@/lib/ignoredCommercials";
import { buildPreferredCollaboratorNameMap, getTeamGroup, type TeamGroup } from "@/lib/teamGroups";
import type { ParsedCall } from "@/lib/callsParse";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function isoFromDate(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function shouldHide(name: string) {
  return isIgnoredCommercial(name) || isMariaCollaboratorName(name);
}

const GROUP_ORDER: TeamGroup[] = ["SDRs", "Closers", "CS", "Grandes Contas", "Executivos"];

const GROUP_COLORS: Record<TeamGroup, string> = {
  SDRs: "hsl(217 91% 60%)",
  Closers: "hsl(271 81% 56%)",
  CS: "hsl(142 71% 45%)",
  "Grandes Contas": "hsl(38 92% 50%)",
  Executivos: "hsl(215 20% 45%)",
};

interface TendenciaChamadasViewProps {
  tvMode?: boolean;
}

/**
 * Carrega chamadas de todos os meses entre `from` e `to` (inclusive).
 * Usa as mesmas chaves `calls:YYYY-MM` que a aba Chamadas grava.
 */
function loadCallsInRange(from: Date, to: Date): ParsedCall[] {
  const months = new Set<string>();
  const cursor = new Date(from.getFullYear(), from.getMonth(), 1);
  const end = new Date(to.getFullYear(), to.getMonth(), 1);
  while (cursor.getTime() <= end.getTime()) {
    months.add(`${cursor.getFullYear()}-${pad2(cursor.getMonth() + 1)}`);
    cursor.setMonth(cursor.getMonth() + 1);
  }

  const fromIso = isoFromDate(from);
  const toIso = isoFromDate(to);
  const out: ParsedCall[] = [];

  for (const mk of months) {
    const raw = loadJson<any[]>(`calls:${mk}`, []) ?? [];
    for (const c of raw) {
      const dateISO = c.dateISO ?? "";
      if (!dateISO || dateISO < fromIso || dateISO > toIso) continue;
      out.push({
        ...c,
        name: canonicalizeCollaboratorNameForDate(c.name ?? "", dateISO),
        dateTime: new Date(c.dateTime),
      } as ParsedCall);
    }
  }
  return out;
}

export const TendenciaChamadasView = ({ tvMode = false }: TendenciaChamadasViewProps) => {
  // Default: últimos 30 dias (incluindo hoje)
  const today = new Date();
  const defaultFrom = new Date(today);
  defaultFrom.setDate(defaultFrom.getDate() - 29);

  const [from, setFrom] = useState<Date>(defaultFrom);
  const [to, setTo] = useState<Date>(today);
  const [viewMode, setViewMode] = useState<"individual" | "setor" | "total">("total");
  const [selectedPerson, setSelectedPerson] = useState<string>("__ALL__");
  const [selectedGroup, setSelectedGroup] = useState<TeamGroup | "__ALL__">("__ALL__");
  const [reloadKey, setReloadKey] = useState(0);

  // Recarrega quando muda período ou quando a aba é montada
  const calls = useMemo(
    () => loadCallsInRange(from, to).filter((c) => !shouldHide(c.name)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [from, to, reloadKey]
  );

  // Listener para atualizar quando outra aba salvar chamadas
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key && e.key.startsWith("calls:")) setReloadKey((k) => k + 1);
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  // Aliases (nome preferido por colaborador)
  const nameAliases = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of calls) counts.set(c.name, (counts.get(c.name) ?? 0) + 1);
    return buildPreferredCollaboratorNameMap(
      Array.from(counts, ([name, score]) => ({ name, score }))
    );
  }, [calls]);

  const normalizedCalls = useMemo(
    () =>
      calls.map((c) => {
        const preferred = nameAliases.get(c.name) ?? c.name;
        return preferred === c.name ? c : { ...c, name: preferred };
      }),
    [calls, nameAliases]
  );

  // Lista de colaboradores
  const allPeople = useMemo(() => {
    const set = new Set<string>();
    for (const c of normalizedCalls) set.add(c.name);
    return Array.from(set).sort((a, b) => {
      const ga = GROUP_ORDER.indexOf(getTeamGroup(a));
      const gb = GROUP_ORDER.indexOf(getTeamGroup(b));
      if (ga !== gb) return ga - gb;
      return a.localeCompare(b);
    });
  }, [normalizedCalls]);

  // Lista de dias cobertos pelo intervalo (sequencial, mesmo sem dados)
  const dayList = useMemo(() => {
    const days: string[] = [];
    const cursor = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
    while (cursor.getTime() <= end.getTime()) {
      days.push(isoFromDate(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return days;
  }, [from, to]);

  // Dados do gráfico — agregação por HORA DO EXPEDIENTE (08-18), consolidando o período
  const chartData = useMemo(() => {
    // base: 11 linhas, uma por hora (08..18)
    const HOUR_START = 8;
    const HOUR_END = 18; // inclusivo
    const rows: Record<string, any>[] = [];
    for (let h = HOUR_START; h <= HOUR_END; h++) {
      rows.push({ hour: h, label: `${pad2(h)}h` });
    }
    const idxOf = (h: number) => h - HOUR_START;

    const hourOf = (c: ParsedCall) => {
      // Prefere hora extraída do timeHHMM (mais confiável que dateTime após serialização)
      if (c.timeHHMM && /^\d{2}:\d{2}$/.test(c.timeHHMM)) {
        return parseInt(c.timeHHMM.slice(0, 2), 10);
      }
      try { return new Date(c.dateTime).getHours(); } catch { return 0; }
    };

    if (viewMode === "total") {
      for (const r of rows) r["Total"] = 0;
      for (const c of normalizedCalls) {
        const h = hourOf(c);
        if (h < HOUR_START || h > HOUR_END) continue;
        const i = idxOf(h);
        rows[i]["Total"] = (rows[i]["Total"] ?? 0) + 1;
      }
    } else if (viewMode === "setor") {
      const groups = selectedGroup === "__ALL__" ? GROUP_ORDER : [selectedGroup];
      for (const r of rows) for (const g of groups) r[g] = 0;
      for (const c of normalizedCalls) {
        const h = hourOf(c);
        if (h < HOUR_START || h > HOUR_END) continue;
        const i = idxOf(h);
        const g = getTeamGroup(c.name);
        if (!groups.includes(g)) continue;
        rows[i][g] = (rows[i][g] ?? 0) + 1;
      }
    } else {
      const people = selectedPerson === "__ALL__" ? allPeople : [selectedPerson];
      for (const r of rows) for (const p of people) r[p] = 0;
      for (const c of normalizedCalls) {
        const h = hourOf(c);
        if (h < HOUR_START || h > HOUR_END) continue;
        const i = idxOf(h);
        if (!people.includes(c.name)) continue;
        rows[i][c.name] = (rows[i][c.name] ?? 0) + 1;
      }
    }
    return rows;
  }, [normalizedCalls, viewMode, selectedGroup, selectedPerson, allPeople]);

  // Séries (chaves do gráfico) e cores
  const series = useMemo(() => {
    if (viewMode === "total") return [{ key: "Total", color: "hsl(var(--primary))" }];
    if (viewMode === "setor") {
      const groups = selectedGroup === "__ALL__" ? GROUP_ORDER : [selectedGroup];
      return groups.map((g) => ({ key: g, color: GROUP_COLORS[g] }));
    }
    const people = selectedPerson === "__ALL__" ? allPeople : [selectedPerson];
    // Paleta com 12 tons distintos
    const palette = [
      "hsl(217 91% 60%)", "hsl(271 81% 56%)", "hsl(142 71% 45%)", "hsl(38 92% 50%)",
      "hsl(0 84% 60%)", "hsl(199 89% 48%)", "hsl(47 96% 53%)", "hsl(280 65% 60%)",
      "hsl(160 70% 40%)", "hsl(20 90% 55%)", "hsl(330 70% 55%)", "hsl(190 80% 45%)",
    ];
    return people.map((name, i) => ({ key: name, color: palette[i % palette.length] }));
  }, [viewMode, selectedGroup, selectedPerson, allPeople]);

  // Totais agregados
  const totalCalls = normalizedCalls.length;
  const totalDays = dayList.length;

  // Hora de pico: maior soma na grade horária (considerando a visão atual)
  const peakHour = useMemo(() => {
    let bestH = 0;
    let bestV = -1;
    for (const row of chartData) {
      let sum = 0;
      for (const k of Object.keys(row)) {
        if (k === "hour" || k === "label") continue;
        sum += Number(row[k] ?? 0);
      }
      if (sum > bestV) { bestV = sum; bestH = row.hour as number; }
    }
    return { hour: bestH, count: bestV < 0 ? 0 : bestV };
  }, [chartData]);

  // Ranking por colaborador (no período)
  const ranking = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of normalizedCalls) counts.set(c.name, (counts.get(c.name) ?? 0) + 1);
    return Array.from(counts, ([name, total]) => ({ name, total, group: getTeamGroup(name) }))
      .sort((a, b) => b.total - a.total);
  }, [normalizedCalls]);

  const sectorTotals = useMemo(() => {
    const totals = new Map<TeamGroup, number>();
    for (const g of GROUP_ORDER) totals.set(g, 0);
    for (const c of normalizedCalls) {
      const g = getTeamGroup(c.name);
      totals.set(g, (totals.get(g) ?? 0) + 1);
    }
    return totals;
  }, [normalizedCalls]);

  const chartConfig = useMemo(() => {
    const cfg: Record<string, { label: string; color: string }> = {};
    for (const s of series) cfg[s.key] = { label: s.key, color: s.color };
    return cfg;
  }, [series]);

  return (
    <div className="animate-fade-in-up space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-3 h-3 rounded-full bg-blue-500" />
        <h2 className={cn("font-semibold text-foreground", tvMode ? "text-3xl" : "text-2xl md:text-3xl")}>
          Tendência de Chamadas
        </h2>
      </div>
      <p className="text-sm text-muted-foreground -mt-3">
        Distribuição das ligações por hora do expediente (08–18h), consolidando todo o período selecionado.
      </p>

      {/* Controles */}
      <div className="bg-card rounded-2xl p-4 md:p-6 border border-border">
        <div className="flex flex-wrap items-end gap-3">
          {/* From */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">De</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-[150px] justify-start text-left font-normal">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(from, "dd/MM/yyyy", { locale: ptBR })}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={from}
                  onSelect={(d) => d && setFrom(d)}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>
          {/* To */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Até</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-[150px] justify-start text-left font-normal">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(to, "dd/MM/yyyy", { locale: ptBR })}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={to}
                  onSelect={(d) => d && setTo(d)}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Atalhos */}
          <div className="flex gap-1 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => {
              const t = new Date();
              setTo(t);
              const f = new Date(t); f.setDate(f.getDate() - 6);
              setFrom(f);
            }}>7 dias</Button>
            <Button variant="outline" size="sm" onClick={() => {
              const t = new Date();
              setTo(t);
              const f = new Date(t); f.setDate(f.getDate() - 29);
              setFrom(f);
            }}>30 dias</Button>
            <Button variant="outline" size="sm" onClick={() => {
              const t = new Date();
              const f = new Date(t.getFullYear(), t.getMonth(), 1);
              setFrom(f); setTo(t);
            }}>Mês atual</Button>
          </div>

          <div className="flex-1" />

          {/* Visão */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Visão</label>
            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as any)}>
              <TabsList>
                <TabsTrigger value="total">Total</TabsTrigger>
                <TabsTrigger value="setor">Por setor</TabsTrigger>
                <TabsTrigger value="individual">Individual</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {viewMode === "setor" && (
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Setor</label>
              <Select value={selectedGroup} onValueChange={(v) => setSelectedGroup(v as any)}>
                <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__ALL__">Todos os setores</SelectItem>
                  {GROUP_ORDER.map((g) => (
                    <SelectItem key={g} value={g}>{g}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {viewMode === "individual" && (
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Colaborador</label>
              <Select value={selectedPerson} onValueChange={setSelectedPerson}>
                <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__ALL__">Todos</SelectItem>
                  {allPeople.map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card rounded-2xl p-4 border border-border flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <PhoneCall className="w-5 h-5 text-primary" />
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Total de chamadas</div>
            <div className="text-2xl font-bold tabular-nums">{totalCalls.toLocaleString("pt-BR")}</div>
          </div>
        </div>
        <div className="bg-card rounded-2xl p-4 border border-border flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-accent" />
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Hora de pico</div>
            <div className="text-2xl font-bold tabular-nums">
              {pad2(peakHour.hour)}h <span className="text-sm text-muted-foreground font-normal">({peakHour.count})</span>
            </div>
          </div>
        </div>
        <div className="bg-card rounded-2xl p-4 border border-border flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-secondary/10 flex items-center justify-center">
            <Users className="w-5 h-5 text-secondary" />
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Colaboradores ativos</div>
            <div className="text-2xl font-bold tabular-nums">{allPeople.length}</div>
          </div>
        </div>
      </div>

      {/* Gráfico principal */}
      <div className="bg-card rounded-2xl p-4 md:p-6 border border-border">
        <div className="mb-4">
          <h3 className={cn("font-semibold", tvMode ? "text-xl" : "text-lg")}>
            Tendência por hora ({format(from, "dd/MM", { locale: ptBR })} – {format(to, "dd/MM", { locale: ptBR })})
          </h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            {viewMode === "total" && "Total de chamadas por hora do dia (consolidado no período)."}
            {viewMode === "setor" && (selectedGroup === "__ALL__" ? "Comparativo entre todos os setores, por hora do dia." : `Setor ${selectedGroup} — por hora do dia.`)}
            {viewMode === "individual" && (selectedPerson === "__ALL__" ? "Todos os colaboradores — por hora do dia." : `Colaborador: ${selectedPerson} — por hora do dia.`)}
          </p>
        </div>

        {totalCalls === 0 ? (
          <div className="text-center text-muted-foreground py-12">
            Nenhuma chamada encontrada no período. Importe os dados na aba <strong>Chamadas</strong>.
          </div>
        ) : (
          <div className={tvMode ? "h-[480px]" : "h-[400px]"}>
            <ChartContainer config={chartConfig}>
              <ResponsiveContainer width="100%" height="100%">
                {viewMode === "total" ? (
                  <BarChart data={chartData} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: tvMode ? 14 : 11 }} />
                    <YAxis tickLine={false} axisLine={false} allowDecimals={false} tick={{ fontSize: tvMode ? 14 : 11 }} />
                    <RTooltip />
                    <Bar dataKey="Total" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                  </BarChart>
                ) : (
                  <LineChart data={chartData} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: tvMode ? 14 : 11 }} />
                    <YAxis tickLine={false} axisLine={false} allowDecimals={false} tick={{ fontSize: tvMode ? 14 : 11 }} />
                    <RTooltip />
                    <Legend />
                    {series.map((s) => (
                      <Line
                        key={s.key}
                        type="monotone"
                        dataKey={s.key}
                        stroke={s.color}
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        activeDot={{ r: 5 }}
                      />
                    ))}
                  </LineChart>
                )}
              </ResponsiveContainer>
            </ChartContainer>
          </div>
        )}
      </div>

      {/* Ranking + setor */}
      {totalCalls > 0 && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="bg-card rounded-2xl p-4 md:p-6 border border-border">
            <h3 className="font-semibold text-lg mb-3">Ranking por colaborador</h3>
            <div className="space-y-2 max-h-[360px] overflow-y-auto">
              {ranking.map((r, i) => {
                const max = ranking[0]?.total || 1;
                const pct = (r.total / max) * 100;
                return (
                  <div key={r.name} className="flex items-center gap-3">
                    <div className="w-6 text-xs text-muted-foreground tabular-nums text-right">{i + 1}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-sm font-medium truncate">{r.name}</span>
                        <span className="text-sm font-bold tabular-nums ml-2">{r.total}</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, backgroundColor: GROUP_COLORS[r.group] }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-card rounded-2xl p-4 md:p-6 border border-border">
            <h3 className="font-semibold text-lg mb-3">Total por setor</h3>
            <div className="space-y-2">
              {GROUP_ORDER.map((g) => {
                const total = sectorTotals.get(g) ?? 0;
                const max = Math.max(...Array.from(sectorTotals.values()), 1);
                const pct = (total / max) * 100;
                if (total === 0) return null;
                return (
                  <div key={g} className="flex items-center gap-3">
                    <div className="w-32 text-sm font-medium truncate">{g}</div>
                    <div className="flex-1">
                      <div className="h-3 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, backgroundColor: GROUP_COLORS[g] }}
                        />
                      </div>
                    </div>
                    <div className="w-12 text-right text-sm font-bold tabular-nums">{total}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};