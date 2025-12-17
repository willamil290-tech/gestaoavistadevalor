import { User, Trash2, Check, X, Sun, Moon } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";

export interface TeamMember {
  id: string;
  name: string;
  total: number;
  morning: number;
  afternoon: number;
}

type Scale = "lg" | "md" | "sm";

interface TeamMemberCardProps {
  member: TeamMember;
  onUpdate: (member: TeamMember) => void;
  onDelete: (id: string) => void;
  scale?: Scale;
  readOnly?: boolean;
}

export const TeamMemberCard = ({ member, onUpdate, onDelete, scale = "md", readOnly = false }: TeamMemberCardProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editMorning, setEditMorning] = useState(member.morning);
  const [editAfternoon, setEditAfternoon] = useState(member.afternoon);

  const size = useMemo(() => {
    if (scale === "lg") return { name: "text-lg md:text-xl", total: "text-4xl md:text-5xl", num: "text-2xl md:text-3xl" };
    if (scale === "sm") return { name: "text-base md:text-lg", total: "text-3xl md:text-4xl", num: "text-xl md:text-2xl" };
    return { name: "text-lg md:text-xl", total: "text-4xl md:text-5xl", num: "text-2xl md:text-3xl" };
  }, [scale]);

  const startEdit = () => {
    if (readOnly) return;
    setEditMorning(member.morning);
    setEditAfternoon(member.afternoon);
    setIsEditing(true);
  };

  const handleSave = () => {
    const morning = Number.isFinite(editMorning) ? Math.max(0, Math.trunc(editMorning)) : 0;
    const afternoon = Number.isFinite(editAfternoon) ? Math.max(0, Math.trunc(editAfternoon)) : 0;
    onUpdate({ ...member, morning, afternoon, total: morning + afternoon });
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditMorning(member.morning);
    setEditAfternoon(member.afternoon);
    setIsEditing(false);
  };

  return (
    <div className={cn("bg-card rounded-2xl p-4 md:p-5 border border-border shadow-sm", readOnly ? "" : "hover:shadow-md transition-shadow")}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-10 h-10 rounded-2xl bg-muted flex items-center justify-center shrink-0">
            <User className="w-5 h-5 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <div className={cn("font-semibold text-foreground truncate", size.name)} title={member.name}>
              {member.name}
            </div>
            <div className="text-xs md:text-sm text-muted-foreground">Total</div>
          </div>
        </div>

        {!readOnly && (
          <div className="flex items-center gap-2">
            {isEditing ? (
              <>
                <button
                  onClick={handleSave}
                  className="p-2 rounded-xl bg-secondary text-secondary-foreground hover:bg-secondary/90 transition-colors"
                  title="Salvar"
                  type="button"
                >
                  <Check className="w-4 h-4" />
                </button>
                <button
                  onClick={handleCancel}
                  className="p-2 rounded-xl bg-muted hover:bg-muted/80 transition-colors"
                  title="Cancelar"
                  type="button"
                >
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              </>
            ) : (
              <button
                onClick={() => onDelete(member.id)}
                className="p-2 rounded-xl bg-muted hover:bg-muted/80 transition-colors"
                title="Excluir"
                type="button"
              >
                <Trash2 className="w-4 h-4 text-muted-foreground" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Total */}
      <div className="mt-3">
        <div
          className={cn(
            "font-extrabold tracking-tight text-foreground",
            size.total,
            !readOnly ? "cursor-pointer hover:text-secondary transition-colors" : ""
          )}
          onClick={startEdit}
          title={!readOnly ? "Clique para editar" : undefined}
        >
          {member.total}
        </div>
      </div>

      {/* Morning/Afternoon */}
      <div className="mt-4 grid grid-cols-2 gap-4">
        <div className="bg-muted/60 rounded-2xl p-3 md:p-4 border border-border/60">
          <div className="flex items-center gap-2 text-xs md:text-sm text-muted-foreground mb-1">
            <Sun className="w-4 h-4 text-yellow-400" />
            <span>Manhã</span>
          </div>
          {isEditing ? (
            <input
              type="number"
              value={editMorning}
              onChange={(e) => setEditMorning(Number(e.target.value))}
              className={cn("w-full text-right font-semibold text-foreground bg-muted border border-border rounded-xl px-3 py-2", size.num)}
            />
          ) : (
            <div
              className={cn(
                "text-right font-semibold text-foreground",
                size.num,
                !readOnly ? "cursor-pointer hover:text-secondary transition-colors" : ""
              )}
              onClick={startEdit}
            >
              {member.morning}
            </div>
          )}
        </div>

        <div className="bg-muted/60 rounded-2xl p-3 md:p-4 border border-border/60">
          <div className="flex items-center gap-2 text-xs md:text-sm text-muted-foreground mb-1">
            <Moon className="w-4 h-4 text-purple-400" />
            <span>Tarde</span>
          </div>
          {isEditing ? (
            <input
              type="number"
              value={editAfternoon}
              onChange={(e) => setEditAfternoon(Number(e.target.value))}
              className={cn("w-full text-right font-semibold text-foreground bg-muted border border-border rounded-xl px-3 py-2", size.num)}
            />
          ) : (
            <div
              className={cn(
                "text-right font-semibold text-foreground",
                size.num,
                !readOnly ? "cursor-pointer hover:text-secondary transition-colors" : ""
              )}
              onClick={startEdit}
            >
              {member.afternoon}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
