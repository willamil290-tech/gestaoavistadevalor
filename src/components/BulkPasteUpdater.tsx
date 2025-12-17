import { useMemo, useState } from "react";
import { parseBulkTeamText, type BulkEntry } from "@/lib/bulkParse";

type Props = {
  title: string;
  subtitle?: string;
  onApply: (entries: BulkEntry[]) => Promise<void> | void;
};

export function BulkPasteUpdater({ title, subtitle, onApply }: Props) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const entries = useMemo(() => parseBulkTeamText(text), [text]);

  const handleApply = async () => {
    const data = parseBulkTeamText(text);
    if (!data.length) return;
    try {
      setBusy(true);
      await onApply(data);
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
            disabled={!entries.length || busy}
          >
            {busy ? "Aplicando..." : "Aplicar"}
          </button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={`Cole aqui o texto no padrão:\n\nAlessandra Youssef\n\nManhã: 0 empresas únicas\n\nTarde: 2 empresas únicas\n\nLuciane Mariani\n\nManhã: 0 empresas únicas\n\nTarde: 1 empresa única`}
          className="min-h-[140px] w-full rounded-lg bg-muted/30 border border-border p-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-secondary"
        />

        <div className="rounded-lg border border-border bg-muted/20 p-3">
          <div className="text-sm font-medium text-foreground mb-2">Prévia ({entries.length})</div>
          {entries.length ? (
            <div className="space-y-2 max-h-[160px] overflow-auto pr-1">
              {entries.map((e) => (
                <div key={e.name} className="flex items-center justify-between gap-3 text-sm">
                  <div className="truncate text-foreground">{e.name}</div>
                  <div className="shrink-0 text-muted-foreground">
                    Manhã: <span className="text-foreground font-semibold">{e.morning}</span> · Tarde:{" "}
                    <span className="text-foreground font-semibold">{e.afternoon}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              Cole o texto ao lado para ver a prévia e aplicar.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
