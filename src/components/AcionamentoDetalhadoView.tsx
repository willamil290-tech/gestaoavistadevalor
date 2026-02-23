import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Plus, Trash2, Pencil, Check, X, Phone, Activity, Clock, Timer, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { isIgnoredCommercial } from "@/lib/ignoredCommercials";
import { groupByTeam, TEAM_GROUP_BADGE_COLORS } from "@/lib/teamGroups";
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
}

export const defaultCategorias = ["ETAPA_ALTERADA", "ATIVIDADE_CRIADA", "STATUS_ATIVIDADE_ALTERADA", "CHAMADA_TELEFONICA", "OUTROS"];

export const AcionamentoDetalhadoView = ({
  colaboradores,
  onUpdate,
  onAdd,
  onDelete,
  readOnly = false,
  tvMode = false,
  personEventDetails = [],
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
    const norm = name.toLowerCase().trim();
    const detail = personEventDetails.find(
      (d) => d.comercial.toLowerCase().trim() === norm || d.comercial.toLowerCase().split(" ")[0] === norm.split(" ")[0]
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

  return (
    <div className="animate-fade-in-up">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-secondary" />
          <h2 className={cn("font-semibold text-foreground", tvMode ? "text-3xl" : "text-2xl md:text-3xl")}>
            Acionamento Detalhado
          </h2>
        </div>

        {!readOnly && (
          <Button onClick={onAdd} className="bg-secondary hover:bg-secondary/90 text-secondary-foreground rounded-xl">
            <Plus className="w-5 h-5 mr-2" />
            <span className="hidden md:inline">Adicionar</span>
          </Button>
        )}
      </div>

      {/* Summary metrics bar */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-card rounded-xl p-3 border border-border text-center">
          <div className="flex items-center justify-center gap-1.5 mb-1">
            <Phone className="w-3.5 h-3.5 text-blue-500" />
            <span className="text-xs text-muted-foreground">Total Ligações</span>
          </div>
          <p className={cn("font-bold text-blue-500", tvMode ? "text-2xl" : "text-xl")}>{summary.ligacoes}</p>
        </div>
        <div className="bg-card rounded-xl p-3 border border-border text-center">
          <div className="flex items-center justify-center gap-1.5 mb-1">
            <Activity className="w-3.5 h-3.5 text-secondary" />
            <span className="text-xs text-muted-foreground">Total Atividades</span>
          </div>
          <p className={cn("font-bold text-secondary", tvMode ? "text-2xl" : "text-xl")}>{summary.atividades}</p>
        </div>
      </div>

      {/* Grouped cards — acionamento detalhado per person */}
      {grouped.map(({ group, items }) => (
        <div key={group} className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <span className={cn("text-xs font-semibold px-3 py-1 rounded-full border", TEAM_GROUP_BADGE_COLORS[group])}>
              {group}
            </span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
        {items.map((c) => {
          const isEditing = editingId === c.id;

          return (
            <div
              key={c.id}
              className="bg-card rounded-2xl p-4 border border-border hover:border-secondary/50 transition-colors"
            >
              {isEditing && editValues ? (
                <div className="space-y-3">
                  <Input
                    value={editValues.name}
                    onChange={(e) => setEditValues({ ...editValues, name: e.target.value })}
                    placeholder="Nome do colaborador"
                    className="font-semibold"
                  />

                  <div className="space-y-2">
                    {editValues.categorias.map((cat) => (
                      <div key={cat.tipo} className="flex items-center justify-between gap-2">
                        <span className="text-sm text-muted-foreground">{formatCategoryLabel(cat.tipo)}</span>
                        <Input
                          type="number"
                          value={cat.quantidade}
                          onChange={(e) => updateCategoria(cat.tipo, Number(e.target.value))}
                          className="w-20 text-center"
                        />
                      </div>
                    ))}
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <Button size="sm" variant="ghost" onClick={cancelEdit}>
                      <X className="w-4 h-4" />
                    </Button>
                    <Button size="sm" onClick={saveEdit}>
                      <Check className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-3">
                    <span className={cn("font-semibold", tvMode ? "text-xl" : "text-lg")}>{c.name}</span>
                    {!readOnly && (
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(c)}>
                          <Pencil className="w-3 h-3" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive"
                          onClick={() => onDelete(c.id)}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    )}
                  </div>

                  <div className="text-center mb-3">
                    <p className="text-xs text-muted-foreground">Total</p>
                    <div className="flex justify-center">
                      <ClickableNumber value={c.total} name={c.name} tvMode={tvMode} className={cn("!text-3xl text-secondary", tvMode && "!text-4xl")} />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {c.categorias.map((cat) => (
                      <div key={cat.tipo} className="p-2 bg-muted/30 rounded-lg text-center">
                        <p className="text-xs text-muted-foreground truncate">{formatCategoryLabel(cat.tipo)}</p>
                        <ClickableNumber value={cat.quantidade} name={c.name} category={cat.tipo} tvMode={tvMode} />
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          );
        })}

        {colaboradores.length === 0 && (
          <div className="col-span-full text-center text-muted-foreground py-8">
            Nenhum colaborador cadastrado
          </div>
        )}
          </div>
        </div>
      ))}

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
                    <div className="flex items-center justify-center gap-1">
                      <Timer className="w-3.5 h-3.5" /> TMO
                    </div>
                  </th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground">
                    <div className="flex items-center justify-center gap-1">
                      <Clock className="w-3.5 h-3.5" /> Tempo Ocioso
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
