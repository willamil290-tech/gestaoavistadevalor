import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { parseAndBuildBitrixReport, type BitrixReport } from "@/lib/bitrixLogs";
import { cn } from "@/lib/utils";

type Props = {
  tvMode?: boolean;
  onApplyToDashboard?: (report: BitrixReport) => Promise<void> | void;
};

function normalizeHHMM(input: string) {
  const m = input.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export function BitrixLogsAnalyzerView({ tvMode, onApplyToDashboard }: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1);

  const [currentTime, setCurrentTime] = useState("");
  const [negociosText, setNegociosText] = useState("");
  const [leadsText, setLeadsText] = useState("");

  const [report, setReport] = useState<string>("");
  const [eventsCount, setEventsCount] = useState<number>(0);
  const [applied, setApplied] = useState(false);

  const canGoStep2 = useMemo(() => normalizeHHMM(currentTime) !== null, [currentTime]);
  const canGoStep3 = useMemo(() => negociosText.trim().length > 0, [negociosText]);
  const canGenerate = useMemo(() => leadsText.trim().length > 0, [leadsText]);

  const resetAll = () => {
    setStep(1);
    setCurrentTime("");
    setNegociosText("");
    setLeadsText("");
    setReport("");
    setEventsCount(0);
    setApplied(false);
  };

  const confirmTime = () => {
    const t = normalizeHHMM(currentTime);
    if (!t) {
      toast.error("Horário inválido. Use HH:MM (24h).");
      return;
    }
    setCurrentTime(t);
    setStep(2);
    setReport("");
    setEventsCount(0);
  };

  const confirmNegocios = () => {
    if (!negociosText.trim()) return;
    setStep(3);
    setReport("");
    setEventsCount(0);
  };

  const generate = async () => {
    const t = normalizeHHMM(currentTime);
    if (!t) {
      toast.error("Horário inválido. Use HH:MM (24h).");
      return;
    }
    if (!negociosText.trim() || !leadsText.trim()) return;

    const res = parseAndBuildBitrixReport({ currentHHMM: t, negociosText, leadsText });
    if (!res.ok) {
      toast.error(res.error);
      return;
    }

    setReport(res.reportText);
    setEventsCount(res.eventsCount);
    setApplied(false);

    // Aplica automaticamente no dashboard, se estiver disponível
    if (onApplyToDashboard) {
      try {
        await onApplyToDashboard(res.report);
        setApplied(true);
        toast.success("Relatório aplicado no dashboard");
      } catch (e: any) {
        toast.error(e?.message ? String(e.message) : "Falha ao aplicar no dashboard");
      }
    }
  };

  const copyReport = async () => {
    if (!report) return;
    try {
      await navigator.clipboard.writeText(report);
      toast.success("Relatório copiado.");
    } catch {
      toast.error("Não foi possível copiar.");
    }
  };

  return (
    <div className={cn("space-y-4", tvMode ? "max-w-none" : "max-w-[1200px]")}>
      <div className="rounded-2xl border border-border bg-card p-4 md:p-6">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
          <div>
            <div className="text-lg font-semibold">Análise de Logs (Bitrix)</div>
            <div className="text-sm text-muted-foreground">
              Cole os logs em texto corrido (hoje, ontem ou vários dias). O sistema só gera o relatório após receber as 2 levas.
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="rounded-xl" onClick={resetAll}>
              Recomeçar
            </Button>
            {report && (
              <Button className="rounded-xl" onClick={copyReport}>
                Copiar relatório
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ETAPA 1 */}
      <div className="rounded-2xl border border-border bg-card p-4 md:p-6">
        <div className="text-sm font-medium mb-2">ETAPA 1</div>
        <div className="text-base font-semibold mb-3">Me informe o horário atual para prosseguir com a análise.</div>

        <div className="flex flex-col sm:flex-row items-start sm:items-end gap-3">
          <div className="w-full sm:max-w-[220px]">
            <label className="text-xs text-muted-foreground">Horário atual (HH:MM)</label>
            <input
              value={currentTime}
              onChange={(e) => setCurrentTime(e.target.value)}
              placeholder="15:45"
              className="mt-1 w-full rounded-xl border border-border bg-muted/30 px-3 py-2 outline-none focus:ring-2 focus:ring-secondary"
              disabled={step !== 1}
            />
          </div>
          <Button className="rounded-xl" onClick={confirmTime} disabled={step !== 1 || !canGoStep2}>
            Confirmar horário
          </Button>
        </div>
      </div>

      {/* ETAPA 2 */}
      <div className={cn("rounded-2xl border border-border bg-card p-4 md:p-6", step < 2 ? "opacity-50" : "")}>
        <div className="text-sm font-medium mb-2">ETAPA 2</div>
        <div className="text-base font-semibold mb-3">Envie agora a 1ª leva: LOGS DE NEGÓCIOS.</div>
        <p className="text-xs text-muted-foreground mb-2">Aceita logs de hoje, ontem ou datas anteriores. Todos serão combinados no relatório.</p>

        <textarea
          value={negociosText}
          onChange={(e) => setNegociosText(e.target.value)}
          placeholder="Cole aqui os logs de NEGÓCIOS..."
          className="min-h-[180px] w-full rounded-xl bg-muted/30 border border-border p-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-secondary resize-y"
          disabled={step !== 2}
        />

        <div className="mt-3 flex items-center gap-2">
          <Button className="rounded-xl" onClick={confirmNegocios} disabled={step !== 2 || !canGoStep3}>
            Confirmar 1ª leva
          </Button>
        </div>
      </div>

      {/* ETAPA 3 */}
      <div className={cn("rounded-2xl border border-border bg-card p-4 md:p-6", step < 3 ? "opacity-50" : "")}>
        <div className="text-sm font-medium mb-2">ETAPA 3</div>
        <div className="text-base font-semibold mb-3">Recebido. Envie agora a 2ª leva: LOGS DE LEADS.</div>
        <p className="text-xs text-muted-foreground mb-2">Aceita logs de hoje, ontem ou datas anteriores. Todos serão combinados no relatório.</p>

        <textarea
          value={leadsText}
          onChange={(e) => setLeadsText(e.target.value)}
          placeholder="Cole aqui os logs de LEADS..."
          className="min-h-[180px] w-full rounded-xl bg-muted/30 border border-border p-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-secondary resize-y"
          disabled={step !== 3}
        />

        <div className="mt-3 flex items-center gap-2">
          <Button className="rounded-xl" onClick={generate} disabled={step !== 3 || !canGenerate}>
            Gerar relatório completo
          </Button>
          {eventsCount > 0 && <span className="text-xs text-muted-foreground">{eventsCount} eventos válidos</span>}
          {report && applied && <span className="text-xs text-muted-foreground">• aplicado</span>}
        </div>
      </div>

      {/* RESULTADO */}
      {report && (
        <div className="rounded-2xl border border-border bg-card p-4 md:p-6">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <div className="text-base font-semibold">Resultado</div>
              <div className="text-xs text-muted-foreground">Contagens determinísticas (sem interpretações subjetivas).</div>
            </div>
            {onApplyToDashboard && (
              <div className="flex items-center gap-2">
                <Button
                  variant={applied ? "outline" : "default"}
                  className="rounded-xl"
                  onClick={async () => {
                    const t2 = normalizeHHMM(currentTime);
                    if (!t2) return;
                    const res2 = parseAndBuildBitrixReport({ currentHHMM: t2, negociosText, leadsText });
                    if (!res2.ok) {
                      toast.error(res2.error);
                      return;
                    }
                    try {
                      await onApplyToDashboard(res2.report);
                      setApplied(true);
                      toast.success("Relatório aplicado no dashboard");
                    } catch (e: any) {
                      toast.error(e?.message ? String(e.message) : "Falha ao aplicar no dashboard");
                    }
                  }}
                >
                  {applied ? "Aplicado" : "Aplicar no dashboard"}
                </Button>
              </div>
            )}
          </div>

          <pre className="whitespace-pre-wrap rounded-xl bg-muted/40 border border-border p-3 text-sm leading-relaxed overflow-auto">
            {report}
          </pre>
        </div>
      )}
    </div>
  );
}
