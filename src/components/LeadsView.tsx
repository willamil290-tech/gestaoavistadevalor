import { TeamMemberCard, TeamMember } from "./TeamMemberCard";
import { BarChart3, Users, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { isSupabaseConfigured } from "@/lib/supabase";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import type { TeamMember as PersistedMember } from "@/lib/persistence";

const initialLeadsData: TeamMember[] = [
  { id: "l1", name: "Sabrina Fulas", total: 45, morning: 45, afternoon: 0 },
  { id: "l2", name: "Nayad Souza", total: 41, morning: 41, afternoon: 0 },
  { id: "l3", name: "Caio Zapelini", total: 14, morning: 14, afternoon: 0 },
  { id: "l4", name: "Alana Silveira", total: 16, morning: 16, afternoon: 0 },
];

export const LeadsView = () => {
  const remote = useTeamMembers("leads");
  const [leadsData, setLeadsData] = useState<TeamMember[]>(initialLeadsData);

  // Sincroniza do Supabase -> state local
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const data = remote.data;
    if (!data) return;
    const mapped: TeamMember[] = data.map((m) => ({
      id: m.id,
      name: m.name,
      morning: m.morning,
      afternoon: m.afternoon,
      total: m.morning + m.afternoon,
    }));
    setLeadsData(mapped);
  }, [remote.data]);

  const totalLeads = leadsData.reduce((acc, member) => acc + member.total, 0);
  const mediaPorPessoa = leadsData.length > 0 ? (totalLeads / leadsData.length).toFixed(0) : "0";
  const topPerformer = leadsData.length > 0 ? [...leadsData].sort((a, b) => b.total - a.total)[0] : null;

  const handleUpdate = (updatedMember: TeamMember) => {
    if (isSupabaseConfigured) {
      const payload: PersistedMember = {
        id: updatedMember.id,
        category: "leads",
        name: updatedMember.name,
        morning: updatedMember.morning,
        afternoon: updatedMember.afternoon,
      };
      remote.upsertMember(payload);
      return;
    }
    setLeadsData(prev => prev.map(m => m.id === updatedMember.id ? updatedMember : m));
  };

  const handleDelete = (id: string) => {
    if (isSupabaseConfigured) {
      remote.deleteMember(id);
      return;
    }
    setLeadsData(prev => prev.filter(m => m.id !== id));
  };

  const handleAdd = () => {
    if (isSupabaseConfigured) {
      remote.addMember();
      return;
    }
    const newMember: TeamMember = {
      id: Date.now().toString(),
      name: "Novo Colaborador",
      total: 0,
      morning: 0,
      afternoon: 0,
    };
    setLeadsData(prev => [...prev, newMember]);
  };

  return (
    <div className="animate-fade-in-up">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-gold" />
          <h2 className="text-2xl md:text-3xl font-semibold text-foreground">Leads Acionados</h2>
        </div>
        <button
          onClick={handleAdd}
          className="flex items-center gap-2 px-4 py-2 bg-gold text-primary-foreground rounded-lg hover:bg-gold/80 transition-colors"
        >
          <Plus className="w-5 h-5" />
          <span className="hidden md:inline">Adicionar</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Team Cards */}
        <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
          {leadsData.map((member) => (
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
              <div className="w-12 h-12 rounded-full bg-gold/20 flex items-center justify-center">
                <BarChart3 className="w-6 h-6 text-gold" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-muted rounded-lg p-5 text-center">
                <Users className="w-8 h-8 text-gold mx-auto mb-2" />
                <p className="text-3xl md:text-4xl font-bold text-gold">{totalLeads}</p>
                <p className="text-sm text-muted-foreground">Leads acionados</p>
              </div>
              <div className="bg-muted rounded-lg p-5 text-center">
                <BarChart3 className="w-8 h-8 text-pink-500 mx-auto mb-2" />
                <p className="text-3xl md:text-4xl font-bold text-pink-500">{mediaPorPessoa}</p>
                <p className="text-sm text-muted-foreground">Média por pessoa</p>
              </div>
            </div>

            <p className="text-sm text-muted-foreground mt-4 text-center">
              *Total de leads acionados pela equipe
            </p>
          </div>

          {/* Top Performer */}
          {topPerformer && (
            <div className="bg-gradient-to-br from-gold/20 to-gold/5 rounded-xl p-6 border border-gold/30">
              <p className="text-sm text-gold uppercase tracking-wider mb-2">Top Performer</p>
              <p className="text-xl md:text-2xl font-bold text-foreground">{topPerformer.name}</p>
              <p className="text-3xl md:text-4xl font-bold text-gold">{topPerformer.total} leads</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};