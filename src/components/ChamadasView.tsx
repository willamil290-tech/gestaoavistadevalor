import { useCallback, useEffect, useMemo, useState } from "react";
import { Phone, Timer, Clock, PhoneIncoming, PhoneOff, CalendarDays, ChevronLeft, ChevronRight, ClipboardPaste, Trash2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { loadJson, saveJson } from "@/lib/localStore";
import { canonicalizeCollaboratorNameForDate } from "@/lib/collaboratorNames";
import { getTeamGroup, type TeamGroup, TEAM_GROUP_BADGE_COLORS } from "@/lib/teamGroups";
import { isIgnoredCommercial } from "@/lib/ignoredCommercials";
import {
  parseCallsText,
  computeCallMetrics,
  aggregateMonthMetrics,
  type ParsedCall,
  type PersonDayCallMetrics,
} from "@/lib/callsParse";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function storageKey(year: number, month: number) {
  return `calls:${year}-${pad2(month)}`;
}

function formatTime(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return "—";
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  if (mins >= 60) {
    const hrs = Math.floor(mins / 60);
    const remainMins = mins % 60;
    return `${hrs}h${remainMins > 0 ? ` ${remainMins}m` : ""}`;
  }
  return `${mins}m${secs > 0 ? ` ${pad2(secs)}s` : ""}`;
}

function formatTimeShort(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return "—";
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  const mins = Math.floor(s / 60);
  if (mins >= 60) {
    const hrs = Math.floor(mins / 60);
    const remainMins = mins % 60;
    return `${hrs}h${remainMins > 0 ? `${remainMins}` : ""}`;
  }
  return `${mins}m`;
}

function formatDuration(seconds: number): string {
  if (seconds === 0) return "—";
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (secs === 0) return `${mins}min`;
  return `${mins}min ${secs}s`;
}

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const MONTH_NAMES_SHORT = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

// Team group colors for table header columns
const TEAM_HEADER_COLORS: Record<TeamGroup, string> = {
  "SDRs": "bg-blue-600 text-white",
  "Closers": "bg-purple-600 text-white",
  "CS": "bg-green-600 text-white",
  "Grandes Contas": "bg-amber-600 text-white",
  "Executivos": "bg-slate-600 text-white",
};

interface ChamadasViewProps {
  tvMode?: boolean;
}

export const ChamadasView = ({ tvMode = false }: ChamadasViewProps) => {
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [pasteText, setPasteText] = useState("");
  const [showPaste, setShowPaste] = useState(false);

  // Drill-down: selected day + person
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [drillDialog, setDrillDialog] = useState<{
    open: boolean;
    name: string;
    day: string;
    calls: ParsedCall[];
    metrics: PersonDayCallMetrics | null;
  }>({ open: false, name: "", day: "", calls: [], metrics: null });

  // Stored calls per month
  const [storedCalls, setStoredCalls] = useState<ParsedCall[]>([]);

  // Load from localStorage on mount / month change
  useEffect(() => {
    const key = storageKey(selectedYear, selectedMonth);
    const raw = loadJson<any[]>(key, []);
    const calls: ParsedCall[] = raw.map((c: any) => ({
      ...c,
      name: canonicalizeCollaboratorNameForDate(c.name ?? "", c.dateISO ?? ""),
      dateTime: new Date(c.dateTime),
    }));
    setStoredCalls(calls);
  }, [selectedYear, selectedMonth]);

  const saveToStorage = useCallback(
    (calls: ParsedCall[]) => {
      const key = storageKey(selectedYear, selectedMonth);
      saveJson(key, calls.map((call) => ({
        ...call,
        name: canonicalizeCollaboratorNameForDate(call.name, call.dateISO),
      })));
    },
    [selectedYear, selectedMonth]
  );

  // Process pasted text
  const handlePaste = () => {
    if (!pasteText.trim()) {
      toast.error("Cole os dados de chamadas antes de aplicar.");
      return;
    }

    const parsed = parseCallsText(pasteText);
    if (parsed.length === 0) {
      toast.error("Nenhuma chamada reconhecida no texto colado.");
      return;
    }

    const existing = [...storedCalls];
    const existingKeys = new Set(
      existing.map((c) => `${c.name}|${c.phone}|${c.dateTime.getTime()}`)
    );

    let added = 0;
    for (const call of parsed) {
      const key = `${call.name}|${call.phone}|${call.dateTime.getTime()}`;
      if (!existingKeys.has(key)) {
        if (call.dateTime.getFullYear() === selectedYear && call.dateTime.getMonth() + 1 === selectedMonth) {
          existing.push(call);
          existingKeys.add(key);
          added++;
        }
      }
    }

    // Handle calls from different months
    const otherMonthCalls = parsed.filter(
      (c) => c.dateTime.getFullYear() !== selectedYear || c.dateTime.getMonth() + 1 !== selectedMonth
    );
    const otherGroups = new Map<string, ParsedCall[]>();
    for (const c of otherMonthCalls) {
      const k = `${c.dateTime.getFullYear()}-${pad2(c.dateTime.getMonth() + 1)}`;
      if (!otherGroups.has(k)) otherGroups.set(k, []);
      otherGroups.get(k)!.push(c);
    }
    let otherAdded = 0;
    for (const [monthKey, calls] of otherGroups) {
      const existingOther = loadJson<any[]>(`calls:${monthKey}`, []).map((c: any) => ({
        ...c,
        name: canonicalizeCollaboratorNameForDate(c.name ?? "", c.dateISO ?? ""),
        dateTime: new Date(c.dateTime),
      }));
      const existingOtherKeys = new Set(
        existingOther.map((c: any) => `${c.name}|${c.phone}|${c.dateTime.getTime()}`)
      );
      for (const call of calls) {
        const k = `${call.name}|${call.phone}|${call.dateTime.getTime()}`;
        if (!existingOtherKeys.has(k)) {
          existingOther.push(call);
          existingOtherKeys.add(k);
          otherAdded++;
        }
      }
      saveJson(`calls:${monthKey}`, existingOther);
    }

    setStoredCalls(existing);
    saveToStorage(existing);
    setPasteText("");
    setShowPaste(false);

    const totalAdded = added + otherAdded;
    toast.success(
      `${totalAdded} chamada(s) importada(s) de ${parsed.length} reconhecida(s).` +
        (otherAdded > 0 ? ` (${otherAdded} de outro(s) mês(es))` : "")
    );
  };

  const clearMonth = () => {
    setStoredCalls([]);
    saveToStorage([]);
    toast.success(`Chamadas de ${MONTH_NAMES[selectedMonth - 1]}/${selectedYear} removidas.`);
  };

  const prevMonth = () => {
    if (selectedMonth === 1) { setSelectedMonth(12); setSelectedYear((y) => y - 1); }
    else setSelectedMonth((m) => m - 1);
    setSelectedDay(null);
  };

  const nextMonth = () => {
    if (selectedMonth === 12) { setSelectedMonth(1); setSelectedYear((y) => y + 1); }
    else setSelectedMonth((m) => m + 1);
    setSelectedDay(null);
  };

  // Computed metrics
  const dailyMetrics = useMemo(() => computeCallMetrics(storedCalls), [storedCalls]);
  const monthMetrics = useMemo(() => aggregateMonthMetrics(dailyMetrics), [dailyMetrics]);

  // Unique days sorted
  const daysWithData = useMemo(() => {
    const days = new Set(dailyMetrics.map((m) => m.date));
    return Array.from(days).sort();
  }, [dailyMetrics]);

  // All unique people sorted by team group
  const allPeople = useMemo(() => {
    const nameSet = new Set<string>();
    for (const m of dailyMetrics) {
      if (!isIgnoredCommercial(m.name)) nameSet.add(m.name);
    }
    const names = Array.from(nameSet);
    // Sort by team group order, then alphabetically
    const groupOrder: TeamGroup[] = ["SDRs", "Closers", "CS", "Grandes Contas", "Executivos"];
    names.sort((a, b) => {
      const ga = groupOrder.indexOf(getTeamGroup(a));
      const gb = groupOrder.indexOf(getTeamGroup(b));
      if (ga !== gb) return ga - gb;
      return a.localeCompare(b);
    });
    return names;
  }, [dailyMetrics]);

  // People grouped by team (for header)
  const peopleByTeam = useMemo(() => {
    const groups: { group: TeamGroup; names: string[] }[] = [];
    const groupOrder: TeamGroup[] = ["SDRs", "Closers", "CS", "Grandes Contas", "Executivos"];
    const map = new Map<TeamGroup, string[]>();
    for (const name of allPeople) {
      const g = getTeamGroup(name);
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(name);
    }
    for (const g of groupOrder) {
      if (map.has(g)) groups.push({ group: g, names: map.get(g)! });
    }
    return groups;
  }, [allPeople]);

  // Build lookup: day -> name -> metrics
  const metricsLookup = useMemo(() => {
    const lookup = new Map<string, Map<string, PersonDayCallMetrics>>();
    for (const m of dailyMetrics) {
      if (isIgnoredCommercial(m.name)) continue;
      if (!lookup.has(m.date)) lookup.set(m.date, new Map());
      lookup.get(m.date)!.set(m.name, m);
    }
    return lookup;
  }, [dailyMetrics]);

  // Daily totals
  const dayTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const day of daysWithData) {
      const dayMap = metricsLookup.get(day);
      if (!dayMap) continue;
      let total = 0;
      for (const m of dayMap.values()) total += m.totalCalls;
      totals.set(day, total);
    }
    return totals;
  }, [daysWithData, metricsLookup]);

  // Calls for selected day
  const currentDayCalls = useMemo(
    () =>
      selectedDay
        ? storedCalls
            .filter((c) => c.dateISO === selectedDay && !isIgnoredCommercial(c.name))
            .sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime())
        : [],
    [storedCalls, selectedDay]
  );

  // Open drill-down dialog for a specific person + day
  const openDrill = (name: string, day: string) => {
    const calls = storedCalls
      .filter((c) => c.name === name && c.dateISO === day)
      .sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime());
    const metrics = metricsLookup.get(day)?.get(name) ?? null;
    setDrillDialog({ open: true, name, day, calls, metrics });
  };

  const tmoColor = (seconds: number | null) => {
    if (seconds == null) return "";
    const mins = seconds / 60;
    if (mins <= 5) return "text-green-600 dark:text-green-400";
    if (mins <= 15) return "text-amber-600 dark:text-amber-400";
    return "text-red-600 dark:text-red-400";
  };

  const slColor = (seconds: number | null) => {
    if (seconds == null) return "";
    const mins = seconds / 60;
    if (mins <= 60) return "text-green-600 dark:text-green-400";
    if (mins <= 120) return "text-amber-600 dark:text-amber-400";
    return "text-red-600 dark:text-red-400";
  };

  // Person first name for compact display
  const firstName = (name: string) => name.split(" ")[0];

  return (
    <div className="animate-fade-in-up">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-blue-500" />
          <h2 className={cn("font-semibold text-foreground", tvMode ? "text-3xl" : "text-2xl md:text-3xl")}>
            Chamadas — {MONTH_NAMES_SHORT[selectedMonth - 1]}/{selectedYear}
          </h2>
        </div>

        {!tvMode && (
          <div className="flex items-center gap-2">
            <Button variant="outline" className="rounded-xl" onClick={() => setShowPaste(!showPaste)}>
              <ClipboardPaste className="w-4 h-4 mr-2" />Importar
            </Button>
            <Button variant="outline" className="rounded-xl text-destructive" onClick={clearMonth}>
              <Trash2 className="w-4 h-4 mr-2" />Limpar Mês
            </Button>
          </div>
        )}
      </div>

      {/* Paste area */}
      {showPaste && !tvMode && (
        <div className="mb-6 bg-card rounded-2xl border border-border p-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            Cole os dados de chamadas do Bitrix (copie a lista inteira da aba Chamadas):
          </p>
          <Textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder="Cole aqui os dados de chamadas..."
            className="min-h-[200px] font-mono text-xs"
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => { setShowPaste(false); setPasteText(""); }}>Cancelar</Button>
            <Button onClick={handlePaste}>Aplicar</Button>
          </div>
        </div>
      )}

      {/* Month selector */}
      <div className="flex items-center justify-center gap-4 mb-6">
        <Button variant="ghost" size="icon" onClick={prevMonth}><ChevronLeft className="w-5 h-5" /></Button>
        <div className="flex items-center gap-2">
          <CalendarDays className="w-5 h-5 text-muted-foreground" />
          <span className={cn("font-semibold", tvMode ? "text-xl" : "text-lg")}>
            {MONTH_NAMES[selectedMonth - 1]} {selectedYear}
          </span>
        </div>
        <Button variant="ghost" size="icon" onClick={nextMonth}><ChevronRight className="w-5 h-5" /></Button>
      </div>

      {/* Summary stats */}
      {storedCalls.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="bg-card rounded-xl p-3 border border-border text-center">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <Phone className="w-3.5 h-3.5 text-blue-500" />
              <span className="text-xs text-muted-foreground">Total Chamadas</span>
            </div>
            <p className={cn("font-bold text-blue-500", tvMode ? "text-2xl" : "text-xl")}>{storedCalls.length}</p>
          </div>
          <div className="bg-card rounded-xl p-3 border border-border text-center">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <PhoneIncoming className="w-3.5 h-3.5 text-green-500" />
              <span className="text-xs text-muted-foreground">Atendidas</span>
            </div>
            <p className={cn("font-bold text-green-500", tvMode ? "text-2xl" : "text-xl")}>{storedCalls.filter((c) => c.answered).length}</p>
          </div>
          <div className="bg-card rounded-xl p-3 border border-border text-center">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <PhoneOff className="w-3.5 h-3.5 text-red-500" />
              <span className="text-xs text-muted-foreground">Canceladas</span>
            </div>
            <p className={cn("font-bold text-red-500", tvMode ? "text-2xl" : "text-xl")}>{storedCalls.filter((c) => !c.answered).length}</p>
          </div>
          <div className="bg-card rounded-xl p-3 border border-border text-center">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <CalendarDays className="w-3.5 h-3.5 text-secondary" />
              <span className="text-xs text-muted-foreground">Dias com Dados</span>
            </div>
            <p className={cn("font-bold text-secondary", tvMode ? "text-2xl" : "text-xl")}>{daysWithData.length}</p>
          </div>
        </div>
      )}

      {storedCalls.length === 0 && (
        <div className="text-center text-muted-foreground py-16">
          <Phone className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p className="text-lg">Nenhuma chamada importada para este mês.</p>
          <p className="text-sm mt-2">Clique em <strong>Importar</strong> e cole os dados da aba Chamadas do Bitrix.</p>
        </div>
      )}

      {/* ===== MAIN TABLE: Days × People (like the spreadsheet) ===== */}
      {storedCalls.length > 0 && !selectedDay && (
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse min-w-[600px]">
              {/* Tier 1: Team group header */}
              <thead>
                <tr>
                  <th rowSpan={3} className="text-center px-2 py-2 font-semibold text-muted-foreground bg-muted/40 border-b border-r border-border sticky left-0 z-10 bg-card min-w-[50px]">
                    Dia
                  </th>
                  {peopleByTeam.map(({ group, names }) => (
                    <th
                      key={group}
                      colSpan={names.length * 4}
                      className={cn("text-center px-2 py-1.5 font-semibold border-b border-r border-border/50 text-xs", TEAM_HEADER_COLORS[group])}
                    >
                      {group}
                    </th>
                  ))}
                  <th rowSpan={3} className="text-center px-2 py-2 font-semibold text-muted-foreground bg-muted/40 border-b border-border min-w-[60px]">
                    Total
                  </th>
                </tr>
                {/* Tier 2: Person names with sub-columns */}
                <tr className="bg-muted/30">
                  {allPeople.map((name) => (
                    <th key={name} colSpan={4} className="text-center px-1 py-1.5 font-medium text-foreground border-b border-r border-border/50 whitespace-nowrap">
                      {firstName(name)}
                    </th>
                  ))}
                </tr>
                {/* Tier 3: Sub-column labels (📞 ✅ ❌ TMO) */}
                <tr className="bg-muted/20">
                  {allPeople.map((name) => (
                    <th key={`${name}-sub`} colSpan={4} className="border-b border-r border-border/30 p-0">
                      <div className="grid grid-cols-4 divide-x divide-border/30">
                        <span className="px-1 py-1 text-center text-[10px] text-blue-500 font-medium" title="Total de ligações">📞</span>
                        <span className="px-1 py-1 text-center text-[10px] text-green-500 font-medium" title="Bem sucedidas">✅</span>
                        <span className="px-1 py-1 text-center text-[10px] text-red-500 font-medium" title="Não atendidas">❌</span>
                        <span className="px-1 py-1 text-center text-[10px] text-amber-500 font-medium" title="Tempo total em ligação">Ligando</span>
                      </div>
                    </th>
                  ))}
                  {/* empty for Total column */}
                </tr>
              </thead>
              <tbody>
                {daysWithData.map((day, rowIdx) => {
                  const [, , d] = day.split("-");
                  const dayMap = metricsLookup.get(day);
                  const dayTotal = dayTotals.get(day) ?? 0;

                  return (
                    <tr
                      key={day}
                      className={cn(
                        "border-b border-border/30 hover:bg-muted/20 transition-colors",
                        rowIdx % 2 === 0 ? "" : "bg-muted/5"
                      )}
                    >
                      {/* Day number - clickable to drill into day */}
                      <td className="text-center px-2 py-2 font-semibold border-r border-border sticky left-0 z-10 bg-card">
                        <button
                          onClick={() => setSelectedDay(day)}
                          className="hover:text-blue-500 hover:underline cursor-pointer transition-colors"
                          title={`Ver detalhes do dia ${parseInt(d)}`}
                        >
                          {parseInt(d)}
                        </button>
                      </td>

                      {/* Per-person cells */}
                      {allPeople.map((name) => {
                        const m = dayMap?.get(name);
                        if (!m) {
                          return (
                            <td key={name} colSpan={4} className="text-center px-1 py-2 text-muted-foreground/30 border-r border-border/30">
                              —
                            </td>
                          );
                        }
                        return (
                          <td key={name} colSpan={4} className="border-r border-border/30 p-0">
                            <button
                              onClick={() => openDrill(name, day)}
                              className="w-full grid grid-cols-4 divide-x divide-border/20 hover:bg-blue-500/10 transition-colors cursor-pointer"
                              title={`${name} — Dia ${parseInt(d)}: ${m.totalCalls} lig, ${m.answeredCalls} bem sucedidas, ${m.canceledCalls} não atendidas, Falado ${formatTime(m.totalDurationSeconds)}`}
                            >
                              <span className="px-1 py-2 text-center font-semibold text-blue-600 dark:text-blue-400 tabular-nums">
                                {m.totalCalls}
                              </span>
                              <span className="px-1 py-2 text-center tabular-nums font-medium text-green-600 dark:text-green-400">
                                {m.answeredCalls}
                              </span>
                              <span className="px-1 py-2 text-center tabular-nums font-medium text-red-600 dark:text-red-400">
                                {m.canceledCalls}
                              </span>
                              <span className="px-1 py-2 text-center tabular-nums font-medium text-amber-600 dark:text-amber-400">
                                {formatTimeShort(m.totalDurationSeconds)}
                              </span>
                            </button>
                          </td>
                        );
                      })}

                      {/* Daily total */}
                      <td className="text-center px-2 py-2 font-bold text-foreground tabular-nums">
                        {dayTotal}
                      </td>
                    </tr>
                  );
                })}

                {/* Month totals row */}
                <tr className="bg-muted/30 font-semibold border-t-2 border-border">
                  <td className="text-center px-2 py-2 border-r border-border sticky left-0 z-10 bg-muted/30">
                    Total
                  </td>
                  {allPeople.map((name) => {
                    const pm = monthMetrics.find((m) => m.name === name);
                    if (!pm) {
                      return <td key={name} colSpan={4} className="text-center px-1 py-2 border-r border-border/30">—</td>;
                    }
                    return (
                      <td key={name} colSpan={4} className="border-r border-border/30 p-0">
                        <div className="grid grid-cols-4 divide-x divide-border/20">
                          <span className="px-1 py-2 text-center font-bold text-blue-600 dark:text-blue-400 tabular-nums">
                            {pm.totalCalls}
                          </span>
                          <span className="px-1 py-2 text-center tabular-nums font-bold text-green-600 dark:text-green-400">
                            {pm.answeredCalls}
                          </span>
                          <span className="px-1 py-2 text-center tabular-nums font-bold text-red-600 dark:text-red-400">
                            {pm.canceledCalls}
                          </span>
                          <span className="px-1 py-2 text-center tabular-nums font-bold text-amber-600 dark:text-amber-400">
                            {formatTimeShort(pm.totalDurationSeconds)}
                          </span>
                        </div>
                      </td>
                    );
                  })}
                  <td className="text-center px-2 py-2 font-bold text-foreground tabular-nums">
                    {storedCalls.filter((c) => !isIgnoredCommercial(c.name)).length}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ===== DAILY DETAIL VIEW ===== */}
      {storedCalls.length > 0 && selectedDay && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <Button variant="ghost" size="sm" onClick={() => setSelectedDay(null)} className="rounded-xl">
              <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
            </Button>
            <h3 className={cn("font-semibold text-foreground", tvMode ? "text-2xl" : "text-xl")}>
              {(() => { const [y, m, d] = selectedDay.split("-"); return `${d}/${m}/${y}`; })()}
            </h3>
            {/* Day selector */}
            <div className="flex items-center gap-1 ml-auto flex-wrap">
              {daysWithData.map((day) => {
                const [, , d] = day.split("-");
                return (
                  <Button
                    key={day}
                    variant={selectedDay === day ? "default" : "outline"}
                    size="sm"
                    className="rounded-lg h-8 w-8 p-0"
                    onClick={() => setSelectedDay(day)}
                  >
                    {parseInt(d)}
                  </Button>
                );
              })}
            </div>
          </div>

          {/* Per-person summary for this day */}
          <div className="bg-card rounded-2xl border border-border overflow-hidden mb-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Colaborador</th>
                  <th className="text-center px-3 py-3 font-medium text-muted-foreground">
                    <div className="flex items-center justify-center gap-1"><Phone className="w-3.5 h-3.5" /> Lig.</div>
                  </th>
                  <th className="text-center px-3 py-3 font-medium text-muted-foreground">Atend.</th>
                  <th className="text-center px-3 py-3 font-medium text-muted-foreground">Canc.</th>
                  <th className="text-center px-3 py-3 font-medium text-muted-foreground">Duração</th>
                  <th className="text-center px-3 py-3 font-medium text-muted-foreground">
                    <div className="flex items-center justify-center gap-1" title="Tempo total falado em ligações">
                      <Timer className="w-3.5 h-3.5" /> Ligando
                    </div>
                  </th>
                  <th className="text-center px-3 py-3 font-medium text-muted-foreground">1ª Lig.</th>
                  <th className="text-center px-3 py-3 font-medium text-muted-foreground">Última</th>
                </tr>
              </thead>
              <tbody>
                {allPeople.map((name, idx) => {
                  const m = metricsLookup.get(selectedDay)?.get(name);
                  if (!m) return null;
                  const group = getTeamGroup(name);
                  return (
                    <tr
                      key={name}
                      className={cn(
                        "border-b border-border/50 last:border-b-0 cursor-pointer hover:bg-blue-500/5 transition-colors",
                        idx % 2 === 0 ? "" : "bg-muted/10"
                      )}
                      onClick={() => openDrill(name, selectedDay)}
                    >
                      <td className="px-4 py-3 font-medium">
                        <div className="flex items-center gap-2">
                          <span>{name}</span>
                          <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full", TEAM_GROUP_BADGE_COLORS[group])}>{group}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center"><span className="font-semibold text-blue-500">{m.totalCalls}</span></td>
                      <td className="px-3 py-3 text-center"><span className="font-semibold text-green-500">{m.answeredCalls}</span></td>
                      <td className="px-3 py-3 text-center"><span className="font-semibold text-red-500">{m.canceledCalls}</span></td>
                      <td className="px-3 py-3 text-center"><span className="font-semibold">{formatTime(m.totalDurationSeconds)}</span></td>
                      <td className="px-3 py-3 text-center"><span className="font-semibold text-amber-600 dark:text-amber-400">{formatTime(m.totalDurationSeconds)}</span></td>
                      <td className="px-3 py-3 text-center text-xs text-muted-foreground">{m.firstCallTime}</td>
                      <td className="px-3 py-3 text-center text-xs text-muted-foreground">{m.lastCallTime}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Full call log for the day */}
          <div className="flex items-center gap-3 mb-4">
            <div className="w-3 h-3 rounded-full bg-blue-500" />
            <h3 className={cn("font-semibold text-foreground", tvMode ? "text-xl" : "text-lg")}>
              Log de Chamadas ({currentDayCalls.length})
            </h3>
          </div>

          <div className="space-y-1">
            {currentDayCalls.map((call, i) => (
              <div
                key={i}
                className={cn(
                  "flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm",
                  call.answered ? "bg-green-500/5 border border-green-500/20" : "bg-red-500/5 border border-red-500/20"
                )}
              >
                <div className="shrink-0">
                  {call.answered ? <PhoneIncoming className="w-4 h-4 text-green-500" /> : <PhoneOff className="w-4 h-4 text-red-500" />}
                </div>
                <span className="font-medium w-32 truncate shrink-0">{call.name}</span>
                <span className="text-xs text-muted-foreground w-28 shrink-0 tabular-nums">{call.phone}</span>
                <span className="text-xs tabular-nums w-14 shrink-0 text-center">{call.timeHHMM}</span>
                <span className="text-xs w-16 shrink-0 text-center font-medium">{formatDuration(call.durationSeconds)}</span>
                <span className={cn("text-xs w-24 shrink-0 text-center", call.answered ? "text-green-600" : "text-red-500")}>{call.status}</span>
                <span className="text-xs text-muted-foreground truncate flex-1">{call.contactInfo}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===== DRILL-DOWN DIALOG (person + day) ===== */}
      <Dialog open={drillDialog.open} onOpenChange={(open) => setDrillDialog((prev) => ({ ...prev, open }))}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{drillDialog.name} — {(() => { const [y, m, d] = (drillDialog.day || "0-0-0").split("-"); return `${d}/${m}/${y}`; })()}</DialogTitle>
            <DialogDescription>
              {drillDialog.calls.length} chamada(s)
              {drillDialog.metrics && (
                <>
                  {" · "}
                  <span className="text-blue-500 font-medium">{drillDialog.metrics.totalCalls} lig</span>
                  {" · "}
                  <span className="text-green-500 font-medium">{drillDialog.metrics.answeredCalls} atend</span>
                  {" · "}
                  <span className="text-red-500 font-medium">{drillDialog.metrics.canceledCalls} não atend</span>
                  {" · "}
                  Ligando: <span className="font-medium text-amber-600 dark:text-amber-400">{formatTime(drillDialog.metrics.totalDurationSeconds)}</span>
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1 mt-2">
            {drillDialog.calls.map((call, i) => (
              <div
                key={i}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg text-sm",
                  call.answered ? "bg-green-500/5 border border-green-500/20" : "bg-red-500/5 border border-red-500/20"
                )}
              >
                {call.answered ? <PhoneIncoming className="w-3.5 h-3.5 text-green-500 shrink-0" /> : <PhoneOff className="w-3.5 h-3.5 text-red-500 shrink-0" />}
                <span className="text-xs tabular-nums w-12 shrink-0 text-center font-medium">{call.timeHHMM}</span>
                <span className="text-xs text-muted-foreground w-28 shrink-0 tabular-nums">{call.phone}</span>
                <span className="text-xs w-14 shrink-0 text-center font-medium">{formatDuration(call.durationSeconds)}</span>
                <span className={cn("text-xs w-20 shrink-0", call.answered ? "text-green-600" : "text-red-500")}>{call.status}</span>
                <span className="text-xs text-muted-foreground truncate flex-1">{call.contactInfo}</span>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
