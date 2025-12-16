import { CircularProgress } from "./CircularProgress";
import { EditableValue } from "./EditableValue";

interface DashboardViewProps {
  metaMes: number;
  metaDia: number;
  atingidoMes: number;
  atingidoDia: number;
  onMetaMesChange: (value: number) => void;
  onMetaDiaChange: (value: number) => void;
  onAtingidoMesChange: (value: number) => void;
  onAtingidoDiaChange: (value: number) => void;
}

export const DashboardView = ({
  metaMes,
  metaDia,
  atingidoMes,
  atingidoDia,
  onMetaMesChange,
  onMetaDiaChange,
  onAtingidoMesChange,
  onAtingidoDiaChange,
}: DashboardViewProps) => {
  const percentualMes = (atingidoMes / metaMes) * 100;
  const percentualDia = (atingidoDia / metaDia) * 100;

  return (
    <div className="animate-fade-in-up">
      {/* Main metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        {/* Month Section */}
        <div className="bg-card rounded-2xl p-5 md:p-6 border border-border">
          <div className="flex flex-col items-center gap-4">
            <EditableValue
              value={atingidoMes}
              onChange={onAtingidoMesChange}
              label="Vl. Borderô (mês)"
            />
            <CircularProgress
              percentage={percentualMes}
              label="Meta (mês)"
              variant="primary"
              size={200}
            />
            <div className="w-full pt-4 border-t border-border">
              <EditableValue
                value={metaMes}
                onChange={onMetaMesChange}
                label="Meta do Mês"
                size="sm"
              />
            </div>
          </div>
        </div>

        {/* Day Section */}
        <div className="bg-card rounded-2xl p-5 md:p-6 border border-border">
          <div className="flex flex-col items-center gap-4">
            <EditableValue
              value={atingidoDia}
              onChange={onAtingidoDiaChange}
              label="Vl. Borderô (dia)"
            />
            <CircularProgress
              percentage={percentualDia}
              label="Meta (dia)"
              variant="secondary"
              size={200}
            />
            <div className="w-full pt-4 border-t border-border">
              <EditableValue
                value={metaDia}
                onChange={onMetaDiaChange}
                label="Meta do Dia"
                size="sm"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-card rounded-xl p-4 border border-border text-center">
          <p className="text-sm md:text-base text-muted-foreground mb-2">% Mês</p>
          <p className="text-2xl md:text-3xl font-bold text-primary">{percentualMes.toFixed(1)}%</p>
        </div>
        <div className="bg-card rounded-xl p-4 border border-border text-center">
          <p className="text-sm md:text-base text-muted-foreground mb-2">% Dia</p>
          <p className="text-2xl md:text-3xl font-bold text-secondary">{percentualDia.toFixed(1)}%</p>
        </div>
        <div className="bg-card rounded-xl p-4 border border-border text-center">
          <p className="text-sm md:text-base text-muted-foreground mb-2">Falta (Mês)</p>
          <p className="text-xl md:text-2xl font-bold text-foreground">
            {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Math.max(0, metaMes - atingidoMes))}
          </p>
        </div>
        <div className="bg-card rounded-xl p-4 border border-border text-center">
          <p className="text-sm md:text-base text-muted-foreground mb-2">Falta (Dia)</p>
          <p className="text-xl md:text-2xl font-bold text-foreground">
            {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Math.max(0, metaDia - atingidoDia))}
          </p>
        </div>
      </div>
    </div>
  );
};
