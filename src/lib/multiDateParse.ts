import { parseBulkTeamText, parseDetailedAcionamento, type BulkEntry, type DetailedEntry } from "./bulkParse";

/**
 * Parser multi-data para acionamentos.
 *
 * O texto colado pode conter múltiplas datas e blocos misturados de Leads e
 * Negócios. Esta função fatia o texto em segmentos por data e por tipo, e
 * devolve dados normalizados prontos para serem persistidos.
 *
 * Datas reconhecidas (qualquer linha contendo o padrão):
 *   - DD/MM/AAAA  ou  DD/MM/AA
 *   - DD-MM-AAAA
 *   - DD.MM.AAAA
 *   - "Data: DD/MM/AAAA"
 *   - "Dia DD/MM"
 *
 * Tipos reconhecidos (cabeçalho dentro do segmento):
 *   - "LEAD" / "LEADS"
 *   - "NEGOCIO" / "NEGOCIOS" / "EMPRESA" / "EMPRESAS"
 *
 * Quando o texto inclui blocos `RESUMO NUMÉRICO` e `RESUMO DETALHADO`, eles
 * também são detectados normalmente.
 */

export type AcionamentoTipo = "negocio" | "lead" | "misto";

export interface MultiDateAcionamentoSegment {
  /** Data ISO YYYY-MM-DD a que este segmento pertence. */
  dateISO: string;
  /** Tipo identificado neste segmento (misto = não declarado, vai pra "geral"). */
  tipo: AcionamentoTipo;
  /** Linhas crus do segmento (para parser). */
  rawLines: string[];
}

export interface MultiDateParseResult {
  /** Segmentos resumo numérico (basic) por (data, tipo). */
  basicByDateTipo: Map<string, { dateISO: string; tipo: AcionamentoTipo; entries: BulkEntry[] }>;
  /** Resumo detalhado por data. */
  detailedByDate: Map<string, DetailedEntry[]>;
  /** Datas únicas detectadas. */
  datesFound: string[];
  /** Tipos únicos detectados. */
  tiposFound: AcionamentoTipo[];
  /** Total de entradas básicas reconhecidas. */
  totalBasicEntries: number;
  /** Total de entradas detalhadas reconhecidas. */
  totalDetailedEntries: number;
  /** Texto sem nenhuma data identificada (usa fallbackDate). */
  usedFallbackDate: boolean;
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function normalizeDateToken(raw: string): string | null {
  // raw ex: "21/04/2026", "21-04-2026", "21.04.2026", "21/04/26", "21/04"
  const m = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?$/);
  if (!m) return null;
  const d = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  let y: number;
  if (m[3]) {
    const raw3 = parseInt(m[3], 10);
    y = raw3 < 100 ? 2000 + raw3 : raw3;
  } else {
    y = new Date().getFullYear();
  }
  if (d < 1 || d > 31 || mo < 1 || mo > 12) return null;
  return `${y}-${pad2(mo)}-${pad2(d)}`;
}

