import { useEffect, useRef, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Pencil, Check, X } from "lucide-react";
import { ChartContainer } from "@/components/ui/chart";
import { cn } from "@/lib/utils";

export interface FaixaVencimento {
  faixa: string;
  valorMes: number;
  valorDia: number;
}

interface FaixaVencimentoViewProps {
  faixas: FaixaVencimento[];
  onUpdate: (faixas: FaixaVencimento[]) => void;
  readOnly?: boolean;
  tvMode?: boolean;
}

export const FaixaVencimentoView = ({
  faixas,
  onUpdate,
  readOnly = false,
  tvMode = false,
}: FaixaVencimentoViewProps) => {
  const [editing, setEditing] = useState(false);
  const [editValues, setEditValues] = useState<FaixaVencimento[]>([]);
  const [activeTab, setActiveTab] = useState<"mes" | "dia">("mes");
  const tabIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-switch tabs in TV mode
  useEffect(() => {
    if (!tvMode) {
      if (tabIntervalRef.current) clearInterval(tabIntervalRef.current);
      return;
    }

    tabIntervalRef.current = setInterval(() => {
      setActiveTab((prev) => (prev === "mes" ? "dia" : "mes"));
    }, 10000); // Switch every 10 seconds

    return () => {
      if (tabIntervalRef.current) clearInterval(tabIntervalRef.current);
    };
  }, [tvMode]);

  const startEdit = () => {
    setEditing(true);
    setEditValues(faixas.map((f) => ({ ...f })));
  };

  const cancelEdit = () => {
    setEditing(false);
    setEditValues([]);
  };

  const saveEdit = () => {
    onUpdate(editValues);
    setEditing(false);
  };

  const updateFaixa = (index: number, field: "valorMes" | "valorDia", value: number) => {
    setEditValues((prev) =>
      prev.map((f, i) => (i === index ? { ...f, [field]: value } : f))
    );
  };

  const fmtBRL = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  const totalMes = faixas.reduce((sum, f) => sum + f.valorMes, 0);
  const totalDia = faixas.reduce((sum, f) => sum + f.valorDia, 0);

  const chartDataMes = faixas.map((f) => ({ name: f.faixa, valor: f.valorMes }));
  const chartDataDia = faixas.map((f) => ({ name: f.faixa, valor: f.valorDia }));

  return (
    <div className="animate-fade-in-up">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-gold" />
          <h2 className={cn("font-semibold text-foreground", tvMode ? "text-3xl" : "text-2xl md:text-3xl")}>
            Faixa de Vencimento
          </h2>
        </div>

        {!readOnly && !editing && (
          <Button variant="outline" onClick={startEdit} className="rounded-xl">
            <Pencil className="w-4 h-4 mr-2" />
            Editar
          </Button>
        )}

        {editing && (
          <div className="flex gap-2">
            <Button variant="ghost" onClick={cancelEdit}>
              <X className="w-4 h-4 mr-1" />
              Cancelar
            </Button>
            <Button onClick={saveEdit}>
              <Check className="w-4 h-4 mr-1" />
              Salvar
            </Button>
          </div>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "mes" | "dia")} className="space-y-4">
        <TabsList className="grid w-full max-w-[300px] grid-cols-2">
          <TabsTrigger value="mes">Mês</TabsTrigger>
          <TabsTrigger value="dia">Dia</TabsTrigger>
        </TabsList>

        <TabsContent value="mes" className="space-y-4">
          <div className="bg-card rounded-2xl p-4 md:p-6 border border-border">
            <div className="flex items-center justify-between mb-4">
              <h3 className={cn("font-semibold", tvMode ? "text-xl" : "text-lg")}>Visão Mensal</h3>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Total Mês</p>
                <p className={cn("font-bold text-primary", tvMode ? "text-2xl" : "text-xl")}>{fmtBRL(totalMes)}</p>
              </div>
            </div>

            {editing ? (
              <div className="space-y-3">
                {editValues.map((f, i) => (
                  <div key={f.faixa} className="flex items-center gap-3">
                    <span className="w-24 text-sm text-muted-foreground">{f.faixa}</span>
                    <Input
                      type="number"
                      value={f.valorMes}
                      onChange={(e) => updateFaixa(i, "valorMes", Number(e.target.value))}
                      className="flex-1"
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className={tvMode ? "h-[400px]" : "h-[300px]"}>
                <ChartContainer config={{ valor: { label: "Valor", color: "hsl(var(--primary))" } }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartDataMes} layout="vertical" margin={{ left: 80, right: 20 }}>
                      <CartesianGrid horizontal strokeDasharray="3 3" />
                      <XAxis type="number" tickFormatter={(v) => fmtBRL(v)} />
                      <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} width={75} />
                      <RTooltip formatter={(v: number) => fmtBRL(v)} />
                      <Bar dataKey="valor" fill="var(--color-valor)" radius={[0, 8, 8, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartContainer>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="dia" className="space-y-4">
          <div className="bg-card rounded-2xl p-4 md:p-6 border border-border">
            <div className="flex items-center justify-between mb-4">
              <h3 className={cn("font-semibold", tvMode ? "text-xl" : "text-lg")}>Visão Diária</h3>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Total Dia</p>
                <p className={cn("font-bold text-secondary", tvMode ? "text-2xl" : "text-xl")}>{fmtBRL(totalDia)}</p>
              </div>
            </div>

            {editing ? (
              <div className="space-y-3">
                {editValues.map((f, i) => (
                  <div key={f.faixa} className="flex items-center gap-3">
                    <span className="w-24 text-sm text-muted-foreground">{f.faixa}</span>
                    <Input
                      type="number"
                      value={f.valorDia}
                      onChange={(e) => updateFaixa(i, "valorDia", Number(e.target.value))}
                      className="flex-1"
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className={tvMode ? "h-[400px]" : "h-[300px]"}>
                <ChartContainer config={{ valor: { label: "Valor", color: "hsl(var(--secondary))" } }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartDataDia} layout="vertical" margin={{ left: 80, right: 20 }}>
                      <CartesianGrid horizontal strokeDasharray="3 3" />
                      <XAxis type="number" tickFormatter={(v) => fmtBRL(v)} />
                      <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} width={75} />
                      <RTooltip formatter={(v: number) => fmtBRL(v)} />
                      <Bar dataKey="valor" fill="var(--color-valor)" radius={[0, 8, 8, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartContainer>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};
