// Persistência baseada em Google Sheets via Edge Function `sheets-sync`.
// O Lovable Cloud (Supabase) é usado APENAS como proxy seguro — nenhum dado
// de negócio é salvo em tabelas Postgres. Cada "tabela" lógica abaixo
// (dashboard_settings, team_members, daily_events) corresponde a uma aba na
// planilha do Google.
//
// API pública mantém os mesmos nomes/assinaturas usados nos hooks e componentes.

import { canonicalizeActiveCollaboratorName } from "@/lib/collaboratorNames";
import {
  jsonField,
  num,
  sheetsAppend,
  sheetsDelete,
  sheetsInit,
  sheetsSelect,
  sheetsUpsert,
} from "@/lib/sheetsClient";

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

const SETTINGS_KEY = "default";

// Cache em memória do row de settings.
// Evita que escritas concorrentes (ex: atingido + clientes logo em seguida)
// percam dados por conta da eventual consistency do Google Sheets.
let settingsRowCache: Record<string, unknown> | null = null;
// Timestamp da última escrita local. Enquanto recente, preferimos o cache
// sobre leituras "frescas" do Sheets (que podem estar atrasadas devido a
// eventual consistency / cache do Google Sheets API).
let settingsCacheUntil = 0;
const CACHE_PRIORITY_MS = 30_000;
let settingsWriteQueue: Promise<void> = Promise.resolve();

function enqueueSettingsWrite<T>(work: () => Promise<T>): Promise<T> {
  const run = settingsWriteQueue.then(work, work);
  settingsWriteQueue = run.then(() => undefined, () => undefined);
  return run;
}

// ---------- Bootstrap ----------
// Garante que as abas/headers da planilha existam. Roda uma vez por sessão.

let initPromise: Promise<void> | null = null;
function ensureInit(): Promise<void> {
  if (!initPromise) {
    initPromise = sheetsInit().catch((e) => {
      initPromise = null;
      throw e;
    });
  }
  return initPromise;
}

// Sempre habilitado neste modo — mantemos os flags por compat.
export const isDailyEventsEnabled = () => true;
export const isDashboardExtrasEnabled = () => true;

// ---------- dashboard_settings (linha única, key='default') ----------

function rowToSettings(row: Record<string, string> | undefined): DashboardSettings {
  if (!row) return DEFAULT_SETTINGS;
  return {
    metaMes: num(row.meta_mes, DEFAULT_SETTINGS.metaMes),
    ajusteMes: num(row.ajuste_mes, 0),
    metaDia: num(row.meta_dia, DEFAULT_SETTINGS.metaDia),
    ajusteDia: num(row.ajuste_dia, 0),
    atingidoMes: num(row.atingido_mes, 0),
    atingidoDia: num(row.atingido_dia, 0),
  };
}

function rowToExtras(row: Record<string, string> | undefined): DashboardExtras {
  if (!row) return DEFAULT_EXTRAS;
  return {
    commercials: jsonField<CommercialProgress[]>(row.commercials, []),
    faixas: jsonField<FaixaVencimentoRow[]>(row.faixas, []),
    clientes: jsonField<ClienteBorderoRow[]>(row.clientes, []),
    acionamentoDetalhado: jsonField<ColaboradorAcionamentoRow[]>(row.acionamento_detalhado, []),
    agendadasMes: jsonField<AgendadaRealizadaRow[]>(row.agendadas_mes, []),
    agendadasDia: jsonField<AgendadaRealizadaRow[]>(row.agendadas_dia, []),
    trendData: jsonField<HourlyTrendRow[]>(row.trend_data, []),
  };
}

