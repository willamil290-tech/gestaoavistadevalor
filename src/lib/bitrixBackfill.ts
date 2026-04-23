import { loadJson, saveJson } from "@/lib/localStore";
import { pushKeyToSheetsNow } from "@/lib/sheetsSync";
import type { BitrixEvent, PersonEventDetail } from "@/lib/bitrixLogs";

const FLAG_KEY = "bitrixBackfill:v1:done";

function pad2(n: number) { return String(n).padStart(2, "0"); }

function listRecentMonthKeys(): string[] {
  const now = new Date();
  const out: string[] = [];
  for (let i = 0; i < 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${pad2(d.getMonth() + 1)}`);
  }
  return out;
}

/**
 * Backfill: redistribui bitrixEvents:YYYY-MM-DD legados.
 *
 * Estratégia:
 *  - Se um evento tem `dateISO` definido (formato novo) e difere da chave atual,
 *    move para a chave correta.
 *  - Eventos sem `dateISO` permanecem na chave original (não há informação
 *    suficiente em `timeHHMM` puro para inferir a data corretamente sem o
 *    contexto cronológico global do parse original).
 *
 * Roda uma vez por sessão/cliente (flag em localStorage).
 */
export async function runBitrixBackfillOnce(): Promise<void> {
  if (typeof window === "undefined") return;
  if (localStorage.getItem(FLAG_KEY)) return;
  // Marca cedo para evitar reentrância em React StrictMode.
  localStorage.setItem(FLAG_KEY, "1");

  try {
    const months = listRecentMonthKeys();
    const candidateKeys: string[] = [];

    // 1) Descobre chaves existentes no localStorage.
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (!k.startsWith("bitrixEvents:")) continue;
      const datePart = k.slice("bitrixEvents:".length);
      const ym = datePart.slice(0, 7);
      if (months.includes(ym)) candidateKeys.push(k);
    }

    // (Removido: varredura de 90+ chaves no Sheets era cara. Backfill processa
    // apenas chaves já presentes no localStorage. Quando o usuário abre uma
    // data específica, o fluxo normal puxa do Cloud sob demanda.)

    // 3) Para cada chave, redistribui eventos com dateISO != chave.
    const movedByDate: Record<string, number> = {};
    const buckets: Record<string, PersonEventDetail[]> = {};

    for (const key of candidateKeys) {
      const currentDate = key.slice("bitrixEvents:".length);
      const persons = loadJson<PersonEventDetail[]>(key, []);
      if (!Array.isArray(persons) || persons.length === 0) continue;

      // Inicia bucket da própria data com o que NÃO precisa mover.
      if (!buckets[currentDate]) buckets[currentDate] = [];

      const stayingByPerson: Record<string, PersonEventDetail> = {};
      const movingByDateAndPerson: Record<string, Record<string, PersonEventDetail>> = {};

      for (const p of persons) {
        const events = Array.isArray(p.events) ? p.events : [];
        for (const e of events) {
          const dest = (e as BitrixEvent).dateISO ?? currentDate;
          if (dest === currentDate) {
            if (!stayingByPerson[p.comercial]) {
              stayingByPerson[p.comercial] = {
                comercial: p.comercial,
                events: [],
                uniqueEmpresas: [],
                uniqueLeads: [],
              };
            }
            stayingByPerson[p.comercial].events.push(e);
          } else {
            if (!movingByDateAndPerson[dest]) movingByDateAndPerson[dest] = {};
            if (!movingByDateAndPerson[dest][p.comercial]) {
              movingByDateAndPerson[dest][p.comercial] = {
                comercial: p.comercial,
                events: [],
                uniqueEmpresas: [],
                uniqueLeads: [],
              };
            }
            movingByDateAndPerson[dest][p.comercial].events.push(e);
            movedByDate[dest] = (movedByDate[dest] ?? 0) + 1;
          }
        }
      }

      // Reescreve a chave atual apenas com os que ficam.
      const stayingArr = Object.values(stayingByPerson);
      buckets[currentDate] = stayingArr;

      // Acumula movimentações em outros buckets.
      for (const [destDate, byPerson] of Object.entries(movingByDateAndPerson)) {
        if (!buckets[destDate]) buckets[destDate] = [];
        // Mescla com possível conteúdo já existente da data destino.
        const existing = loadJson<PersonEventDetail[]>(`bitrixEvents:${destDate}`, []);
        const map = new Map<string, PersonEventDetail>();
        for (const p of existing) map.set(p.comercial, { ...p, events: [...(p.events ?? [])] });
        for (const [comercial, p] of Object.entries(byPerson)) {
          if (map.has(comercial)) {
            const cur = map.get(comercial)!;
            cur.events.push(...p.events);
          } else {
            map.set(comercial, p);
          }
        }
        buckets[destDate] = Array.from(map.values());
      }
    }

    // 4) Persiste todos os buckets afetados.
    const writtenDates: string[] = [];
    for (const [date, arr] of Object.entries(buckets)) {
      const key = `bitrixEvents:${date}`;
      saveJson(key, arr);
      writtenDates.push(date);
      try { await pushKeyToSheetsNow(key); } catch { /* ignora */ }
    }

    return;
  } catch (e) {
    console.warn("[bitrixBackfill] erro:", e);
    // Mantém flag setada para não rodar de novo em loop.
  }
}