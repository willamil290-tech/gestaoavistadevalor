/**
 * Parser para dados de chamadas colados do Bitrix (aba Chamadas).
 *
 * Formato esperado (bloco repetido por chamada):
 *
 *   Nome Sobrenome
 *   +55 XX XXXX-XXXX
 *   efetuadas
 *   [duração: "24 s" | "1 min, 12 s" | ausente para canceladas]
 *   DD/MM/AAAA HH:MM
 *   Status (Bem sucedida | Cancelada | Temporiamente indisponível | ...)
 *   Contato: ... | Empresa: ...
 *   Atividade
 *   [- (para canceladas, opcional)]
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
 * Verifica se uma linha parece ser uma data no formato DD/MM/AAAA HH:MM
 */
function isDateLine(line: string): boolean {
  return /^\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}$/.test(line.trim());
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
    l.startsWith("bem sucedida") ||
    l.startsWith("cancelad") ||
    l.startsWith("sem resposta") ||
    l.startsWith("ocupad")
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
 * Faz o parse de uma data DD/MM/AAAA HH:MM
 */
function parseDate(text: string): Date {
  const m = text.trim().match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/);
  if (!m) return new Date();
  return new Date(
    parseInt(m[3]),
    parseInt(m[2]) - 1,
    parseInt(m[1]),
    parseInt(m[4]),
    parseInt(m[5])
  );
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
export function parseCallsText(text: string): ParsedCall[] {
  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  const calls: ParsedCall[] = [];

  let i = 0;
  while (i < lines.length) {
    // Pular linhas de cabeçalho/filtro/lixo
    if (
      lines[i] === "Chamadas" ||
      lines[i] === "Filtro" ||
      lines[i] === "Atividade" ||
      lines[i] === "-" ||
      lines[i].startsWith("Padrão") ||
      lines[i].startsWith("Aplicar") ||
      lines[i].startsWith("Selecionar")
    ) {
      i++;
      continue;
    }

    // Tentar encontrar início de um bloco de chamada (nome)
    if (!isNameLine(lines[i])) {
      i++;
      continue;
    }

    const name = lines[i];
    i++;

    // Telefone
    if (i >= lines.length || !isPhoneLine(lines[i])) continue;
    const phone = lines[i];
    i++;

    // Direção
    if (i >= lines.length || !isDirectionLine(lines[i])) continue;
    const direction = lines[i].toLowerCase();
    i++;

    // Duração (opcional) ou data
    let durationSeconds = 0;
    if (i < lines.length && isDurationLine(lines[i])) {
      durationSeconds = parseDuration(lines[i]);
      i++;
    }

    // Data
    if (i >= lines.length || !isDateLine(lines[i])) continue;
    const dateTime = parseDate(lines[i]);
    const dateISO = `${dateTime.getFullYear()}-${pad2(dateTime.getMonth() + 1)}-${pad2(dateTime.getDate())}`;
    const timeHHMM = `${pad2(dateTime.getHours())}:${pad2(dateTime.getMinutes())}`;
    i++;

    // Status
    if (i >= lines.length) continue;
    const status = lines[i];
    i++;

    // Contato/Empresa
    let contactInfo = "";
    if (i < lines.length && isContactLine(lines[i])) {
      contactInfo = lines[i];
      i++;
    }

    // Pular "Atividade" e "-"
    while (i < lines.length && (lines[i] === "Atividade" || lines[i] === "-")) {
      i++;
    }

    const answered =
      status.toLowerCase() === "bem sucedida" || status.toLowerCase().startsWith("bem sucedida");

    calls.push({
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
    });
  }

  return calls;
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
  /** TMO: tempo médio entre ligações, descontando duração da ligação (em segundos) */
  tmoSeconds: number | null;
  /** S/L: tempo total em que a pessoa NÃO estava ligando (em segundos) */
  slSeconds: number | null;
  /** Primeira ligação do dia */
  firstCallTime: string;
  /** Última ligação do dia */
  lastCallTime: string;
}

/**
 * Calcula as métricas de chamadas por pessoa e por dia.
 *
 * TMO = tempo médio entre o fim de uma ligação e o início da próxima.
 *        Para cada par consecutivo de chamadas (ordenadas cronologicamente):
 *        gap = (início da próxima) - (fim da anterior, que é início + duração)
 *        TMO = média dos gaps positivos
 *
 * S/L = tempo total sem ligar = (última chamada + sua duração - primeira chamada) - soma das durações
 *       Ou seja: janela total de atividade menos o tempo realmente ligando.
 */
export function computeCallMetrics(calls: ParsedCall[]): PersonDayCallMetrics[] {
  // Agrupar por pessoa + dia
  const groups = new Map<string, ParsedCall[]>();
  for (const call of calls) {
    const key = `${call.name}|||${call.dateISO}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(call);
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

    if (sorted.length >= 2) {
      // Calcular gaps entre ligações
      const gaps: number[] = [];
      for (let i = 0; i < sorted.length - 1; i++) {
        const endCurrent = sorted[i].dateTime.getTime() / 1000 + sorted[i].durationSeconds;
        const startNext = sorted[i + 1].dateTime.getTime() / 1000;
        const gap = startNext - endCurrent;
        if (gap >= 0) {
          gaps.push(gap);
        }
      }
      if (gaps.length > 0) {
        tmoSeconds = gaps.reduce((a, b) => a + b, 0) / gaps.length;
      }

      // S/L = janela total - tempo em ligação
      const windowStart = sorted[0].dateTime.getTime() / 1000;
      const lastCall = sorted[sorted.length - 1];
      const windowEnd = lastCall.dateTime.getTime() / 1000 + lastCall.durationSeconds;
      const totalWindow = windowEnd - windowStart;
      slSeconds = Math.max(0, totalWindow - totalDurationSeconds);
    } else if (sorted.length === 1) {
      tmoSeconds = null;
      slSeconds = null;
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
  /** TMO médio ponderado dos dias (em segundos) */
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
