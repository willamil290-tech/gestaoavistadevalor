// Auto-sync entre localStorage e Google Sheets (aba `local_archive`).
//
// - `pullAllFromSheets()`: roda no boot do app. Baixa TODAS as chaves arquivadas
//   no Sheets para o localStorage. Chaves locais com timestamp mais recente que
//   o Sheets ganham (não são sobrescritas).
// - `pushKeyToSheets(key)`: dispara um upsert atômico (debounced) para a chave
//   no Sheets. Usado pelo `localStore.saveJson` para chaves de negócio.

import { sheetsSelect } from "@/lib/sheetsClient";
import { compressToBase64, decompressFromBase64 } from "lz-string";

const FN_NAME = "sheets-sync";
const MAX_CELL = 45_000;
const COMPRESS_PREFIX = "LZB64:";
// Chaves grandes (eventos detalhados) sempre comprimimos para reduzir
// chunks e tamanho total da planilha.
const ALWAYS_COMPRESS: RegExp[] = [/^bitrixEvents:/];

function functionsUrl(): string {
  const base = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (!base) throw new Error("VITE_SUPABASE_URL não disponível");
  return `${base.replace(/\/$/, "")}/functions/v1/${FN_NAME}`;
}
function anonKey(): string {
  const k = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined)
    ?? (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined);
  if (!k) throw new Error("VITE_SUPABASE_ANON_KEY não disponível");
  return k;
}

// Padrões de chaves de negócio que devem ser auto-sincronizadas.
const BUSINESS_PATTERNS: RegExp[] = [
  /^acionGeral:/,
  /^acionDet:/,
  /^trendData:/,
  /^calls:/,
  /^bitrixEvents:/,
];

export function isBusinessKey(key: string): boolean {
  return BUSINESS_PATTERNS.some((re) => re.test(key));
}

function shouldCompress(key: string, value: string): boolean {
  if (ALWAYS_COMPRESS.some((re) => re.test(key))) return true;
  return value.length > MAX_CELL;
}

function maybeDecompress(value: string): string {
  if (!value.startsWith(COMPRESS_PREFIX)) return value;
  try {
    const out = decompressFromBase64(value.slice(COMPRESS_PREFIX.length));
    return out ?? value;
  } catch {
    return value;
  }
}

// Debounce por chave: reduz spam quando vários `saveJson` rápidos acontecem.
const pending = new Map<string, ReturnType<typeof setTimeout>>();
const DEBOUNCE_MS = 1500;
let initPromise: Promise<void> | null = null;

async function rpc(body: unknown): Promise<any> {
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
    const msg = (data && data.error) || `HTTP ${res.status}`;
    throw new Error(`[sheetsSync] ${msg}`);
  }
  return data;
}

async function ensureInit(): Promise<void> {
  if (!initPromise) {
    initPromise = rpc({ op: "init" }).then(() => undefined).catch((e) => {
      initPromise = null;
      throw e;
    });
  }
  return initPromise;
}

/** Faz upsert atômico de uma chave no Sheets (com chunking se necessário). */
export async function pushKeyToSheetsNow(key: string): Promise<void> {
  if (!isBusinessKey(key)) return;
  const value = (() => {
    try { return localStorage.getItem(key) ?? ""; } catch { return ""; }
  })();

  await ensureInit();

  if (value.length === 0) {
    // Remoção: upsert sem itens limpa todas as linhas dessa baseKey.
    await rpc({
      op: "upsert_local_key",
      table: "local_archive",
      payload: { baseKey: key, items: [] },
    });
    return;
  }

  const now = new Date().toISOString();
  const stored = shouldCompress(key, value)
    ? COMPRESS_PREFIX + compressToBase64(value)
    : value;
  const items: Array<Record<string, unknown>> = [];
  if (stored.length <= MAX_CELL) {
    items.push({ key, value: stored, size: stored.length, updated_at: now });
  } else {
    let idx = 0;
    for (let pos = 0; pos < stored.length; pos += MAX_CELL) {
      const part = stored.slice(pos, pos + MAX_CELL);
      items.push({ key: `${key}#${idx}`, value: part, size: part.length, updated_at: now });
      idx++;
    }
  }

  await rpc({
    op: "upsert_local_key",
    table: "local_archive",
    payload: { baseKey: key, items },
  });
}

/** Versão debounced. Chamada do localStore.saveJson sem await. */
export function pushKeyToSheets(key: string): void {
  if (!isBusinessKey(key)) return;
  const prev = pending.get(key);
  if (prev) clearTimeout(prev);
  const t = setTimeout(() => {
    pending.delete(key);
    pushKeyToSheetsNow(key).catch((e) => {
      console.warn(`[sheetsSync] Falha ao salvar '${key}' no Sheets:`, e);
    });
  }, DEBOUNCE_MS);
  pending.set(key, t);
}

/**
 * Baixa todas as chaves arquivadas no Sheets para o localStorage.
 * Estratégia: o Sheets é a fonte da verdade. Sempre sobrescreve o local
 * (assim, recarregar a página sem ter dados — ou em outro navegador — recupera tudo).
 */
export async function pullAllFromSheets(opts?: {
  onProgress?: (done: number, total: number) => void;
}): Promise<{ restored: number }> {
  await ensureInit();
  const rows = await sheetsSelect<Record<string, string>>("local_archive");

  // Reagrupa chunks key#N -> string única.
  const chunks = new Map<string, { idx: number; value: string }[]>();
  const flat = new Map<string, string>();
  for (const r of rows) {
    const k = String(r.key ?? "");
    if (!k) continue;
    const m = k.match(/^(.*)#(\d+)$/);
    if (m) {
      const arr = chunks.get(m[1]) ?? [];
      arr.push({ idx: Number(m[2]), value: String(r.value ?? "") });
      chunks.set(m[1], arr);
    } else {
      flat.set(k, String(r.value ?? ""));
    }
  }
  for (const [base, parts] of chunks) {
    parts.sort((a, b) => a.idx - b.idx);
    flat.set(base, parts.map((p) => p.value).join(""));
  }

  let restored = 0;
  const entries = Array.from(flat.entries());
  for (let i = 0; i < entries.length; i++) {
    const [key, rawValue] = entries[i];
    if (!isBusinessKey(key)) continue;
    const value = maybeDecompress(rawValue);
    try {
      // Marca para que o próximo saveJson não dispare push de volta com o mesmo valor.
      bootstrapKeys.add(key);
      localStorage.setItem(key, value);
      restored++;
    } catch { /* quota — ignora */ }
    opts?.onProgress?.(i + 1, entries.length);
  }
  return { restored };
}

// Chaves carregadas pelo bootstrap. O primeiro saveJson após bootstrap
// não precisa repush se o valor for idêntico.
const bootstrapKeys = new Set<string>();
export function wasJustBootstrapped(key: string): boolean {
  if (bootstrapKeys.has(key)) {
    bootstrapKeys.delete(key);
    return true;
  }
  return false;
}