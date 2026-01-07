import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis, Legend } from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Pencil, Check, X } from "lucide-react";
import { ChartContainer } from "@/components/ui/chart";
import { cn } from "@/lib/utils";

export interface AgendadaRealizada {
  label: string;
  agendadas: number;
  realizadas: number;
}

interface AgendadasRealizadasViewProps {
  dadosMes: AgendadaRealizada[];
  dadosDia: AgendadaRealizada[];
  onUpdateMes: (dados: AgendadaRealizada[]) => void;
  onUpdateDia: (dados: AgendadaRealizada[]) => void;
  readOnly?: boolean;
  tvMode?: boolean;
}

export const AgendadasRealizadasView = ({
  dadosMes,
  dadosDia,
  onUpdateMes,
  onUpdateDia,
  readOnly = false,
  tvMode = false,
}: AgendadasRealizadasViewProps) => {
  const [editingMes, setEditingMes] = useState(false);
  const [editingDia, setEditingDia] = useState(false);
  const [editValuesMes, setEditValuesMes] = useState<AgendadaRealizada[]>([]);
  const [editValuesDia, setEditValuesDia] = useState<AgendadaRealizada[]>([]);

  const startEditMes = () => {
    setEditingMes(true);
    setEditValuesMes(dadosMes.map((d) => ({ ...d })));
  };

  const startEditDia = () => {
    setEditingDia(true);
    setEditValuesDia(dadosDia.map((d) => ({ ...d })));
  };

  const cancelEditMes = () => {
    setEditingMes(false);
    setEditValuesMes([]);
  };

  const cancelEditDia = () => {
    setEditingDia(false);
    setEditValuesDia([]);
  };

  const saveEditMes = () => {
    onUpdateMes(editValuesMes);
    setEditingMes(false);
  };

  const saveEditDia = () => {
    onUpdateDia(editValuesDia);
    setEditingDia(false);
  };

  const totalAgendadasMes = dadosMes.reduce((sum, d) => sum + d.agendadas, 0);
  const totalRealizadasMes = dadosMes.reduce((sum, d) => sum + d.realizadas, 0);
  const totalAgendadasDia = dadosDia.reduce((sum, d) => sum + d.agendadas, 0);
  const totalRealizadasDia = dadosDia.reduce((sum, d) => sum + d.realizadas, 0);

  const taxaConversaoMes = totalAgendadasMes > 0 ? (totalRealizadasMes / totalAgendadasMes) * 100 : 0;
  const taxaConversaoDia = totalAgendadasDia > 0 ? (totalRealizadasDia / totalAgendadasDia) * 100 : 0;

  return (
    <div className="animate-fade-in-up">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-3 h-3 rounded-full bg-secondary" />
        <h2 className={cn("font-semibold text-foreground", tvMode ? "text-3xl" : "text-2xl md:text-3xl")}>
          Agendadas × Realizadas
        </h2>
      </div>

      <Tabs defaultValue="mes" className="space-y-4">
        <TabsList className="grid w-full max-w-[300px] grid-cols-2">
          <TabsTrigger value="mes">Mês</TabsTrigger>
          <TabsTrigger value="dia">Dia</TabsTrigger>
        </TabsList>

        <TabsContent value="mes" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Gráfico */}
            <div className="lg:col-span-2 bg-card rounded-2xl p-4 md:p-6 border border-border">
              <div className="flex items-center justify-between mb-4">
                <h3 className={cn("font-semibold", tvMode ? "text-xl" : "text-lg")}>Comparativo Mensal</h3>
                {!readOnly && !editingMes && (
                  <Button variant="outline" size="sm" onClick={startEditMes} className="rounded-xl">
                    <Pencil className="w-4 h-4 mr-1" />
                    Editar
                  </Button>
                )}
                {editingMes && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={cancelEditMes}>
                      <X className="w-4 h-4" />
                    </Button>
                    <Button size="sm" onClick={saveEditMes}>
                      <Check className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </div>

              {editingMes ? (
                <div className="space-y-3">
                  {editValuesMes.map((d, i) => (
                    <div key={d.label} className="grid grid-cols-3 gap-3 items-center">
                      <span className="text-sm font-medium">{d.label}</span>
                      <div>
                        <label className="text-xs text-muted-foreground">Agendadas</label>
                        <Input
                          type="number"
                          value={d.agendadas}
                          onChange={(e) =>
                            setEditValuesMes((prev) =>
                              prev.map((item, idx) =>
                                idx === i ? { ...item, agendadas: Number(e.target.value) } : item
                              )
                            )
                          }
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Realizadas</label>
                        <Input
                          type="number"
                          value={d.realizadas}
                          onChange={(e) =>
                            setEditValuesMes((prev) =>
                              prev.map((item, idx) =>
                                idx === i ? { ...item, realizadas: Number(e.target.value) } : item
                              )
                            )
                          }
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={tvMode ? "h-[400px]" : "h-[300px]"}>
                  <ChartContainer
                    config={{
                      agendadas: { label: "Agendadas", color: "hsl(var(--primary))" },
                      realizadas: { label: "Realizadas", color: "hsl(var(--secondary))" },
                    }}
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={dadosMes} margin={{ left: 8, right: 8 }}>
                        <CartesianGrid vertical={false} strokeDasharray="3 3" />
                        <XAxis dataKey="label" tickLine={false} axisLine={false} />
                        <YAxis tickLine={false} axisLine={false} />
                        <RTooltip />
                        <Legend />
                        <Bar dataKey="agendadas" fill="var(--color-agendadas)" radius={[8, 8, 0, 0]} />
                        <Bar dataKey="realizadas" fill="var(--color-realizadas)" radius={[8, 8, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                </div>
              )}
            </div>

            {/* Resumo */}
            <div className="bg-card rounded-2xl p-4 md:p-6 border border-border">
              <h3 className={cn("font-semibold mb-4", tvMode ? "text-xl" : "text-lg")}>Resumo Mensal</h3>
              <div className="space-y-4">
                <div className="p-4 bg-primary/10 rounded-xl text-center">
                  <p className="text-sm text-muted-foreground mb-1">Agendadas</p>
                  <p className={cn("font-bold text-primary", tvMode ? "text-4xl" : "text-3xl")}>
                    {totalAgendadasMes}
                  </p>
                </div>
                <div className="p-4 bg-secondary/10 rounded-xl text-center">
                  <p className="text-sm text-muted-foreground mb-1">Realizadas</p>
                  <p className={cn("font-bold text-secondary", tvMode ? "text-4xl" : "text-3xl")}>
                    {totalRealizadasMes}
                  </p>
                </div>
                <div className="p-4 bg-muted/30 rounded-xl text-center">
                  <p className="text-sm text-muted-foreground mb-1">Taxa de Conversão</p>
                  <p
                    className={cn(
                      "font-bold",
                      tvMode ? "text-3xl" : "text-2xl",
                      taxaConversaoMes >= 80 ? "text-green-500" : taxaConversaoMes >= 50 ? "text-gold" : "text-destructive"
                    )}
                  >
                    {taxaConversaoMes.toFixed(1)}%
                  </p>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="dia" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Gráfico */}
            <div className="lg:col-span-2 bg-card rounded-2xl p-4 md:p-6 border border-border">
              <div className="flex items-center justify-between mb-4">
                <h3 className={cn("font-semibold", tvMode ? "text-xl" : "text-lg")}>Comparativo Diário</h3>
                {!readOnly && !editingDia && (
                  <Button variant="outline" size="sm" onClick={startEditDia} className="rounded-xl">
                    <Pencil className="w-4 h-4 mr-1" />
                    Editar
                  </Button>
                )}
                {editingDia && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={cancelEditDia}>
                      <X className="w-4 h-4" />
                    </Button>
                    <Button size="sm" onClick={saveEditDia}>
                      <Check className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </div>

              {editingDia ? (
                <div className="space-y-3">
                  {editValuesDia.map((d, i) => (
                    <div key={d.label} className="grid grid-cols-3 gap-3 items-center">
                      <span className="text-sm font-medium">{d.label}</span>
                      <div>
                        <label className="text-xs text-muted-foreground">Agendadas</label>
                        <Input
                          type="number"
                          value={d.agendadas}
                          onChange={(e) =>
                            setEditValuesDia((prev) =>
                              prev.map((item, idx) =>
                                idx === i ? { ...item, agendadas: Number(e.target.value) } : item
                              )
                            )
                          }
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Realizadas</label>
                        <Input
                          type="number"
                          value={d.realizadas}
                          onChange={(e) =>
                            setEditValuesDia((prev) =>
                              prev.map((item, idx) =>
                                idx === i ? { ...item, realizadas: Number(e.target.value) } : item
                              )
                            )
                          }
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={tvMode ? "h-[400px]" : "h-[300px]"}>
                  <ChartContainer
                    config={{
                      agendadas: { label: "Agendadas", color: "hsl(var(--primary))" },
                      realizadas: { label: "Realizadas", color: "hsl(var(--secondary))" },
                    }}
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={dadosDia} margin={{ left: 8, right: 8 }}>
                        <CartesianGrid vertical={false} strokeDasharray="3 3" />
                        <XAxis dataKey="label" tickLine={false} axisLine={false} />
                        <YAxis tickLine={false} axisLine={false} />
                        <RTooltip />
                        <Legend />
                        <Bar dataKey="agendadas" fill="var(--color-agendadas)" radius={[8, 8, 0, 0]} />
                        <Bar dataKey="realizadas" fill="var(--color-realizadas)" radius={[8, 8, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                </div>
              )}
            </div>

            {/* Resumo */}
            <div className="bg-card rounded-2xl p-4 md:p-6 border border-border">
              <h3 className={cn("font-semibold mb-4", tvMode ? "text-xl" : "text-lg")}>Resumo Diário</h3>
              <div className="space-y-4">
                <div className="p-4 bg-primary/10 rounded-xl text-center">
                  <p className="text-sm text-muted-foreground mb-1">Agendadas</p>
                  <p className={cn("font-bold text-primary", tvMode ? "text-4xl" : "text-3xl")}>
                    {totalAgendadasDia}
                  </p>
                </div>
                <div className="p-4 bg-secondary/10 rounded-xl text-center">
                  <p className="text-sm text-muted-foreground mb-1">Realizadas</p>
                  <p className={cn("font-bold text-secondary", tvMode ? "text-4xl" : "text-3xl")}>
                    {totalRealizadasDia}
                  </p>
                </div>
                <div className="p-4 bg-muted/30 rounded-xl text-center">
                  <p className="text-sm text-muted-foreground mb-1">Taxa de Conversão</p>
                  <p
                    className={cn(
                      "font-bold",
                      tvMode ? "text-3xl" : "text-2xl",
                      taxaConversaoDia >= 80 ? "text-green-500" : taxaConversaoDia >= 50 ? "text-gold" : "text-destructive"
                    )}
                  >
                    {taxaConversaoDia.toFixed(1)}%
                  </p>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};
