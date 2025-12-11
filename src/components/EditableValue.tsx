import { useState } from "react";
import { Pencil, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface EditableValueProps {
  value: number;
  onChange: (value: number) => void;
  label: string;
  size?: "sm" | "lg";
  className?: string;
}

export const EditableValue = ({
  value,
  onChange,
  label,
  size = "lg",
  className,
}: EditableValueProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [tempValue, setTempValue] = useState(value.toString());

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(val);
  };

  const handleSave = () => {
    const parsed = parseFloat(tempValue.replace(/[^\d,.-]/g, "").replace(",", "."));
    if (!isNaN(parsed)) {
      onChange(parsed);
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setTempValue(value.toString());
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSave();
    if (e.key === "Escape") handleCancel();
  };

  const sizeClasses = {
    sm: "text-lg md:text-xl",
    lg: "text-2xl md:text-4xl lg:text-5xl",
  };

  return (
    <div className={cn("flex flex-col items-center gap-1", className)}>
      <span className="text-xs md:text-sm font-medium text-muted-foreground uppercase tracking-wider">
        {label}
      </span>
      <div className="flex items-center gap-2">
        {isEditing ? (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={tempValue}
              onChange={(e) => setTempValue(e.target.value)}
              onKeyDown={handleKeyDown}
              className={cn(
                "bg-muted border border-border rounded-md px-3 py-2 text-foreground font-bold focus:outline-none focus:ring-2 focus:ring-primary",
                sizeClasses[size]
              )}
              autoFocus
            />
            <button
              onClick={handleSave}
              className="p-2 rounded-full bg-green-600 hover:bg-green-700 transition-colors"
            >
              <Check className="w-4 h-4 text-foreground" />
            </button>
            <button
              onClick={handleCancel}
              className="p-2 rounded-full bg-destructive hover:bg-destructive/80 transition-colors"
            >
              <X className="w-4 h-4 text-foreground" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3 group cursor-pointer" onClick={() => setIsEditing(true)}>
            <span className={cn("font-bold text-foreground", sizeClasses[size])}>
              {formatCurrency(value)}
            </span>
            <button className="p-2 rounded-full bg-muted opacity-0 group-hover:opacity-100 transition-all hover:bg-muted/80">
              <Pencil className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
