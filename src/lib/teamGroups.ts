import { canonicalizeCollaboratorName } from "./collaboratorNames";

export type TeamGroup = "SDRs" | "Closers" | "CS" | "Grandes Contas" | "Executivos";
export type PreferredCollaboratorNameCandidate = { name: string; score: number };

const TEAM_GROUP_ORDER: TeamGroup[] = ["SDRs", "Closers", "CS", "Grandes Contas", "Executivos"];

function normalizeTeamFirstName(name: string) {
  return canonicalizeCollaboratorName(name)
    .trim()
    .split(/\s+/)[0]
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function collaboratorNameDetailScore(name: string) {
  const cleaned = canonicalizeCollaboratorName(name);
  if (!cleaned) return 0;

  const parts = cleaned.split(/\s+/).filter(Boolean);
  return (parts.length * 1000) + cleaned.length;
}

function preferredCollaboratorGroupKey(name: string) {
  const cleaned = canonicalizeCollaboratorName(name);
  return `${getTeamGroup(cleaned)}::${normalizeTeamFirstName(cleaned)}`;
}

function isBetterCollaboratorCandidate(
  candidate: PreferredCollaboratorNameCandidate,
  current: PreferredCollaboratorNameCandidate,
) {
  if (candidate.score !== current.score) return candidate.score > current.score;

  const candidateDetail = collaboratorNameDetailScore(candidate.name);
  const currentDetail = collaboratorNameDetailScore(current.name);
  if (candidateDetail !== currentDetail) return candidateDetail > currentDetail;

  return candidate.name.localeCompare(current.name) < 0;
}

export function getTeamGroup(name: string): TeamGroup {
  const firstName = normalizeTeamFirstName(name);

  if (["alana", "vanessa", "william", "gabriel", "maicon", "adriana"].includes(firstName)) return "SDRs";
  if (["samara", "gisele"].includes(firstName)) return "Closers";
  if (firstName === "bruna") return "CS";
  return "Executivos";
}

export function buildPreferredCollaboratorNameMap(
  candidates: PreferredCollaboratorNameCandidate[],
) {
  const preferredByGroup = new Map<string, PreferredCollaboratorNameCandidate>();

  for (const candidate of candidates) {
    const cleaned = canonicalizeCollaboratorName(candidate.name);
    if (!cleaned) continue;

    const normalizedCandidate = { ...candidate, name: cleaned };
    const groupKey = preferredCollaboratorGroupKey(cleaned);
    const current = preferredByGroup.get(groupKey);

    if (!current || isBetterCollaboratorCandidate(normalizedCandidate, current)) {
      preferredByGroup.set(groupKey, normalizedCandidate);
    }
  }

  const aliasByName = new Map<string, string>();

  for (const candidate of candidates) {
    const cleaned = canonicalizeCollaboratorName(candidate.name);
    if (!cleaned) continue;

    const preferred = preferredByGroup.get(preferredCollaboratorGroupKey(cleaned));
    if (preferred) aliasByName.set(cleaned, preferred.name);
  }

  return aliasByName;
}

export function groupByTeam<T extends { name: string }>(items: T[]): { group: TeamGroup; items: T[] }[] {
  const groups = new Map<TeamGroup, T[]>();

  for (const item of items) {
    const group = getTeamGroup(item.name);
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group)!.push(item);
  }

  return TEAM_GROUP_ORDER
    .filter((g) => groups.has(g))
    .map((g) => ({ group: g, items: groups.get(g)! }));
}

export const TEAM_GROUP_COLORS: Record<TeamGroup, string> = {
  "SDRs": "bg-blue-500/10 border-blue-500/30",
  "Closers": "bg-purple-500/10 border-purple-500/30",
  "CS": "bg-green-500/10 border-green-500/30",
  "Grandes Contas": "bg-amber-500/10 border-amber-500/30",
  "Executivos": "bg-secondary/10 border-secondary/30",
};

export const TEAM_GROUP_BADGE_COLORS: Record<TeamGroup, string> = {
  "SDRs": "bg-blue-500/20 text-blue-700 dark:text-blue-400",
  "Closers": "bg-purple-500/20 text-purple-700 dark:text-purple-400",
  "CS": "bg-green-500/20 text-green-700 dark:text-green-400",
  "Grandes Contas": "bg-amber-500/20 text-amber-700 dark:text-amber-400",
  "Executivos": "bg-secondary/20 text-secondary",
};
