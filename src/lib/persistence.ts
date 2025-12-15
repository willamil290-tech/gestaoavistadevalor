import { supabase, isSupabaseConfigured } from "@/lib/supabase";

export type DashboardSettings = {
  metaMes: number;
  metaDia: number;
  atingidoMes: number;
  atingidoDia: number;
};

export type TeamCategory = "empresas" | "leads";

export type TeamMember = {
  id: string;
  category: TeamCategory;
  name: string;
  morning: number;
  afternoon: number;
};

// Defaults atuais do app (para primeiro uso / seed)
export const DEFAULT_SETTINGS: DashboardSettings = {
  metaMes: 15800000,
  metaDia: 1053333.33,
  atingidoMes: 5556931.1,
  atingidoDia: 292434.31,
};

export const DEFAULT_EMPRESAS: TeamMember[] = [
  { id: "1", category: "empresas", name: "Alessandra Youssef", morning: 29, afternoon: 0 },
  { id: "2", category: "empresas", name: "Luciane Mariani", morning: 23, afternoon: 0 },
  { id: "3", category: "empresas", name: "Samara de Ramos", morning: 9, afternoon: 0 },
  { id: "4", category: "empresas", name: "Rodrigo Mariani", morning: 4, afternoon: 0 },
  { id: "5", category: "empresas", name: "Bruna Domingos", morning: 3, afternoon: 0 },
  { id: "6", category: "empresas", name: "Raissa Flor", morning: 1, afternoon: 0 },
];

export const DEFAULT_LEADS: TeamMember[] = [
  { id: "l1", category: "leads", name: "Sabrina Fulas", morning: 45, afternoon: 0 },
  { id: "l2", category: "leads", name: "Nayad Souza", morning: 41, afternoon: 0 },
  { id: "l3", category: "leads", name: "Caio Zapelini", morning: 14, afternoon: 0 },
  { id: "l4", category: "leads", name: "Alana Silveira", morning: 16, afternoon: 0 },
];

const SETTINGS_KEY = "default";

function assertConfigured() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error(
      "Supabase não configurado. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY nas variáveis de ambiente."
    );
  }
}

export async function getDashboardSettings(): Promise<DashboardSettings> {
  assertConfigured();

  const { data, error } = await supabase!
    .from("dashboard_settings")
    .select("meta_mes, meta_dia, atingido_mes, atingido_dia")
    .eq("key", SETTINGS_KEY)
    .maybeSingle();

  if (error) throw error;

  // Se ainda não existir, cria com default
  if (!data) {
    const { error: insertError } = await supabase!
      .from("dashboard_settings")
      .insert({
        key: SETTINGS_KEY,
        meta_mes: DEFAULT_SETTINGS.metaMes,
        meta_dia: DEFAULT_SETTINGS.metaDia,
        atingido_mes: DEFAULT_SETTINGS.atingidoMes,
        atingido_dia: DEFAULT_SETTINGS.atingidoDia,
      });
    if (insertError) throw insertError;
    return DEFAULT_SETTINGS;
  }

  return {
    metaMes: Number(data.meta_mes ?? 0),
    metaDia: Number(data.meta_dia ?? 0),
    atingidoMes: Number(data.atingido_mes ?? 0),
    atingidoDia: Number(data.atingido_dia ?? 0),
  };
}

export async function updateDashboardSettings(patch: Partial<DashboardSettings>) {
  assertConfigured();

  const payload: Record<string, number> = {};
  if (typeof patch.metaMes === "number") payload.meta_mes = patch.metaMes;
  if (typeof patch.metaDia === "number") payload.meta_dia = patch.metaDia;
  if (typeof patch.atingidoMes === "number") payload.atingido_mes = patch.atingidoMes;
  if (typeof patch.atingidoDia === "number") payload.atingido_dia = patch.atingidoDia;

  const { error } = await supabase!
    .from("dashboard_settings")
    .update(payload)
    .eq("key", SETTINGS_KEY);
  if (error) throw error;
}

export async function listTeamMembers(category: TeamCategory): Promise<TeamMember[]> {
  assertConfigured();

  const { data, error } = await supabase!
    .from("team_members")
    .select("id, category, name, morning, afternoon")
    .eq("category", category)
    .order("name", { ascending: true });

  if (error) throw error;

  const rows = (data ?? []).map((r) => ({
    id: String(r.id),
    category: (r.category as TeamCategory) ?? category,
    name: String(r.name ?? ""),
    morning: Number(r.morning ?? 0),
    afternoon: Number(r.afternoon ?? 0),
  }));

  // Seed se estiver vazio
  if (rows.length === 0) {
    const seed = category === "empresas" ? DEFAULT_EMPRESAS : DEFAULT_LEADS;
    const { error: insertError } = await supabase!
      .from("team_members")
      .insert(seed.map((m) => ({ ...m })));
    if (insertError) throw insertError;
    return seed;
  }

  return rows;
}

export async function upsertTeamMember(member: TeamMember) {
  assertConfigured();

  const { error } = await supabase!
    .from("team_members")
    .upsert(
      {
        id: member.id,
        category: member.category,
        name: member.name,
        morning: member.morning,
        afternoon: member.afternoon,
      },
      { onConflict: "id" }
    );
  if (error) throw error;
}

export async function addTeamMember(category: TeamCategory): Promise<TeamMember> {
  assertConfigured();

  const id = (globalThis.crypto?.randomUUID?.() ?? Date.now().toString()) as string;
  const newMember: TeamMember = {
    id,
    category,
    name: "Novo Colaborador",
    morning: 0,
    afternoon: 0,
  };

  const { error } = await supabase!.from("team_members").insert(newMember);
  if (error) throw error;
  return newMember;
}

export async function deleteTeamMember(id: string) {
  assertConfigured();
  const { error } = await supabase!.from("team_members").delete().eq("id", id);
  if (error) throw error;
}
