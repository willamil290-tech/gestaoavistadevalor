function normalizeLooseName(value: string) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function canonicalizeCollaboratorName(name: string) {
  const cleaned = String(name ?? "").trim().replace(/\s+/g, " ");
  return cleaned;
}

export const GABRIEL_TRANSITION_DATE = "2026-03-18";

export function canonicalizeActiveCollaboratorName(name: string) {
  const cleaned = canonicalizeCollaboratorName(name);
  if (!cleaned) return "";

  const parts = cleaned.split(" ");
  if (normalizeLooseName(parts[0]) !== "maria") return cleaned;

  parts[0] = "Gabriel";
  return parts.join(" ");
}

export function canonicalizeCollaboratorNameForDate(name: string, dateISO?: string | null) {
  const cleaned = canonicalizeCollaboratorName(name);
  if (!dateISO) return cleaned;
  return dateISO >= GABRIEL_TRANSITION_DATE
    ? canonicalizeActiveCollaboratorName(cleaned)
    : cleaned;
}

export function collaboratorNameKey(name: string, dateISO?: string | null) {
  return normalizeLooseName(canonicalizeCollaboratorNameForDate(name, dateISO));
}

export function activeCollaboratorNameKey(name: string) {
  return normalizeLooseName(canonicalizeActiveCollaboratorName(name));
}

export function isMariaCollaboratorName(name: string) {
  const cleaned = canonicalizeCollaboratorName(name);
  if (!cleaned) return false;
  return normalizeLooseName(cleaned.split(" ")[0]) === "maria";
}

export function sameCollaboratorName(a: string, b: string, dateISO?: string | null) {
  return collaboratorNameKey(a, dateISO) === collaboratorNameKey(b, dateISO);
}
