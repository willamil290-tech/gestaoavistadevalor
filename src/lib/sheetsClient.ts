// Cliente para a Edge Function sheets-sync.
// Toda persistência do app passa por aqui — Google Sheets é o banco de dados.

const FN_NAME = "sheets-sync";

// Resolve a URL da Edge Function. O Lovable Cloud injeta VITE_SUPABASE_URL.
function functionsUrl(): string {
  const base = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (!base) throw new Error("VITE_SUPABASE_URL não disponível — Lovable Cloud não está ativo.");
  return `${base.replace(/\/$/, "")}/functions/v1/${FN_NAME}`;
}

function anonKey(): string {
  const k = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined
    ?? import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!k) throw new Error("VITE_SUPABASE_PUBLISHABLE_KEY / VITE_SUPABASE_ANON_KEY não disponível.");
  return k;
}

export type SheetsTable = "dashboard_settings" | "team_members" | "daily_events" | "local_archive" | "calls_log";

type RpcBody = {
  op: "ping" | "init" | "select" | "replace" | "upsert" | "delete" | "append";
  table?: SheetsTable;
  payload?: unknown;
};

async function rpc<T = any>(body: RpcBody): Promise<T> {
  const res = await fetch(functionsUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey(),
      Authorization: `Bearer ${anonKey()}`,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const msg = (data && data.error) || (typeof data === "string" ? data : `HTTP ${res.status}`);
    throw new Error(`[sheets-sync] ${msg}`);
  }
  return data as T;
}

// ---------- API pública ----------

export async function sheetsInit(): Promise<void> {
  await rpc({ op: "init" });
}

export async function sheetsSelect<T = Record<string, string>>(
  table: SheetsTable,
  where?: Record<string, string>,
): Promise<T[]> {
  const { items } = await rpc<{ items: T[] }>({ op: "select", table, payload: where ? { where } : undefined });
  return items;
}

export async function sheetsReplace(table: SheetsTable, items: Record<string, unknown>[]): Promise<void> {
  await rpc({ op: "replace", table, payload: { items } });
}

export async function sheetsUpsert(
  table: SheetsTable,
  items: Record<string, unknown>[],
  key = "id",
): Promise<void> {
  await rpc({ op: "upsert", table, payload: { items, key } });
}

export async function sheetsDelete(table: SheetsTable, value: string, key = "id"): Promise<void> {
  await rpc({ op: "delete", table, payload: { value, key } });
}

export async function sheetsAppend(table: SheetsTable, items: Record<string, unknown>[]): Promise<void> {
  await rpc({ op: "append", table, payload: { items } });
}

// Helpers de parse — Sheets devolve sempre string; convertemos conforme schema.

export function num(v: unknown, fallback = 0): number {
  if (v === null || v === undefined || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function jsonField<T>(v: unknown, fallback: T): T {
  if (typeof v !== "string" || v.length === 0) return fallback;
  try { return JSON.parse(v) as T; } catch { return fallback; }
}
