// Sincronização entre localStorage e Lovable Cloud (tabela public.app_data).
// Substitui o uso do Google Sheets como fonte da verdade.
//
// API equivalente ao antigo sheetsSync para minimizar mudanças nos consumidores:
// - pushKeyToSheets(key)        -> debounced push
// - pushKeyToSheetsNow(key)     -> push imediato
// - pullAllFromSheets()         -> baixa todas as chaves de negócio
// - pullKeyFromSheets(key)      -> baixa uma chave específica
// - flushPendingPushes()        -> aguarda debounces pendentes
// - wasJustBootstrapped(key)    -> evita ping-pong logo após restore
// - isBusinessKey(key)          -> filtra chaves que vão pro cloud

import { supabase } from "@/integrations/supabase/client";

const BUSINESS_PATTERNS: RegExp[] = [
  /^acionGeral:/,
  /^acionDet:/,
  /^trendData:/,
  /^calls:/,
  /^bitrixEvents:/,
  /^dashSettings/,
  /^teamMembers/,
  /^dashExtras/,
];

export function isBusinessKey(key: string): boolean {
  return BUSINESS_PATTERNS.some((re) => re.test(key));
}

function hasMeaningfulValue(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value as Record<string, unknown>).length > 0;
  return true;
}

const pending = new Map<string, ReturnType<typeof setTimeout>>();
const DEBOUNCE_MS = 800;

const bootstrapKeys = new Set<string>();
export function wasJustBootstrapped(key: string): boolean {
  if (bootstrapKeys.has(key)) {
    bootstrapKeys.delete(key);
    return true;
  }
  return false;
}

function readLocal(key: string): string {
  try { return localStorage.getItem(key) ?? ""; } catch { return ""; }
}

/** Push imediato de uma chave para o Cloud. */
export async function pushKeyToSheetsNow(key: string): Promise<void> {
  if (!isBusinessKey(key)) return;
  const raw = readLocal(key);
  if (raw.length === 0) {
    const { error } = await supabase.from("app_data").delete().eq("key", key);
    if (error) throw error;
    return;
  }
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { parsed = raw; }
  const { error } = await supabase
    .from("app_data")
    .upsert({ key, value: parsed as never }, { onConflict: "key" });
  if (error) throw error;
}

/** Push debounced — usado pelo localStore.saveJson. */
export function pushKeyToSheets(key: string): void {
  if (!isBusinessKey(key)) return;
  const prev = pending.get(key);
  if (prev) clearTimeout(prev);
  const t = setTimeout(() => {
    pending.delete(key);
    pushKeyToSheetsNow(key).catch((e) => {
      console.warn(`[cloudSync] Falha ao salvar '${key}':`, e);
    });
  }, DEBOUNCE_MS);
  pending.set(key, t);
}

/** Baixa todas as chaves de negócio do Cloud para o localStorage. */
export async function pullAllFromSheets(opts?: {
  onProgress?: (done: number, total: number) => void;
}): Promise<{ restored: number }> {
  // Busca em páginas para evitar limite de 1000 do PostgREST.
  const PAGE = 1000;
  const all: { key: string; value: unknown }[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("app_data")
      .select("key, value")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...(data as { key: string; value: unknown }[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }

  let restored = 0;
  for (let i = 0; i < all.length; i++) {
    const { key, value } = all[i];
    if (!isBusinessKey(key)) continue;
    if (!hasMeaningfulValue(value)) {
      opts?.onProgress?.(i + 1, all.length);
      continue;
    }
    try {
      const serialized = typeof value === "string" ? value : JSON.stringify(value);
      bootstrapKeys.add(key);
      localStorage.setItem(key, serialized);
      restored++;
    } catch {
      /* quota — ignora */
    }
    opts?.onProgress?.(i + 1, all.length);
  }
  return { restored };
}

/** Baixa UMA chave específica do Cloud para o localStorage. */
export async function pullKeyFromSheets(key: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("app_data")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (error) {
    console.warn(`[cloudSync] pullKey '${key}':`, error.message);
    return false;
  }
  if (!data) return false;
  try {
    const v = (data as { value: unknown }).value;
    if (!hasMeaningfulValue(v)) return false;
    const serialized = typeof v === "string" ? v : JSON.stringify(v);
    bootstrapKeys.add(key);
    localStorage.setItem(key, serialized);
    return true;
  } catch {
    return false;
  }
}

/** Aguarda todos os pushes debounced finalizarem. */
export async function flushPendingPushes(): Promise<void> {
  const keys = Array.from(pending.keys());
  for (const k of keys) {
    const t = pending.get(k);
    if (t) clearTimeout(t);
    pending.delete(k);
  }
  await Promise.all(keys.map((k) => pushKeyToSheetsNow(k).catch((e) => {
    console.warn(`[cloudSync] flush falhou para '${k}':`, e);
  })));
}
