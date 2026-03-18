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
  if (!cleaned) return "";

  const parts = cleaned.split(" ");
  if (normalizeLooseName(parts[0]) !== "maria") return cleaned;

  parts[0] = "Gabriel";
  return parts.join(" ");
}

export function collaboratorNameKey(name: string) {
  return normalizeLooseName(canonicalizeCollaboratorName(name));
}

export function sameCollaboratorName(a: string, b: string) {
  return collaboratorNameKey(a) === collaboratorNameKey(b);
}
