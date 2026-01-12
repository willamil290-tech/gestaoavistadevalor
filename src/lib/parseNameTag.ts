export type NameTagCategory = "empresas" | "leads" | null;

export type ParsedNameTag = {
  baseName: string;
  hasTag: boolean;
  category: NameTagCategory;
};

function stripDiacritics(s: string) {
  // NFD splits diacritics into separate codepoints so we can remove them.
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeTag(raw: string) {
  const s = stripDiacritics(raw)
    .toLowerCase()
    .trim();

  // Keep only letters to make matching robust (e.g. "NEGÓCIO" -> "negocio")
  return s.replace(/[^a-z]/g, "");
}

/**
 * Parses lines like:
 *  - "Nome do Comercial — NEGÓCIO"
 *  - "Nome do Comercial – LEAD"
 *  - "Nome do Comercial -- EMPRESA"
 *  - "Nome do Comercial - BUSINESS" (with spaces around the hyphen)
 *
 * Separators accepted between name and tag: —, –, --, and " - " (hyphen with spaces).
 *
 * Returns:
 *  - baseName: the name without the tag
 *  - hasTag: whether a tag separator was detected
 *  - category: "empresas" | "leads" | null (null means unknown tag or no tag)
 */
export function parseNameTag(input: string): ParsedNameTag {
  const raw = (input ?? "").replace(/\u00A0/g, " ").trim();
  if (!raw) return { baseName: "", hasTag: false, category: null };

  // Matches: <name> <sep> <tag>
  // Note: " - " requires spaces on both sides by using /\s-\s/.
  const m = raw.match(/^(.*?)\s*(?:—|–|--|\s-\s)\s*(.+)$/);
  if (!m) return { baseName: raw, hasTag: false, category: null };

  const baseName = (m[1] ?? "").trim() || raw;
  const tagRaw = (m[2] ?? "").trim();
  if (!tagRaw) return { baseName, hasTag: false, category: null };

  const tag = normalizeTag(tagRaw);

  const isLead = tag === "lead" || tag === "leads";
  const isEmpresa = tag === "negocio" || tag === "negocios" || tag === "empresa" || tag === "empresas" || tag === "business";

  const category: NameTagCategory = isLead ? "leads" : isEmpresa ? "empresas" : null;

  return { baseName, hasTag: true, category };
}
