import * as XLSX from "xlsx";

export type ExcelImportClient = {
  cliente: string;
  comercial: string;
  valor: number;
};

export type ExcelImportResult = {
  referenceDate: Date;
  grossMonth: number;
  grossDay: number;
  indevidoMonth: number;
  indevidoDay: number;
  borderoMonth: number;
  borderoDay: number;
  clientsDay: ExcelImportClient[];
  rowsRead: number;
};

function normalizeHeader(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeText(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseMoney(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (v == null) return 0;
  const s = String(v).trim();
  if (!s) return 0;
  // pt-BR: 1.234.567,89
  const cleaned = s
    .replace(/\./g, "")
    .replace(/,/g, ".")
    .replace(/[^0-9.-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function parseExcelDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date && !isNaN(v.getTime())) return v;

  if (typeof v === "number" && Number.isFinite(v)) {
    // Excel serial date
    const dc = XLSX.SSF.parse_date_code(v);
    if (!dc) return null;
    const d = new Date(dc.y, (dc.m ?? 1) - 1, dc.d ?? 1, dc.H ?? 0, dc.M ?? 0, Math.floor(dc.S ?? 0));
    return isNaN(d.getTime()) ? null : d;
  }

  const s = String(v).trim();
  if (!s) return null;

  // dd/mm/yyyy or dd/mm/yyyy hh:mm
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) {
    const dd = Number(m[1]);
    const mm = Number(m[2]);
    const yy = Number(m[3]);
    const HH = m[4] ? Number(m[4]) : 0;
    const MM = m[5] ? Number(m[5]) : 0;
    const SS = m[6] ? Number(m[6]) : 0;
    const d = new Date(yy, mm - 1, dd, HH, MM, SS);
    return isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function sameBusinessDay(d: Date, ref: Date): boolean {
  const start = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate(), 0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return d >= start && d < end;
}

function inSameMonth(d: Date, ref: Date): boolean {
  const start = new Date(ref.getFullYear(), ref.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(ref.getFullYear(), ref.getMonth() + 1, 1, 0, 0, 0, 0);
  return d >= start && d < end;
}

function isIndevido(motivoRaw: unknown): boolean {
  const motivo = normalizeText(String(motivoRaw ?? ""));
  if (!motivo) return false;
  const excluded = new Set(["pagamento direto ao credor", "pagamento assessoria"]);
  return !excluded.has(motivo);
}

function pickColumnKey(keys: string[], candidates: string[]): string | null {
  const normKeys = keys.map((k) => ({ k, nk: normalizeHeader(k) }));
  for (const cand of candidates) {
    const c = normalizeHeader(cand);
    const exact = normKeys.find((x) => x.nk === c);
    if (exact) return exact.k;
  }
  for (const cand of candidates) {
    const c = normalizeHeader(cand);
    const partial = normKeys.find((x) => x.nk.includes(c) || c.includes(x.nk));
    if (partial) return partial.k;
  }
  return null;
}

export async function importBorderoFromExcel(file: File, referenceDate = new Date()): Promise<ExcelImportResult> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error("Planilha vazia");
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "", raw: true });

  if (!rows.length) throw new Error("Nenhuma linha encontrada na planilha");

  const keys = Object.keys(rows[0] ?? {});

  const dtKey = pickColumnKey(keys, ["Dt. Cadastro", "Dt Cadastro", "Data Cadastro", "Dt. de Cadastro"]);
  const vlKey = pickColumnKey(keys, ["Vl. Título", "Vl Titulo", "Valor", "Valor Titulo", "Vl. Titulo"]);
  const motivoKey = pickColumnKey(keys, ["Motivo da Devolução", "Motivo da Devolucao", "Motivo", "Motivo devolucao"]);
  const clienteKey = pickColumnKey(keys, ["Cliente", "Credor", "Empresa", "Nome do Cliente"]);
  const comercialKey = pickColumnKey(keys, ["Comercial", "Responsável", "Responsavel", "Vendedor"]);

  if (!dtKey || !vlKey) {
    throw new Error("Colunas obrigatórias não encontradas. Precisa de 'Dt. Cadastro' e 'Vl. Título'.");
  }

  let grossMonth = 0;
  let grossDay = 0;
  let indevidoMonth = 0;
  let indevidoDay = 0;

  const clientMap = new Map<string, { cliente: string; comercial: string; valor: number }>();

  for (const row of rows) {
    const d = parseExcelDate(row[dtKey]);
    if (!d) continue;

    const v = parseMoney(row[vlKey]);
    if (!Number.isFinite(v) || v === 0) continue;

    const inMonth = inSameMonth(d, referenceDate);
    const inDay = sameBusinessDay(d, referenceDate);

    if (!inMonth && !inDay) continue;

    const indevido = motivoKey ? isIndevido(row[motivoKey]) : false;

    if (inMonth) {
      grossMonth += v;
      if (indevido) indevidoMonth += v;
    }

    if (inDay) {
      grossDay += v;
      if (indevido) indevidoDay += v;

      // Clientes do dia: valor liquido (exclui indevidos)
      if (!indevido) {
        const cliente = clienteKey ? String(row[clienteKey] ?? "").trim() : "";
        if (cliente) {
          const key = normalizeText(cliente);
          const comercial = comercialKey ? String(row[comercialKey] ?? "").trim() : "";
          const prev = clientMap.get(key);
          if (!prev) {
            clientMap.set(key, { cliente, comercial, valor: v });
          } else {
            prev.valor += v;
            if (!prev.comercial && comercial) prev.comercial = comercial;
          }
        }
      }
    }
  }

  const borderoMonth = grossMonth - indevidoMonth;
  const borderoDay = grossDay - indevidoDay;

  const clientsDay = Array.from(clientMap.values())
    .filter((c) => Number.isFinite(c.valor) && c.valor !== 0)
    .sort((a, b) => b.valor - a.valor);

  return {
    referenceDate,
    grossMonth,
    grossDay,
    indevidoMonth,
    indevidoDay,
    borderoMonth,
    borderoDay,
    clientsDay,
    rowsRead: rows.length,
  };
}
