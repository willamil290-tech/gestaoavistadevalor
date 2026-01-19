import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { importBorderoFromExcel, type ExcelImportResult } from "@/lib/excelImport";

function fmtBRL(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function toDateInputValue(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseDateInputValue(s: string): Date {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return new Date();
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0);
}

export function ExcelBorderoImporter(props: {
  tvMode: boolean;
  defaultDate?: Date;
  onImported: (result: ExcelImportResult) => void | Promise<void>;
}) {
  const { tvMode, onImported } = props;
  const defaultDate = useMemo(() => props.defaultDate ?? new Date(), [props.defaultDate]);

  const [file, setFile] = useState<File | null>(null);
  const [dateStr, setDateStr] = useState(() => toDateInputValue(defaultDate));
  const [loading, setLoading] = useState(false);

  const handleImport = async () => {
    if (!file) {
      toast.error("Selecione um arquivo .xlsx");
      return;
    }
    setLoading(true);
    try {
      const refDate = parseDateInputValue(dateStr);
      const result = await importBorderoFromExcel(file, refDate);
      await onImported(result);
      toast.success(
        `Importado! Borderô dia ${fmtBRL(result.borderoDay)} | mês ${fmtBRL(result.borderoMonth)} (linhas: ${result.rowsRead})`
      );
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message ?? "Falha ao importar Excel");
    } finally {
      setLoading(false);
    }
  };

  if (tvMode) return null;

  return (
    <Card className="p-4 md:p-6 rounded-2xl border border-border">
      <div className="flex flex-col md:flex-row md:items-end gap-3 md:gap-4">
        <div className="flex-1">
          <div className="text-sm font-medium mb-1">Importar Excel (Base)</div>
          <div className="text-xs text-muted-foreground mb-3">
            Atualiza Borderô (dia/mês) e Clientes do Dia a partir de <span className="font-medium">Dt. Cadastro</span>, <span className="font-medium">Vl. Título</span> e <span className="font-medium">Motivo da Devolução</span>.
            O Borderô é calculado como <span className="font-medium">Total - Indevido</span>.
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <Input
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
            <div>
              <Input
                type="date"
                value={dateStr}
                onChange={(e) => setDateStr(e.target.value)}
                title="Data de referência (A1)"
              />
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <Button onClick={handleImport} disabled={!file || loading} className="rounded-xl">
            {loading ? "Importando..." : "Importar"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
