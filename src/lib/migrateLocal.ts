// Ferramenta de migração: lê chaves "de negócio" do localStorage e envia para
// a aba `local_archive` no Google Sheets via Edge Function. Também permite
// restaurar todas as chaves de volta para o localStorage do navegador atual.

import { sheetsAppend, sheetsReplace, sheetsSelect } from "@/lib/sheetsClient";

// Chaves que NÃO migramos (sessão/UI/flags efêmeras).
const SKIP_PREFIXES = [
  "auth",
  "tvMode",
  "tvTabs",
  "themePlayed:",
  "migration:",
  "sb-", // tokens supabase
];

// Padrões que indicam dado de negócio que vale preservar.
const BUSINESS_PATTERNS: RegExp[] = [
  /^acionGeral:/,        // histórico mensal Empresas/Leads
  /^acionDet:/,          // histórico mensal Detalhado
  /^trendData:/,         // tendência por hora (por dia)
  /^calls:/,             // histórico mensal de chamadas
  /^bitrixEvents:/,      // eventos detalhados Bitrix por dia
  /^teamMembers:/,       // snapshots por dia (fallback offline)
  /^dashboard:/,         // settings/extras antigos
  /^team:/,              // empresas/leads antigos
];

export type LocalKeyPreview = {
  key: string;
  size: number;
  reason: "business" | "unknown";
};

function isSkipped(key: string) {
  return SKIP_PREFIXES.some((p) => key.startsWith(p));
}

function isBusiness(key: string) {
  return BUSINESS_PATTERNS.some((re) => re.test(key));
}

/** Lista chaves do localStorage que serão consideradas para migração. */
export function listLocalKeys(includeUnknown = false): LocalKeyPreview[] {
  const out: LocalKeyPreview[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (isSkipped(k)) continue;
      const v = localStorage.getItem(k) ?? "";
      const business = isBusiness(k);
      if (!business && !includeUnknown) continue;
      out.push({ key: k, size: v.length, reason: business ? "business" : "unknown" });
    }
  } catch { /* ignore */ }
  out.sort((a, b) => b.size - a.size);
  return out;
}

/** Envia para o Sheets (aba local_archive) todas as chaves listadas. */
export async function migrateLocalToSheets(opts?: {
  includeUnknown?: boolean;
  selectedKeys?: string[];
  delayMs?: number;
  incremental?: boolean;
  forceUpdate?: boolean; // Nova opção: sempre atualizar mesmo se chave existir
  onProgress?: (done: number, total: number, key: string) => void;
}): Promise<{ count: number; bytes: number }> {
  const keys = listLocalKeys(opts?.includeUnknown ?? false);
  const filteredKeys = opts?.selectedKeys
    ? keys.filter((k) => opts.selectedKeys?.includes(k.key))
    : keys;
  if (filteredKeys.length === 0) return { count: 0, bytes: 0 };

  // Se incremental E não forçado, verificar quais chaves já existem no Sheets
  let existingKeys = new Set<string>();
  if (opts?.incremental && !opts?.forceUpdate) {
    try {
      const archived = await listArchivedKeys();
      existingKeys = new Set(archived.map((a) => a.key.split('#')[0])); // remover #0, #1 etc
    } catch (e) {
      console.warn('Não conseguiu verificar chaves existentes, migrando tudo:', e);
    }
  }

  // Filtrar apenas chaves que ainda não existem (se incremental) ou todas (se forceUpdate)
  const keysToMigrate = opts?.incremental && !opts?.forceUpdate
    ? filteredKeys.filter((k) => !existingKeys.has(k.key))
    : filteredKeys;

  if (keysToMigrate.length === 0) {
    return { count: 0, bytes: 0 }; // Nada novo para migrar
  }

  // Limite por célula do Sheets ~50.000 chars; usamos margem segura.
  const MAX_CELL = 45_000;
  // Quebra cada chave grande em múltiplas linhas key#0, key#1, ...
  type Row = { key: string; value: string; size: number; updated_at: string };
  const rows: Row[] = [];
  let bytes = 0;
  const now = new Date().toISOString();

  for (const { key } of keysToMigrate) {
    const v = localStorage.getItem(key) ?? "";
    bytes += v.length;
    if (v.length === 0) continue;
    if (v.length <= MAX_CELL) {
      rows.push({ key, value: v, size: v.length, updated_at: now });
    } else {
      let idx = 0;
      for (let pos = 0; pos < v.length; pos += MAX_CELL) {
        const part = v.slice(pos, pos + MAX_CELL);
        rows.push({ key: `${key}#${idx}`, value: part, size: part.length, updated_at: now });
        idx++;
      }
    }
  }

  // ESTRATÉGIA: se incremental E não forçado, apenas adiciona sem limpar.
  // Se forceUpdate ou não incremental, limpa a aba primeiro.
  if (!opts?.incremental || opts?.forceUpdate) {
    await withRetry(() => sheetsReplace("local_archive", []), "limpar aba");
  }

  // Lotes pequenos para não estourar payload do gateway (~6MB) nem timeout (~150s).
  // 3 linhas/lote ≈ 135KB max no body — bem seguro.
  const BATCH = 3;
  let done = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    await withRetry(() => sheetsAppend("local_archive", slice), `append lote ${Math.floor(i / BATCH) + 1}`);
    done += slice.length;
    opts?.onProgress?.(done, rows.length, slice[slice.length - 1].key);
    if (opts?.delayMs) {
      await new Promise((resolve) => setTimeout(resolve, opts.delayMs));
    }
  }
  return { count: keysToMigrate.length, bytes };
}

async function withRetry<T>(fn: () => Promise<T>, label: string, tries = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const wait = 1200 * (i + 1);
      console.warn(`[migrate] ${label} falhou (${i + 1}/${tries}). Retentando em ${wait}ms`, e);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}

/** Lista o que está arquivado no Sheets (sem baixar valores). */
export async function listArchivedKeys(): Promise<{ key: string; size: number; updated_at: string }[]> {
  const rows = await sheetsSelect<Record<string, string>>("local_archive");
  return rows.map((r) => ({
    key: String(r.key ?? ""),
    size: Number(r.size ?? 0),
    updated_at: String(r.updated_at ?? ""),
  })).filter((r) => r.key);
}

/** Restaura para o localStorage do navegador atual o que está no Sheets. */
export async function restoreArchiveToLocal(opts?: {
  overwrite?: boolean;
  onProgress?: (done: number, total: number, key: string) => void;
}): Promise<{ restored: number; skipped: number }> {
  const rows = await sheetsSelect<Record<string, string>>("local_archive");
  // Reagrupa chunks key#0, key#1, ... -> concatena em ordem.
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
  let skipped = 0;
  const entries = Array.from(flat.entries());
  for (let i = 0; i < entries.length; i++) {
    const [key, value] = entries[i];
    const existing = localStorage.getItem(key);
    if (existing !== null && !(opts?.overwrite ?? false)) {
      skipped++;
    } else {
      try {
        localStorage.setItem(key, value);
        restored++;
      } catch { skipped++; }
    }
    opts?.onProgress?.(i + 1, entries.length, key);
  }
  return { restored, skipped };
}

export function humanBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}
