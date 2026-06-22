import type { WarmIntro } from "./types";

export function relationshipLabel(strength: 1 | 2 | 3 | 4, path: string[]): string {
  if (strength >= 4) return "Direct connection";
  if (strength === 3) return "Knows colleague";
  if (strength === 2 && path.length >= 3) {
    return `2-hop via ${path[1]}`;
  }
  if (strength === 2) return "Company network";
  return "CRM colleague";
}

export function sortWarmIntros(intros: WarmIntro[]): WarmIntro[] {
  return [...intros].sort((a, b) => {
    if (b.strength !== a.strength) return b.strength - a.strength;
    return a.connectorName.localeCompare(b.connectorName);
  });
}

export function toSummaryItems(intros: WarmIntro[], limit = 5) {
  return sortWarmIntros(intros).slice(0, limit).map((intro) => ({
    name: intro.name,
    email: intro.email,
    linkedIn: intro.linkedIn,
    strength: intro.strength,
    relationship: intro.relationship,
    connectorName: intro.connectorName,
    path: intro.path,
  }));
}
