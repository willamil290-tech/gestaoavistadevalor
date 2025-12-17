export type BulkEntry = {
  name: string;
  morning: number;
  afternoon: number;
};

export function normalizeName(name: string) {
  return name
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Parseia texto colado no padrão:
 * Nome
 * Manhã: 0 ...
 * Tarde: 2 ...
 *
 * Aceita variações como "Manha", "Manhã", "Tarde", com qualquer sufixo após o número.
 */
export function parseBulkTeamText(text: string): BulkEntry[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const out: BulkEntry[] = [];

  const rxMorning = /^(manha|manhã)\s*:\s*(\d+)/i;
  const rxAfternoon = /^tarde\s*:\s*(\d+)/i;

  let current: { name: string; morning?: number; afternoon?: number } | null = null;

  const pushCurrent = () => {
    if (!current) return;
    const name = current.name?.trim();
    if (!name) return;
    out.push({
      name,
      morning: Number(current.morning ?? 0),
      afternoon: Number(current.afternoon ?? 0),
    });
  };

  for (const line of lines) {
    if (!line) continue;

    const m1 = line.match(rxMorning);
    if (m1) {
      if (!current) current = { name: "" };
      current.morning = Number(m1[2] ?? 0);
      continue;
    }

    const m2 = line.match(rxAfternoon);
    if (m2) {
      if (!current) current = { name: "" };
      current.afternoon = Number(m2[1] ?? 0);
      continue;
    }

    // Linha de nome (inicia novo bloco)
    if (current && current.name && (current.morning !== undefined || current.afternoon !== undefined)) {
      pushCurrent();
    }
    current = { name: line };
  }

  pushCurrent();

  // Remove duplicados (mesmo nome), mantendo o último bloco
  const map = new Map<string, BulkEntry>();
  for (const e of out) map.set(normalizeName(e.name), e);
  return Array.from(map.values());
}
