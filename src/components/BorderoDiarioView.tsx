import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, Pencil, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ClienteBordero {
  id: string;
  cliente: string;
  comercial: string;
  valor: number;
  horario: string;
  observacao: string;
}

interface BorderoDiarioViewProps {
  clientes: ClienteBordero[];
  metaDia: number;
  onClienteAdd: () => void;
  onClienteUpdate: (cliente: ClienteBordero) => void;
  onClienteDelete: (id: string) => void;
  onMetaChange: (value: number) => void;
  readOnly?: boolean;
  tvMode?: boolean;
}

export const BorderoDiarioView = ({
  clientes,
  metaDia,
  onClienteAdd,
  onClienteUpdate,
  onClienteDelete,
  onMetaChange,
  readOnly = false,
  tvMode = false,
}: BorderoDiarioViewProps) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<ClienteBordero | null>(null);
  const [editingMeta, setEditingMeta] = useState(false);
  const [tempMeta, setTempMeta] = useState(metaDia);

  const totalDia = clientes.reduce((sum, c) => sum + c.valor, 0);
  const faltaMeta = Math.max(0, metaDia - totalDia);
  const percentual = metaDia > 0 ? (totalDia / metaDia) * 100 : 0;

  const fmtBRL = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  const startEdit = (c: ClienteBordero) => {
    setEditingId(c.id);
    setEditValues({ ...c });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditValues(null);
  };

  const saveEdit = () => {
    if (editValues) {
      onClienteUpdate(editValues);
    }
    cancelEdit();
  };

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-3 h-3 rounded-full bg-primary" />
        <h2 className={cn("font-semibold text-foreground", tvMode ? "text-3xl" : "text-2xl md:text-3xl")}>
          Borderô Diário
        </h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Tabela de Clientes */}
        <div className="lg:col-span-2 bg-card rounded-2xl p-4 md:p-6 border border-border">
          <div className="flex items-center justify-between mb-4">
            <h3 className={cn("font-semibold", tvMode ? "text-xl" : "text-lg")}>Clientes do Dia</h3>
            {!readOnly && (
              <Button size="sm" onClick={onClienteAdd} className="rounded-xl">
                <Plus className="w-4 h-4 mr-1" />
                Adicionar
              </Button>
            )}
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className={tvMode ? "text-base" : ""}>Cliente</TableHead>
                  <TableHead className={tvMode ? "text-base" : ""}>Comercial</TableHead>
                  <TableHead className={cn("text-right", tvMode ? "text-base" : "")}>Valor</TableHead>
                  <TableHead className={tvMode ? "text-base" : ""}>Horário</TableHead>
                  <TableHead className={tvMode ? "text-base" : ""}>Obs.</TableHead>
                  {!readOnly && <TableHead className="w-20"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {clientes.map((c) => {
                  const isEditing = editingId === c.id;

                  return (
                    <TableRow key={c.id}>
                      {isEditing && editValues ? (
                        <>
                          <TableCell>
                            <Input
                              value={editValues.cliente}
                              onChange={(e) => setEditValues({ ...editValues, cliente: e.target.value })}
                              className="min-w-[120px]"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={editValues.comercial}
                              onChange={(e) => setEditValues({ ...editValues, comercial: e.target.value })}
                              className="min-w-[100px]"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              value={editValues.valor}
                              onChange={(e) => setEditValues({ ...editValues, valor: Number(e.target.value) })}
                              className="min-w-[80px] text-right"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={editValues.horario}
                              onChange={(e) => setEditValues({ ...editValues, horario: e.target.value })}
                              className="min-w-[60px]"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={editValues.observacao}
                              onChange={(e) => setEditValues({ ...editValues, observacao: e.target.value })}
                              className="min-w-[80px]"
                            />
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={saveEdit}>
                                <Check className="w-3 h-3" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={cancelEdit}>
                                <X className="w-3 h-3" />
                              </Button>
                            </div>
                          </TableCell>
                        </>
                      ) : (
                        <>
                          <TableCell className={cn("font-medium", tvMode ? "text-lg" : "")}>
                            {c.cliente}
                          </TableCell>
                          <TableCell className={tvMode ? "text-lg" : ""}>{c.comercial}</TableCell>
                          <TableCell className={cn("text-right font-semibold", tvMode ? "text-lg" : "")}>
                            {fmtBRL(c.valor)}
                          </TableCell>
                          <TableCell className={tvMode ? "text-lg" : ""}>{c.horario}</TableCell>
                          <TableCell className={cn("text-muted-foreground", tvMode ? "text-base" : "text-sm")}>
                            {c.observacao}
                          </TableCell>
                          {!readOnly && (
                            <TableCell>
                              <div className="flex gap-1">
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(c)}>
                                  <Pencil className="w-3 h-3" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7 text-destructive"
                                  onClick={() => onClienteDelete(c.id)}
                                >
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </div>
                            </TableCell>
                          )}
                        </>
                      )}
                    </TableRow>
                  );
                })}

                {clientes.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={readOnly ? 5 : 6} className="text-center text-muted-foreground py-8">
                      Nenhum cliente registrado hoje
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Resumo do Dia */}
        <div className="bg-card rounded-2xl p-4 md:p-6 border border-border">
          <h3 className={cn("font-semibold mb-4", tvMode ? "text-xl" : "text-lg")}>Resumo do Dia</h3>

          <div className="space-y-4">
            <div className="p-4 bg-muted/30 rounded-xl text-center">
              <p className="text-sm text-muted-foreground mb-1">Borderô do Dia</p>
              <p className={cn("font-bold text-primary", tvMode ? "text-4xl" : "text-3xl")}>
                {fmtBRL(totalDia)}
              </p>
            </div>

            <div className="p-4 bg-muted/30 rounded-xl text-center">
              <p className="text-sm text-muted-foreground mb-1">Meta do Dia</p>
              {editingMeta && !readOnly ? (
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    value={tempMeta}
                    onChange={(e) => setTempMeta(Number(e.target.value))}
                    className="text-center text-xl font-bold"
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      onMetaChange(tempMeta);
                      setEditingMeta(false);
                    }}
                  >
                    <Check className="w-4 h-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => setEditingMeta(false)}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <p
                  className={cn(
                    "font-bold text-foreground cursor-pointer hover:text-primary transition-colors",
                    tvMode ? "text-3xl" : "text-2xl"
                  )}
                  onClick={() => {
                    if (!readOnly) {
                      setTempMeta(metaDia);
                      setEditingMeta(true);
                    }
                  }}
                >
                  {fmtBRL(metaDia)}
                </p>
              )}
            </div>

            <div className="p-4 bg-muted/30 rounded-xl text-center">
              <p className="text-sm text-muted-foreground mb-1">% Atingido</p>
              <p
                className={cn(
                  "font-bold",
                  tvMode ? "text-3xl" : "text-2xl",
                  percentual >= 100 ? "text-green-500" : "text-secondary"
                )}
              >
                {percentual.toFixed(1)}%
              </p>
            </div>

            <div className="p-4 bg-muted/30 rounded-xl text-center">
              <p className="text-sm text-muted-foreground mb-1">
                {totalDia >= metaDia ? "Excedente" : "Falta para Meta"}
              </p>
              <p
                className={cn(
                  "font-bold",
                  tvMode ? "text-2xl" : "text-xl",
                  totalDia >= metaDia ? "text-green-500" : "text-destructive"
                )}
              >
                {fmtBRL(totalDia >= metaDia ? totalDia - metaDia : faltaMeta)}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
