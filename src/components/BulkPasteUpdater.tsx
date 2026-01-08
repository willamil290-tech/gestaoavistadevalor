import { useState } from "react";

type Props = {
  title: string;
  subtitle?: string;
  onApply: (text: string) => Promise<void> | void;
};

export function BulkPasteUpdater({ title, subtitle, onApply }: Props) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const handleApply = async () => {
    if (!text.trim()) return;
    try {
      setBusy(true);
      await onApply(text);
      setText("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 mb-5">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h3 className="text-base md:text-lg font-semibold text-foreground">{title}</h3>
          {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setText("")}
            className="px-3 py-2 rounded-lg border border-border text-sm hover:bg-muted transition-colors"
            disabled={!text || busy}
          >
            Limpar
          </button>
          <button
            onClick={handleApply}
            className="px-3 py-2 rounded-lg bg-secondary text-secondary-foreground text-sm hover:bg-secondary/80 transition-colors disabled:opacity-50"
            disabled={!text.trim() || busy}
          >
            {busy ? "Aplicando..." : "Aplicar"}
          </button>
        </div>
      </div>

      <div className="mt-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Cole aqui o texto para atualizar..."
          className="min-h-[100px] w-full rounded-lg bg-muted/30 border border-border p-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-secondary resize-y"
        />
      </div>
    </div>
  );
}
