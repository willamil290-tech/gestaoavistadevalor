import { useState } from "react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pencil, Check, X, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Commercial {
  id: string;
  name: string;
  currentValue: number;
  goal: number;
}

interface CommercialProgressViewProps {
  commercials: Commercial[];
  onUpdate: (commercial: Commercial) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
  readOnly?: boolean;
  tvMode?: boolean;
}

export const CommercialProgressView = ({
  commercials,
  onUpdate,
  onAdd,
  onDelete,
  readOnly = false,
  tvMode = false,
}: CommercialProgressViewProps) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{ name: string; currentValue: number; goal: number }>({
    name: "",
    currentValue: 0,
    goal: 0,
  });

  const startEdit = (c: Commercial) => {
    setEditingId(c.id);
    setEditValues({ name: c.name, currentValue: c.currentValue, goal: c.goal });
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const saveEdit = (c: Commercial) => {
    onUpdate({ ...c, ...editValues });
    setEditingId(null);
  };

  const fmtBRL = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  return (
    <div className="bg-card rounded-2xl p-4 md:p-6 border border-border">
      <div className="flex items-center justify-between mb-4">
        <h3 className={cn("font-semibold", tvMode ? "text-xl" : "text-lg md:text-xl")}>
          Progresso por Comercial
        </h3>
        {!readOnly && (
          <Button size="sm" onClick={onAdd} className="rounded-xl">
            <Plus className="w-4 h-4 mr-1" />
            Adicionar
          </Button>
        )}
      </div>

      <div className="space-y-4">
        {commercials.map((c) => {
          const percentage = c.goal > 0 ? Math.min((c.currentValue / c.goal) * 100, 100) : 0;
          const isGoalReached = c.currentValue >= c.goal;
          const isEditing = editingId === c.id;

          return (
            <div
              key={c.id}
              className={cn(
                "p-3 rounded-xl border transition-colors",
                isGoalReached ? "bg-green-500/10 border-green-500/30" : "bg-muted/30 border-border"
              )}
            >
              {isEditing ? (
                <div className="space-y-3">
                  <Input
                    value={editValues.name}
                    onChange={(e) => setEditValues((v) => ({ ...v, name: e.target.value }))}
                    placeholder="Nome"
                    className="font-medium"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-muted-foreground">Valor atual</label>
                      <Input
                        type="number"
                        value={editValues.currentValue}
                        onChange={(e) =>
                          setEditValues((v) => ({ ...v, currentValue: Number(e.target.value) }))
                        }
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Meta</label>
                      <Input
                        type="number"
                        value={editValues.goal}
                        onChange={(e) => setEditValues((v) => ({ ...v, goal: Number(e.target.value) }))}
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="ghost" onClick={cancelEdit}>
                      <X className="w-4 h-4" />
                    </Button>
                    <Button size="sm" onClick={() => saveEdit(c)}>
                      <Check className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <span className={cn("font-medium", tvMode ? "text-lg" : "text-base")}>
                      {c.name}
                    </span>
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "font-bold",
                          tvMode ? "text-xl" : "text-lg",
                          isGoalReached ? "text-green-500" : "text-foreground"
                        )}
                      >
                        {percentage.toFixed(0)}%
                      </span>
                      {!readOnly && (
                        <>
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
                        </>
                      )}
                    </div>
                  </div>

                  <Progress
                    value={percentage}
                    className={cn("h-3", isGoalReached ? "[&>div]:bg-green-500" : "[&>div]:bg-primary")}
                  />

                  <div className="flex justify-between mt-2 text-sm text-muted-foreground">
                    <span>Atual: {fmtBRL(c.currentValue)}</span>
                    <span>Meta: {fmtBRL(c.goal)}</span>
                  </div>
                </>
              )}
            </div>
          );
        })}

        {commercials.length === 0 && (
          <p className="text-center text-muted-foreground py-4">Nenhum comercial cadastrado</p>
        )}
      </div>
    </div>
  );
};
