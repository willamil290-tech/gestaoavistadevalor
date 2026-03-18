import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Plus, Trash2, Pencil, Check, X, Phone, Activity, Clock, Timer, Search, CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { isIgnoredCommercial } from "@/lib/ignoredCommercials";
import { canonicalizeCollaboratorName, collaboratorNameKey } from "@/lib/collaboratorNames";
import { getTeamGroup, groupByTeam, TEAM_GROUP_BADGE_COLORS, type TeamGroup } from "@/lib/teamGroups";
import { loadJson, saveJson } from "@/lib/localStore";
import { getBusinessDate, getYesterdayBusinessDate } from "@/lib/businessDate";
import type { PersonEventDetail } from "@/lib/bitrixLogs";

export interface AcionamentoCategoria {
  tipo: string;
  quantidade: number;
}

export interface ColaboradorAcionamento {
  id: string;
  name: string;
  total: number;
  categorias: AcionamentoCategoria[];
  ligacoes?: number;
  totalAtividades?: number;
  tmoSegundos?: number | null;
  tempoOciosoTotal?: number | null;
}

interface AcionamentoDetalhadoViewProps {
  colaboradores: ColaboradorAcionamento[];
  onUpdate: (colaborador: ColaboradorAcionamento) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
  readOnly?: boolean;
  tvMode?: boolean;
  personEventDetails?: PersonEventDetail[];
  saveDate?: string;
  onSaveDateChange?: (date: string) => void;
}

export const defaultCategorias = ["ETAPA_ALTERADA", "ATIVIDADE_CRIADA", "STATUS_ATIVIDADE_ALTERADA", "CHAMADA_TELEFONICA", "OUTROS"];

function pad2(n: number) { return String(n).padStart(2, "0"); }

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const TEAM_HEADER_COLORS: Record<TeamGroup, string> = {
  "SDRs": "bg-blue-600 text-white",
  "Closers": "bg-purple-600 text-white",
  "CS": "bg-green-600 text-white",
  "Grandes Contas": "bg-amber-600 text-white",
  "Executivos": "bg-slate-600 text-white",
};

type DetDayPerson = { name: string; total: number; categorias: { tipo: string; quantidade: number }[] };
type DetMonthData = Record<string, DetDayPerson[]>;

function normalizeDetDayData(dayData: DetDayPerson[]) {
  const map = new Map<string, DetDayPerson>();

  for (const person of dayData ?? []) {
    const name = canonicalizeCollaboratorName(person.name);
    const key = collaboratorNameKey(name);
    const current = map.get(key);

    if (!current) {
      map.set(key, {
        name,
        total: Number(person.total ?? 0),
        categorias: (person.categorias ?? []).map((cat) => ({
          tipo: cat.tipo,
          quantidade: Number(cat.quantidade ?? 0),
        })),
      });
      continue;
    }

    current.total += Number(person.total ?? 0);
    for (const cat of person.categorias ?? []) {
      const existingCategory = current.categorias.find((item) => item.tipo === cat.tipo);
      if (existingCategory) {
        existingCategory.quantidade += Number(cat.quantidade ?? 0);
      } else {
        current.categorias.push({ tipo: cat.tipo, quantidade: Number(cat.quantidade ?? 0) });
      }
    }
  }

  return Array.from(map.values());
}

function normalizeDetMonthData(data: DetMonthData) {
  const normalized: DetMonthData = {};

  for (const [date, dayData] of Object.entries(data ?? {})) {
    normalized[date] = normalizeDetDayData(dayData);
  }

  return normalized;
}

