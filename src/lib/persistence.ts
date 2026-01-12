import { supabase, isSupabaseConfigured } from "@/lib/supabase";

let dailyEventsDisabled = false;
let dashboardExtrasDisabled = false;
const isMissingDailyEventsError = (msg?: string) => {
  const m = String(msg ?? "");
  return m.includes("daily_events") && (m.includes("Could not find the table") || m.includes("schema cache") || m.includes("404"));
};
const isMissingDashboardExtrasError = (msg?: string) => {
  const m = String(msg ?? "");
  // Column missing on dashboard_settings (e.g., "column dashboard_settings.commercials does not exist")
  return (
    m.includes("dashboard_settings") &&
    (m.includes("does not exist") || m.includes("schema cache") || m.includes("42703"))
  );
};
export const isDailyEventsEnabled = () => !dailyEventsDisabled;
export const isDashboardExtrasEnabled = () => !dashboardExtrasDisabled;


export type DashboardSettings = {
  metaMes: number;
  metaDia: number;
  atingidoMes: number;
  atingidoDia: number;
};

// Extras persistidos como JSONB no mesmo registro de dashboard_settings (key='default')
// Motivo: evita criar várias tabelas novas e simplifica o sync.
export type CommercialGroup = "executivo" | "cs" | "closer";

export type CommercialProgress = {
  id: string;
  name: string;
  currentValue: number;
  goal: number;
  group: CommercialGroup;
};

export type FaixaVencimentoRow = {
  faixa: string;
  valorMes: number;
  valorDia: number;
};

export type ClienteBorderoRow = {
  id: string;
  cliente: string;
  comercial: string;
  valor: number;
  horario: string;
  observacao: string;
};

export type AgendadaRealizadaRow = {
  label: string;
  agendadas: number;
  realizadas: number;
};

export type HourlyTrendRow = {
  hour: string;
  actions: number;
};

export type AcionamentoCategoriaRow = { tipo: string; quantidade: number };

export type ColaboradorAcionamentoRow = {
  id: string;
  name: string;
  total: number;
  categorias: AcionamentoCategoriaRow[];
};

