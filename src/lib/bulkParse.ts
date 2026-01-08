export type BulkEntry = {
  name: string;
  morning: number;
  afternoon: number;
};

export type DetailedEntry = {
  name: string;
  etapaAlterada: number;
  atividadeCriada: number;
  statusAlterada: number;
  chamadaTelefonica: number;
  outros: number;
  total: number;
};

export type HourlyTrend = {
  hour: string;
  actions: number;
};

export type DashboardBulkData = {
  valorBorderoMes: number;
  valorBorderoDia: number;
  commercials: { name: string; value: number }[];
  groups: { executivo: number; cs: number; closer: number };
  faixasMes: { faixa: string; valor: number }[];
  faixasDia: { faixa: string; valor: number }[];
};

export type ClienteTableEntry = {
  cliente: string;
  valor: number;
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

/**
 * Parse hourly trend data:
 * 08: 21
 * 09: 26
 */
export function parseHourlyTrend(text: string): HourlyTrend[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out: HourlyTrend[] = [];
  const rx = /^(\d{1,2})\s*:\s*(\d+)$/;

  for (const line of lines) {
    const m = line.match(rx);
    if (m) {
      out.push({ hour: m[1].padStart(2, "0"), actions: Number(m[2]) });
    }
  }
  return out;
}

/**
 * Parse detailed acionamento per collaborator:
 * ETAPA_ALTERADA: 11
 * ATIVIDADE_CRIADA: 14
 * ...
 */
export function parseDetailedAcionamento(text: string): DetailedEntry[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const out: DetailedEntry[] = [];

  const rxEtapa = /^ETAPA_ALTERADA\s*:\s*(\d+)/i;
  const rxAtividade = /^ATIVIDADE_CRIADA\s*:\s*(\d+)/i;
  const rxStatus = /^STATUS_ATIVIDADE_ALTERADA\s*:\s*(\d+)/i;
  const rxChamada = /^CHAMADA_TELEFONICA\s*:\s*(\d+)/i;
  const rxOutros = /^OUTROS\s*:\s*(\d+)/i;
  const rxTotal = /^TOTAL_ACIONAMENTOS\s*:\s*(\d+)/i;

  let current: Partial<DetailedEntry> & { name?: string } = {};

  const pushCurrent = () => {
    if (!current.name) return;
    out.push({
      name: current.name,
      etapaAlterada: current.etapaAlterada ?? 0,
      atividadeCriada: current.atividadeCriada ?? 0,
      statusAlterada: current.statusAlterada ?? 0,
      chamadaTelefonica: current.chamadaTelefonica ?? 0,
      outros: current.outros ?? 0,
      total: current.total ?? 0,
    });
    current = {};
  };

  for (const line of lines) {
    if (!line) continue;

    if (rxEtapa.test(line)) {
      current.etapaAlterada = Number(line.match(rxEtapa)![1]);
      continue;
    }
    if (rxAtividade.test(line)) {
      current.atividadeCriada = Number(line.match(rxAtividade)![1]);
      continue;
    }
    if (rxStatus.test(line)) {
      current.statusAlterada = Number(line.match(rxStatus)![1]);
      continue;
    }
    if (rxChamada.test(line)) {
      current.chamadaTelefonica = Number(line.match(rxChamada)![1]);
      continue;
    }
    if (rxOutros.test(line)) {
      current.outros = Number(line.match(rxOutros)![1]);
      continue;
    }
    if (rxTotal.test(line)) {
      current.total = Number(line.match(rxTotal)![1]);
      pushCurrent();
      continue;
    }

    // If it doesn't match any pattern, it's a name
    if (!line.includes(":")) {
      if (current.name && (current.etapaAlterada !== undefined || current.total !== undefined)) {
        pushCurrent();
      }
      current.name = line;
    }
  }

  pushCurrent();
  return out;
}

/**
 * Parse dashboard bulk data in format:
 * Valor borderô mês 1358346,58 Valor borderô dia 112035,53 ...
 */
export function parseDashboardBulk(text: string): DashboardBulkData | null {
  // Normalize text - replace newlines with spaces
  const normalized = text.replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim();
  
  const parseNum = (str: string) => {
    // Handle Brazilian number format: 1.234,56 -> 1234.56
    return Number(str.replace(/\./g, "").replace(",", "."));
  };

  const result: DashboardBulkData = {
    valorBorderoMes: 0,
    valorBorderoDia: 0,
    commercials: [],
    groups: { executivo: 0, cs: 0, closer: 0 },
    faixasMes: [],
    faixasDia: [],
  };

  // Extract values using regex
  const rxBorderoMes = /Valor\s+border[oô]\s+m[eê]s\s+([\d.,]+)/i;
  const rxBorderoDia = /Valor\s+border[oô]\s+dia\s+([\d.,]+)/i;
  const rxExecutivo = /realizado\s+executivo\s+([\d.,]+)/i;
  const rxCS = /realizado\s+cs\s+([\d.,]+)/i;
  const rxCloser = /realizado\s+closer\s+([\d.,]+)/i;

  // Faixas mês
  const rxFaixa0180 = /0-180\s+dias?\s+([\d.,]+)/i;
  const rxFaixa181360 = /181\s+a\s+360\s+dias?\s+([\d.,]+)/i;
  const rxFaixa361720 = /361\s+a\s+720\s+dias?\s+([\d.,]+)/i;
  const rxFaixa720Plus = /Mais\s+de\s+720\s+dias?\s+([\d.,]+)/i;

  // Faixas dia
  const rxFaixa0180Dia = /0-180\s+dias?\s*\(dia\)\s+([\d.,]+)/i;
  const rxFaixa181360Dia = /181\s+a\s+360\s+dias?\s*\(dia\)\s+([\d.,]+)/i;
  const rxFaixa361720Dia = /361\s+a\s+720\s+dias?\s*\(dia\)\s+([\d.,]+)/i;
  const rxFaixa720PlusDia = /Mais\s+de\s+720\s+dias?\s*\(dia\)\s+([\d.,]+)/i;

  // Commercial names patterns (flexible)
  const commercialPatterns = [
    { rx: /Rodrigo\s+Mariani(?:\s+Ferreira)?\s+([\d.,]+)/i, name: "Rodrigo" },
    { rx: /Luciane\s+Mariani(?:\s+Ferreira)?\s+([\d.,]+)/i, name: "Luciane" },
    { rx: /Alessandra(?:\s+da\s+Cunha)?\s+Youssef\s+([\d.,]+)/i, name: "Alessandra" },
    { rx: /Raissa\s+Flor(?:\s+Chaves)?\s+([\d.,]+)/i, name: "Raissa" },
    { rx: /Bruna\s+(?:Stefany\s+)?Domingos\s+([\d.,]+)/i, name: "Bruna" },
    { rx: /Samara\s+de\s+Ramos(?:\s+dos\s+Santos)?\s+([\d.,]+)/i, name: "Samara" },
  ];

  let m = normalized.match(rxBorderoMes);
  if (m) result.valorBorderoMes = parseNum(m[1]);

  m = normalized.match(rxBorderoDia);
  if (m) result.valorBorderoDia = parseNum(m[1]);

  m = normalized.match(rxExecutivo);
  if (m) result.groups.executivo = parseNum(m[1]);

  m = normalized.match(rxCS);
  if (m) result.groups.cs = parseNum(m[1]);

  m = normalized.match(rxCloser);
  if (m) result.groups.closer = parseNum(m[1]);

  // Commercial values
  for (const pattern of commercialPatterns) {
    m = normalized.match(pattern.rx);
    if (m) {
      result.commercials.push({ name: pattern.name, value: parseNum(m[1]) });
    }
  }

  // Faixas mês (parse before dia to avoid conflicts)
  // We need to be careful about the order and use non-greedy matching
  const textWithoutDia = normalized.replace(/\(dia\)/gi, "(DIA_MARKER)");
  
  m = textWithoutDia.replace(/\(DIA_MARKER\)/g, "(dia)").match(rxFaixa0180);
  if (m && !normalized.slice(normalized.indexOf(m[0]) - 10, normalized.indexOf(m[0])).includes("(dia)")) {
    // Check it's not the dia version
    const idx = normalized.indexOf(m[0]);
    if (idx !== -1 && !normalized.slice(idx, idx + m[0].length + 10).includes("(dia)")) {
      result.faixasMes.push({ faixa: "0-180", valor: parseNum(m[1]) });
    }
  }
  
  // Simpler approach - extract all faixas
  const faixaMatches: { faixa: string; valor: number; isDia: boolean }[] = [];
  
  const allFaixaRx = /(\d+-\d+|\d+\s+a\s+\d+|Mais\s+de\s+\d+)\s+dias?\s*(\(dia\))?\s+([\d.,]+)/gi;
  let match;
  while ((match = allFaixaRx.exec(normalized)) !== null) {
    const faixaStr = match[1].replace(/\s+a\s+/i, "-");
    const isDia = !!match[2];
    const valor = parseNum(match[3]);
    
    let faixa = faixaStr;
    if (faixaStr.toLowerCase().startsWith("mais")) {
      faixa = "720+";
    }
    
    faixaMatches.push({ faixa, valor, isDia });
  }
  
  result.faixasMes = faixaMatches.filter(f => !f.isDia).map(f => ({ faixa: f.faixa, valor: f.valor }));
  result.faixasDia = faixaMatches.filter(f => f.isDia).map(f => ({ faixa: f.faixa, valor: f.valor }));

  // Only return if we got some data
  if (result.valorBorderoMes > 0 || result.valorBorderoDia > 0 || result.commercials.length > 0) {
    return result;
  }
  return null;
}

/**
 * Parse client table in format:
 * Cliente Borderô (soma Vl. Título)
 * INDUSTRIA E COMERCIO RIOMAR CORDAS LTDA 54265,41
 */
export function parseClienteTable(text: string): ClienteTableEntry[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out: ClienteTableEntry[] = [];

  // Skip header line if present
  const startIdx = lines[0]?.toLowerCase().includes("cliente") ? 1 : 0;

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];
    // Match: text followed by a number with comma decimal
    const rx = /^(.+?)\s+([\d.,]+)$/;
    const m = line.match(rx);
    if (m) {
      const cliente = m[1].trim();
      const valor = Number(m[2].replace(/\./g, "").replace(",", "."));
      if (cliente && !isNaN(valor)) {
        out.push({ cliente, valor });
      }
    }
  }

  return out;
}
