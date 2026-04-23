import { canonicalizeCollaboratorNameForDate, collaboratorNameKey } from "./collaboratorNames";

/**
 * Parser para dados de chamadas colados do Bitrix (aba Chamadas).
 *
 * Estratégia LOSSLESS: o texto é dividido em blocos delimitados pelo nome do
 * colaborador. Dentro de cada bloco, identificamos os campos por padrão (não
 * por posição), de modo que blocos com duração ausente, linha "-" ou ordem
 * variável de contato/empresa NÃO sejam descartados.
 *
 * Nenhuma chamada válida (com nome + telefone + data + status reconhecíveis)
 * é descartada silenciosamente. Blocos que não puderem ser interpretados
 * voltam como `unparsedBlocks` no diagnóstico para revisão.
 */

export interface ParsedCall {
  /** Nome completo do colaborador */
  name: string;
  /** Telefone */
  phone: string;
  /** Direção: efetuadas | recebidas */
  direction: string;
  /** Duração em segundos (0 se não teve) */
  durationSeconds: number;
  /** Data/hora da chamada */
  dateTime: Date;
  /** Data ISO (YYYY-MM-DD) para agrupamento diário */
  dateISO: string;
  /** Horário formatado HH:MM */
  timeHHMM: string;
  /** Status da ligação */
  status: string;
  /** Informação do contato (ex: "Contato: Andressa" ou "Empresa: PARIMA") */
  contactInfo: string;
  /** Se a ligação foi atendida (Bem sucedida) */
  answered: boolean;
}

/**
 * Analisa a duração no formato: "24 s", "1 min, 12 s", "2 min, 32 s", "1 h, 5 min, 12 s"
 * Retorna duração em segundos.
 */
function parseDuration(text: string): number {
  let seconds = 0;
  const hMatch = text.match(/(\d+)\s*h/);
  const mMatch = text.match(/(\d+)\s*min/);
  const sMatch = text.match(/(\d+)\s*s/);
  if (hMatch) seconds += parseInt(hMatch[1]) * 3600;
  if (mMatch) seconds += parseInt(mMatch[1]) * 60;
  if (sMatch) seconds += parseInt(sMatch[1]);
  return seconds;
}

/**
 * Verifica se uma linha parece ser uma duração.
 */
function isDurationLine(line: string): boolean {
  return /^\d+\s*(s|min|h)/i.test(line.trim());
}

/**
 * Verifica se uma linha parece ser uma data.
 * Aceita: DD/MM/AAAA HH:MM | ontem, HH:MM | hoje, HH:MM | DD.MM.AAAA, HH:MM
 */
function isDateLine(line: string): boolean {
  const l = line.trim();
  if (/^\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}$/.test(l)) return true;
  if (/^(ontem|hoje|anteontem),?\s*\d{2}:\d{2}$/i.test(l)) return true;
  if (/^\d{2}\.\d{2}\.\d{4},?\s*\d{2}:\d{2}$/.test(l)) return true;
  return false;
}

/**
 * Verifica se uma linha parece ser um telefone (+55 ...)
 */
function isPhoneLine(line: string): boolean {
  return /^\+?\d[\d\s\-()]+$/.test(line.trim()) && line.trim().length >= 8;
}

/**
 * Verifica se uma linha é a direção da chamada
 */
function isDirectionLine(line: string): boolean {
  const l = line.trim().toLowerCase();
  return l === "efetuadas" || l === "recebidas";
}

/**
 * Verifica se é uma linha de status
 */
function isStatusLine(line: string): boolean {
  const l = line.trim().toLowerCase();
  return (
    l === "bem sucedida" ||
    l === "cancelada" ||
    l === "temporiamente indisponível" ||
    l === "temporariamente indisponível" ||
    l === "sem resposta" ||
    l === "ocupado" ||
    l === "número inválido" ||
    l === "numero invalido" ||
    l === "recusada" ||
    l === "indefinido" ||
    l === "não atendida" ||
    l === "nao atendida" ||
    l === "falha" ||
    l.startsWith("bem sucedida") ||
    l.startsWith("cancelad") ||
    l.startsWith("sem resposta") ||
    l.startsWith("ocupad") ||
    l.startsWith("número inválido") ||
    l.startsWith("numero invalido") ||
    l.startsWith("recusad") ||
    l.startsWith("indefinid") ||
    l.startsWith("não atend") ||
    l.startsWith("nao atend") ||
    l.startsWith("falha") ||
    l.startsWith("esta rota") ||
    l.startsWith("rota indisponível") ||
    l.startsWith("rota indisponivel")
  );
}

/**
 * Verifica se é uma linha de contato/empresa
 */
