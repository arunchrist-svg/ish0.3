import {
  companyMatchesScoutSelection,
  mentionsSelectedLocality,
  selectionLooksLikeNeighborhoods,
} from "@/lib/enrichment/city-search";
import { isAcceptableCompanyDomain } from "@/lib/enrichment/company-domain-quality";
import { employeeMatchesBands } from "@/lib/enrichment/employee-size";
import type { ScoutQualityProfile } from "@/lib/enrichment/quality-profile";
import type { ScoutCompanyResult } from "@/lib/enrichment/types";

export type AccountScoreBreakdown = {
  reachability: number;
  officialWebsite: number;
  locality: number;
  scaleFit: number;
  pastGifting: number;
  industryFit: number;
  total: number;
};

export type AccountScoreInput = {
  profile: ScoutQualityProfile;
  selectedCities: string[];
  employeeBands?: string[];
  selectedIndustries?: string[];
  locationScope?: "focus" | "interest";
  searchKind?: "industry" | "business";
};

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function companyHaystack(company: ScoutCompanyResult): string {
  return `${company.city ?? ""} ${company.intelNotes ?? ""} ${company.industry ?? ""}`.toLowerCase();
}

function reachabilitySignal(company: ScoutCompanyResult): number {
  const band = company.leadabilityBand;
  if (band === "high") return 1;
  if (band === "medium") return 0.65;
  if (band === "low") return 0.25;
  const score = company.leadabilityScore ?? 0;
  if (score >= 80) return 1;
  if (score >= 45) return 0.65;
  if (score > 0) return 0.25;
  return 0;
}

function officialWebsiteSignal(company: ScoutCompanyResult): number {
  const domain = company.domain?.trim();
  if (domain && isAcceptableCompanyDomain(domain, company.name)) return 1;
  const website = company.website?.trim();
  if (website && isAcceptableCompanyDomain(website, company.name)) return 0.9;
  return 0;
}

function localitySignal(
  company: ScoutCompanyResult,
  selectedCities: string[],
  locationScope?: "focus" | "interest",
  searchKind?: "industry" | "business",
): number {
  if (!selectedCities.length) return 0.5;
  if (company.scoutGeoVerified) return 1;

  const hay = companyHaystack(company);
  if (selectionLooksLikeNeighborhoods(selectedCities)) {
    if (mentionsSelectedLocality(hay, selectedCities)) return 1;
    if (
      companyMatchesScoutSelection(company, selectedCities, {
        searchKind,
        geoVerified: company.scoutGeoVerified,
      })
    ) {
      return 0.7;
    }
    return locationScope === "focus" ? 0.25 : 0.4;
  }

  if (companyMatchesScoutSelection(company, selectedCities, { searchKind })) return 1;
  if (company.city?.trim()) return 0.35;
  return 0.2;
}

function scaleFitSignal(company: ScoutCompanyResult, employeeBands?: string[]): number {
  if (!employeeBands?.length) return 0.5;
  const match = employeeMatchesBands(company.employees, employeeBands);
  if (match === true) return 1;
  if (match === "unknown") return 0.45;
  return 0;
}

function pastGiftingSignal(company: ScoutCompanyResult): number {
  const past = company.pastGifting;
  if (Array.isArray(past) && past.length > 0) return 1;
  const overview = company.companyOverview;
  if (overview?.pastGiftingBrands?.length) return 1;
  if (overview?.detectedOccasions?.length) return 0.6;
  if (company.budgetBand?.trim()) return 0.4;
  return 0;
}

function industryFitSignal(
  company: ScoutCompanyResult,
  profile: ScoutQualityProfile,
  selectedIndustries?: string[],
): number {
  const hay = companyHaystack(company);
  if (selectedIndustries?.length) {
    const hit = selectedIndustries.some((ind) => {
      const token = ind.trim().toLowerCase();
      return token.length >= 3 && hay.includes(token);
    });
    if (hit) return 1;
  }
  if (!profile.industryBoostTerms.length) return 0.4;
  const boost = profile.industryBoostTerms.some((term) => hay.includes(term));
  return boost ? 0.85 : 0.35;
}

export function computeAccountScore(
  company: ScoutCompanyResult,
  input: AccountScoreInput,
): AccountScoreBreakdown {
  const { profile, selectedCities, employeeBands, selectedIndustries, locationScope, searchKind } =
    input;
  const w = profile.weights;

  const reachability = reachabilitySignal(company);
  const officialWebsite = officialWebsiteSignal(company);
  const locality = localitySignal(company, selectedCities, locationScope, searchKind);
  const scaleFit = scaleFitSignal(company, employeeBands);
  const pastGifting = pastGiftingSignal(company);
  const industryFit = industryFitSignal(company, profile, selectedIndustries);

  const total =
    100 *
    clamp01(
      w.reachability * reachability +
        w.officialWebsite * officialWebsite +
        w.locality * locality +
        w.scaleFit * scaleFit +
        w.pastGifting * pastGifting +
        w.industryFit * industryFit,
    );

  return {
    reachability,
    officialWebsite,
    locality,
    scaleFit,
    pastGifting,
    industryFit,
    total: Math.round(total * 10) / 10,
  };
}

/** Sort companies by AccountScore; provider fitScore is a weak tie-break only. */
export function sortCompaniesByAccountScore(
  companies: ScoutCompanyResult[],
  input: AccountScoreInput,
): ScoutCompanyResult[] {
  const scored = companies.map((company) => ({
    company,
    score: computeAccountScore(company, input).total,
  }));
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const aLead = a.company.leadabilityScore ?? 0;
    const bLead = b.company.leadabilityScore ?? 0;
    if (bLead !== aLead) return bLead - aLead;
    return (b.company.fitScore ?? 0) - (a.company.fitScore ?? 0);
  });
  return scored.map(({ company, score }) => ({
    ...company,
    // Keep existing UI field meaningful: blend so best accounts float without new badges.
    fitScore: Math.max(company.fitScore ?? 0, Math.round(score)),
  }));
}