/** Detecta se a linha indica uma data e retorna ISO. */
function detectDateInLine(line: string): string | null {
  const cleaned = line.trim();

  // "Data: DD/MM/AAAA"
  const m1 = cleaned.match(/^data\s*:\s*(\d{1,2}[\/\-.]\d{1,2}(?:[\/\-.]\d{2,4})?)/i);
  if (m1) return normalizeDateToken(m1[1]);

  // "Dia DD/MM/AAAA" ou "Dia DD/MM"
  const m2 = cleaned.match(/^dia\s+(\d{1,2}[\/\-.]\d{1,2}(?:[\/\-.]\d{2,4})?)/i);
  if (m2) return normalizeDateToken(m2[1]);

  // "=== DD/MM/AAAA ===" ou variações com símbolos
  const m3 = cleaned.match(/^[#=\-*\s]*(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})[#=\-*\s]*$/);
  if (m3) return normalizeDateToken(m3[1]);

  // Linha que é APENAS uma data
  const m4 = cleaned.match(/^(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})$/);
  if (m4) return normalizeDateToken(m4[1]);

  // Cabeçalho RESUMO ... DD/MM/AAAA
  const m5 = cleaned.match(/resumo[^0-9]*(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/i);
  if (m5) return normalizeDateToken(m5[1]);

  return null;
}

/** Detecta cabeçalho de tipo. */
function detectTipoInLine(line: string): AcionamentoTipo | null {
  const cleaned = line.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  // Linhas curtas, tipo cabeçalho
  if (cleaned.length > 40) return null;
  if (/^[#=\-*\s]*lead[s]?[#=\-*\s:]*$/.test(cleaned)) return "lead";
  if (/^[#=\-*\s]*(negocio[s]?|empresa[s]?)[#=\-*\s:]*$/.test(cleaned)) return "negocio";
  return null;
}

/** Detecta cabeçalho de RESUMO DETALHADO. */
function isDetailedHeader(line: string): boolean {
  return /resumo\s+detalhad/i.test(line);
}
function isBasicHeader(line: string): boolean {
  return /resumo\s+numeric/i.test(line.normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
}

export function parseMultiDateAcionamento(
  text: string,
  fallbackDateISO: string,
): MultiDateParseResult {
  const lines = text.split(/\r?\n/);

  // Estado de varredura
  let currentDate: string = fallbackDateISO;
  let currentTipo: AcionamentoTipo = "misto";
  let currentSection: "basic" | "detailed" = "basic";
  let usedFallback = true;

  type Segment = {
    dateISO: string;
    tipo: AcionamentoTipo;
    section: "basic" | "detailed";
    lines: string[];
  };
  const segments: Segment[] = [];
  const newSegment = () =>
    segments.push({ dateISO: currentDate, tipo: currentTipo, section: currentSection, lines: [] });
  newSegment();

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    // 1) Data?
    const d = detectDateInLine(line);
    if (d) {
      currentDate = d;
      usedFallback = false;
      newSegment();
      continue;
    }

    // 2) Tipo?
    const t = detectTipoInLine(line);
    if (t) {
      currentTipo = t;
      newSegment();
      continue;
    }

    // 3) Seção?
    if (isDetailedHeader(line)) {
      currentSection = "detailed";
      newSegment();
      continue;
    }
    if (isBasicHeader(line)) {
      currentSection = "basic";
      newSegment();
      continue;
    }

    // 4) Conteúdo do segmento atual
    segments[segments.length - 1].lines.push(raw);
  }

  // Agora processa cada segmento usando os parsers existentes.
  const basicByDateTipo = new Map<
    string,
    { dateISO: string; tipo: AcionamentoTipo; entries: BulkEntry[] }
  >();
  const detailedByDate = new Map<string, DetailedEntry[]>();

  let totalBasic = 0;
  let totalDetailed = 0;

  for (const seg of segments) {
    const segText = seg.lines.join("\n").trim();
    if (!segText) continue;

    if (seg.section === "detailed") {
      const parsed = parseDetailedAcionamento(segText);
      if (parsed.length > 0) {
        const prev = detailedByDate.get(seg.dateISO) ?? [];
        // merge: nomes iguais somam categorias
        const merged = [...prev];
        for (const p of parsed) {
          const existing = merged.find((m) => m.name === p.name);
          if (existing) {
            existing.etapaAlterada += p.etapaAlterada;
            existing.atividadeCriada += p.atividadeCriada;
            existing.statusAlterada += p.statusAlterada;
            existing.chamadaTelefonica += p.chamadaTelefonica;
            existing.outros += p.outros;
            existing.total += p.total;
          } else {
            merged.push({ ...p });
          }
        }
        detailedByDate.set(seg.dateISO, merged);
        totalDetailed += parsed.length;
      }
      continue;
    }

    // Basic
    const parsed = parseBulkTeamText(segText);
    if (parsed.length === 0) continue;

    const key = `${seg.dateISO}|${seg.tipo}`;
    const prev = basicByDateTipo.get(key) ?? { dateISO: seg.dateISO, tipo: seg.tipo, entries: [] };
    // merge por nome
    const map = new Map<string, BulkEntry>();
    for (const e of [...prev.entries, ...parsed]) {
      const cur = map.get(e.name);
      if (cur) {
        cur.morning += e.morning;
        cur.afternoon += e.afternoon;
      } else {
        map.set(e.name, { ...e });
      }
    }
    prev.entries = Array.from(map.values());
    basicByDateTipo.set(key, prev);
    totalBasic += parsed.length;
  }

  const datesFound = Array.from(
    new Set([
      ...Array.from(basicByDateTipo.values()).map((v) => v.dateISO),
      ...Array.from(detailedByDate.keys()),
    ])
  ).sort();

  const tiposFound = Array.from(
    new Set(Array.from(basicByDateTipo.values()).map((v) => v.tipo))
  );

  return {
    basicByDateTipo,
    detailedByDate,
    datesFound,
    tiposFound,
    totalBasicEntries: totalBasic,
    totalDetailedEntries: totalDetailed,
    usedFallbackDate: usedFallback && datesFound.length <= 1,
  };
}