function isContactLine(line: string): boolean {
  const l = line.trim();
  return l.startsWith("Contato:") || l.startsWith("Empresa:");
}

/**
 * Faz o parse de uma data DD/MM/AAAA HH:MM | ontem, HH:MM | hoje, HH:MM | DD.MM.AAAA, HH:MM
 */
function parseDate(text: string, referenceDate?: Date): Date {
  const t = text.trim();
  const ref = referenceDate ?? new Date();

  // DD/MM/AAAA HH:MM
  const m1 = t.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/);
  if (m1) {
    return new Date(parseInt(m1[3]), parseInt(m1[2]) - 1, parseInt(m1[1]), parseInt(m1[4]), parseInt(m1[5]));
  }

  // DD.MM.AAAA, HH:MM
  const m2 = t.match(/(\d{2})\.(\d{2})\.(\d{4}),?\s*(\d{2}):(\d{2})/);
  if (m2) {
    return new Date(parseInt(m2[3]), parseInt(m2[2]) - 1, parseInt(m2[1]), parseInt(m2[4]), parseInt(m2[5]));
  }

  // ontem, HH:MM | hoje, HH:MM | anteontem, HH:MM
  const mRel = t.match(/^(ontem|hoje|anteontem),?\s*(\d{2}):(\d{2})$/i);
  if (mRel) {
    const d = new Date(ref);
    const keyword = mRel[1].toLowerCase();
    if (keyword === "ontem") d.setDate(d.getDate() - 1);
    else if (keyword === "anteontem") d.setDate(d.getDate() - 2);
    // "hoje" = sem deslocamento
    d.setHours(parseInt(mRel[2]), parseInt(mRel[3]), 0, 0);
    return d;
  }

  return new Date();
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/**
 * Verifica se a linha é um nome (pelo menos 2 palavras que começam com letra maiúscula,
 * e não é uma linha de contato, status, etc.)
 */
function isNameLine(line: string): boolean {
  const l = line.trim();
  if (!l || l === "-" || l === "Atividade") return false;
  if (isPhoneLine(l)) return false;
  if (isDirectionLine(l)) return false;
  if (isDurationLine(l)) return false;
  if (isDateLine(l)) return false;
  if (isStatusLine(l)) return false;
  if (isContactLine(l)) return false;
  // Deve conter pelo menos uma letra e parecer um nome
  if (!/[A-Za-zÀ-ú]/.test(l)) return false;
  // Nomes geralmente começam com maiúscula
  if (/^[A-ZÀ-Ú]/.test(l)) return true;
  return false;
}

/**
 * Faz o parse de um texto colado de chamadas do Bitrix.
 * Retorna a lista de chamadas parseadas.
 */

/** Lixo de cabeçalho/UI do Bitrix que aparece no copia-e-cola. */
function isJunkLine(line: string): boolean {
  const l = line.trim();
  if (!l) return true;
  if (l === "Chamadas" || l === "Filtro" || l === "Atividade" || l === "-") return true;
  if (l.startsWith("Padrão") || l.startsWith("Aplicar") || l.startsWith("Selecionar")) return true;
  if (/^Padr.o\s+Aplicar/i.test(l)) return true;
  return false;
}

/** Resultado detalhado do parsing, sem descarte silencioso. */
export interface ParseCallsResult {
  calls: ParsedCall[];
  /** Blocos identificados como uma chamada mas que não puderam ser totalmente interpretados. */
  unparsedBlocks: { lines: string[]; reason: string }[];
  /** Total de blocos detectados (parseados + não parseados). */
  totalBlocks: number;
}

/**
 * Divide o texto em blocos. Cada bloco começa numa linha que parece ser um
 * nome de colaborador e termina logo antes do próximo nome (ou no fim do texto).
 * Linhas de lixo são ignoradas no processo de detecção, mas o conteúdo
 * intermediário é preservado dentro do bloco.
 */
function splitIntoBlocks(text: string): string[][] {
  const lines = text.split("\n").map((l) => l.trim());
  const blocks: string[][] = [];
  let current: string[] | null = null;

  for (const line of lines) {
    if (!line) continue;
    if (isJunkLine(line)) continue;
    if (isNameLine(line)) {
      if (current && current.length > 0) blocks.push(current);
      current = [line];
    } else if (current) {
      current.push(line);
    }
    // Linhas antes do primeiro nome são descartadas (cabeçalho).
  }
  if (current && current.length > 0) blocks.push(current);
  return blocks;
}

/**
 * Interpreta um único bloco. Identifica campos por padrão, não por posição.
 * Retorna a chamada parseada ou um motivo de falha.
 */
