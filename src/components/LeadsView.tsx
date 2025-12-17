import { TeamMemberCard, TeamMember } from "./TeamMemberCard";
import { Plus } from "lucide-react";
import { BulkPasteUpdater } from "./BulkPasteUpdater";
import { normalizeName, type BulkEntry } from "@/lib/bulkParse";
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

  const sortedLeadsData = [...leadsData].sort((a, b) => {
    const diff = b.total - a.total;
    if (diff !== 0) return diff;
    return a.name.localeCompare(b.name);
  });

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


  const applyBulk = async (entries: BulkEntry[]) => {
    const byName = new Map<string, TeamMember>();
    for (const m of leadsData) byName.set(normalizeName(m.name), m);

    let next = [...leadsData];

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
          next = next.map((m) => (m.id === updated.id ? updated : m));

          const payload: PersistedMember = {
            id: updated.id,
            category: "leads",
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
            category: "leads",
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

    setLeadsData(next);
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

      <BulkPasteUpdater
        title="Atualização rápida (colar texto)"
        subtitle="Cole o texto no padrão e clique em Aplicar para atualizar Manhã e Tarde automaticamente."
        onApply={applyBulk}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
        {sortedLeadsData.map((member) => (
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