export const AcionamentoDetalhadoView = ({
  colaboradores,
  onUpdate,
  onAdd,
  onDelete,
  readOnly = false,
  tvMode = false,
  personEventDetails = [],
  saveDate: saveDateProp,
  onSaveDateChange,
}: AcionamentoDetalhadoViewProps) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<ColaboradorAcionamento | null>(null);

  // Drill-down dialog state
  const [detailDialog, setDetailDialog] = useState<{
    open: boolean;
    title: string;
    items: { empresa: string; tipo: string; hora: string }[];
  }>({ open: false, title: "", items: [] });

  const startEdit = (c: ColaboradorAcionamento) => {
    setEditingId(c.id);
    setEditValues({ ...c, categorias: c.categorias.map((cat) => ({ ...cat })) });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditValues(null);
  };

  const saveEdit = () => {
    if (editValues) {
      const total = editValues.categorias.reduce((sum, cat) => sum + cat.quantidade, 0);
      onUpdate({ ...editValues, total });
    }
    cancelEdit();
  };

  const updateCategoria = (tipo: string, quantidade: number) => {
    if (!editValues) return;
    setEditValues({
      ...editValues,
      categorias: editValues.categorias.map((cat) =>
        cat.tipo === tipo ? { ...cat, quantidade } : cat
      ),
    });
  };

  const formatCategoryLabel = (tipo: string) => {
    const labels: Record<string, string> = {
      "ETAPA_ALTERADA": "Etapa Alterada",
      "ATIVIDADE_CRIADA": "Atividade Criada",
      "STATUS_ATIVIDADE_ALTERADA": "Atividade Concluída",
      "CHAMADA_TELEFONICA": "Chamada Telefônica",
      "OUTROS": "Outros",
    };
    return labels[tipo] || tipo;
  };

  const sortedColaboradores = [...colaboradores]
    .map((c) => ({ ...c, name: canonicalizeCollaboratorName(c.name) }))
    .filter((c) => !isIgnoredCommercial(c.name))
    .sort((a, b) => b.total - a.total);

  const grouped = groupByTeam(sortedColaboradores);

  const formatTime = (seconds: number | null | undefined) => {
    if (seconds == null || !Number.isFinite(seconds)) return "—";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    if (mins >= 60) {
      const hrs = Math.floor(mins / 60);
      const remainMins = mins % 60;
      return `${hrs}h ${remainMins}min`;
    }
    return `${mins}min ${secs}s`;
  };

  // Summary metrics across all collaborators
  const summary = sortedColaboradores.reduce(
    (acc, c) => {
      acc.ligacoes += c.ligacoes ?? c.categorias.find((cat) => cat.tipo === "CHAMADA_TELEFONICA")?.quantidade ?? 0;
      acc.atividades += c.total;
      return acc;
    },
    { ligacoes: 0, atividades: 0 }
  );

  // Opens drill-down dialog with detailed events for a person + category
  const openDetail = (name: string, filterCategory?: string) => {
    const norm = collaboratorNameKey(name);
    const detail = personEventDetails.find(
      (d) => collaboratorNameKey(d.comercial) === norm
    );
    if (!detail) return;

    let items: { empresa: string; tipo: string; hora: string }[];
    if (filterCategory === "EMPRESA") {
      items = detail.uniqueEmpresas.map((e) => ({ empresa: e.empresa, tipo: "Negócio", hora: e.timeHHMM }));
    } else if (filterCategory === "LEAD") {
      items = detail.uniqueLeads.map((e) => ({ empresa: e.empresa, tipo: "Lead", hora: e.timeHHMM }));
    } else if (filterCategory) {
      items = detail.events
        .filter((e) => e.actionCategory === filterCategory)
        .map((e) => ({ empresa: e.empresa, tipo: e.entityType, hora: e.timeHHMM }));
    } else {
      items = detail.events.map((e) => ({ empresa: e.empresa, tipo: e.entityType, hora: e.timeHHMM }));
    }

    const labelSuffix = filterCategory ? ` — ${formatCategoryLabel(filterCategory)}` : " — Todos";
    setDetailDialog({ open: true, title: `${name}${labelSuffix}`, items });
  };

  // Clickable number (with Search icon on hover)
  const ClickableNumber = ({ value, name, category, className: cls, tvMode: tv }: {
    value: number;
    name: string;
    category?: string;
    className?: string;
    tvMode?: boolean;
  }) => {
    if (!personEventDetails.length || value === 0) {
      return <p className={cn("font-semibold", tv ? "text-xl" : "text-lg", cls)}>{value}</p>;
    }
    return (
      <button
        onClick={() => openDetail(name, category)}
        className={cn(
          "font-semibold group/num inline-flex items-center gap-0.5 hover:underline cursor-pointer",
          tv ? "text-xl" : "text-lg",
          cls,
        )}
      >
        {value}
        <Search className="w-3 h-3 opacity-0 group-hover/num:opacity-70 transition-opacity text-muted-foreground" />
      </button>
    );
  };

  // -- Monthly table state --
  const todayDate = new Date();
  const businessDate = getBusinessDate();
  const effectiveSaveDate = saveDateProp ?? businessDate;
  const [detYear, setDetYear] = useState(todayDate.getFullYear());
  const [detMonth, setDetMonth] = useState(todayDate.getMonth() + 1);
  const [detMonthData, setDetMonthData] = useState<DetMonthData>({});

  useEffect(() => {
    const key = `acionDet:${detYear}-${pad2(detMonth)}`;
    setDetMonthData(normalizeDetMonthData(loadJson<DetMonthData>(key, {})));
  }, [detYear, detMonth]);

  useEffect(() => {
    if (sortedColaboradores.length === 0) return;
    const hasNonZero = sortedColaboradores.some(c => c.total > 0);
    if (!hasNonZero) return;
    const [y, m] = effectiveSaveDate.split("-");
    const key = `acionDet:${y}-${m}`;
    const stored = loadJson<DetMonthData>(key, {});
    stored[effectiveSaveDate] = normalizeDetDayData(sortedColaboradores.map(c => ({
      name: canonicalizeCollaboratorName(c.name),
      total: c.total,
      categorias: c.categorias.map(cat => ({ tipo: cat.tipo, quantidade: cat.quantidade })),
    })));
    saveJson(key, stored);
    if (parseInt(y) === detYear && parseInt(m) === detMonth) {
      setDetMonthData(prev => ({ ...prev, [effectiveSaveDate]: stored[effectiveSaveDate] }));
    }
  }, [sortedColaboradores, effectiveSaveDate]);

  const prevDetMonth = () => {
    if (detMonth === 1) { setDetMonth(12); setDetYear(y => y - 1); }
    else setDetMonth(m => m - 1);
  };
  const nextDetMonth = () => {
    if (detMonth === 12) { setDetMonth(1); setDetYear(y => y + 1); }
    else setDetMonth(m => m + 1);
  };

  const detDaysWithData = useMemo(() => Object.keys(detMonthData).sort(), [detMonthData]);

  const detAllPeople = useMemo(() => {
    const nameSet = new Set<string>();
    for (const dayData of Object.values(detMonthData)) {
      for (const person of dayData) {
        if (!isIgnoredCommercial(person.name)) nameSet.add(person.name);
      }
    }
    const names = Array.from(nameSet);
    const groupOrder: TeamGroup[] = ["SDRs", "Closers", "CS", "Grandes Contas", "Executivos"];
    names.sort((a, b) => {
      const ga = groupOrder.indexOf(getTeamGroup(a));
      const gb = groupOrder.indexOf(getTeamGroup(b));
      if (ga !== gb) return ga - gb;
      return a.localeCompare(b);
    });
    return names;
  }, [detMonthData]);

  const detPeopleByTeam = useMemo(() => {
    const groups: { group: TeamGroup; names: string[] }[] = [];
    const groupOrder: TeamGroup[] = ["SDRs", "Closers", "CS", "Grandes Contas", "Executivos"];
    const map = new Map<TeamGroup, string[]>();
    for (const name of detAllPeople) {
      const g = getTeamGroup(name);
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(name);
    }
    for (const g of groupOrder) {
      if (map.has(g)) groups.push({ group: g, names: map.get(g)! });
    }
    return groups;
  }, [detAllPeople]);

  const detDataLookup = useMemo(() => {
    const lookup = new Map<string, Map<string, DetDayPerson>>();
    for (const [date, dayData] of Object.entries(detMonthData)) {
      const personMap = new Map<string, DetDayPerson>();
      for (const person of dayData) {
        if (!isIgnoredCommercial(person.name)) {
          personMap.set(person.name, person);
        }
      }
      lookup.set(date, personMap);
    }
    return lookup;
  }, [detMonthData]);

  const detDayTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const day of detDaysWithData) {
      const dayMap = detDataLookup.get(day);
      if (!dayMap) continue;
      let total = 0;
      for (const v of dayMap.values()) total += v.total;
      totals.set(day, total);
    }
    return totals;
  }, [detDaysWithData, detDataLookup]);

  const detPersonTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const dayData of Object.values(detMonthData)) {
      for (const person of dayData) {
        if (isIgnoredCommercial(person.name)) continue;
        totals.set(person.name, (totals.get(person.name) ?? 0) + person.total);
      }
    }
    return totals;
  }, [detMonthData]);

  const detFirstName = (name: string) => name.split(" ")[0];

  const [cellDetail, setCellDetail] = useState<{
    open: boolean;
    name: string;
    day: string;
    total: number;
    categorias: { tipo: string; quantidade: number }[];
    events: { empresa: string; tipo: string; hora: string; actionCategory: string }[];
  }>({ open: false, name: "", day: "", total: 0, categorias: [], events: [] });

  const openCellDetail = (name: string, day: string) => {
    const dayMap = detDataLookup.get(day);
    const data = dayMap?.get(name);
    if (!data) return;
    // Carregar eventos do localStorage
    const stored = loadJson<any[]>(`bitrixEvents:${day}`, []);
    const norm = collaboratorNameKey(name);
    const detail = stored?.find(
      (d: any) => collaboratorNameKey(d.comercial ?? "") === norm
    );
    const events = detail?.events?.map((e: any) => ({
      empresa: e.empresa,
      tipo: e.entityType,
      hora: e.timeHHMM,
      actionCategory: e.actionCategory ?? "",
    })) ?? [];
    setCellDetail({ open: true, name, day, total: data.total, categorias: data.categorias, events });
  };

  return (
    <div className="animate-fade-in-up">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-3 h-3 rounded-full bg-secondary" />
        <h2 className={cn("font-semibold text-foreground", tvMode ? "text-3xl" : "text-2xl md:text-3xl")}>
          Acionamento Detalhado
        </h2>
      </div>

      {/* Date picker for reference date */}
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-3 p-4 rounded-xl border border-border bg-card mb-4">
          <CalendarDays className="w-5 h-5 text-muted-foreground" />
          <label className="text-sm font-medium text-muted-foreground whitespace-nowrap">Data de referência:</label>
          <input
            type="date"
            value={effectiveSaveDate}
            onChange={(e) => onSaveDateChange?.(e.target.value)}
            className="bg-muted text-foreground text-sm rounded-lg px-3 py-2 border border-border focus:ring-2 focus:ring-secondary outline-none"
          />
          <div className="flex gap-1">
            <Button variant="outline" size="sm" onClick={() => onSaveDateChange?.(getYesterdayBusinessDate())}>
              Ontem
            </Button>
            <Button variant="outline" size="sm" onClick={() => onSaveDateChange?.(businessDate)}>
              Hoje
            </Button>
          </div>
          {effectiveSaveDate !== businessDate && (
            <span className="text-xs text-amber-500 font-medium">
              ⚠ Dados serão salvos para {effectiveSaveDate.split("-").reverse().join("/")}
            </span>
          )}
        </div>
      )}

      {/* Month picker */}
      <div className="flex items-center justify-center gap-4 mb-6">
        <Button variant="ghost" size="icon" onClick={prevDetMonth}><ChevronLeft className="w-5 h-5" /></Button>
        <div className="flex items-center gap-2">
          <CalendarDays className="w-5 h-5 text-muted-foreground" />
          <span className={cn("font-semibold", tvMode ? "text-xl" : "text-lg")}>
            {MONTH_NAMES[detMonth - 1]} {detYear}
          </span>
        </div>
        <Button variant="ghost" size="icon" onClick={nextDetMonth}><ChevronRight className="w-5 h-5" /></Button>
      </div>

      {/* Monthly table — acionamento detalhado per person */}
      {detDaysWithData.length === 0 ? (
        <div className="text-center text-muted-foreground py-16">
          <Activity className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p className="text-lg">Nenhum dado de acionamento detalhado para este mês.</p>
          <p className="text-sm mt-2">Cole dados do Bitrix ou atualize os acionamentos.</p>
        </div>
      ) : (
        <div className="bg-card rounded-2xl border border-border overflow-hidden mb-6">
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse min-w-[600px]">
              <thead>
                <tr>
                  <th rowSpan={2} className="text-center px-2 py-2 font-semibold text-muted-foreground bg-muted/40 border-b border-r border-border sticky left-0 z-10 bg-card min-w-[50px]">
                    Dia
                  </th>
                  {detPeopleByTeam.map(({ group, names }) => (
                    <th key={group} colSpan={names.length} className={cn("text-center px-2 py-1.5 font-semibold border-b border-r border-border/50 text-xs", TEAM_HEADER_COLORS[group])}>
                      {group}
                    </th>
                  ))}
                  <th rowSpan={2} className="text-center px-2 py-2 font-semibold text-muted-foreground bg-muted/40 border-b border-border min-w-[60px]">
                    Total
                  </th>
                </tr>
                <tr className="bg-muted/30">
                  {detAllPeople.map(name => (
                    <th key={name} className="text-center px-2 py-1.5 font-medium text-foreground border-b border-r border-border/50 whitespace-nowrap min-w-[55px]">
                      {detFirstName(name)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {detDaysWithData.map((day, rowIdx) => {
                  const [, , d] = day.split("-");
                  const dayMap = detDataLookup.get(day);
                  const dayTotal = detDayTotals.get(day) ?? 0;
                  return (
                    <tr key={day} className={cn("border-b border-border/30 hover:bg-muted/20 transition-colors", rowIdx % 2 === 0 ? "" : "bg-muted/5")}>
                      <td className="text-center px-2 py-2 font-semibold border-r border-border sticky left-0 z-10 bg-card">
                        {parseInt(d)}
                      </td>
                      {detAllPeople.map(name => {
                        const m = dayMap?.get(name);
                        if (!m) return (
                          <td key={name} className="text-center px-2 py-2 text-muted-foreground/30 border-r border-border/30">—</td>
                        );
                        return (
                          <td key={name} className="text-center border-r border-border/30 p-0">
                            <button
                              onClick={() => openCellDetail(name, day)}
                              className="w-full px-2 py-2 hover:bg-secondary/10 transition-colors cursor-pointer font-semibold text-secondary tabular-nums"
                              title={`${name} — Dia ${parseInt(d)}: ${m.total} acionamentos`}
                            >
                              {m.total}
                            </button>
                          </td>
                        );
                      })}
                      <td className="text-center px-2 py-2 font-bold text-foreground tabular-nums">{dayTotal}</td>
                    </tr>
                  );
                })}
                <tr className="bg-muted/30 font-semibold border-t-2 border-border">
                  <td className="text-center px-2 py-2 border-r border-border sticky left-0 z-10 bg-muted/30">Total</td>
                  {detAllPeople.map(name => {
                    const pt = detPersonTotals.get(name) ?? 0;
                    return (
                      <td key={name} className="text-center px-2 py-2 font-bold text-secondary tabular-nums border-r border-border/30">
                        {pt}
                      </td>
                    );
                  })}
                  <td className="text-center px-2 py-2 font-bold text-foreground tabular-nums">
                    {Array.from(detPersonTotals.values()).reduce((s, v) => s + v, 0)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Cell detail dialog */}
      <Dialog open={cellDetail.open} onOpenChange={(open) => setCellDetail(prev => ({ ...prev, open }))}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{cellDetail.name}</DialogTitle>
            <DialogDescription>
              {(() => {
                if (!cellDetail.day) return "";
                const [y, m, d] = cellDetail.day.split("-");
                return `${d}/${m}/${y} — ${cellDetail.total} acionamentos`;
              })()}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 mt-2">
            {cellDetail.categorias.map((cat) => (
              <div key={cat.tipo} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-muted/30 text-sm">
                <span className="font-medium">{formatCategoryLabel(cat.tipo)}</span>
                <span className="font-semibold text-secondary tabular-nums">{cat.quantidade}</span>
              </div>
            ))}
          </div>
          {cellDetail.events.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-semibold text-muted-foreground mb-2">Eventos ({cellDetail.events.length})</p>
              <div className="space-y-1 max-h-[300px] overflow-y-auto">
                {cellDetail.events.map((ev, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-muted/20 text-xs">
                    <span className="truncate flex-1 font-medium">{ev.empresa}</span>
                    <span className="text-muted-foreground shrink-0">{formatCategoryLabel(ev.actionCategory)}</span>
                    <span className="text-muted-foreground shrink-0 tabular-nums">{ev.hora}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {cellDetail.events.length === 0 && (
            <p className="text-xs text-muted-foreground mt-3">Sem logs de eventos salvos para este dia.</p>
          )}
        </DialogContent>
      </Dialog>

      {/* Separate TMO / Tempo Ocioso section — table format */}
      {sortedColaboradores.some((c) => c.tmoSegundos != null || c.tempoOciosoTotal != null) && (
        <div className="mt-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-3 h-3 rounded-full bg-blue-500" />
            <h3 className={cn("font-semibold text-foreground", tvMode ? "text-2xl" : "text-xl md:text-2xl")}>
              Métricas de Ligações
            </h3>
          </div>

          <div className="bg-card rounded-2xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Colaborador</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground">
                    <div className="flex items-center justify-center gap-1">
                      <Phone className="w-3.5 h-3.5" /> Ligações
                    </div>
                  </th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground">
                    <div className="flex items-center justify-center gap-1">
                      <Activity className="w-3.5 h-3.5" /> Atividades
                    </div>
                  </th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground">
                    <div className="flex items-center justify-center gap-1" title="Tempo médio entre cada ligação, desconsiderando o tempo em que estava em ligação">
                      <Timer className="w-3.5 h-3.5" /> TMO
                    </div>
                  </th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground">
                    <div className="flex items-center justify-center gap-1" title="Tempo total em que a pessoa não estava ligando">
                      <Clock className="w-3.5 h-3.5" /> S/L
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedColaboradores
                  .filter((c) => c.tmoSegundos != null || c.tempoOciosoTotal != null)
                  .map((c, idx) => {
                    const tmoMinutes = c.tmoSegundos != null ? c.tmoSegundos / 60 : null;
                    const ociosoMinutes = c.tempoOciosoTotal != null ? c.tempoOciosoTotal / 60 : null;
                    // Color code: green ≤ 5min, yellow ≤ 15min, red > 15min
                    const tmoColor = tmoMinutes == null ? "" : tmoMinutes <= 5 ? "text-green-500" : tmoMinutes <= 15 ? "text-amber-500" : "text-red-500";
                    // Ocioso: green ≤ 60min, yellow ≤ 120min, red > 120min
                    const ociosoColor = ociosoMinutes == null ? "" : ociosoMinutes <= 60 ? "text-green-500" : ociosoMinutes <= 120 ? "text-amber-500" : "text-red-500";

                    return (
                      <tr key={c.id} className={cn("border-b border-border/50 last:border-b-0", idx % 2 === 0 ? "" : "bg-muted/10")}>
                        <td className="px-4 py-3 font-medium">{c.name}</td>
                        <td className="px-4 py-3 text-center">
                          <span className="font-semibold text-blue-500">
                            {c.ligacoes ?? c.categorias.find((cat) => cat.tipo === "CHAMADA_TELEFONICA")?.quantidade ?? 0}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="font-semibold text-secondary">{c.totalAtividades ?? c.total}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={cn("font-semibold", tmoColor)}>{formatTime(c.tmoSegundos)}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={cn("font-semibold", ociosoColor)}>{formatTime(c.tempoOciosoTotal)}</span>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Drill-down dialog */}
      <Dialog open={detailDialog.open} onOpenChange={(open) => setDetailDialog((prev) => ({ ...prev, open }))}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{detailDialog.title}</DialogTitle>
            <DialogDescription>{detailDialog.items.length} registro(s) encontrado(s)</DialogDescription>
          </DialogHeader>
          <div className="space-y-1 mt-2">
            {detailDialog.items.length === 0 && (
              <p className="text-muted-foreground text-sm text-center py-4">Nenhum registro encontrado.</p>
            )}
            {detailDialog.items.map((item, i) => (
              <div key={i} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-muted/30 text-sm">
                <span className="truncate flex-1 font-medium">{item.empresa}</span>
                <span className="text-xs text-muted-foreground shrink-0">{item.tipo}</span>
                <span className="text-xs text-muted-foreground shrink-0 tabular-nums">{item.hora}</span>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
