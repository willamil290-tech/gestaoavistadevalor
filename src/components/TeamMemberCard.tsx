import { User, Trash2, Check, X, Crown } from "lucide-react";
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
  rank?: number; // 1-based rank in the sorted list
  scale?: Scale;
  readOnly?: boolean;
}

export const TeamMemberCard = ({
  member,
  onUpdate,
  onDelete,
  rank,
  scale = "md",
  readOnly = false,
}: TeamMemberCardProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(member.name);
  const [editMorning, setEditMorning] = useState(member.morning);
  const [editAfternoon, setEditAfternoon] = useState(member.afternoon);

  const isTop = typeof rank === "number" && rank >= 1 && rank <= 3;

  const size = useMemo(() => {
    if (scale === "lg") {
      return {
        name: "text-2xl md:text-3xl",
        num: "text-2xl md:text-3xl",
        total: "text-4xl md:text-5xl",
        pad: "p-5 md:p-6",
      };
    }
    if (scale === "sm") {
      return {
        name: "text-lg md:text-xl",
        num: "text-xl md:text-2xl",
        total: "text-3xl md:text-4xl",
        pad: "p-4 md:p-5",
      };
    }
    return {
      name: "text-xl md:text-2xl",
      num: "text-2xl md:text-3xl",
      total: "text-4xl md:text-5xl",
      pad: "p-4 md:p-5",
    };
  }, [scale]);

  const handleSave = () => {
    onUpdate({
      id: member.id,
      name: editName.trim() || member.name,
      morning: editMorning,
      afternoon: editAfternoon,
      total: editMorning + editAfternoon,
    });
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditName(member.name);
    setEditMorning(member.morning);
    setEditAfternoon(member.afternoon);
    setIsEditing(false);
  };

  const cardClasses = cn(
    "relative bg-card rounded-2xl border transition-all duration-300",
    size.pad,
    isTop ? "border-gold/70 shadow-[0_0_0_1px_rgba(212,175,55,0.35)]" : "border-border hover:border-secondary/50");

  return (
    <div className={cardClasses}>
      {/* Top badge / delta */}
      <div className="absolute right-3 top-3 flex items-center gap-2">
        {isTop && (
          <div className="flex items-center gap-1 rounded-full bg-gold/20 px-2 py-1 text-xs font-semibold text-gold">
            <Crown className="h-3.5 w-3.5" />
            TOP {rank}
          </div>
        )}
        {!readOnly && (
          <button
            onClick={() => onDelete(member.id)}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
            title="Excluir"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Header */}
      <div className="flex items-center gap-3 pr-10">
        <div className={cn("shrink-0 rounded-full flex items-center justify-center", isTop ? "bg-gold/20" : "bg-gold/15", "w-12 h-12")}>
          <User className={cn("w-6 h-6", isTop ? "text-gold" : "text-gold")} />
        </div>

        {isEditing ? (
          <input
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            className={cn(
              "font-semibold text-foreground bg-muted border border-border rounded-xl px-3 py-2 w-full",
              size.name
            )}
            autoFocus
          />
        ) : (
          <div
            className={cn(
              "font-semibold text-foreground leading-tight w-full",
              size.name,
              !readOnly ? "cursor-pointer hover:text-secondary transition-colors" : ""
            )}
            onClick={() => !readOnly && setIsEditing(true)}
            title={!readOnly ? "Clique para editar" : undefined}
          >
            {member.name}
          </div>
        )}
      </div>

      {/* Total */}
      <div className="mt-4 flex items-end justify-between gap-4">
        <div>
          <div className="text-sm md:text-base text-muted-foreground">Total</div>
          <div className={cn("font-extrabold tracking-tight text-foreground", size.total)}>{member.total}</div>
        </div>

        {/* Edit controls */}
        {!readOnly && (
          <div className="flex items-center gap-2">
            {isEditing ? (
              <>
                <button onClick={handleSave} className="p-2 rounded-xl text-green-500 hover:bg-green-500/15 transition-all" title="Salvar">
                  <Check className="w-5 h-5" />
                </button>
                <button onClick={handleCancel} className="p-2 rounded-xl text-red-500 hover:bg-red-500/15 transition-all" title="Cancelar">
                  <X className="w-5 h-5" />
                </button>
              </>
            ) : null}
          </div>
        )}
      </div>

      {/* Morning/Afternoon */}
      <div className="mt-4 grid grid-cols-2 gap-4">
        <div className="bg-muted/60 rounded-2xl p-3 md:p-4 border border-border/60">
          <div className="text-xs md:text-sm text-muted-foreground mb-1">Manhã</div>
          {isEditing ? (
            <input
              type="number"
              value={editMorning}
              onChange={(e) => setEditMorning(Number(e.target.value))}
              className={cn(
                "w-full text-right font-semibold text-foreground bg-muted border border-border rounded-xl px-3 py-2",
                size.num
              )}
            />
          ) : (
            <div
              className={cn(
                "text-right font-semibold text-foreground",
                size.num,
                !readOnly ? "cursor-pointer hover:text-secondary transition-colors" : ""
              )}
              onClick={() => !readOnly && setIsEditing(true)}
            >
              {member.morning}
            </div>
          )}
        </div>

        <div className="bg-muted/60 rounded-2xl p-3 md:p-4 border border-border/60">
          <div className="text-xs md:text-sm text-muted-foreground mb-1">Tarde</div>
          {isEditing ? (
            <input
              type="number"
              value={editAfternoon}
              onChange={(e) => setEditAfternoon(Number(e.target.value))}
              className={cn(
                "w-full text-right font-semibold text-foreground bg-muted border border-border rounded-xl px-3 py-2",
                size.num
              )}
            />
          ) : (
            <div
              className={cn(
                "text-right font-semibold text-foreground",
                size.num,
                !readOnly ? "cursor-pointer hover:text-secondary transition-colors" : ""
              )}
              onClick={() => !readOnly && setIsEditing(true)}
            >
              {member.afternoon}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
