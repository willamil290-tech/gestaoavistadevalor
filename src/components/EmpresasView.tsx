import { TeamMemberCard } from "./TeamMemberCard";
import { BarChart3, Users } from "lucide-react";

const teamData = [
  { name: "Alessandra Youssef", total: 29, morning: 29, afternoon: 0 },
  { name: "Luciane Mariani", total: 23, morning: 23, afternoon: 0 },
  { name: "Samara de Ramos", total: 9, morning: 9, afternoon: 0 },
  { name: "Rodrigo Mariani", total: 4, morning: 4, afternoon: 0 },
  { name: "Bruna Domingos", total: 3, morning: 3, afternoon: 0 },
  { name: "Raissa Flor", total: 1, morning: 1, afternoon: 0 },
];

export const EmpresasView = () => {
  const totalEmpresas = teamData.reduce((acc, member) => acc + member.total, 0);
  const mediaPorPessoa = (totalEmpresas / teamData.length).toFixed(0);

  return (
    <div className="animate-fade-in-up">
      <div className="flex items-center gap-2 mb-6">
        <div className="w-2 h-2 rounded-full bg-secondary" />
        <h2 className="text-xl font-semibold text-foreground">Empresas Acionadas</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Team Cards */}
        <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
          {teamData.map((member) => (
            <TeamMemberCard key={member.name} {...member} />
          ))}
        </div>

        {/* Summary Panel */}
        <div className="space-y-4">
          <div className="bg-card rounded-xl p-6 border border-border">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-foreground">Visão Geral</h3>
              <div className="w-10 h-10 rounded-full bg-secondary/20 flex items-center justify-center">
                <BarChart3 className="w-5 h-5 text-secondary" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-muted rounded-lg p-4 text-center">
                <Users className="w-6 h-6 text-secondary mx-auto mb-2" />
                <p className="text-3xl font-bold text-secondary">{totalEmpresas}</p>
                <p className="text-xs text-muted-foreground">Empresas acionadas</p>
              </div>
              <div className="bg-muted rounded-lg p-4 text-center">
                <BarChart3 className="w-6 h-6 text-pink-500 mx-auto mb-2" />
                <p className="text-3xl font-bold text-pink-500">{mediaPorPessoa}</p>
                <p className="text-xs text-muted-foreground">Média por pessoa</p>
              </div>
            </div>

            <p className="text-xs text-muted-foreground mt-4 text-center">
              *Sem repetir nome de empresa entre os comerciais
            </p>
          </div>

          {/* Top Performer */}
          <div className="bg-gradient-to-br from-gold/20 to-gold/5 rounded-xl p-6 border border-gold/30">
            <p className="text-xs text-gold uppercase tracking-wider mb-2">Top Performer</p>
            <p className="text-lg font-bold text-foreground">{teamData[0].name}</p>
            <p className="text-3xl font-bold text-gold">{teamData[0].total} empresas</p>
          </div>
        </div>
      </div>
    </div>
  );
};
