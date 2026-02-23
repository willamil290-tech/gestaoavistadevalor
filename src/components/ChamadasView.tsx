import { useCallback, useEffect, useMemo, useState } from "react";
import { Phone, Timer, Clock, PhoneIncoming, PhoneOff, CalendarDays, ChevronLeft, ChevronRight, ClipboardPaste, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { loadJson, saveJson } from "@/lib/localStore";
import { groupByTeam, TEAM_GROUP_BADGE_COLORS } from "@/lib/teamGroups";
import { isIgnoredCommercial } from "@/lib/ignoredCommercials";
import {
  parseCallsText,
  computeCallMetrics,
  aggregateMonthMetrics,
  type ParsedCall,
  type PersonDayCallMetrics,
  type PersonMonthCallMetrics,
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
    return `${hrs}h ${remainMins}min`;
  }
  return `${mins}min ${pad2(secs)}s`;
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

interface ChamadasViewProps {
  tvMode?: boolean;
}

type ViewMode = "month-summary" | "daily-detail";

export const ChamadasView = ({ tvMode = false }: ChamadasViewProps) => {
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1); // 1-indexed
  const [pasteText, setPasteText] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("month-summary");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  // Stored calls per month
  const [storedCalls, setStoredCalls] = useState<ParsedCall[]>([]);

  // Load from localStorage on mount / month change
  useEffect(() => {
    const key = storageKey(selectedYear, selectedMonth);
    const raw = loadJson<any[]>(key, []);
    // Rehydrate dates
    const calls: ParsedCall[] = raw.map((c: any) => ({
      ...c,
      dateTime: new Date(c.dateTime),
    }));
    setStoredCalls(calls);
  }, [selectedYear, selectedMonth]);

  // Save to localStorage whenever storedCalls changes
  const saveToStorage = useCallback(
    (calls: ParsedCall[]) => {
      const key = storageKey(selectedYear, selectedMonth);
      saveJson(key, calls);
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

    // Merge with existing, avoiding duplicates by (name + phone + dateTime)
    const existing = [...storedCalls];
    const existingKeys = new Set(
      existing.map((c) => `${c.name}|${c.phone}|${c.dateTime.getTime()}`)
    );

    let added = 0;
    for (const call of parsed) {
      const key = `${call.name}|${call.phone}|${call.dateTime.getTime()}`;
      if (!existingKeys.has(key)) {
        // Only add calls that belong to the selected month
        if (call.dateTime.getFullYear() === selectedYear && call.dateTime.getMonth() + 1 === selectedMonth) {
          existing.push(call);
          existingKeys.add(key);
          added++;
        }
      }
    }

    // Also handle calls from different months
    const otherMonthCalls = parsed.filter(
      (c) =>
        c.dateTime.getFullYear() !== selectedYear ||
        c.dateTime.getMonth() + 1 !== selectedMonth
    );

    // Group other month calls and save to their respective months
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

  // Navigate months
  const prevMonth = () => {
    if (selectedMonth === 1) {
      setSelectedMonth(12);
      setSelectedYear((y) => y - 1);
    } else {
      setSelectedMonth((m) => m - 1);
    }
    setViewMode("month-summary");
    setSelectedDay(null);
  };

  const nextMonth = () => {
    if (selectedMonth === 12) {
      setSelectedMonth(1);
      setSelectedYear((y) => y + 1);
    } else {
      setSelectedMonth((m) => m + 1);
    }
    setViewMode("month-summary");
    setSelectedDay(null);
  };

  // Computed metrics
  const dailyMetrics = useMemo(() => computeCallMetrics(storedCalls), [storedCalls]);
  const monthMetrics = useMemo(() => aggregateMonthMetrics(dailyMetrics), [dailyMetrics]);

  // Unique days with data
  const daysWithData = useMemo(() => {
    const days = new Set(dailyMetrics.map((m) => m.date));
    return Array.from(days).sort();
  }, [dailyMetrics]);

  // Current day detail
  const currentDayMetrics = useMemo(
    () => (selectedDay ? dailyMetrics.filter((m) => m.date === selectedDay) : []),
    [dailyMetrics, selectedDay]
  );

  // Calls for selected day
  const currentDayCalls = useMemo(
    () =>
      selectedDay
        ? storedCalls
            .filter((c) => c.dateISO === selectedDay)
            .sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime())
        : [],
    [storedCalls, selectedDay]
  );

  // Group monthly metrics by team
  const groupedMonthMetrics = useMemo(() => {
    const items = monthMetrics
      .filter((m) => !isIgnoredCommercial(m.name))
      .map((m) => ({ ...m, name: m.name }));
    return groupByTeam(items);
  }, [monthMetrics]);

  // Group daily metrics by team
  const groupedDayMetrics = useMemo(() => {
    const items = currentDayMetrics
      .filter((m) => !isIgnoredCommercial(m.name))
      .map((m) => ({ ...m, name: m.name }));
    return groupByTeam(items);
  }, [currentDayMetrics]);

  // Format selected day for display
  const formatDayLabel = (dateISO: string) => {
    const [y, m, d] = dateISO.split("-");
    return `${d}/${m}/${y}`;
  };

  const tmoColor = (seconds: number | null) => {
    if (seconds == null) return "";
    const mins = seconds / 60;
    if (mins <= 5) return "text-green-500";
    if (mins <= 15) return "text-amber-500";
    return "text-red-500";
  };

  const slColor = (seconds: number | null) => {
    if (seconds == null) return "";
    const mins = seconds / 60;
    if (mins <= 60) return "text-green-500";
    if (mins <= 120) return "text-amber-500";
    return "text-red-500";
  };

  return (
    <div className="animate-fade-in-up">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-blue-500" />
          <h2
            className={cn(
              "font-semibold text-foreground",
              tvMode ? "text-3xl" : "text-2xl md:text-3xl"
            )}
          >
            Chamadas
          </h2>
        </div>

        {!tvMode && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={() => setShowPaste(!showPaste)}
            >
              <ClipboardPaste className="w-4 h-4 mr-2" />
              Importar
            </Button>
            <Button
              variant="outline"
              className="rounded-xl text-destructive"
              onClick={clearMonth}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Limpar Mês
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
            <Button
              variant="ghost"
              onClick={() => {
                setShowPaste(false);
                setPasteText("");
              }}
            >
              Cancelar
            </Button>
            <Button onClick={handlePaste}>Aplicar</Button>
          </div>
        </div>
      )}

      {/* Month selector */}
      <div className="flex items-center justify-center gap-4 mb-6">
        <Button variant="ghost" size="icon" onClick={prevMonth}>
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <div className="flex items-center gap-2">
          <CalendarDays className="w-5 h-5 text-muted-foreground" />
          <span className={cn("font-semibold", tvMode ? "text-xl" : "text-lg")}>
            {MONTH_NAMES[selectedMonth - 1]} {selectedYear}
          </span>
        </div>
        <Button variant="ghost" size="icon" onClick={nextMonth}>
          <ChevronRight className="w-5 h-5" />
        </Button>
      </div>

      {/* View toggle */}
      {storedCalls.length > 0 && (
        <div className="flex items-center justify-center gap-2 mb-6">
          <Button
            variant={viewMode === "month-summary" ? "default" : "outline"}
            className="rounded-xl"
            onClick={() => {
              setViewMode("month-summary");
              setSelectedDay(null);
            }}
          >
            <Users className="w-4 h-4 mr-2" />
            Resumo do Mês
          </Button>
          <Button
            variant={viewMode === "daily-detail" ? "default" : "outline"}
            className="rounded-xl"
            onClick={() => {
              setViewMode("daily-detail");
              if (!selectedDay && daysWithData.length > 0)
                setSelectedDay(daysWithData[daysWithData.length - 1]);
            }}
          >
            <CalendarDays className="w-4 h-4 mr-2" />
            Diário
          </Button>
        </div>
      )}

      {/* Summary stats */}
      {storedCalls.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="bg-card rounded-xl p-3 border border-border text-center">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <Phone className="w-3.5 h-3.5 text-blue-500" />
              <span className="text-xs text-muted-foreground">Total Chamadas</span>
            </div>
            <p className={cn("font-bold text-blue-500", tvMode ? "text-2xl" : "text-xl")}>
              {storedCalls.length}
            </p>
          </div>
          <div className="bg-card rounded-xl p-3 border border-border text-center">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <PhoneIncoming className="w-3.5 h-3.5 text-green-500" />
              <span className="text-xs text-muted-foreground">Atendidas</span>
            </div>
            <p className={cn("font-bold text-green-500", tvMode ? "text-2xl" : "text-xl")}>
              {storedCalls.filter((c) => c.answered).length}
            </p>
          </div>
          <div className="bg-card rounded-xl p-3 border border-border text-center">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <PhoneOff className="w-3.5 h-3.5 text-red-500" />
              <span className="text-xs text-muted-foreground">Canceladas</span>
            </div>
            <p className={cn("font-bold text-red-500", tvMode ? "text-2xl" : "text-xl")}>
              {storedCalls.filter((c) => !c.answered).length}
            </p>
          </div>
          <div className="bg-card rounded-xl p-3 border border-border text-center">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <CalendarDays className="w-3.5 h-3.5 text-secondary" />
              <span className="text-xs text-muted-foreground">Dias com Dados</span>
            </div>
            <p className={cn("font-bold text-secondary", tvMode ? "text-2xl" : "text-xl")}>
              {daysWithData.length}
            </p>
          </div>
        </div>
      )}

      {storedCalls.length === 0 && (
        <div className="text-center text-muted-foreground py-16">
          <Phone className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p className="text-lg">Nenhuma chamada importada para este mês.</p>
          <p className="text-sm mt-2">
            Clique em <strong>Importar</strong> e cole os dados da aba Chamadas do Bitrix.
          </p>
        </div>
      )}

      {/* MONTH SUMMARY VIEW */}
      {viewMode === "month-summary" && storedCalls.length > 0 && (
        <div>
          {/* Metrics table grouped by team */}
          {groupedMonthMetrics.map(({ group, items }) => (
            <div key={group} className="mb-6">
              <div className="flex items-center gap-2 mb-3">
                <span
                  className={cn(
                    "text-xs font-semibold px-3 py-1 rounded-full border",
                    TEAM_GROUP_BADGE_COLORS[group]
                  )}
                >
                  {group}
                </span>
                <div className="flex-1 h-px bg-border" />
              </div>

              <div className="bg-card rounded-2xl border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                        Colaborador
                      </th>
                      <th className="text-center px-4 py-3 font-medium text-muted-foreground">
                        <div className="flex items-center justify-center gap-1">
                          <Phone className="w-3.5 h-3.5" /> Ligações
                        </div>
                      </th>
                      <th className="text-center px-4 py-3 font-medium text-muted-foreground">
                        <div className="flex items-center justify-center gap-1">
                          <PhoneIncoming className="w-3.5 h-3.5" /> Atendidas
                        </div>
                      </th>
                      <th className="text-center px-4 py-3 font-medium text-muted-foreground">
                        <div className="flex items-center justify-center gap-1">
                          <Clock className="w-3.5 h-3.5" /> Duração Total
                        </div>
                      </th>
                      <th className="text-center px-4 py-3 font-medium text-muted-foreground">
                        <div
                          className="flex items-center justify-center gap-1"
                          title="Tempo médio entre cada ligação, desconsiderando o tempo em que estava em ligação"
                        >
                          <Timer className="w-3.5 h-3.5" /> TMO Médio
                        </div>
                      </th>
                      <th className="text-center px-4 py-3 font-medium text-muted-foreground">
                        <div
                          className="flex items-center justify-center gap-1"
                          title="Tempo total em que a pessoa não estava ligando (soma de todos os dias)"
                        >
                          <Clock className="w-3.5 h-3.5" /> S/L Total
                        </div>
                      </th>
                      <th className="text-center px-4 py-3 font-medium text-muted-foreground">
                        Dias
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((m, idx) => (
                      <tr
                        key={m.name}
                        className={cn(
                          "border-b border-border/50 last:border-b-0",
                          idx % 2 === 0 ? "" : "bg-muted/10"
                        )}
                      >
                        <td className="px-4 py-3 font-medium">{m.name}</td>
                        <td className="px-4 py-3 text-center">
                          <span className="font-semibold text-blue-500">
                            {m.totalCalls}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="font-semibold text-green-500">
                            {m.answeredCalls}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="font-semibold">
                            {formatTime(m.totalDurationSeconds)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span
                            className={cn(
                              "font-semibold",
                              tmoColor(m.avgTmoSeconds)
                            )}
                          >
                            {formatTime(m.avgTmoSeconds)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span
                            className={cn(
                              "font-semibold",
                              slColor(m.totalSlSeconds)
                            )}
                          >
                            {formatTime(m.totalSlSeconds)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="font-semibold text-secondary">
                            {m.daysWorked}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          {/* Daily breakdown table */}
          <div className="mt-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-3 h-3 rounded-full bg-secondary" />
              <h3
                className={cn(
                  "font-semibold text-foreground",
                  tvMode ? "text-2xl" : "text-xl md:text-2xl"
                )}
              >
                Detalhamento por Dia
              </h3>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-2">
              {daysWithData.map((day) => {
                const dayM = dailyMetrics.filter((m) => m.date === day);
                const totalCalls = dayM.reduce((s, m) => s + m.totalCalls, 0);
                const [, , d] = day.split("-");
                return (
                  <button
                    key={day}
                    onClick={() => {
                      setSelectedDay(day);
                      setViewMode("daily-detail");
                    }}
                    className={cn(
                      "bg-card rounded-xl p-3 border border-border hover:border-blue-500/50 transition-colors text-center cursor-pointer",
                      selectedDay === day && "border-blue-500 bg-blue-500/5"
                    )}
                  >
                    <p className="text-xs text-muted-foreground">Dia {parseInt(d)}</p>
                    <p className="font-bold text-blue-500 text-lg">{totalCalls}</p>
                    <p className="text-xs text-muted-foreground">chamadas</p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* DAILY DETAIL VIEW */}
      {viewMode === "daily-detail" && storedCalls.length > 0 && (
        <div>
          {/* Day selector */}
          <div className="flex items-center justify-center gap-2 mb-6 flex-wrap">
            {daysWithData.map((day) => {
              const [, , d] = day.split("-");
              return (
                <Button
                  key={day}
                  variant={selectedDay === day ? "default" : "outline"}
                  className="rounded-xl"
                  onClick={() => setSelectedDay(day)}
                >
                  {parseInt(d)}
                </Button>
              );
            })}
          </div>

          {selectedDay && (
            <>
              <h3
                className={cn(
                  "font-semibold text-foreground mb-4",
                  tvMode ? "text-2xl" : "text-xl"
                )}
              >
                {formatDayLabel(selectedDay)}
              </h3>

              {/* Per-person daily metrics table */}
              {groupedDayMetrics.map(({ group, items }) => (
                <div key={group} className="mb-6">
                  <div className="flex items-center gap-2 mb-3">
                    <span
                      className={cn(
                        "text-xs font-semibold px-3 py-1 rounded-full border",
                        TEAM_GROUP_BADGE_COLORS[group]
                      )}
                    >
                      {group}
                    </span>
                    <div className="flex-1 h-px bg-border" />
                  </div>

                  <div className="bg-card rounded-2xl border border-border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/30">
                          <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                            Colaborador
                          </th>
                          <th className="text-center px-4 py-3 font-medium text-muted-foreground">
                            <div className="flex items-center justify-center gap-1">
                              <Phone className="w-3.5 h-3.5" /> Ligações
                            </div>
                          </th>
                          <th className="text-center px-4 py-3 font-medium text-muted-foreground">
                            Atend.
                          </th>
                          <th className="text-center px-4 py-3 font-medium text-muted-foreground">
                            Canc.
                          </th>
                          <th className="text-center px-4 py-3 font-medium text-muted-foreground">
                            Duração
                          </th>
                          <th className="text-center px-4 py-3 font-medium text-muted-foreground">
                            <div
                              className="flex items-center justify-center gap-1"
                              title="Tempo médio entre cada ligação, desconsiderando o tempo em que estava em ligação"
                            >
                              <Timer className="w-3.5 h-3.5" /> TMO
                            </div>
                          </th>
                          <th className="text-center px-4 py-3 font-medium text-muted-foreground">
                            <div
                              className="flex items-center justify-center gap-1"
                              title="Tempo total em que a pessoa não estava ligando"
                            >
                              <Clock className="w-3.5 h-3.5" /> S/L
                            </div>
                          </th>
                          <th className="text-center px-4 py-3 font-medium text-muted-foreground">
                            Primeira
                          </th>
                          <th className="text-center px-4 py-3 font-medium text-muted-foreground">
                            Última
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((m, idx) => (
                          <tr
                            key={m.name}
                            className={cn(
                              "border-b border-border/50 last:border-b-0",
                              idx % 2 === 0 ? "" : "bg-muted/10"
                            )}
                          >
                            <td className="px-4 py-3 font-medium">{m.name}</td>
                            <td className="px-4 py-3 text-center">
                              <span className="font-semibold text-blue-500">
                                {m.totalCalls}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className="font-semibold text-green-500">
                                {m.answeredCalls}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className="font-semibold text-red-500">
                                {m.canceledCalls}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className="font-semibold">
                                {formatTime(m.totalDurationSeconds)}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span
                                className={cn(
                                  "font-semibold",
                                  tmoColor(m.tmoSeconds)
                                )}
                              >
                                {formatTime(m.tmoSeconds)}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span
                                className={cn(
                                  "font-semibold",
                                  slColor(m.slSeconds)
                                )}
                              >
                                {formatTime(m.slSeconds)}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center text-xs text-muted-foreground">
                              {m.firstCallTime}
                            </td>
                            <td className="px-4 py-3 text-center text-xs text-muted-foreground">
                              {m.lastCallTime}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}

              {/* Call log for the day */}
              <div className="mt-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-3 h-3 rounded-full bg-blue-500" />
                  <h3
                    className={cn(
                      "font-semibold text-foreground",
                      tvMode ? "text-xl" : "text-lg"
                    )}
                  >
                    Log de Chamadas ({currentDayCalls.length})
                  </h3>
                </div>

                <div className="space-y-1">
                  {currentDayCalls.map((call, i) => (
                    <div
                      key={i}
                      className={cn(
                        "flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm",
                        call.answered
                          ? "bg-green-500/5 border border-green-500/20"
                          : "bg-red-500/5 border border-red-500/20"
                      )}
                    >
                      <div className="shrink-0">
                        {call.answered ? (
                          <PhoneIncoming className="w-4 h-4 text-green-500" />
                        ) : (
                          <PhoneOff className="w-4 h-4 text-red-500" />
                        )}
                      </div>
                      <span className="font-medium w-32 truncate shrink-0">
                        {call.name}
                      </span>
                      <span className="text-xs text-muted-foreground w-28 shrink-0 tabular-nums">
                        {call.phone}
                      </span>
                      <span className="text-xs tabular-nums w-14 shrink-0 text-center">
                        {call.timeHHMM}
                      </span>
                      <span className="text-xs w-16 shrink-0 text-center font-medium">
                        {formatDuration(call.durationSeconds)}
                      </span>
                      <span
                        className={cn(
                          "text-xs w-24 shrink-0 text-center",
                          call.answered ? "text-green-600" : "text-red-500"
                        )}
                      >
                        {call.status}
                      </span>
                      <span className="text-xs text-muted-foreground truncate flex-1">
                        {call.contactInfo}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