function parseBlock(block: string[]): { call: ParsedCall } | { error: string } {
  if (block.length === 0) return { error: "bloco vazio" };

  const rawName = block[0];
  let phone = "";
  let direction = "";
  let durationSeconds = 0;
  let dateLine = "";
  let status = "";
  let contactInfo = "";

  // Varre as linhas restantes classificando por padrão.
  for (let i = 1; i < block.length; i++) {
    const l = block[i];
    if (!l || l === "-" || l === "Atividade") continue;
    if (!phone && isPhoneLine(l)) { phone = l; continue; }
    if (!direction && isDirectionLine(l)) { direction = l.toLowerCase(); continue; }
    if (isDurationLine(l) && durationSeconds === 0) {
      durationSeconds = parseDuration(l);
      continue;
    }
    if (!dateLine && isDateLine(l)) { dateLine = l; continue; }
    if (!contactInfo && isContactLine(l)) { contactInfo = l; continue; }
    if (!status && isStatusLine(l)) { status = l; continue; }
    // Se nada bateu mas ainda não temos status, e a linha não é nada conhecido,
    // assumimos que é o status (variação não catalogada). Isso evita perder
    // chamadas com status novo/desconhecido.
    if (!status && !isPhoneLine(l) && !isDirectionLine(l) && !isDurationLine(l) && !isDateLine(l) && !isContactLine(l)) {
      status = l;
      continue;
    }
  }

  if (!phone) return { error: `telefone ausente em "${rawName}"` };
  if (!dateLine) return { error: `data ausente em "${rawName}"` };
  if (!direction) direction = "efetuadas";
  if (!status) status = "Indefinido";

  const dateTime = parseDate(dateLine);
  const dateISO = `${dateTime.getFullYear()}-${pad2(dateTime.getMonth() + 1)}-${pad2(dateTime.getDate())}`;
  const timeHHMM = `${pad2(dateTime.getHours())}:${pad2(dateTime.getMinutes())}`;
  const name = canonicalizeCollaboratorNameForDate(rawName, dateISO);
  const answered =
    status.toLowerCase() === "bem sucedida" || status.toLowerCase().startsWith("bem sucedida");

  return {
    call: {
      name,
      phone,
      direction,
      durationSeconds,
      dateTime,
      dateISO,
      timeHHMM,
      status,
      contactInfo,
      answered,
    },
  };
}

/**
 * Versão detalhada: retorna chamadas + blocos não parseados, sem descarte silencioso.
 */
export function parseCallsTextDetailed(text: string): ParseCallsResult {
  const blocks = splitIntoBlocks(text);
  const calls: ParsedCall[] = [];
  const unparsedBlocks: { lines: string[]; reason: string }[] = [];

  for (const block of blocks) {
    const result = parseBlock(block);
    if ("call" in result) calls.push(result.call);
    else unparsedBlocks.push({ lines: block, reason: result.error });
  }

  return { calls, unparsedBlocks, totalBlocks: blocks.length };
}

/**
 * Compatibilidade: retorna apenas as chamadas reconhecidas.
 */
export function parseCallsText(text: string): ParsedCall[] {
  return parseCallsTextDetailed(text).calls;
}

/**
 * Métricas calculadas por pessoa e por dia.
 */
export interface PersonDayCallMetrics {
  name: string;
  date: string; // YYYY-MM-DD
  totalCalls: number;
  answeredCalls: number;
  canceledCalls: number;
  totalDurationSeconds: number;
  /** TMO: tempo ocioso total = janela de trabalho (1ª à última ligação) menos tempo em ligação (em segundos) */
  tmoSeconds: number | null;
  /** S/L: tempo total em que a pessoa NÃO estava ligando (em segundos) */
  slSeconds: number | null;
  /** Primeira ligação do dia */
  firstCallTime: string;
  /** Última ligação do dia */
  lastCallTime: string;
}

/**
 * Retorna o total de segundos úteis de trabalho para um dado dia da semana.
 * Seg-Qui: 08:00-12:00 + 13:00-18:00 = 9 h = 32 400 s
 * Sexta:   08:00-12:00 + 13:00-17:00 = 8 h = 28 800 s
 * Sáb/Dom: 0 (sem expediente)
 */
function workDaySeconds(dateISO: string): number {
  const [y, m, d] = dateISO.split("-").map(Number);
  const dow = new Date(y, m - 1, d).getDay(); // 0=Dom, 5=Sex, 6=Sáb
  if (dow === 0 || dow === 6) return 0;
  if (dow === 5) return 8 * 3600; // sexta
  return 9 * 3600; // seg-qui
}

/**
 * Calcula as métricas de chamadas por pessoa e por dia.
 *
 * TMO (Tempo Morto / Ocioso):
 *   1) Soma o tempo total em ligação
 *   2) Expediente: Seg-Qui 9h (08-12 + 13-18), Sex 8h (08-12 + 13-17)
 *   3) TMO = expediente − tempo em ligação = tempo perdido/ocioso
 *
 * Quanto menor o TMO, mais produtivo o colaborador.
 */
