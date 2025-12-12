import { TeamMemberCard, TeamMember } from "./TeamMemberCard";
import { BarChart3, Users, Plus } from "lucide-react";
import { useState } from "react";

const initialTeamData: TeamMember[] = [
  { id: "1", name: "Alessandra Youssef", total: 29, morning: 29, afternoon: 0 },
  { id: "2", name: "Luciane Mariani", total: 23, morning: 23, afternoon: 0 },
  { id: "3", name: "Samara de Ramos", total: 9, morning: 9, afternoon: 0 },
  { id: "4", name: "Rodrigo Mariani", total: 4, morning: 4, afternoon: 0 },
  { id: "5", name: "Bruna Domingos", total: 3, morning: 3, afternoon: 0 },
  { id: "6", name: "Raissa Flor", total: 1, morning: 1, afternoon: 0 },
];

export const EmpresasView = () => {
  const [teamData, setTeamData] = useState<TeamMember[]>(initialTeamData);

  const totalEmpresas = teamData.reduce((acc, member) => acc + member.total, 0);
  const mediaPorPessoa = teamData.length > 0 ? (totalEmpresas / teamData.length).toFixed(0) : "0";
  const topPerformer = teamData.length > 0 ? [...teamData].sort((a, b) => b.total - a.total)[0] : null;

  const handleUpdate = (updatedMember: TeamMember) => {
    setTeamData(prev => prev.map(m => m.id === updatedMember.id ? updatedMember : m));
  };

  const handleDelete = (id: string) => {
    setTeamData(prev => prev.filter(m => m.id !== id));
  };

  const handleAdd = () => {
    const newMember: TeamMember = {
      id: Date.now().toString(),
      name: "Novo Colaborador",
      total: 0,
      morning: 0,
      afternoon: 0,
    };
    setTeamData(prev => [...prev, newMember]);
  };

  return (
    <div className="animate-fade-in-up">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-secondary" />
          <h2 className="text-2xl md:text-3xl font-semibold text-foreground">Empresas Acionadas</h2>
        </div>
        <button
          onClick={handleAdd}
          className="flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-colors"
        >
          <Plus className="w-5 h-5" />
          <span className="hidden md:inline">Adicionar</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Team Cards */}
        <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
          {teamData.map((member) => (
            <TeamMemberCard 
              key={member.id} 
              member={member}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
            />
          ))}
        </div>

        {/* Summary Panel */}
        <div className="space-y-4">
          <div className="bg-card rounded-xl p-6 border border-border">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-foreground text-xl">Visão Geral</h3>
              <div className="w-12 h-12 rounded-full bg-secondary/20 flex items-center justify-center">
                <BarChart3 className="w-6 h-6 text-secondary" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-muted rounded-lg p-5 text-center">
                <Users className="w-8 h-8 text-secondary mx-auto mb-2" />
                <p className="text-3xl md:text-4xl font-bold text-secondary">{totalEmpresas}</p>
                <p className="text-sm text-muted-foreground">Empresas acionadas</p>
              </div>
              <div className="bg-muted rounded-lg p-5 text-center">
                <BarChart3 className="w-8 h-8 text-pink-500 mx-auto mb-2" />
                <p className="text-3xl md:text-4xl font-bold text-pink-500">{mediaPorPessoa}</p>
                <p className="text-sm text-muted-foreground">Média por pessoa</p>
              </div>
            </div>

            <p className="text-sm text-muted-foreground mt-4 text-center">
              *Sem repetir nome de empresa entre os comerciais
            </p>
          </div>

          {/* Top Performer */}
          {topPerformer && (
            <div className="bg-gradient-to-br from-gold/20 to-gold/5 rounded-xl p-6 border border-gold/30">
              <p className="text-sm text-gold uppercase tracking-wider mb-2">Top Performer</p>
              <p className="text-xl md:text-2xl font-bold text-foreground">{topPerformer.name}</p>
              <p className="text-3xl md:text-4xl font-bold text-gold">{topPerformer.total} empresas</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};