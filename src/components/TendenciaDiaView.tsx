import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from "recharts";
import { ChartContainer } from "@/components/ui/chart";
import { cn } from "@/lib/utils";
import { BulkPasteUpdater } from "./BulkPasteUpdater";
import { parseHourlyTrend, parseBulkTeamText, parseDetailedAcionamento, type HourlyTrend, type BulkEntry, type DetailedEntry } from "@/lib/bulkParse";
import { toast } from "sonner";

interface TendenciaDiaViewProps {
  tvMode?: boolean;
  trendData: HourlyTrend[];
  onTrendUpdate?: (data: HourlyTrend[]) => void;
  onBulkUpdate?: (entries: BulkEntry[]) => void;
  onDetailedUpdate?: (entries: DetailedEntry[]) => void;
}

export const TendenciaDiaView = ({
  tvMode = false,
  trendData,
  onTrendUpdate,
  onBulkUpdate,
  onDetailedUpdate,
}: TendenciaDiaViewProps) => {
  const totalActions = trendData.reduce((sum, t) => sum + t.actions, 0);

  const handleBulkPaste = async (text: string) => {
    // Hourly trend
    const trendMatch = text.match(/Acionamentos por hora[^\n]*\n([\s\S]*?)(?=\(\d\)|$)/i);
    if (trendMatch) {
      const trendEntries = parseHourlyTrend(trendMatch[1]);
      if (trendEntries.length > 0) {
        onTrendUpdate?.(trendEntries);
      }
    }

    // Basic entries (morning/afternoon)
    const basicMatch = text.match(/RESUMO NUMÉRICO[^\n]*\n([\s\S]*?)(?=\(\d\)\s+RESUMO|$)/i);
    if (basicMatch) {
      const entries = parseBulkTeamText(basicMatch[1]);
      if (entries.length > 0) {
        onBulkUpdate?.(entries);
      }
    }

    // Detailed entries
    const detailedMatch = text.match(/RESUMO DETALHADO[^\n]*\n([\s\S]*?)$/i);
    if (detailedMatch) {
      const detailedEntries = parseDetailedAcionamento(detailedMatch[1]);
      if (detailedEntries.length > 0) {
        onDetailedUpdate?.(detailedEntries);
      }
    }

    toast.success("Dados de acionamento atualizados!");
  };

  return (
    <div className="animate-fade-in-up space-y-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-3 h-3 rounded-full bg-accent" />
        <h2 className={cn("font-semibold text-foreground", tvMode ? "text-3xl" : "text-2xl md:text-3xl")}>
          Tendência do Dia
        </h2>
      </div>

      {/* Bulk paste for updating */}
      {!tvMode && (
        <BulkPasteUpdater
          title="Atualizar Acionamentos"
          subtitle="Cole o texto completo com tendência, resumo numérico e detalhado"
          onApply={handleBulkPaste}
        />
      )}

      <div className="bg-card rounded-2xl p-4 md:p-6 border border-border">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h3 className={cn("font-semibold", tvMode ? "text-xl" : "text-lg md:text-xl")}>Acionamentos por Hora</h3>
            <p className="text-sm text-muted-foreground mt-1">Distribuição horária das atividades</p>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Total</div>
            <div className={cn("font-bold text-foreground", tvMode ? "text-4xl" : "text-3xl md:text-4xl")}>
              {totalActions}
            </div>
          </div>
        </div>

        {trendData.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            Cole os dados de acionamento acima para visualizar a tendência.
          </div>
        ) : (
          <div className={tvMode ? "h-[500px]" : "h-[400px]"}>
            <ChartContainer config={{ actions: { label: "Acionamentos", color: "hsl(var(--secondary))" } }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trendData} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="hour" tickLine={false} axisLine={false} tick={{ fontSize: tvMode ? 16 : 12 }} />
                  <YAxis tickLine={false} axisLine={false} allowDecimals={false} tick={{ fontSize: tvMode ? 16 : 12 }} />
                  <RTooltip />
                  <Bar dataKey="actions" fill="var(--color-actions)" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </div>
        )}
      </div>
    </div>
  );
};
