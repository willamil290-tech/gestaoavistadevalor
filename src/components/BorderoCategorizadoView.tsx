import { useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Pencil, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CategoriaData {
  categoria: string;
  valorMes: number;
  valorDia: number;
}

interface BorderoCategorizadoViewProps {
  categorias: CategoriaData[];
  onUpdate: (categorias: CategoriaData[]) => void;
  readOnly?: boolean;
  tvMode?: boolean;
}

const COLORS = ["#1e3a5f", "#7c3238", "#d4a574", "#2e5a4c"];

export const BorderoCategorizadoView = ({
  categorias,
  onUpdate,
  readOnly = false,
  tvMode = false,
}: BorderoCategorizadoViewProps) => {
  const [editing, setEditing] = useState(false);
  const [editValues, setEditValues] = useState<CategoriaData[]>([]);

  const startEdit = () => {
    setEditing(true);
    setEditValues(categorias.map((c) => ({ ...c })));
  };

  const cancelEdit = () => {
    setEditing(false);
    setEditValues([]);
  };

  const saveEdit = () => {
    onUpdate(editValues);
    setEditing(false);
  };

  const updateCategoria = (index: number, field: "valorMes" | "valorDia", value: number) => {
    setEditValues((prev) =>
      prev.map((c, i) => (i === index ? { ...c, [field]: value } : c))
    );
  };

  const fmtBRL = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  const totalMes = categorias.reduce((sum, c) => sum + c.valorMes, 0);
  const totalDia = categorias.reduce((sum, c) => sum + c.valorDia, 0);

  const pieDataMes = categorias.map((c) => ({ name: c.categoria, value: c.valorMes }));
  const pieDataDia = categorias.map((c) => ({ name: c.categoria, value: c.valorDia }));

  const renderCustomLabel = ({ name, percent }: { name: string; percent: number }) => {
    return `${name} (${(percent * 100).toFixed(0)}%)`;
  };

  return (
    <div className="animate-fade-in-up">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-primary" />
          <h2 className={cn("font-semibold text-foreground", tvMode ? "text-3xl" : "text-2xl md:text-3xl")}>
            Borderô Categorizado
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

      <Tabs defaultValue="mes" className="space-y-4">
        <TabsList className="grid w-full max-w-[300px] grid-cols-2">
          <TabsTrigger value="mes">Mês</TabsTrigger>
          <TabsTrigger value="dia">Dia</TabsTrigger>
        </TabsList>

        <TabsContent value="mes" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-card rounded-2xl p-4 md:p-6 border border-border">
              <div className="flex items-center justify-between mb-4">
                <h3 className={cn("font-semibold", tvMode ? "text-xl" : "text-lg")}>Distribuição Mensal</h3>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Total</p>
                  <p className={cn("font-bold text-primary", tvMode ? "text-2xl" : "text-xl")}>{fmtBRL(totalMes)}</p>
                </div>
              </div>

              {editing ? (
                <div className="space-y-3">
                  {editValues.map((c, i) => (
                    <div key={c.categoria} className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      <span className="w-24 text-sm">{c.categoria}</span>
                      <Input
                        type="number"
                        value={c.valorMes}
                        onChange={(e) => updateCategoria(i, "valorMes", Number(e.target.value))}
                        className="flex-1"
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className={tvMode ? "h-[350px]" : "h-[280px]"}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieDataMes}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={tvMode ? 120 : 90}
                        label={renderCustomLabel}
                        labelLine={false}
                      >
                        {pieDataMes.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: number) => fmtBRL(v)} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="bg-card rounded-2xl p-4 md:p-6 border border-border">
              <h3 className={cn("font-semibold mb-4", tvMode ? "text-xl" : "text-lg")}>Detalhes por Categoria</h3>
              <div className="space-y-3">
                {categorias.map((c, i) => (
                  <div key={c.categoria} className="flex items-center justify-between p-3 bg-muted/30 rounded-xl">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      <span className={cn("font-medium", tvMode ? "text-lg" : "")}>{c.categoria}</span>
                    </div>
                    <span className={cn("font-bold", tvMode ? "text-xl" : "text-lg")}>{fmtBRL(c.valorMes)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="dia" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-card rounded-2xl p-4 md:p-6 border border-border">
              <div className="flex items-center justify-between mb-4">
                <h3 className={cn("font-semibold", tvMode ? "text-xl" : "text-lg")}>Distribuição Diária</h3>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Total</p>
                  <p className={cn("font-bold text-secondary", tvMode ? "text-2xl" : "text-xl")}>{fmtBRL(totalDia)}</p>
                </div>
              </div>

              {editing ? (
                <div className="space-y-3">
                  {editValues.map((c, i) => (
                    <div key={c.categoria} className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      <span className="w-24 text-sm">{c.categoria}</span>
                      <Input
                        type="number"
                        value={c.valorDia}
                        onChange={(e) => updateCategoria(i, "valorDia", Number(e.target.value))}
                        className="flex-1"
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className={tvMode ? "h-[350px]" : "h-[280px]"}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieDataDia}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={tvMode ? 120 : 90}
                        label={renderCustomLabel}
                        labelLine={false}
                      >
                        {pieDataDia.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: number) => fmtBRL(v)} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="bg-card rounded-2xl p-4 md:p-6 border border-border">
              <h3 className={cn("font-semibold mb-4", tvMode ? "text-xl" : "text-lg")}>Detalhes por Categoria</h3>
              <div className="space-y-3">
                {categorias.map((c, i) => (
                  <div key={c.categoria} className="flex items-center justify-between p-3 bg-muted/30 rounded-xl">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      <span className={cn("font-medium", tvMode ? "text-lg" : "")}>{c.categoria}</span>
                    </div>
                    <span className={cn("font-bold", tvMode ? "text-xl" : "text-lg")}>{fmtBRL(c.valorDia)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};
