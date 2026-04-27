// Persistência baseada no banco de dados do Lovable Cloud (tabela public.app_data).
// A API pública mantém os mesmos nomes/assinaturas usados nos hooks e componentes.

import { canonicalizeActiveCollaboratorName } from "@/lib/collaboratorNames";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

// ---------- Tipos ----------

export type DashboardSettings = {
  metaMes: number;
  ajusteMes: number;
  metaDia: number;
  ajusteDia: number;
  atingidoMes: number;
  atingidoDia: number;
};

export type CommercialGroup = "executivo" | "cs" | "closer";

export type CommercialProgress = {
  id: string;
  name: string;
  currentValue: number;
  goal: number;
  group: CommercialGroup;
};

export type FaixaVencimentoRow = { faixa: string; valorMes: number; valorDia: number };

export type ClienteBorderoRow = {
  id: string;
  cliente: string;
  comercial: string;
  valor: number;
  horario: string;
  observacao: string;
};

export type AgendadaRealizadaRow = { label: string; agendadas: number; realizadas: number };
export type HourlyTrendRow = { hour: string; actions: number };
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

// ---------- Defaults ----------

export const DEFAULT_SETTINGS: DashboardSettings = {
  metaMes: 15800000,
  ajusteMes: 0,
  metaDia: 1053333.33,
  ajusteDia: 0,
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
  { id: "5", category: "empresas", name: "Bruna Domingos", morning: 3, afternoon: 0 },
  { id: "6", category: "empresas", name: "Raissa Flor", morning: 1, afternoon: 0 },
];

export const DEFAULT_LEADS: TeamMember[] = [
  { id: "l1", category: "leads", name: "Sabrina Fulas", morning: 45, afternoon: 0 },
  { id: "l2", category: "leads", name: "Nayad Souza", morning: 41, afternoon: 0 },
  { id: "l4", category: "leads", name: "Alana Silveira", morning: 16, afternoon: 0 },
];

const SETTINGS_DATA_KEY = "dashboard_settings:default";
const CACHE_PRIORITY_MS = 30_000;

let settingsRowCache: Record<string, unknown> | null = null;
let settingsCacheUntil = 0;
let settingsWriteQueue: Promise<void> = Promise.resolve();
const teamWriteQueues = new Map<TeamCategory, Promise<void>>();
const dailyEventQueues = new Map<string, Promise<void>>();

function enqueueSettingsWrite<T>(work: () => Promise<T>): Promise<T> {
  const run = settingsWriteQueue.then(work, work);
  settingsWriteQueue = run.then(() => undefined, () => undefined);
  return run;
}

function enqueueByKey<T>(queues: Map<string, Promise<void>>, key: string, work: () => Promise<T>): Promise<T> {
  const previous = queues.get(key) ?? Promise.resolve();
  const run = previous.then(work, work);
  queues.set(key, run.then(() => undefined, () => undefined));
  return run;
}

function num(v: unknown, fallback = 0): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

