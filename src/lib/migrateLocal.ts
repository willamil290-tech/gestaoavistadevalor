// Ferramenta de migração: lê chaves "de negócio" do localStorage e envia para
// a aba `local_archive` no Google Sheets via Edge Function. Também permite
// restaurar todas as chaves de volta para o localStorage do navegador atual.

import { sheetsSelect, sheetsUpsert } from "@/lib/sheetsClient";

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
  onProgress?: (done: number, total: number, key: string) => void;
}): Promise<{ count: number; bytes: number }> {
  const keys = listLocalKeys(opts?.includeUnknown ?? false);
  if (keys.length === 0) return { count: 0, bytes: 0 };

  // Upload em lotes pequenos pra não estourar a Sheets API por request.
  const BATCH = 25;
  let bytes = 0;
  let done = 0;
  for (let i = 0; i < keys.length; i += BATCH) {
    const slice = keys.slice(i, i + BATCH);
    const items = slice.map(({ key, size }) => {
      const value = localStorage.getItem(key) ?? "";
      bytes += value.length;
      return {
        key,
        value,
        size,
        updated_at: new Date().toISOString(),
      };
    });
    await sheetsUpsert("local_archive", items, "key");
    done += slice.length;
    opts?.onProgress?.(done, keys.length, slice[slice.length - 1].key);
  }
  return { count: keys.length, bytes };
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
  let restored = 0;
  let skipped = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const key = String(r.key ?? "");
    if (!key) continue;
    const existing = localStorage.getItem(key);
    if (existing !== null && !(opts?.overwrite ?? false)) {
      skipped++;
    } else {
      try {
        localStorage.setItem(key, String(r.value ?? ""));
        restored++;
      } catch { skipped++; }
    }
    opts?.onProgress?.(i + 1, rows.length, key);
  }
  return { restored, skipped };
}

export function humanBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}