export function computeCallMetrics(calls: ParsedCall[]): PersonDayCallMetrics[] {
  // Agrupar por pessoa + dia
  const groups = new Map<string, ParsedCall[]>();
  for (const call of calls) {
    const canonicalName = canonicalizeCollaboratorNameForDate(call.name, call.dateISO);
    const normalizedCall = canonicalName === call.name ? call : { ...call, name: canonicalName };
    const key = `${collaboratorNameKey(canonicalName, call.dateISO)}|||${call.dateISO}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(normalizedCall);
  }

  const metrics: PersonDayCallMetrics[] = [];

  for (const [, groupCalls] of groups) {
    // Ordenar cronologicamente (mais antigo primeiro)
    const sorted = [...groupCalls].sort(
      (a, b) => a.dateTime.getTime() - b.dateTime.getTime()
    );

    const name = sorted[0].name;
    const date = sorted[0].dateISO;
    const totalCalls = sorted.length;
    const answeredCalls = sorted.filter((c) => c.answered).length;
    const canceledCalls = sorted.filter((c) => !c.answered).length;
    const totalDurationSeconds = sorted.reduce((sum, c) => sum + c.durationSeconds, 0);

    const firstCallTime = sorted[0].timeHHMM;
    const lastCallTime = sorted[sorted.length - 1].timeHHMM;

    let tmoSeconds: number | null = null;
    let slSeconds: number | null = null;

    // Expediente: Seg-Qui 9h, Sex 8h
    const wds = workDaySeconds(date);

    // S/L = expediente do dia − tempo em ligação
    if (wds > 0) {
      slSeconds = Math.max(0, wds - totalDurationSeconds);
    }

    // TMO = expediente total − tempo em ligação = tempo ocioso
    if (wds > 0) {
      tmoSeconds = Math.max(0, wds - totalDurationSeconds);
    }

    metrics.push({
      name,
      date,
      totalCalls,
      answeredCalls,
      canceledCalls,
      totalDurationSeconds,
      tmoSeconds,
      slSeconds,
      firstCallTime,
      lastCallTime,
    });
  }

  // Ordenar por data desc, depois por nome
  metrics.sort((a, b) => {
    const dc = b.date.localeCompare(a.date);
    if (dc !== 0) return dc;
    return a.name.localeCompare(b.name);
  });

  return metrics;
}

/**
 * Métricas agregadas por pessoa para um mês inteiro.
 */
export interface PersonMonthCallMetrics {
  name: string;
  totalCalls: number;
  answeredCalls: number;
  canceledCalls: number;
  totalDurationSeconds: number;
  /** TMO médio dos dias (em segundos) */
  avgTmoSeconds: number | null;
  /** S/L soma total de todos os dias */
  totalSlSeconds: number | null;
  /** Dias trabalhados */
  daysWorked: number;
}

/**
 * Agrega métricas diárias em métricas mensais por pessoa.
 */
export function aggregateMonthMetrics(
  dailyMetrics: PersonDayCallMetrics[]
): PersonMonthCallMetrics[] {
  const groups = new Map<string, PersonDayCallMetrics[]>();
  for (const m of dailyMetrics) {
    if (!groups.has(m.name)) groups.set(m.name, []);
    groups.get(m.name)!.push(m);
  }

  const result: PersonMonthCallMetrics[] = [];
  for (const [name, days] of groups) {
    const totalCalls = days.reduce((s, d) => s + d.totalCalls, 0);
    const answeredCalls = days.reduce((s, d) => s + d.answeredCalls, 0);
    const canceledCalls = days.reduce((s, d) => s + d.canceledCalls, 0);
    const totalDurationSeconds = days.reduce((s, d) => s + d.totalDurationSeconds, 0);

    const tmoValues = days.filter((d) => d.tmoSeconds != null).map((d) => d.tmoSeconds!);
    const avgTmoSeconds = tmoValues.length > 0
      ? tmoValues.reduce((a, b) => a + b, 0) / tmoValues.length
      : null;

    const slValues = days.filter((d) => d.slSeconds != null).map((d) => d.slSeconds!);
    const totalSlSeconds = slValues.length > 0
      ? slValues.reduce((a, b) => a + b, 0)
      : null;

    result.push({
      name,
      totalCalls,
      answeredCalls,
      canceledCalls,
      totalDurationSeconds,
      avgTmoSeconds,
      totalSlSeconds,
      daysWorked: days.length,
    });
  }

  result.sort((a, b) => a.name.localeCompare(b.name));
  return result;
}
