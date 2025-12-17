import { TeamMemberCard, TeamMember } from "./TeamMemberCard";
import { Plus } from "lucide-react";
import { BulkPasteUpdater } from "./BulkPasteUpdater";
import { normalizeName, type BulkEntry } from "@/lib/bulkParse";
import { useEffect, useState } from "react";
import { isSupabaseConfigured } from "@/lib/supabase";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import type { TeamMember as PersistedMember } from "@/lib/persistence";

const initialTeamData: TeamMember[] = [
  { id: "1", name: "Alessandra Youssef", total: 29, morning: 29, afternoon: 0 },
  { id: "2", name: "Luciane Mariani", total: 23, morning: 23, afternoon: 0 },
  { id: "3", name: "Samara de Ramos", total: 9, morning: 9, afternoon: 0 },
  { id: "4", name: "Rodrigo Mariani", total: 4, morning: 4, afternoon: 0 },
  { id: "5", name: "Bruna Domingos", total: 3, morning: 3, afternoon: 0 },
  { id: "6", name: "Raissa Flor", total: 1, morning: 1, afternoon: 0 },
];

export const EmpresasView = () => {
  const remote = useTeamMembers("empresas");
  const [teamData, setTeamData] = useState<TeamMember[]>(initialTeamData);

  // Sincroniza do Supabase -> state local (para manter o componente e o card quase iguais)
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
    setTeamData(mapped);
  }, [remote.data]);

  const sortedTeamData = [...teamData].sort((a, b) => {
    const diff = b.total - a.total;
    if (diff !== 0) return diff;
    return a.name.localeCompare(b.name);
  });

  const handleUpdate = (updatedMember: TeamMember) => {
    if (isSupabaseConfigured) {
      const payload: PersistedMember = {
        id: updatedMember.id,
        category: "empresas",
        name: updatedMember.name,
        morning: updatedMember.morning,
        afternoon: updatedMember.afternoon,
      };
      remote.upsertMember(payload);
      return;
    }
    setTeamData((prev) => prev.map((m) => (m.id === updatedMember.id ? updatedMember : m)));
  };

  const handleDelete = (id: string) => {
    if (isSupabaseConfigured) {
      remote.deleteMember(id);
      return;
    }
    setTeamData((prev) => prev.filter((m) => m.id !== id));
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
    setTeamData((prev) => [...prev, newMember]);
  };


  const applyBulk = async (entries: BulkEntry[]) => {
    const byName = new Map<string, TeamMember>();
    for (const m of teamData) byName.set(normalizeName(m.name), m);

    // copia local para refletir já na tela
    let next = [...teamData];

    for (const e of entries) {
      const key = normalizeName(e.name);
      const existing = byName.get(key);

      if (isSupabaseConfigured) {
        if (existing) {
          const updated: TeamMember = {
            ...existing,
            name: e.name,
            morning: e.morning,
            afternoon: e.afternoon,
            total: e.morning + e.afternoon,
          };
          // atualiza local
          next = next.map((m) => (m.id === updated.id ? updated : m));

          const payload: PersistedMember = {
            id: updated.id,
            category: "empresas",
            name: updated.name,
            morning: updated.morning,
            afternoon: updated.afternoon,
          };
          await remote.upsertMemberAsync(payload);
        } else {
          const created = await remote.addMember();
          const newLocal: TeamMember = {
            id: created.id,
            name: e.name,
            morning: e.morning,
            afternoon: e.afternoon,
            total: e.morning + e.afternoon,
          };
          next = [...next, newLocal];

          const payload: PersistedMember = {
            id: created.id,
            category: "empresas",
            name: e.name,
            morning: e.morning,
            afternoon: e.afternoon,
          };
          await remote.upsertMemberAsync(payload);
        }
      } else {
        if (existing) {
          const updated: TeamMember = {
            ...existing,
            name: e.name,
            morning: e.morning,
            afternoon: e.afternoon,
            total: e.morning + e.afternoon,
          };
          next = next.map((m) => (m.id === updated.id ? updated : m));
        } else {
          const newMember: TeamMember = {
            id: Date.now().toString() + Math.random().toString(16).slice(2),
            name: e.name,
            morning: e.morning,
            afternoon: e.afternoon,
            total: e.morning + e.afternoon,
          };
          next = [...next, newMember];
        }
      }
    }

    setTeamData(next);
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

      <BulkPasteUpdater
        title="Atualização rápida (colar texto)"
        subtitle="Cole o texto no padrão e clique em Aplicar para atualizar Manhã e Tarde automaticamente."
        onApply={applyBulk}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
        {sortedTeamData.map((member) => (
          <TeamMemberCard 
            key={member.id} 
            member={member}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
          />
        ))}
      </div>
    </div>
  );
};