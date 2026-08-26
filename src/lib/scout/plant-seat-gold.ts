/**
 * Workspace gold cases for plant-seat learning: Keep / Drop marked by the user.
 * Pure helpers only. Load/save via preference-profile at the call site.
 */
import type { ScoutPersonSeat } from "@/lib/enrichment/types";
import { linkedInSlug } from "@/lib/utils";
import { normalizeCompanyName } from "@/lib/enrichment/company-name-match";

export type PlantSeatGoldVerdict = "keep" | "drop";

export type PlantSeatGoldCase = {
  id: string;
  companyName: string;
  plantCity: string;
  personName: string;
  title?: string;
  location?: string;
  linkedIn?: string;
  seat?: ScoutPersonSeat;
  verdict: PlantSeatGoldVerdict;
  reason?: string;
  createdAt: string;
};

const MAX_CASES = 80;

export function parsePlantSeatGoldCases(raw: unknown): PlantSeatGoldCase[] {
  if (!Array.isArray(raw)) return [];
  const out: PlantSeatGoldCase[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const o = row as Record<string, unknown>;
    if (typeof o.companyName !== "string" || !o.companyName.trim()) continue;
    if (typeof o.plantCity !== "string" || !o.plantCity.trim()) continue;
    if (typeof o.personName !== "string" || !o.personName.trim()) continue;
    if (o.verdict !== "keep" && o.verdict !== "drop") continue;
    out.push({
      id: typeof o.id === "string" && o.id ? o.id : `gold-${out.length}`,
      companyName: o.companyName.trim(),
      plantCity: o.plantCity.trim(),
      personName: o.personName.trim(),
      title: typeof o.title === "string" ? o.title : undefined,
      location: typeof o.location === "string" ? o.location : undefined,
      linkedIn: typeof o.linkedIn === "string" ? o.linkedIn : undefined,
      seat: o.seat === "plant" || o.seat === "nearby_hq" ? o.seat : undefined,
      verdict: o.verdict,
      reason: typeof o.reason === "string" ? o.reason : undefined,
      createdAt: typeof o.createdAt === "string" ? o.createdAt : new Date().toISOString(),
    });
  }
  return out;
}

export function goldCasesForPlantCity(
  cases: PlantSeatGoldCase[],
  plantCity: string,
  limit = 12,
): PlantSeatGoldCase[] {
  const key = plantCity.trim().toLowerCase();
  const matched = cases.filter((c) => c.plantCity.trim().toLowerCase() === key);
  const pool = matched.length ? matched : cases;
  return pool.slice(-limit);
}

export function formatGoldCasesFewShot(cases: PlantSeatGoldCase[]): string {
  if (!cases.length) return "";
  return cases
    .map((c) => {
      const seat = c.seat ? ` seat=${c.seat}` : "";
      return `- ${c.verdict.toUpperCase()}: ${c.personName} (${c.title ?? "title?"}) at ${c.companyName}${seat} loc=${c.location ?? "?"} for plant ${c.plantCity}${c.reason ? `. ${c.reason}` : ""}`;
    })
    .join("\n");
}

function personMatchesDropCase(
  person: { name?: string | null; linkedIn?: string | null; title?: string | null },
  companyName: string,
  drop: PlantSeatGoldCase,
): boolean {
  if (normalizeCompanyName(drop.companyName) !== normalizeCompanyName(companyName)) return false;
  const dropSlug = linkedInSlug(drop.linkedIn);
  const personSlug = linkedInSlug(person.linkedIn);
  if (dropSlug && personSlug && dropSlug === personSlug) return true;
  const dropName = drop.personName.trim().toLowerCase();
  const personName = (person.name ?? "").trim().toLowerCase();
  if (dropName && personName && dropName === personName) return true;
  return false;
}

/** Drop people the workspace marked as wrong for this company (same LinkedIn or name). */
export function filterPeopleAgainstGoldDrops<
  T extends { name?: string | null; linkedIn?: string | null; title?: string | null },
>(people: T[], companyName: string, cases: PlantSeatGoldCase[]): T[] {
  const drops = cases.filter((c) => c.verdict === "drop");
  if (!drops.length) return people;
  return people.filter((person) => !drops.some((d) => personMatchesDropCase(person, companyName, d)));
}

export function mergePlantSeatGoldCase(
  existing: PlantSeatGoldCase[],
  input: Omit<PlantSeatGoldCase, "id" | "createdAt"> & { id?: string; createdAt?: string },
): PlantSeatGoldCase[] {
  const nextCase: PlantSeatGoldCase = {
    id: input.id ?? `gold-${Date.now()}`,
    companyName: input.companyName.trim(),
    plantCity: input.plantCity.trim(),
    personName: input.personName.trim(),
    title: input.title,
    location: input.location,
    linkedIn: input.linkedIn,
    seat: input.seat,
    verdict: input.verdict,
    reason: input.reason,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
  const withoutDup = existing.filter((c) => {
    if (nextCase.linkedIn && c.linkedIn && linkedInSlug(c.linkedIn) === linkedInSlug(nextCase.linkedIn)) {
      return false;
    }
    return !(
      normalizeCompanyName(c.companyName) === normalizeCompanyName(nextCase.companyName) &&
      c.personName.trim().toLowerCase() === nextCase.personName.trim().toLowerCase() &&
      c.plantCity.trim().toLowerCase() === nextCase.plantCity.trim().toLowerCase()
    );
  });
  return [...withoutDup, nextCase].slice(-MAX_CASES);
}
