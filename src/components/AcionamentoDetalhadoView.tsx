import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, Pencil, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { isIgnoredCommercial } from "@/lib/ignoredCommercials";

export interface AcionamentoCategoria {
  tipo: string;
  quantidade: number;
}

export interface ColaboradorAcionamento {
  id: string;
  name: string;
  total: number;
  categorias: AcionamentoCategoria[];
}

interface AcionamentoDetalhadoViewProps {
  colaboradores: ColaboradorAcionamento[];
  onUpdate: (colaborador: ColaboradorAcionamento) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
  readOnly?: boolean;
  tvMode?: boolean;
}

export const defaultCategorias = ["ETAPA_ALTERADA", "ATIVIDADE_CRIADA", "STATUS_ATIVIDADE_ALTERADA", "CHAMADA_TELEFONICA", "OUTROS"];

export const AcionamentoDetalhadoView = ({
  colaboradores,
  onUpdate,
  onAdd,
  onDelete,
  readOnly = false,
  tvMode = false,
}: AcionamentoDetalhadoViewProps) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<ColaboradorAcionamento | null>(null);

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
      "STATUS_ATIVIDADE_ALTERADA": "Status Alterada",
      "CHAMADA_TELEFONICA": "Chamada Telefônica",
      "OUTROS": "Outros",
    };
    return labels[tipo] || tipo;
  };

  const sortedColaboradores = [...colaboradores]
    .filter((c) => !isIgnoredCommercial(c.name))
    .sort((a, b) => b.total - a.total);

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

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
        {sortedColaboradores.map((c) => {
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
                    <p className={cn("font-bold text-secondary", tvMode ? "text-4xl" : "text-3xl")}>{c.total}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {c.categorias.map((cat) => (
                      <div key={cat.tipo} className="p-2 bg-muted/30 rounded-lg text-center">
                        <p className="text-xs text-muted-foreground truncate">{formatCategoryLabel(cat.tipo)}</p>
                        <p className={cn("font-semibold", tvMode ? "text-xl" : "text-lg")}>{cat.quantidade}</p>
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
  );
};
