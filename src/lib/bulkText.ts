export type BulkEntry = {
  name: string;
  morning: number;
  afternoon: number;
};

function norm(s: string) {
  return s.replace(/\r/g, "").replace(/\u00A0/g, " ").trim();
}

function extractInt(line: string) {
  const m = line.match(/(-?\d+)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/**
 * Parses blocks like:
 * Name
 *
 * Manhã: 0 empresas únicas
 *
 * Tarde: 2 empresas únicas
 *
 * Returns one entry per name (last occurrence wins).
 */
export function parseBulkText(text: string): BulkEntry[] {
  const lines = norm(text).split("\n");
  const out: BulkEntry[] = [];

  let name: string | null = null;
  let morning: number | null = null;
  let afternoon: number | null = null;

  const flush = () => {
    if (!name) return;
    out.push({ name: name.trim(), morning: morning ?? 0, afternoon: afternoon ?? 0 });
    name = null;
    morning = null;
    afternoon = null;
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    const lower = line.toLowerCase();
    const isMorning = lower.includes("manhã") || lower.includes("manha");
    const isAfternoon = lower.includes("tarde");

    if (isMorning) {
      const n = extractInt(line);
      if (n !== null) morning = n;
      continue;
    }
    if (isAfternoon) {
      const n = extractInt(line);
      if (n !== null) afternoon = n;
      continue;
    }

    // treat as name line
    if (name) flush();
    name = line;
  }
  flush();

  // Deduplicate: last occurrence wins (case-insensitive)
  const map = new Map<string, BulkEntry>();
  for (const e of out) map.set(normalizeNameKey(e.name), e);
  return Array.from(map.values());
}

export function normalizeNameKey(name: string) {
  return norm(name).toLowerCase();
}
