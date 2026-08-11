import { degreeToStrength, type ConnectionDegree } from "./degree";
import type { NetworkPerson, WarmIntro } from "./types";

export function relationshipLabel(strength: 1 | 2 | 3 | 4, path: string[]): string {
  if (strength >= 4) return "Direct connection";
  if (strength === 3) return "Knows colleague";
  if (strength === 2 && path.length >= 3) {
    return `2-hop via ${path[1]}`;
  }
  if (strength === 2) return "Company network";
  return "CRM colleague";
}

function degreeRank(degree?: ConnectionDegree): number {
  if (degree === "1st") return 3;
  if (degree === "2nd") return 2;
  return 1;
}

export function sortWarmIntros(intros: WarmIntro[]): WarmIntro[] {
  return [...intros].sort((a, b) => {
    const deg = degreeRank(b.degree) - degreeRank(a.degree);
    if (deg !== 0) return deg;
    if (b.strength !== a.strength) return b.strength - a.strength;
    return a.name.localeCompare(b.name);
  });
}

export function sortNetworkPeople(people: NetworkPerson[]): NetworkPerson[] {
  return [...people].sort((a, b) => {
    const deg = degreeRank(b.degree) - degreeRank(a.degree);
    if (deg !== 0) return deg;
    return a.name.localeCompare(b.name);
  });
}

export function personToWarmIntro(person: NetworkPerson): WarmIntro {
  return {
    connectorName: person.connectorName ?? (person.degree === "3rd" ? "CRM" : "Team"),
    connectorEmail: person.connectorEmail,
    connectorId: person.connectorId,
    path: person.path,
    strength: degreeToStrength(person.degree),
    relationship: person.relationship,
    name: person.name,
    email: person.email,
    linkedIn: person.linkedIn,
    degree: person.degree,
    headline: person.headline,
  };
}

export function toSummaryItems(intros: WarmIntro[], limit = 5) {
  return sortWarmIntros(intros).slice(0, limit).map((intro) => ({
    name: intro.name,
    email: intro.email,
    linkedIn: intro.linkedIn,
    strength: intro.strength,
    degree: intro.degree ?? ("3rd" as const),
    headline: intro.headline,
    relationship: intro.relationship,
    connectorName: intro.connectorName,
    path: intro.path,
  }));
}
