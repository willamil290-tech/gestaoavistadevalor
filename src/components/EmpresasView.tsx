import { TeamMemberCard, TeamMember } from "./TeamMemberCard";
import { ClipboardPaste, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { isSupabaseConfigured } from "@/lib/supabase";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import type { TeamMember as PersistedMember } from "@/lib/persistence";
import { insertDailyEvent } from "@/lib/persistence";
import { getBusinessDate } from "@/lib/businessDate";
import { parseBulkText, normalizeNameKey } from "@/lib/bulkText";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { useUndoToast } from "@/hooks/useUndoToast";

type BulkMode = "replace" | "sum";

const initialTeamData: TeamMember[] = [
  { id: "1", name: "Alessandra Youssef", total: 29, morning: 29, afternoon: 0 },
  { id: "2", name: "Luciane Mariani", total: 23, morning: 23, afternoon: 0 },
  { id: "3", name: "Samara de Ramos", total: 9, morning: 9, afternoon: 0 },
  { id: "4", name: "Rodrigo Mariani", total: 4, morning: 4, afternoon: 0 },
  { id: "5", name: "Bruna Domingos", total: 3, morning: 3, afternoon: 0 },
  { id: "6", name: "Raissa Flor", total: 1, morning: 1, afternoon: 0 },
];

function genId(prefix = "m") {
  const u = (globalThis.crypto as any)?.randomUUID?.();
  return u ? String(u) : `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export const EmpresasView = ({ tvMode = false }: { tvMode?: boolean }) => {
  const remote = useTeamMembers("empresas");
  const [teamData, setTeamData] = useState<TeamMember[]>(initialTeamData);

  // Bulk UI
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkMode, setBulkMode] = useState<BulkMode>("replace");
  const showUndo = useUndoToast();

  // Sync from Supabase -> local state
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

  const sortedTeamData = useMemo(() => {
    return [...teamData].sort((a, b) => {
      const diff = b.total - a.total;
      if (diff !== 0) return diff;
      return a.name.localeCompare(b.name);
    });
  }, [teamData]);

  const scale = useMemo(() => {
    const n = sortedTeamData.length;
    if (n <= 8) return "lg" as const;
    if (n <= 16) return "md" as const;
    return "sm" as const;
  }, [sortedTeamData.length]);

  const handleUpdate = async (member: TeamMember) => {
    if (!isSupabaseConfigured) {
      setTeamData((prev) => prev.map((m) => (m.id === member.id ? member : m)));
      return;
    }

    const existing = remote.data?.find((m) => m.id === member.id);
    const oldMorning = existing?.morning ?? 0;
    const oldAfternoon = existing?.afternoon ?? 0;

    const persisted: PersistedMember = {
      id: member.id,
      category: "empresas",
      name: member.name,
      morning: member.morning,
      afternoon: member.afternoon,
    };

    await remote.upsertMemberAsync(persisted);

    const dMorning = member.morning - oldMorning;
    const dAfternoon = member.afternoon - oldAfternoon;
    if (dMorning !== 0 || dAfternoon !== 0) {
      await insertDailyEvent({
        businessDate: getBusinessDate(),
        scope: "empresas",
        kind: "single",
        memberId: member.id,
        deltaMorning: dMorning,
        deltaAfternoon: dAfternoon,
      });
    }
  };

  const handleDelete = async (id: string) => {
    if (isSupabaseConfigured) {
      await remote.deleteMemberAsync(id);
      return;
    }
    setTeamData((prev) => prev.filter((m) => m.id !== id));
  };

  const handleAdd = async () => {
    if (isSupabaseConfigured) {
      await remote.addMemberAsync();
      toast.success("Colaborador adicionado");
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

  const applyBulk = async () => {
    const entries = parseBulkText(bulkText);
    if (entries.length === 0) {
      toast.error("Cole um texto válido (nome, manhã e tarde)");
      return;
    }

    if (!isSupabaseConfigured) {
      // Local fallback
      setTeamData((prev) => {
        const map = new Map(prev.map((m) => [normalizeNameKey(m.name), m]));
        for (const e of entries) {
          const key = normalizeNameKey(e.name);
          const existing = map.get(key);
          if (existing) {
            const morning = bulkMode === "sum" ? existing.morning + e.morning : e.morning;
            const afternoon = bulkMode === "sum" ? existing.afternoon + e.afternoon : e.afternoon;
            map.set(key, { ...existing, morning, afternoon, total: morning + afternoon });
          } else {
            const id = genId("emp");
            map.set(key, { id, name: e.name, morning: e.morning, afternoon: e.afternoon, total: e.morning + e.afternoon });
          }
        }
        return Array.from(map.values());
      });

      setBulkOpen(false);
      setBulkText("");
      toast.success("Atualizado");
      return;
    }

    const businessDate = getBusinessDate();
    const existingByName = new Map<string, PersistedMember>();
    for (const m of remote.data ?? []) existingByName.set(normalizeNameKey(m.name), m);

    const createdIds: string[] = [];
    const changedSnapshots: PersistedMember[] = [];
    const appliedDeltas: Array<{ id: string; dm: number; da: number; created: boolean }> = [];

    for (const e of entries) {
      const key = normalizeNameKey(e.name);
      const existing = existingByName.get(key);

      if (existing) {
        const oldM = existing.morning;
        const oldA = existing.afternoon;
        const newM = bulkMode === "sum" ? oldM + e.morning : e.morning;
        const newA = bulkMode === "sum" ? oldA + e.afternoon : e.afternoon;

        const dm = newM - oldM;
        const da = newA - oldA;

        changedSnapshots.push({ ...existing });
        await remote.upsertMemberAsync({ ...existing, morning: newM, afternoon: newA });
        await insertDailyEvent({
          businessDate,
          scope: "empresas",
          kind: "bulk",
          memberId: existing.id,
          deltaMorning: dm,
          deltaAfternoon: da,
        });
        appliedDeltas.push({ id: existing.id, dm, da, created: false });
      } else {
        const id = genId("emp");
        const newMember: PersistedMember = {
          id,
          category: "empresas",
          name: e.name,
          morning: e.morning,
          afternoon: e.afternoon,
        };
        createdIds.push(id);
        await remote.upsertMemberAsync(newMember);
        await insertDailyEvent({
          businessDate,
          scope: "empresas",
          kind: "bulk",
          memberId: id,
          deltaMorning: e.morning,
          deltaAfternoon: e.afternoon,
        });
        appliedDeltas.push({ id, dm: e.morning, da: e.afternoon, created: true });
      }
    }

    setBulkOpen(false);
    setBulkText("");
    toast.success(`Atualizado: ${entries.length} colaborador(es)`);

    // Undo
    showUndo({
      message: "Atualização aplicada",
      onUndo: async () => {
        // Delete created
        for (const id of createdIds) {
          await remote.deleteMemberAsync(id);
          await insertDailyEvent({
            businessDate,
            scope: "empresas",
            kind: "undo",
            memberId: id,
            deltaMorning: 0,
            deltaAfternoon: 0,
          });
        }
        // Restore changed
        for (const snap of changedSnapshots) {
          await remote.upsertMemberAsync(snap);
        }
        for (const d of appliedDeltas) {
          if (d.created) continue;
          await insertDailyEvent({
            businessDate,
            scope: "empresas",
            kind: "undo",
            memberId: d.id,
            deltaMorning: -d.dm,
            deltaAfternoon: -d.da,
          });
        }
        toast.success("Restaurado");
      },
    });
  };

  return (
    <div className="animate-fade-in-up">
      <div className={"flex items-center justify-between mb-5"}>
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-secondary" />
          <h2 className="text-2xl md:text-3xl font-semibold text-foreground">Empresas Acionadas</h2>
        </div>

        {!tvMode && (
          <div className="flex items-center gap-2">
            <Button variant="outline" className="rounded-xl" onClick={() => setBulkOpen(true)}>
              <ClipboardPaste className="w-4 h-4 mr-2" />
              Colar texto
            </Button>

            <Button onClick={handleAdd} className="bg-secondary hover:bg-secondary/90 text-secondary-foreground rounded-xl">
              <Plus className="w-5 h-5 mr-2" />
              <span className="hidden md:inline">Adicionar</span>
            </Button>
          </div>
        )}
      </div>

      <div className={"grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4"}>
        {sortedTeamData.map((member, idx) => (
          <TeamMemberCard
            key={member.id}
            member={member}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
            rank={idx + 1}
            scale={scale}
            readOnly={tvMode}
          />
        ))}
      </div>

      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Atualização rápida (Empresas)</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Modo</Label>
              <RadioGroup value={bulkMode} onValueChange={(v) => setBulkMode(v as BulkMode)} className="flex gap-4">
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="replace" id="emp-replace" />
                  <Label htmlFor="emp-replace">Substituir</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="sum" id="emp-sum" />
                  <Label htmlFor="emp-sum">Somar</Label>
                </div>
              </RadioGroup>
            </div>

            <Textarea
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              placeholder={`Cole aqui no padrão:\n\nAlessandra Youssef\n\nManhã: 0 empresas únicas\n\nTarde: 2 empresas únicas`}
              className="min-h-[240px]"
            />
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setBulkOpen(false)}>Cancelar</Button>
            <Button onClick={applyBulk} className="bg-secondary hover:bg-secondary/90">Aplicar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
