import { TeamMemberCard, TeamMember } from "./TeamMemberCard";
import { ClipboardPaste, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { isSupabaseConfigured } from "@/lib/supabase";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import type { TeamMember as PersistedMember } from "@/lib/persistence";
import { insertDailyEvent } from "@/lib/persistence";
import { getBusinessDate } from "@/lib/businessDate";
import { parseBulkText, normalizeNameKey } from "@/lib/bulkText";
import { parseNameTag } from "@/lib/parseNameTag";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { useUndoToast } from "@/hooks/useUndoToast";

type BulkMode = "replace" | "sum";

const initialLeadsData: TeamMember[] = [
  { id: "l1", name: "Sabrina Fulas", total: 45, morning: 45, afternoon: 0 },
  { id: "l2", name: "Nayad Souza", total: 41, morning: 41, afternoon: 0 },
  { id: "l3", name: "Caio Zapelini", total: 14, morning: 14, afternoon: 0 },
  { id: "l4", name: "Alana Silveira", total: 16, morning: 16, afternoon: 0 },
];

function genId(prefix = "lead") {
  const u = (globalThis.crypto as any)?.randomUUID?.();
  return u ? String(u) : `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export const LeadsView = ({ tvMode = false }: { tvMode?: boolean }) => {
  const remote = useTeamMembers("leads");
  const [leadsData, setLeadsData] = useState<TeamMember[]>(initialLeadsData);

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
    setLeadsData(mapped);
  }, [remote.data]);

  // Atalho Ctrl+Shift+U / Cmd+Shift+U
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMac = /mac/i.test(navigator.platform);
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (mod && e.shiftKey && (e.key === "u" || e.key === "U")) {
        e.preventDefault();
        if (!tvMode) setBulkOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [tvMode]);

  const sortedLeadsData = useMemo(() => {
    return [...leadsData].sort((a, b) => {
      const diff = b.total - a.total;
      if (diff !== 0) return diff;
      return a.name.localeCompare(b.name);
    });
  }, [leadsData]);

  const scale = useMemo(() => {
    const n = sortedLeadsData.length;
    if (n <= 8) return "lg" as const;
    if (n <= 16) return "md" as const;
    return "sm" as const;
  }, [sortedLeadsData.length]);

  const handleUpdate = async (member: TeamMember) => {
    if (!isSupabaseConfigured) {
      setLeadsData((prev) => prev.map((m) => (m.id === member.id ? member : m)));
      return;
    }

    const existing = remote.data?.find((m) => m.id === member.id);
    const oldMorning = existing?.morning ?? 0;
    const oldAfternoon = existing?.afternoon ?? 0;

    const persisted: PersistedMember = {
      id: member.id,
      category: "leads",
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
        scope: "leads",
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
    setLeadsData((prev) => prev.filter((m) => m.id !== id));
  };

  const handleAdd = async () => {
    if (isSupabaseConfigured) {
      await remote.addMemberAsync();
      toast.success("Colaborador adicionado");
      return;
    }
    const newMember: TeamMember = {
      id: genId("lead"),
      name: "Novo Colaborador",
      total: 0,
      morning: 0,
      afternoon: 0,
    };
    setLeadsData((prev) => [...prev, newMember]);
  };

  const applyBulk = async () => {
    const entries = parseBulkText(bulkText);
    if (entries.length === 0) {
      toast.error("Cole um texto válido (nome, manhã e tarde)");
      return;
    }

    const beforeLocal = leadsData.map((m) => ({ ...m }));
    const beforeRemote = (remote.data ?? []).map((m) => ({ ...m }));

    if (!isSupabaseConfigured) {
      setLeadsData((prev) => {
        const map = new Map(prev.map((m) => [normalizeNameKey(m.name), m]));
        for (const e of entries) {
          const parsed = parseNameTag(e.name);
          // Se veio TAG desconhecida, ignora o bloco
          if (parsed.hasTag && parsed.category === null) continue;
          // Se veio TAG e NÃO é desta aba, ignora o bloco
          if (parsed.category && parsed.category !== "leads") continue;

		  const baseName = parsed.baseName;
		  const key = normalizeNameKey(baseName);
          const existing = map.get(key);
          if (existing) {
            const morning = bulkMode === "sum" ? existing.morning + e.morning : e.morning;
            const afternoon = bulkMode === "sum" ? existing.afternoon + e.afternoon : e.afternoon;
            map.set(key, { ...existing, morning, afternoon, total: morning + afternoon });
          } else {
            const id = genId("le");
			map.set(key, { id, name: baseName, morning: e.morning, afternoon: e.afternoon, total: e.morning + e.afternoon });
          }
        }
        return Array.from(map.values());
      });

      setBulkOpen(false);
      setBulkText("");
      toast.success("Atualizado");

      showUndo({
        message: "Atualização aplicada",
        onUndo: () => setLeadsData(beforeLocal),
      });
      return;
    }

    const businessDate = getBusinessDate();
    const existingByName = new Map<string, PersistedMember>();
    for (const m of remote.data ?? []) existingByName.set(normalizeNameKey(m.name), m);

    for (const e of entries) {
      const parsed = parseNameTag(e.name);
      // Se veio TAG desconhecida, ignora o bloco
      if (parsed.hasTag && parsed.category === null) continue;
      // Se veio TAG e NÃO é desta aba, ignora o bloco
      if (parsed.category && parsed.category !== "leads") continue;

	  const baseName = parsed.baseName;
	  const key = normalizeNameKey(baseName);
      const existing = existingByName.get(key);

      if (existing) {
        const oldM = existing.morning;
        const oldA = existing.afternoon;
        const newM = bulkMode === "sum" ? oldM + e.morning : e.morning;
        const newA = bulkMode === "sum" ? oldA + e.afternoon : e.afternoon;

        const dm = newM - oldM;
        const da = newA - oldA;

        await remote.upsertMemberAsync({ ...existing, morning: newM, afternoon: newA });

        if (dm !== 0 || da !== 0) {
          await insertDailyEvent({
            businessDate,
            scope: "leads",
            kind: "bulk",
            memberId: existing.id,
            deltaMorning: dm,
            deltaAfternoon: da,
          });
        }
      } else {
        const id = genId("lead");
        const newMember: PersistedMember = {
          id,
          category: "leads",
		  name: baseName,
          morning: e.morning,
          afternoon: e.afternoon,
        };
        await remote.upsertMemberAsync(newMember);

        await insertDailyEvent({
          businessDate,
          scope: "leads",
          kind: "bulk",
          memberId: id,
          deltaMorning: e.morning,
          deltaAfternoon: e.afternoon,
        });
      }
    }

    setBulkOpen(false);
    setBulkText("");
    toast.success(`Atualizado: ${entries.length} colaborador(es)`);

    showUndo({
      message: "Atualização aplicada",
      onUndo: async () => {
        for (const m of beforeRemote) await remote.upsertMemberAsync(m);
      },
    });
  };

  return (
    <div className="animate-fade-in-up">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-gold" />
          <h2 className="text-2xl md:text-3xl font-semibold text-foreground">Leads Acionados</h2>
        </div>

        {!tvMode && (
          <div className="flex items-center gap-2">
            <Button variant="outline" className="rounded-xl" onClick={() => setBulkOpen(true)}>
              <ClipboardPaste className="w-4 h-4 mr-2" />
              Colar texto
            </Button>

            <Button onClick={handleAdd} className="bg-gold hover:bg-gold/90 text-background rounded-xl">
              <Plus className="w-5 h-5 mr-2" />
              <span className="hidden md:inline">Adicionar</span>
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
        {sortedLeadsData.map((member) => (
          <TeamMemberCard
            key={member.id}
            member={member}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
            scale={scale}
            readOnly={tvMode}
          />
        ))}
      </div>

      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Atualização rápida (Leads)</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Modo</Label>
              <RadioGroup value={bulkMode} onValueChange={(v) => setBulkMode(v as BulkMode)} className="flex gap-4">
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="replace" id="le-replace" />
                  <Label htmlFor="le-replace">Substituir</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="sum" id="le-sum" />
                  <Label htmlFor="le-sum">Somar</Label>
                </div>
              </RadioGroup>
            </div>

            <Textarea
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              placeholder={`Cole aqui no padrão:\n\nLuciane Mariani\n\nManhã: 0 leads únicos\n\nTarde: 1 lead único`}
              className="min-h-[240px]"
            />
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setBulkOpen(false)}>Cancelar</Button>
            <Button onClick={applyBulk} className="bg-gold hover:bg-gold/90 text-background">Aplicar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
