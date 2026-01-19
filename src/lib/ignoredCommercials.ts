// Colaboradores que NAO devem ser considerados nos acionamentos.
// Regra: ignora tanto na exibicao quanto em qualquer atualizacao (bulk/bitrix).

const IGNORED_FULL = new Set([
  "caio zapelini",
  "rafael kreusch",
  "willami moises lima",
]);

// Em alguns pontos do app o nome pode virar apenas o primeiro nome.
// Para manter o comportamento consistente, ignoramos tambem pelo primeiro token.
const IGNORED_FIRST = new Set(["caio", "rafael", "willami"]);

function stripDiacritics(input: string) {
  return (input ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeNameLoose(input: string) {
  return stripDiacritics(String(input ?? ""))
    .toLowerCase()
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Retorna true quando o nome do colaborador deve ser ignorado nos acionamentos.
 * Aceita nome completo ou apenas primeiro nome.
 */
export function isIgnoredCommercial(name: string): boolean {
  const norm = normalizeNameLoose(name);
  if (!norm) return false;
  if (IGNORED_FULL.has(norm)) return true;
  const first = norm.split(" ")[0];
  return IGNORED_FIRST.has(first);
}