export type DashboardExtras = {
  commercials: CommercialProgress[];
  faixas: FaixaVencimentoRow[];
  clientes: ClienteBorderoRow[];
  acionamentoDetalhado: ColaboradorAcionamentoRow[];
  agendadasMes: AgendadaRealizadaRow[];
  agendadasDia: AgendadaRealizadaRow[];
  trendData: HourlyTrendRow[];
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

export const DEFAULT_EXTRAS: DashboardExtras = {
  commercials: [],
  faixas: [],
  clientes: [],
  acionamentoDetalhado: [],
  agendadasMes: [],
  agendadasDia: [],
  trendData: [],
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
        updated_at: new Date().toISOString(),
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

  const payload: Record<string, any> = {};
  payload.updated_at = new Date().toISOString();
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

/**
 * Carrega extras (comerciais, faixas, clientes, etc.) a partir do mesmo registro
 * de dashboard_settings (key='default').
 *
 * Se as colunas ainda não existirem no Supabase, o app continua funcionando,
 * porém sem persistir esses extras (dashboardExtrasDisabled=true).
 */
export async function getDashboardExtras(): Promise<DashboardExtras> {
  if (!isSupabaseConfigured || dashboardExtrasDisabled) return DEFAULT_EXTRAS;

  try {
    assertConfigured();
    const { data, error } = await supabase!
      .from("dashboard_settings")
      .select("commercials, faixas, clientes, acionamento_detalhado, agendadas_mes, agendadas_dia")
      .eq("key", SETTINGS_KEY)
      .maybeSingle();

    if (error) {
      if (isMissingDashboardExtrasError(error.message)) dashboardExtrasDisabled = true;
      return DEFAULT_EXTRAS;
    }

        // trend_data é opcional (coluna pode não existir). Tentamos ler sem derrubar os outros extras.
    let trendData: HourlyTrendRow[] = [];
    try {
      const { data: td, error: tdErr } = await supabase!
        .from("dashboard_settings")
        .select("trend_data")
        .eq("key", SETTINGS_KEY)
        .maybeSingle();
      if (!tdErr) trendData = (td?.trend_data ?? []) as HourlyTrendRow[];
    } catch {
      // ignore
    }

    return {
      commercials: (data?.commercials ?? []) as CommercialProgress[],
      faixas: (data?.faixas ?? []) as FaixaVencimentoRow[],
      clientes: (data?.clientes ?? []) as ClienteBorderoRow[],
      acionamentoDetalhado: (data?.acionamento_detalhado ?? []) as ColaboradorAcionamentoRow[],
      agendadasMes: (data?.agendadas_mes ?? []) as AgendadaRealizadaRow[],
      agendadasDia: (data?.agendadas_dia ?? []) as AgendadaRealizadaRow[],
      trendData,
    };
  } catch (e: any) {
    if (isMissingDashboardExtrasError(e?.message)) dashboardExtrasDisabled = true;
    return DEFAULT_EXTRAS;
  }
}

export async function updateDashboardExtras(patch: Partial<DashboardExtras>) {
  if (!isSupabaseConfigured || dashboardExtrasDisabled) return;
  assertConfigured();

  const payload: Record<string, any> = { updated_at: new Date().toISOString() };
  if (patch.commercials) payload.commercials = patch.commercials;
  if (patch.faixas) payload.faixas = patch.faixas;
  if (patch.clientes) payload.clientes = patch.clientes;
  if (patch.acionamentoDetalhado) payload.acionamento_detalhado = patch.acionamentoDetalhado;
  if (patch.agendadasMes) payload.agendadas_mes = patch.agendadasMes;
  if (patch.agendadasDia) payload.agendadas_dia = patch.agendadasDia;

  // trend_data é opcional (coluna pode não existir).
  // Mantemos update separado para não derrubar outros campos se a coluna não existir.
  const trendPatch = patch.trendData;

  const { error } = await supabase!
    .from("dashboard_settings")
    .update(payload)
    .eq("key", SETTINGS_KEY);

  if (error) {
    if (isMissingDashboardExtrasError(error.message)) {
      dashboardExtrasDisabled = true;
      return;
    }
    throw error;
  }

  if (trendPatch) {
    try {
      const { error: tErr } = await supabase!
        .from("dashboard_settings")
        .update({ updated_at: new Date().toISOString(), trend_data: trendPatch })
        .eq("key", SETTINGS_KEY);

      // Se a coluna não existir, ignoramos silenciosamente (não desabilita os extras).
      if (tErr) {
        const msg = String(tErr.message ?? "");
        const isMissingTrend = msg.includes("trend_data") && (msg.includes("does not exist") || msg.includes("42703") || msg.includes("schema cache"));
        if (!isMissingTrend) throw tErr;
      }
    } catch {
      // ignore (ex.: coluna não existe)
    }
  }
}

export async function listTeamMembers(category: TeamCategory): Promise<TeamMember[]> {
  assertConfigured();

  const { data, error } = await supabase!
    .from("team_members")
    .select("id, category, name, morning, afternoon")
    .eq("category", category);

  if (error) throw error;

  const rows = (data ?? []).map((r) => ({
    id: String(r.id),
    category: (r.category as TeamCategory) ?? category,
    name: String(r.name ?? ""),
    morning: Number(r.morning ?? 0),
    afternoon: Number(r.afternoon ?? 0),
  }));

  // Ordena sempre pelo total (manhã + tarde), desc.
  rows.sort((a, b) => {
    const diff = (b.morning + b.afternoon) - (a.morning + a.afternoon);
    if (diff !== 0) return diff;
    return a.name.localeCompare(b.name);
  });

  // Seed se estiver vazio
  if (rows.length === 0) {
    const seed = category === "empresas" ? DEFAULT_EMPRESAS : DEFAULT_LEADS;
    const { error: insertError } = await supabase!
      .from("team_members")
      .insert(seed.map((m) => ({ ...m, updated_at: new Date().toISOString() })) );
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
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );
  if (error) throw error;
}

export async function addTeamMember(category: TeamCategory): Promise<TeamMember> {
  assertConfigured();

  const id = (globalThis.crypto?.randomUUID?.() ?? Date.now().toString()) as string;
  const newMember: any = {
    id,
    category,
    name: "Novo Colaborador",
    morning: 0,
    afternoon: 0,
    updated_at: new Date().toISOString(),
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


export type DailyEventScope = "empresas" | "leads" | "bordero";
export type DailyEventKind = "bulk" | "single" | "reset" | "undo";

export type DailyEvent = {
  id: string;
  businessDate: string;
  scope: DailyEventScope;
  kind: DailyEventKind;
  memberId?: string | null;
  deltaMorning: number;
  deltaAfternoon: number;
  deltaBorderoDia: number;
  createdAt: string;
};

async function safeFrom(table: string) {
  assertConfigured();
  return supabase!.from(table);
}

/**
 * Inserts a daily event. If the table doesn't exist, it fails silently (keeps the UI working).
 */
export async function insertDailyEvent(event: {
  businessDate: string;
  scope: DailyEventScope;
  kind: DailyEventKind;
  memberId?: string | null;
  deltaMorning?: number;
  deltaAfternoon?: number;
  deltaBorderoDia?: number;
}) {
  if (!isSupabaseConfigured || dailyEventsDisabled) return;

  try {
    const { error } = await supabase!
      .from("daily_events")
      .insert({
        business_date: event.businessDate,
        scope: event.scope,
        kind: event.kind,
        member_id: event.memberId ?? null,
        delta_morning: event.deltaMorning ?? 0,
        delta_afternoon: event.deltaAfternoon ?? 0,
        delta_bordero_dia: event.deltaBorderoDia ?? 0,
      });

    if (error) {
      if (isMissingDailyEventsError(error.message)) dailyEventsDisabled = true;
      return;
    }
  } catch (e: any) {
    // ignore
  }
}

export async function listDailyEvents(businessDate: string, beforeIso?: string): Promise<DailyEvent[]> {
  if (!isSupabaseConfigured || dailyEventsDisabled) return [];

  try {
    let q = supabase!
      .from("daily_events")
      .select("id, business_date, scope, kind, member_id, delta_morning, delta_afternoon, delta_bordero_dia, created_at")
      .eq("business_date", businessDate)
      .order("created_at", { ascending: true });

    if (beforeIso) q = q.lte("created_at", beforeIso);

    const { data, error } = await q;
    if (error) {
      if (isMissingDailyEventsError(error.message)) dailyEventsDisabled = true;
      return [];
    }

    return (data ?? []).map((r: any) => ({
      id: String(r.id),
      businessDate: String(r.business_date),
      scope: r.scope as DailyEventScope,
      kind: r.kind as DailyEventKind,
      memberId: r.member_id ? String(r.member_id) : null,
      deltaMorning: Number(r.delta_morning ?? 0),
      deltaAfternoon: Number(r.delta_afternoon ?? 0),
      deltaBorderoDia: Number(r.delta_bordero_dia ?? 0),
      createdAt: String(r.created_at),
    }));
  } catch (e: any) {
    return [];
  }
}

/**
 * Resets day counters:
 * - dashboard_settings.atingido_dia = 0
 * - team_members morning/afternoon = 0 for empresas/leads
 */
export async function resetDayCounters() {
  assertConfigured();
  const nowIso = new Date().toISOString();

  const { error: e1 } = await supabase!
    .from("dashboard_settings")
    .update({ atingido_dia: 0, updated_at: nowIso })
    .eq("key", SETTINGS_KEY);
  if (e1) throw e1;

  const { error: e2 } = await supabase!
    .from("team_members")
    .update({ morning: 0, afternoon: 0, updated_at: nowIso })
    .in("category", ["empresas", "leads"]);
  if (e2) throw e2;
}

/**
 * Returns the most recent activity timestamp (ISO string).
 * Uses updated_at columns to avoid depender de daily_events (que é opcional).
 */
export async function getLastActivityIso(): Promise<string | null> {
  assertConfigured();

  // updated_at columns
  try {
    const { data: sData } = await supabase!
      .from("dashboard_settings")
      .select("updated_at")
      .eq("key", SETTINGS_KEY)
      .maybeSingle();

    const sUpdated = sData?.updated_at ? new Date(sData.updated_at).getTime() : 0;

    const { data: tData } = await supabase!
      .from("team_members")
      .select("updated_at")
      .order("updated_at", { ascending: false })
      .limit(1);

    const tUpdated = tData?.[0]?.updated_at ? new Date(tData[0].updated_at).getTime() : 0;

    const maxTs = Math.max(sUpdated, tUpdated);
    return maxTs ? new Date(maxTs).toISOString() : null;
  } catch (_) {
    return null;
  }
}