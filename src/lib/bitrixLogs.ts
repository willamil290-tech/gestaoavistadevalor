import { isIgnoredCommercial } from "@/lib/ignoredCommercials";

export type BitrixEntityType = "NEGÓCIO" | "LEAD";

export type BitrixActionCategory =
  | "ETAPA_ALTERADA"
  | "ATIVIDADE_CRIADA"
  | "STATUS_ATIVIDADE_ALTERADA"
  | "CHAMADA_TELEFONICA"
  | "OUTROS";

export type BitrixEvent = {
  entityType: BitrixEntityType;
  empresa: string; // exatamente como aparece
  comercial: string; // exatamente como aparece
  actionLine: string;
  actionCategory: BitrixActionCategory;
  timeHHMM: string; // HH:MM calculado/extraído
  hour: number; // 0-23
  ageSeconds: number; // usado para desempate (maior = mais antigo)
  idx: number; // ordem no texto (para desempate final)
};

const DAY_SECONDS = 24 * 60 * 60;

function removeDiacritics(input: string) {
  return input.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeForCompare(input: string) {
  return removeDiacritics(input)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeEmpresaForDedupe(input: string) {
  // Apenas para deduplicar empresas: case-insensitive + remover espaços extras
  return input.toLowerCase().replace(/\s+/g, " ").trim();
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function parseCurrentTimeHHMM(hhmm: string): { ok: true; seconds: number; normalized: string } | { ok: false } {
  const m = hhmm.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return { ok: false };
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return { ok: false };
  if (hh < 0 || hh > 23) return { ok: false };
  if (mm < 0 || mm > 59) return { ok: false };
  return { ok: true, seconds: hh * 3600 + mm * 60, normalized: `${pad2(hh)}:${pad2(mm)}` };
}

type TimeParse =
  | { ok: true; secondsOfDay: number; ageSeconds: number; hhmm: string }
  | { ok: false };

function wrapSeconds(sec: number) {
  let s = sec % DAY_SECONDS;
  if (s < 0) s += DAY_SECONDS;
  return s;
}

function secondsToHHMM(sec: number) {
  const hh = Math.floor(sec / 3600);
  const mm = Math.floor((sec % 3600) / 60);
  return `${pad2(hh)}:${pad2(mm)}`;
}

function parseTimelineLine(lineRaw: string, currentSeconds: number): TimeParse {
  const line = lineRaw.trim();

  // hoje, HH:MM
  const hoje = line.match(/\bhoje\b\s*,?\s*(\d{1,2}:\d{2})/i);
  if (hoje) {
    const t = hoje[1];
    const cur = parseCurrentTimeHHMM(t);
    if (!cur.ok) return { ok: false };
    const sec = cur.seconds;
    let age = currentSeconds - sec;
    if (age < 0) age += DAY_SECONDS;
    return { ok: true, secondsOfDay: sec, ageSeconds: age, hhmm: secondsToHHMM(sec) };
  }

  // X minutos atrás
  const min = line.match(/\b(\d+)\s*(minuto|minutos|min)\s*atr[aá]s\b/i);
  if (min) {
    const x = Number(min[1]);
    if (!Number.isFinite(x)) return { ok: false };
    const age = x * 60;
    const sec = wrapSeconds(currentSeconds - age);
    return { ok: true, secondsOfDay: sec, ageSeconds: age, hhmm: secondsToHHMM(sec) };
  }

  // X segundos atrás
  const secm = line.match(/\b(\d+)\s*(segundo|segundos|seg)\s*atr[aá]s\b/i);
  if (secm) {
    const x = Number(secm[1]);
    if (!Number.isFinite(x)) return { ok: false };
    const age = x;
    const sec = wrapSeconds(currentSeconds - age);
    return { ok: true, secondsOfDay: sec, ageSeconds: age, hhmm: secondsToHHMM(sec) };
  }

  // X horas atrás
  const hrm = line.match(/\b(\d+)\s*(hora|horas|hr|hrs)\s*atr[aá]s\b/i);
  if (hrm) {
    const x = Number(hrm[1]);
    if (!Number.isFinite(x)) return { ok: false };
    const age = x * 3600;
    const sec = wrapSeconds(currentSeconds - age);
    return { ok: true, secondsOfDay: sec, ageSeconds: age, hhmm: secondsToHHMM(sec) };
  }

  // ontem, HH:MM
  const ontem = line.match(/\bontem\b\s*,?\s*(\d{1,2}:\d{2})/i);
  if (ontem) {
    const t = ontem[1];
    const cur = parseCurrentTimeHHMM(t);
    if (!cur.ok) return { ok: false };
    const sec = cur.seconds;
    // age = time since yesterday at that hour
    const age = DAY_SECONDS + (currentSeconds - sec);
    return { ok: true, secondsOfDay: sec, ageSeconds: age, hhmm: secondsToHHMM(sec) };
  }

  // DD.MM.YYYY HH:MM  or  DD/MM/YYYY HH:MM  or  DD.MM.YYYY, HH:MM (absolute date)
  const absDate = line.match(/\b(\d{1,2})[./](\d{1,2})[./](\d{4})\s*,?\s*(\d{1,2}:\d{2})/);
  if (absDate) {
    const t = absDate[4];
    const cur = parseCurrentTimeHHMM(t);
    if (!cur.ok) return { ok: false };
    const sec = cur.seconds;
    // We don't compute real age across days, just put a large ageSeconds based on date diff estimate
    const age = DAY_SECONDS * 2 + (currentSeconds - sec);
    return { ok: true, secondsOfDay: sec, ageSeconds: Math.max(age, 0), hhmm: secondsToHHMM(sec) };
  }

  // DD de mês, HH:MM  or  DD de mês HH:MM  (e.g. "15 de fevereiro, 14:30")
  const absBR = line.match(/\b(\d{1,2})\s+de\s+\w+\s*,?\s*(\d{1,2}:\d{2})/i);
  if (absBR) {
    const t = absBR[2];
    const cur = parseCurrentTimeHHMM(t);
    if (!cur.ok) return { ok: false };
    const sec = cur.seconds;
    const age = DAY_SECONDS * 2 + (currentSeconds - sec);
    return { ok: true, secondsOfDay: sec, ageSeconds: Math.max(age, 0), hhmm: secondsToHHMM(sec) };
  }

  // DD/MM HH:MM  or  DD.MM, HH:MM (without year)
  const absShort = line.match(/\b(\d{1,2})[./](\d{1,2})\s*,?\s*(\d{1,2}:\d{2})/);
  if (absShort) {
    const t = absShort[3];
    const cur = parseCurrentTimeHHMM(t);
    if (!cur.ok) return { ok: false };
    const sec = cur.seconds;
    const age = DAY_SECONDS * 2 + (currentSeconds - sec);
    return { ok: true, secondsOfDay: sec, ageSeconds: Math.max(age, 0), hhmm: secondsToHHMM(sec) };
  }

  return { ok: false };
}

function parseEntityType(line: string): BitrixEntityType | null {
  const norm = normalizeForCompare(line);
  if (norm === "lead") return "LEAD";
  if (norm === "negocio" || norm === "negócio") return "NEGÓCIO";
  return null;
}

export function classifyAction(actionLineRaw: string): BitrixActionCategory {
  const norm = normalizeForCompare(actionLineRaw);
  if (norm.includes("etapa alterada")) return "ETAPA_ALTERADA";
  if (norm.includes("atividade criada")) return "ATIVIDADE_CRIADA";
  if (norm.includes("status da atividade")) return "STATUS_ATIVIDADE_ALTERADA";
  if (norm.includes("chamada telefonica criada") || norm.includes("chamada telefônica criada")) return "CHAMADA_TELEFONICA";
  return "OUTROS";
}

export function parseBitrixTextToEvents(
  text: string,
  currentHHMM: string,
  startIdxOffset = 0
): { ok: true; events: BitrixEvent[]; normalizedCurrentTime: string } | { ok: false; error: string } {
  const cur = parseCurrentTimeHHMM(currentHHMM);
  if (!cur.ok) return { ok: false, error: "Horário inválido. Use HH:MM (24h)." };

  const lines = text
    .split(/\r?\n/g)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const out: BitrixEvent[] = [];
  let i = 0;
  let idx = startIdxOffset;

  while (i < lines.length) {
    const t = parseTimelineLine(lines[i], cur.seconds);
    if (t.ok && i + 4 < lines.length) {
      const entity = parseEntityType(lines[i + 1]);
      if (entity) {
        const empresa = lines[i + 2].trim();
        const comercial = lines[i + 3].trim();
        const actionLine = lines[i + 4].trim();

        out.push({
          entityType: entity,
          empresa,
          comercial,
          actionLine,
          actionCategory: classifyAction(actionLine),
          timeHHMM: t.hhmm,
          hour: Number(t.hhmm.slice(0, 2)),
          ageSeconds: t.ageSeconds,
          idx,
        });

        idx += 1;
        i += 5;
        continue;
      }
    }
    i += 1;
  }

  return { ok: true, events: out, normalizedCurrentTime: cur.normalized };
}

export type BitrixReport = {
  hourlyCounts: Record<number, number>; // hour -> count
  uniqueResumo: Array<{
    comercial: string;
    entityType: BitrixEntityType;
    morning: number;
    afternoon: number;
  }>;
  actionResumo: Array<{
    comercial: string;
    counts: Record<BitrixActionCategory, number>;
  }>;
};

function compareCommercial(a: string, b: string) {
  return a.localeCompare(b, "pt-BR", { sensitivity: "base" });
}

export function buildBitrixReport(events: BitrixEvent[]): BitrixReport {
  const filteredEvents = events.filter((e) => !isIgnoredCommercial(e.comercial));
  // (A) Acionamentos por hora (total geral)
  const hourlyCounts: Record<number, number> = {};
  for (const e of filteredEvents) {
    hourlyCounts[e.hour] = (hourlyCounts[e.hour] ?? 0) + 1;
  }

  // Resumo (1) - empresas únicas por comercial, por tipo, manhã/tarde
  // Dedup por (comercial + tipo + empresa norm) e pega o registro mais antigo (maior ageSeconds). Empate: menor idx.
  const commercialDisplayByKey = new Map<string, string>();
  const uniqueMap = new Map<
    string,
    { comercialKey: string; comercial: string; entityType: BitrixEntityType; empresaKey: string; oldest: BitrixEvent }
  >();

  for (const e of filteredEvents) {
    const comercialKey = normalizeForCompare(e.comercial);
    const empresaKey = normalizeEmpresaForDedupe(e.empresa);

    if (!commercialDisplayByKey.has(comercialKey)) commercialDisplayByKey.set(comercialKey, e.comercial);

    const key = `${comercialKey}||${e.entityType}||${empresaKey}`;
    const existing = uniqueMap.get(key);
    if (!existing) {
      uniqueMap.set(key, {
        comercialKey,
        comercial: commercialDisplayByKey.get(comercialKey) ?? e.comercial,
        entityType: e.entityType,
        empresaKey,
        oldest: e,
      });
    } else {
      const a = existing.oldest;
      const b = e;
      const bIsOlder = b.ageSeconds > a.ageSeconds || (b.ageSeconds === a.ageSeconds && b.idx < a.idx);
      if (bIsOlder) {
        existing.oldest = b;
      }
    }
  }

  const resumo1Map = new Map<string, { comercial: string; entityType: BitrixEntityType; morning: number; afternoon: number }>();
  for (const entry of uniqueMap.values()) {
    const hour = entry.oldest.hour;
    const isMorning = hour <= 11;
    const key = `${entry.comercialKey}||${entry.entityType}`;
    const existing = resumo1Map.get(key);
    if (!existing) {
      resumo1Map.set(key, {
        comercial: entry.comercial,
        entityType: entry.entityType,
        morning: isMorning ? 1 : 0,
        afternoon: isMorning ? 0 : 1,
      });
    } else {
      if (isMorning) existing.morning += 1;
      else existing.afternoon += 1;
    }
  }

  const uniqueResumo = Array.from(resumo1Map.values()).sort((a, b) => {
    const c = compareCommercial(a.comercial, b.comercial);
    if (c !== 0) return c;
    // NEGÓCIO antes de LEAD
    if (a.entityType === b.entityType) return 0;
    return a.entityType === "NEGÓCIO" ? -1 : 1;
  });

  // Resumo (2) - ações por comercial (todos os eventos)
  const actionMap = new Map<string, { comercial: string; counts: Record<BitrixActionCategory, number> }>();
  const allCats: BitrixActionCategory[] = [
    "ETAPA_ALTERADA",
    "ATIVIDADE_CRIADA",
    "STATUS_ATIVIDADE_ALTERADA",
    "CHAMADA_TELEFONICA",
    "OUTROS",
  ];

  for (const e of filteredEvents) {
    const comercialKey = normalizeForCompare(e.comercial);
    if (!commercialDisplayByKey.has(comercialKey)) commercialDisplayByKey.set(comercialKey, e.comercial);
    const comercial = commercialDisplayByKey.get(comercialKey) ?? e.comercial;

    const existing = actionMap.get(comercialKey);
    if (!existing) {
      const counts = Object.fromEntries(allCats.map((k) => [k, 0])) as Record<BitrixActionCategory, number>;
      counts[e.actionCategory] = 1;
      actionMap.set(comercialKey, { comercial, counts });
    } else {
      existing.counts[e.actionCategory] = (existing.counts[e.actionCategory] ?? 0) + 1;
    }
  }

  const actionResumo = Array.from(actionMap.values()).sort((a, b) => compareCommercial(a.comercial, b.comercial));

  return { hourlyCounts, uniqueResumo, actionResumo };
}

export function formatBitrixReport(report: BitrixReport): string {
  const lines: string[] = [];

  // (A)
  lines.push("Acionamentos por hora (total geral)");
  lines.push("");
  const hours = Object.keys(report.hourlyCounts)
    .map((h) => Number(h))
    .filter((h) => report.hourlyCounts[h] > 0)
    .sort((a, b) => a - b);

  for (const h of hours) {
    lines.push(`${pad2(h)}: ${report.hourlyCounts[h]}`);
  }

  lines.push("");
  lines.push("");

  // (1)
  for (const r of report.uniqueResumo) {
    lines.push(`${r.comercial} — ${r.entityType}`);
    lines.push(`Manhã: ${r.morning} empresas únicas`);
    lines.push(`Tarde: ${r.afternoon} empresas únicas`);
    lines.push("");
  }

  if (report.uniqueResumo.length > 0) {
    lines.push("");
  }

  // (2)
  for (const r of report.actionResumo) {
    lines.push(r.comercial);
    lines.push(`ETAPA_ALTERADA: ${r.counts.ETAPA_ALTERADA ?? 0}`);
    lines.push(`ATIVIDADE_CRIADA: ${r.counts.ATIVIDADE_CRIADA ?? 0}`);
    lines.push(`STATUS_ATIVIDADE_ALTERADA: ${r.counts.STATUS_ATIVIDADE_ALTERADA ?? 0}`);
    lines.push(`CHAMADA_TELEFONICA: ${r.counts.CHAMADA_TELEFONICA ?? 0}`);
    lines.push(`OUTROS: ${r.counts.OUTROS ?? 0}`);
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

export function parseAndBuildBitrixReport(params: {
  currentHHMM: string;
  negociosText: string;
  leadsText: string;
}):
  | { ok: true; reportText: string; eventsCount: number; report: BitrixReport }
  | { ok: false; error: string } {
  const a = parseBitrixTextToEvents(params.negociosText, params.currentHHMM, 0);
  if (!a.ok) return { ok: false, error: a.error };
  const b = parseBitrixTextToEvents(params.leadsText, params.currentHHMM, a.events.length);
  if (!b.ok) return { ok: false, error: b.error };
  const all = [...a.events, ...b.events];
  const filtered = all.filter((e) => !isIgnoredCommercial(e.comercial));
  const report = buildBitrixReport(filtered);
  const reportText = formatBitrixReport(report);
  return { ok: true, reportText, eventsCount: filtered.length, report };
}
