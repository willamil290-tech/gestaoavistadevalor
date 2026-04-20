// Edge Function: sheets-sync
// Acts as a secure proxy between the SPA and Google Sheets API v4.
// All persistence (dashboard_settings, team_members, daily_events) is mirrored
// to a single Google Spreadsheet. Each "table" lives on a separate sheet/tab.
//
// Auth: Service Account JWT (RS256) signed in-function using Web Crypto.
// Secrets required: GOOGLE_SERVICE_ACCOUNT_JSON, GOOGLE_SHEETS_ID

import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

const SHEETS_ID = Deno.env.get("GOOGLE_SHEETS_ID");
const SA_JSON_RAW = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");

const SHEETS_BASE = "https://sheets.googleapis.com/v4/spreadsheets";

// ---------- JWT ----------

let cachedToken: { token: string; exp: number } | null = null;

function b64urlEncode(data: ArrayBuffer | string): string {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data);
  let str = "";
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN [A-Z ]+-----/g, "")
    .replace(/-----END [A-Z ]+-----/g, "")
    .replace(/\s+/g, "");
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

async function getAccessToken(): Promise<string> {
  if (!SA_JSON_RAW) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON não configurado");
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp - 60 > now) return cachedToken.token;

  const sa = JSON.parse(SA_JSON_RAW);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const unsigned = `${b64urlEncode(JSON.stringify(header))}.${b64urlEncode(JSON.stringify(claim))}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const jwt = `${unsigned}.${b64urlEncode(sigBuf)}`;

  const tokRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const tok = await tokRes.json();
  if (!tokRes.ok) throw new Error(`Falha ao obter token Google: ${JSON.stringify(tok)}`);
  cachedToken = { token: tok.access_token, exp: now + Number(tok.expires_in ?? 3600) };
  return cachedToken.token;
}

// ---------- Sheets helpers ----------

async function sheetsFetch(path: string, init: RequestInit = {}, retries = 0) {
  const token = await getAccessToken();
  const res = await fetch(`${SHEETS_BASE}/${SHEETS_ID}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  
  // Retry com exponential backoff para 429 (RATE_LIMIT_EXCEEDED)
  if (res.status === 429 && retries < 5) {
    const waitMs = Math.min(1000 * Math.pow(2, retries) + Math.random() * 1000, 30000);
    console.log(`[sheets-sync] Rate limit hit, aguardando ${waitMs}ms antes de retry ${retries + 1}/5`);
    await new Promise(r => setTimeout(r, waitMs));
    return sheetsFetch(path, init, retries + 1);
  }
  
  if (!res.ok) throw new Error(`Sheets API ${res.status}: ${typeof data === "string" ? data : JSON.stringify(data)}`);
  return data as any;
}

async function ensureSheets(names: string[]) {
  const meta = await sheetsFetch("?fields=sheets.properties");
  const existing = new Set<string>((meta.sheets ?? []).map((s: any) => s.properties.title));
  const toCreate = names.filter((n) => !existing.has(n));
  if (toCreate.length === 0) return;
  await sheetsFetch(":batchUpdate", {
    method: "POST",
    body: JSON.stringify({
      requests: toCreate.map((title) => ({ addSheet: { properties: { title } } })),
    }),
  });
}

async function readRange(sheet: string): Promise<string[][]> {
  const data = await sheetsFetch(`/values/${encodeURIComponent(sheet)}?majorDimension=ROWS`);
  return (data.values ?? []) as string[][];
}

async function writeRange(sheet: string, values: string[][]) {
  // Clear then write to avoid stale rows.
  await sheetsFetch(`/values/${encodeURIComponent(sheet)}:clear`, { method: "POST", body: "{}" });
  if (values.length === 0) return;
  await sheetsFetch(
    `/values/${encodeURIComponent(sheet)}?valueInputOption=RAW`,
    { method: "PUT", body: JSON.stringify({ range: sheet, values }) },
  );
}

async function appendRows(sheet: string, values: string[][]) {
  if (values.length === 0) return;
  console.log(`[sheets-sync] Anexando ${values.length} linhas para ${sheet}`);
  
  // Tenta anexar direto. Se falhar com erro de range não encontrado, cria headers
  try {
    await sheetsFetch(
      `/values/${encodeURIComponent(sheet)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      { method: "POST", body: JSON.stringify({ range: sheet, values }) },
    );
  } catch (e) {
    const msg = String(e);
    if (msg.includes("not found") || msg.includes("Unable to parse")) {
      console.log(`[sheets-sync] Range não encontrado, criando headers para ${sheet}`);
      // Se a aba não tiver dados, cria headers
      const headers = SCHEMAS[sheet] || [];
      await sheetsFetch(
        `/values/${encodeURIComponent(sheet)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
        { method: "POST", body: JSON.stringify({ range: sheet, values: [headers, ...values] }) },
      );
    } else {
      throw e;
    }
  }
}

// ---------- Row <-> object mapping ----------
// First row = headers. Cells stored as strings. JSON columns are JSON-stringified.

function rowsToObjects(rows: string[][]): Record<string, string>[] {
  if (rows.length < 2) return [];
  const [headers, ...rest] = rows;
  return rest
    .filter((r) => r.some((c) => (c ?? "").length > 0))
    .map((r) => {
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => { obj[h] = r[i] ?? ""; });
      return obj;
    });
}

function objectsToRows(headers: string[], items: Record<string, unknown>[]): string[][] {
  const out: string[][] = [headers];
  for (const item of items) {
    out.push(headers.map((h) => {
      const v = item[h];
      if (v === undefined || v === null) return "";
      if (typeof v === "object") return JSON.stringify(v);
      return String(v);
    }));
  }
  return out;
}