function hasMeaningfulPatchValue(value: unknown): boolean {
  if (value == null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value as Record<string, unknown>).length > 0;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

async function fetchSettingsRow(): Promise<Record<string, string> | undefined> {
  await ensureInit();
  const rows = await sheetsSelect("dashboard_settings", { key: SETTINGS_KEY });
  const row = rows[0];
  if (!row) return row;
  // Se ainda estamos na janela de prioridade do cache (escrita local recente),
  // mesclamos com o cache vencendo nos campos cacheados.
  if (settingsRowCache && Date.now() < settingsCacheUntil) {
    const merged = { ...row, ...settingsRowCache };
    settingsRowCache = merged;
    return merged as Record<string, string>;
  }
  // Janela expirou — leitura fresca passa a ser a verdade.
  settingsRowCache = { ...row };
  return row;
}

async function ensureSettingsRow(): Promise<Record<string, string>> {
  const existing = await fetchSettingsRow();
  if (existing) return (settingsRowCache as Record<string, string>) ?? existing;
  const seed = {
    key: SETTINGS_KEY,
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
    updated_at: new Date().toISOString(),
  };
  await sheetsUpsert("dashboard_settings", [seed], "key");
  settingsRowCache = { ...seed };
  settingsCacheUntil = Date.now() + CACHE_PRIORITY_MS;
  return (await fetchSettingsRow()) ?? (settingsRowCache as Record<string, string>);
}

export async function getDashboardSettings(): Promise<DashboardSettings> {
  await ensureInit();
  const row = await ensureSettingsRow();
  return rowToSettings(row);
}

export async function updateDashboardSettings(patch: Partial<DashboardSettings>) {
  return enqueueSettingsWrite(async () => {
    const row = await ensureSettingsRow();
    const merged: Record<string, unknown> = { ...row, key: SETTINGS_KEY };
    if (typeof patch.metaMes === "number") merged.meta_mes = patch.metaMes;
    if (typeof patch.ajusteMes === "number") merged.ajuste_mes = patch.ajusteMes;
    if (typeof patch.metaDia === "number") merged.meta_dia = patch.metaDia;
    if (typeof patch.ajusteDia === "number") merged.ajuste_dia = patch.ajusteDia;
    if (typeof patch.atingidoMes === "number") merged.atingido_mes = patch.atingidoMes;
    if (typeof patch.atingidoDia === "number") merged.atingido_dia = patch.atingidoDia;
    merged.updated_at = new Date().toISOString();
    // Cache otimista antes da rede: evita que uma leitura/persistência concorrente
    // use o valor antigo enquanto o Sheets ainda está gravando.
    settingsRowCache = { ...merged };
    settingsCacheUntil = Date.now() + CACHE_PRIORITY_MS;
    await sheetsUpsert("dashboard_settings", [merged], "key");
  });
}

export async function getDashboardExtras(): Promise<DashboardExtras> {
  await ensureInit();
  const row = await ensureSettingsRow();
  return rowToExtras(row);
}

export async function updateDashboardExtras(patch: Partial<DashboardExtras>) {
  return enqueueSettingsWrite(async () => {
    const row = await ensureSettingsRow();
    const merged: Record<string, unknown> = { ...row, key: SETTINGS_KEY };
    if (hasMeaningfulPatchValue(patch.commercials)) merged.commercials = patch.commercials;
    if (hasMeaningfulPatchValue(patch.faixas)) merged.faixas = patch.faixas;
    if (hasMeaningfulPatchValue(patch.clientes)) merged.clientes = patch.clientes;
    if (hasMeaningfulPatchValue(patch.acionamentoDetalhado)) merged.acionamento_detalhado = patch.acionamentoDetalhado;
    if (hasMeaningfulPatchValue(patch.agendadasMes)) merged.agendadas_mes = patch.agendadasMes;
    if (hasMeaningfulPatchValue(patch.agendadasDia)) merged.agendadas_dia = patch.agendadasDia;
    if (hasMeaningfulPatchValue(patch.trendData)) merged.trend_data = patch.trendData;
    merged.updated_at = new Date().toISOString();
    settingsRowCache = { ...merged };
    settingsCacheUntil = Date.now() + CACHE_PRIORITY_MS;
    await sheetsUpsert("dashboard_settings", [merged], "key");
  });
}

// ---------- team_members ----------

function rowToMember(row: Record<string, string>): TeamMember {
  return {
    id: String(row.id ?? ""),
    category: (row.category as TeamCategory) || "empresas",
    name: canonicalizeActiveCollaboratorName(String(row.name ?? "")),
    morning: num(row.morning, 0),
    afternoon: num(row.afternoon, 0),
  };
}

export async function listTeamMembers(category: TeamCategory): Promise<TeamMember[]> {
  await ensureInit();
  const rows = await sheetsSelect("team_members", { category });
  let members = rows.map(rowToMember);

  if (members.length === 0) {
    const seed = category === "empresas" ? DEFAULT_EMPRESAS : DEFAULT_LEADS;
    await sheetsUpsert(
      "team_members",
      seed.map((m) => ({ ...m, updated_at: new Date().toISOString() })),
      "id",
    );
    members = seed;
  }

  members.sort((a, b) => {
    const diff = (b.morning + b.afternoon) - (a.morning + a.afternoon);
    if (diff !== 0) return diff;
    return a.name.localeCompare(b.name);
  });
  return members;
}

export async function upsertTeamMember(member: TeamMember) {
  await ensureInit();
  await sheetsUpsert(
    "team_members",
    [{
      id: member.id,
      category: member.category,
      name: canonicalizeActiveCollaboratorName(member.name),
      morning: member.morning,
      afternoon: member.afternoon,
      updated_at: new Date().toISOString(),
    }],
    "id",
  );
}

export async function addTeamMember(category: TeamCategory): Promise<TeamMember> {
  await ensureInit();
  const id = (globalThis.crypto?.randomUUID?.() ?? Date.now().toString()) as string;
  const newMember: TeamMember = { id, category, name: "Novo Colaborador", morning: 0, afternoon: 0 };
  await sheetsUpsert(
    "team_members",
    [{ ...newMember, updated_at: new Date().toISOString() }],
    "id",
  );
  return newMember;
}

export async function deleteTeamMember(id: string) {
  await ensureInit();
  await sheetsDelete("team_members", id, "id");
}

// ---------- daily_events ----------

export async function insertDailyEvent(event: {
  businessDate: string;
  scope: DailyEventScope;
  kind: DailyEventKind;
  memberId?: string | null;
  deltaMorning?: number;
  deltaAfternoon?: number;
  deltaBorderoDia?: number;
}) {
  await ensureInit();
  const id = (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`) as string;
  await sheetsAppend("daily_events", [{
    id,
    business_date: event.businessDate,
    scope: event.scope,
    kind: event.kind,
    member_id: event.memberId ?? "",
    delta_morning: event.deltaMorning ?? 0,
    delta_afternoon: event.deltaAfternoon ?? 0,
    delta_bordero_dia: event.deltaBorderoDia ?? 0,
    created_at: new Date().toISOString(),
  }]);
}

export async function listDailyEvents(businessDate: string, beforeIso?: string): Promise<DailyEvent[]> {
  await ensureInit();
  const rows = await sheetsSelect("daily_events", { business_date: businessDate });
  const evts: DailyEvent[] = rows.map((r) => ({
    id: String(r.id ?? ""),
    businessDate: String(r.business_date ?? ""),
    scope: (r.scope as DailyEventScope) || "empresas",
    kind: (r.kind as DailyEventKind) || "single",
    memberId: r.member_id ? String(r.member_id) : null,
    deltaMorning: num(r.delta_morning, 0),
    deltaAfternoon: num(r.delta_afternoon, 0),
    deltaBorderoDia: num(r.delta_bordero_dia, 0),
    createdAt: String(r.created_at ?? ""),
  }));
  const filtered = beforeIso ? evts.filter((e) => e.createdAt <= beforeIso) : evts;
  filtered.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return filtered;
}

// ---------- calls ----------
// As chamadas agora são persistidas exclusivamente via `saveJson("calls:YYYY-MM", ...)`
// no Lovable Cloud (tabela `app_data`). O caminho legado para Google Sheets foi
// removido para evitar fontes paralelas e divergência de totais.

// ---------- Reset diário e last activity ----------

export async function resetDayCounters() {
  await ensureInit();

  // Zera atingido_dia
  const row = await ensureSettingsRow();
  await sheetsUpsert(
    "dashboard_settings",
    [{ ...row, key: SETTINGS_KEY, atingido_dia: 0, updated_at: new Date().toISOString() }],
    "key",
  );

  // Zera morning/afternoon de todos os membros
  const all = await sheetsSelect("team_members");
  const updated = all
    .filter((r) => r.category === "empresas" || r.category === "leads")
    .map((r) => ({ ...r, morning: 0, afternoon: 0, updated_at: new Date().toISOString() }));
  if (updated.length > 0) await sheetsUpsert("team_members", updated, "id");
}

export async function getLastActivityIso(): Promise<string | null> {
  try {
    await ensureInit();
    const settings = await sheetsSelect("dashboard_settings", { key: SETTINGS_KEY });
    const sUpdated = settings[0]?.updated_at ? new Date(settings[0].updated_at).getTime() : 0;

    const members = await sheetsSelect("team_members");
    const tUpdated = members.reduce((max, r) => {
      const t = r.updated_at ? new Date(r.updated_at).getTime() : 0;
      return t > max ? t : max;
    }, 0);

    const maxTs = Math.max(sUpdated, tUpdated);
    return maxTs ? new Date(maxTs).toISOString() : null;
  } catch {
    return null;
  }
}