function jsonField<T>(v: unknown, fallback: T): T {
  if (Array.isArray(v) || (v && typeof v === "object")) return v as T;
  if (typeof v !== "string" || v.length === 0) return fallback;
  try { return JSON.parse(v) as T; } catch { return fallback; }
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

async function getAppValue<T = unknown>(key: string): Promise<T | null> {
  const { data, error } = await supabase
    .from("app_data")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (error) throw error;
  return data ? (data.value as T) : null;
}

async function upsertAppValue(key: string, value: unknown): Promise<void> {
  const { error } = await supabase
    .from("app_data")
    .upsert({ key, value: value as Json, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw error;
}

async function deleteAppValue(key: string): Promise<void> {
  const { error } = await supabase.from("app_data").delete().eq("key", key);
  if (error) throw error;
}

function teamMembersKey(category: TeamCategory) {
  return `team_members:${category}`;
}

function dailyEventsKey(businessDate: string) {
  return `daily_events:${businessDate}`;
}

// Sempre habilitado neste modo — mantemos os flags por compat.
export const isDailyEventsEnabled = () => true;
export const isDashboardExtrasEnabled = () => true;

// ---------- dashboard_settings (registro único em app_data) ----------

function rowToSettings(row: Record<string, unknown> | undefined): DashboardSettings {
  if (!row) return DEFAULT_SETTINGS;
  return {
    metaMes: num(row.meta_mes ?? row.metaMes, DEFAULT_SETTINGS.metaMes),
    ajusteMes: num(row.ajuste_mes ?? row.ajusteMes, 0),
    metaDia: num(row.meta_dia ?? row.metaDia, DEFAULT_SETTINGS.metaDia),
    ajusteDia: num(row.ajuste_dia ?? row.ajusteDia, 0),
    atingidoMes: num(row.atingido_mes ?? row.atingidoMes, DEFAULT_SETTINGS.atingidoMes),
    atingidoDia: num(row.atingido_dia ?? row.atingidoDia, DEFAULT_SETTINGS.atingidoDia),
  };
}

function rowToExtras(row: Record<string, unknown> | undefined): DashboardExtras {
  if (!row) return DEFAULT_EXTRAS;
  return {
    commercials: jsonField<CommercialProgress[]>(row.commercials, []),
    faixas: jsonField<FaixaVencimentoRow[]>(row.faixas, []),
    clientes: jsonField<ClienteBorderoRow[]>(row.clientes, []),
    acionamentoDetalhado: jsonField<ColaboradorAcionamentoRow[]>(row.acionamento_detalhado ?? row.acionamentoDetalhado, []),
    agendadasMes: jsonField<AgendadaRealizadaRow[]>(row.agendadas_mes ?? row.agendadasMes, []),
    agendadasDia: jsonField<AgendadaRealizadaRow[]>(row.agendadas_dia ?? row.agendadasDia, []),
    trendData: jsonField<HourlyTrendRow[]>(row.trend_data ?? row.trendData, []),
  };
}

async function fetchSettingsRow(): Promise<Record<string, unknown> | undefined> {
  const remote = toRecord(await getAppValue(SETTINGS_DATA_KEY));
  if (!remote) return undefined;

  if (settingsRowCache && Date.now() < settingsCacheUntil) {
    const merged = { ...remote, ...settingsRowCache };
    settingsRowCache = merged;
    return merged;
  }

  settingsRowCache = { ...remote };
  return remote;
}

async function ensureSettingsRow(): Promise<Record<string, unknown>> {
  const existing = await fetchSettingsRow();
  if (existing) return settingsRowCache ?? existing;

  const seed: Record<string, unknown> = {
    meta_mes: DEFAULT_SETTINGS.metaMes,
    ajuste_mes: DEFAULT_SETTINGS.ajusteMes,
    meta_dia: DEFAULT_SETTINGS.metaDia,
    ajuste_dia: DEFAULT_SETTINGS.ajusteDia,
    atingido_mes: DEFAULT_SETTINGS.atingidoMes,
    atingido_dia: DEFAULT_SETTINGS.atingidoDia,
    commercials: [],
    faixas: [],
    clientes: [],
    acionamento_detalhado: [],
    agendadas_mes: [],
    agendadas_dia: [],
    trend_data: [],
  };

  settingsRowCache = { ...seed };
  settingsCacheUntil = Date.now() + CACHE_PRIORITY_MS;
  await upsertAppValue(SETTINGS_DATA_KEY, seed);
  return seed;
}

export async function getDashboardSettings(): Promise<DashboardSettings> {
  const row = await ensureSettingsRow();
  return rowToSettings(row);
}

export async function updateDashboardSettings(patch: Partial<DashboardSettings>) {
  return enqueueSettingsWrite(async () => {
    const row = await ensureSettingsRow();
    const merged: Record<string, unknown> = { ...row };
    if (typeof patch.metaMes === "number") merged.meta_mes = patch.metaMes;
    if (typeof patch.ajusteMes === "number") merged.ajuste_mes = patch.ajusteMes;
    if (typeof patch.metaDia === "number") merged.meta_dia = patch.metaDia;
    if (typeof patch.ajusteDia === "number") merged.ajuste_dia = patch.ajusteDia;
    if (typeof patch.atingidoMes === "number") merged.atingido_mes = patch.atingidoMes;
    if (typeof patch.atingidoDia === "number") merged.atingido_dia = patch.atingidoDia;

    settingsRowCache = { ...merged };
    settingsCacheUntil = Date.now() + CACHE_PRIORITY_MS;
    await upsertAppValue(SETTINGS_DATA_KEY, merged);
  });
}

export async function getDashboardExtras(): Promise<DashboardExtras> {
  const row = await ensureSettingsRow();
  return rowToExtras(row);
}

export async function updateDashboardExtras(patch: Partial<DashboardExtras>) {
  return enqueueSettingsWrite(async () => {
    const row = await ensureSettingsRow();
    const merged: Record<string, unknown> = { ...row };
    if ("commercials" in patch) merged.commercials = patch.commercials ?? [];
    if ("faixas" in patch) merged.faixas = patch.faixas ?? [];
    if ("clientes" in patch) merged.clientes = patch.clientes ?? [];
    if ("acionamentoDetalhado" in patch) merged.acionamento_detalhado = patch.acionamentoDetalhado ?? [];
    if ("agendadasMes" in patch) merged.agendadas_mes = patch.agendadasMes ?? [];
    if ("agendadasDia" in patch) merged.agendadas_dia = patch.agendadasDia ?? [];
    if ("trendData" in patch) merged.trend_data = patch.trendData ?? [];

    settingsRowCache = { ...merged };
    settingsCacheUntil = Date.now() + CACHE_PRIORITY_MS;
    await upsertAppValue(SETTINGS_DATA_KEY, merged);
  });
}

// ---------- team_members ----------

function rowToMember(row: Partial<TeamMember> & Record<string, unknown>, fallbackCategory: TeamCategory): TeamMember {
  return {
    id: String(row.id ?? ""),
    category: (row.category as TeamCategory) || fallbackCategory,
    name: canonicalizeActiveCollaboratorName(String(row.name ?? "")),
    morning: num(row.morning, 0),
    afternoon: num(row.afternoon, 0),
  };
}

function sortMembers(members: TeamMember[]) {
  return [...members].sort((a, b) => {
    const diff = (b.morning + b.afternoon) - (a.morning + a.afternoon);
    if (diff !== 0) return diff;
    return a.name.localeCompare(b.name);
  });
}

async function saveTeamMembers(category: TeamCategory, members: TeamMember[]): Promise<void> {
  await upsertAppValue(teamMembersKey(category), sortMembers(members));
}

export async function listTeamMembers(category: TeamCategory): Promise<TeamMember[]> {
  const stored = await getAppValue<unknown>(teamMembersKey(category));
  let members = Array.isArray(stored)
    ? stored.map((row) => rowToMember(toRecord(row) ?? {}, category)).filter((m) => m.id)
    : [];

  if (members.length === 0) {
    members = category === "empresas" ? DEFAULT_EMPRESAS : DEFAULT_LEADS;
    await saveTeamMembers(category, members);
  }

  return sortMembers(members);
}

export async function upsertTeamMember(member: TeamMember) {
  return enqueueByKey(teamWriteQueues as Map<string, Promise<void>>, member.category, async () => {
    const normalized: TeamMember = {
      ...member,
      name: canonicalizeActiveCollaboratorName(member.name),
    };
    const members = await listTeamMembers(normalized.category);
    const idx = members.findIndex((m) => m.id === normalized.id);
    const next = idx >= 0
      ? members.map((m) => (m.id === normalized.id ? normalized : m))
      : [...members, normalized];
    await saveTeamMembers(normalized.category, next);
  });
}

export async function addTeamMember(category: TeamCategory): Promise<TeamMember> {
  const id = (globalThis.crypto?.randomUUID?.() ?? Date.now().toString()) as string;
  const newMember: TeamMember = { id, category, name: "Novo Colaborador", morning: 0, afternoon: 0 };
  await upsertTeamMember(newMember);
  return newMember;
}

export async function deleteTeamMember(id: string) {
  await Promise.all(((["empresas", "leads"] as TeamCategory[])).map((category) =>
    enqueueByKey(teamWriteQueues as Map<string, Promise<void>>, category, async () => {
      const members = await listTeamMembers(category);
      const next = members.filter((m) => m.id !== id);
      if (next.length !== members.length) await saveTeamMembers(category, next);
    })
  ));
}

// ---------- daily_events ----------

function normalizeDailyEvent(row: Record<string, unknown>): DailyEvent {
  return {
    id: String(row.id ?? ""),
    businessDate: String(row.businessDate ?? row.business_date ?? ""),
    scope: (row.scope as DailyEventScope) || "empresas",
    kind: (row.kind as DailyEventKind) || "single",
    memberId: row.memberId || row.member_id ? String(row.memberId ?? row.member_id) : null,
    deltaMorning: num(row.deltaMorning ?? row.delta_morning, 0),
    deltaAfternoon: num(row.deltaAfternoon ?? row.delta_afternoon, 0),
    deltaBorderoDia: num(row.deltaBorderoDia ?? row.delta_bordero_dia, 0),
    createdAt: String(row.createdAt ?? row.created_at ?? ""),
  };
}

export async function insertDailyEvent(event: {
  businessDate: string;
  scope: DailyEventScope;
  kind: DailyEventKind;
  memberId?: string | null;
  deltaMorning?: number;
  deltaAfternoon?: number;
  deltaBorderoDia?: number;
}) {
  const key = dailyEventsKey(event.businessDate);
  await enqueueByKey(dailyEventQueues, key, async () => {
    const current = await getAppValue<unknown>(key);
    const events = Array.isArray(current)
      ? current.map((row) => normalizeDailyEvent(toRecord(row) ?? {})).filter((e) => e.id)
      : [];
    const nextEvent: DailyEvent = {
      id: (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`) as string,
      businessDate: event.businessDate,
      scope: event.scope,
      kind: event.kind,
      memberId: event.memberId ?? null,
      deltaMorning: event.deltaMorning ?? 0,
      deltaAfternoon: event.deltaAfternoon ?? 0,
      deltaBorderoDia: event.deltaBorderoDia ?? 0,
      createdAt: new Date().toISOString(),
    };
    await upsertAppValue(key, [...events, nextEvent]);
  });
}

export async function listDailyEvents(businessDate: string, beforeIso?: string): Promise<DailyEvent[]> {
  const stored = await getAppValue<unknown>(dailyEventsKey(businessDate));
  const events = Array.isArray(stored)
    ? stored.map((row) => normalizeDailyEvent(toRecord(row) ?? {})).filter((e) => e.id)
    : [];
  const filtered = beforeIso ? events.filter((e) => e.createdAt <= beforeIso) : events;
  filtered.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return filtered;
}

// ---------- calls ----------
// As chamadas são persistidas via `saveJson("calls:YYYY-MM", ...)` no Lovable Cloud.

// ---------- Reset diário e last activity ----------

export async function resetDayCounters() {
  await updateDashboardSettings({ atingidoDia: 0 });

  const [empresas, leads] = await Promise.all([listTeamMembers("empresas"), listTeamMembers("leads")]);
  await Promise.all([
    saveTeamMembers("empresas", empresas.map((m) => ({ ...m, morning: 0, afternoon: 0 }))),
    saveTeamMembers("leads", leads.map((m) => ({ ...m, morning: 0, afternoon: 0 }))),
  ]);
}

export async function getLastActivityIso(): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("app_data")
      .select("updated_at")
      .in("key", [SETTINGS_DATA_KEY, teamMembersKey("empresas"), teamMembersKey("leads")]);
    if (error) throw error;

    const maxTs = (data ?? []).reduce((max, row) => {
      const t = row.updated_at ? new Date(row.updated_at).getTime() : 0;
      return t > max ? t : max;
    }, 0);

    return maxTs ? new Date(maxTs).toISOString() : null;
  } catch {
    return null;
  }
}

export async function clearPersistenceKeyForTests(key: string) {
  await deleteAppValue(key);
}