// ---------- Schemas per "table" ----------

const SCHEMAS: Record<string, string[]> = {
  dashboard_settings: [
    "key", "meta_mes", "ajuste_mes", "meta_dia", "ajuste_dia",
    "atingido_mes", "atingido_dia",
    "commercials", "faixas", "clientes", "acionamento_detalhado",
    "agendadas_mes", "agendadas_dia", "trend_data",
    "updated_at",
  ],
  team_members: ["id", "category", "name", "morning", "afternoon", "updated_at"],
  daily_events: [
    "id", "business_date", "scope", "kind", "member_id",
    "delta_morning", "delta_afternoon", "delta_bordero_dia", "created_at",
  ],
  // Arquivo genérico para snapshots vindos do localStorage do navegador.
  // key = chave original; value = JSON serializado; size = bytes.
  local_archive: ["key", "value", "size", "updated_at"],
  // Histórico de chamadas importadas do Bitrix
  calls_log: [
    "year", "month", "name", "phone", "direction", "duration_seconds",
    "date_iso", "time_hhmm", "date_time", "status", "contact_info", "answered",
    "updated_at",
  ],
};

const SHEET_NAMES = Object.keys(SCHEMAS);

// ---------- HTTP entry ----------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    console.log("[sheets-sync] Requisição recebida", req.method, req.url);
    console.log("[sheets-sync] SHEETS_ID:", SHEETS_ID ? "configurado" : "NÃO configurado");
    console.log("[sheets-sync] SA_JSON_RAW:", SA_JSON_RAW ? "configurado" : "NÃO configurado");
    
    if (!SHEETS_ID) throw new Error("GOOGLE_SHEETS_ID não configurado");
    if (!SA_JSON_RAW) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON não configurado");

    let body: any = {};
    try {
      body = await req.json();
    } catch (e) {
      console.error("[sheets-sync] Erro ao fazer parse de JSON:", e);
      body = {};
    }
    const op = String(body?.op ?? "");
    const table = String(body?.table ?? "");
    const payload = body?.payload;

    console.log("[sheets-sync] Operação:", op, "Tabela:", table);
    
    if (op === "ping") {
      console.log("[sheets-sync] Executando ping");
      await ensureSheets(SHEET_NAMES);
      return json({ ok: true });
    }

    if (op === "init") {
      console.log("[sheets-sync] Executando init com", SHEET_NAMES.length, "tabelas");
      await ensureSheets(SHEET_NAMES);
      // ensure headers row exists
      for (const t of SHEET_NAMES) {
        const rows = await readRange(t);
        if (rows.length === 0) {
          console.log("[sheets-sync] Criando headers para", t);
          await writeRange(t, [SCHEMAS[t]]);
        }
      }
      return json({ ok: true });
    }

    if (!table || !SCHEMAS[table]) {
      return json({ error: `Tabela inválida: ${table}` }, 400);
    }
    const headers = SCHEMAS[table];

    if (op === "select") {
      const rows = await readRange(table);
      let items = rowsToObjects(rows);
      // Optional filter: payload.where = { col: value }
      if (payload?.where && typeof payload.where === "object") {
        const w = payload.where as Record<string, string>;
        items = items.filter((it) => Object.entries(w).every(([k, v]) => String(it[k] ?? "") === String(v)));
      }
      return json({ items });
    }

    if (op === "replace") {
      // Full overwrite of the sheet content with payload.items
      const items = (payload?.items ?? []) as Record<string, unknown>[];
      await ensureSheets(SHEET_NAMES);
      await writeRange(table, objectsToRows(headers, items));
      return json({ ok: true, count: items.length });
    }

    if (op === "upsert") {
      // Upsert by key column (payload.key)
      const items = (payload?.items ?? []) as Record<string, unknown>[];
      const keyCol = String(payload?.key ?? "id");
      const existing = rowsToObjects(await readRange(table));
      const map = new Map<string, Record<string, unknown>>();
      for (const e of existing) map.set(String(e[keyCol] ?? ""), e);
      for (const it of items) map.set(String(it[keyCol] ?? ""), { ...map.get(String(it[keyCol] ?? "")), ...it });
      await writeRange(table, objectsToRows(headers, Array.from(map.values())));
      return json({ ok: true });
    }

    if (op === "delete") {
      const keyCol = String(payload?.key ?? "id");
      const value = String(payload?.value ?? "");
      const existing = rowsToObjects(await readRange(table));
      const filtered = existing.filter((e) => String(e[keyCol] ?? "") !== value);
      await writeRange(table, objectsToRows(headers, filtered));
      return json({ ok: true });
    }

    if (op === "append") {
      console.log("[sheets-sync] Executando append para", table, "com", payload?.items?.length ?? 0, "items");
      const items = (payload?.items ?? []) as Record<string, unknown>[];
      const rows = items.map((it) => headers.map((h) => {
        const v = it[h];
        if (v === undefined || v === null) return "";
        if (typeof v === "object") return JSON.stringify(v);
        return String(v);
      }));
      console.log("[sheets-sync] Anexando", rows.length, "linhas");
      await appendRows(table, rows);
      return json({ ok: true });
    }

    return json({ error: `Operação inválida: ${op}` }, 400);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const stack = e instanceof Error ? e.stack : "";
    console.error("[sheets-sync] erro:", msg);
    console.error("[sheets-sync] stack:", stack);
    return json({ error: msg, details: stack }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
