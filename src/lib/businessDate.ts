export const BUSINESS_DAY_START_HOUR = 6;

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

export function toYMD(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * Returns the business date (YYYY-MM-DD) using a 06:00 cutoff.
 * If current local time is before 06:00, it counts as the previous day.
 */
export function getBusinessDate(now: Date = new Date()) {
  const d = new Date(now);
  if (d.getHours() < BUSINESS_DAY_START_HOUR) d.setDate(d.getDate() - 1);
  return toYMD(d);
}

export function getBusinessDayStart(businessDate: string) {
  const [y, m, d] = businessDate.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, BUSINESS_DAY_START_HOUR, 0, 0, 0);
}

export function getYesterdayBusinessDate(now: Date = new Date()) {
  const bd = getBusinessDate(now);
  const start = getBusinessDayStart(bd);
  start.setDate(start.getDate() - 1);
  return toYMD(start);
}

export function formatTimeHHMM(d: Date) {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function formatDateTimeBR(iso: string) {
  const d = new Date(iso);
  const date = `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
  return `${date} ${formatTimeHHMM(d)}`;
}
