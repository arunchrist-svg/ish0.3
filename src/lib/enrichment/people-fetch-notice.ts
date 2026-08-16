/** Empty Fetch Leads copy: always say how many companies were searched. */

export function summarizeEmptyPeopleFetch(params: {
  companyCount: number;
  warnings: string[];
  cities?: string[];
  seniority?: string[];
  departments?: string[];
}): { headline: string; detail: string } {
  const n = Math.max(0, params.companyCount);
  const unique = [...new Set(params.warnings.filter(Boolean))];
  const joined = unique.join(" ");

  const noDomain = unique.filter((m) => /no website domain/i.test(m)).length;
  const cityMiss = unique.filter((m) => /no decision-makers found in /i.test(m)).length;
  const roleMiss = unique.filter((m) => /no contacts match the selected seniority/i.test(m)).length;
  const quota = unique.some((m) => /quota|usage limit|exhausted|people search needs tavily/i.test(m));
  const skippedQuota = unique.filter((m) => /skipped .*: tavily quota/i.test(m)).length;
  const searched = Math.max(0, n - skippedQuota);

  const cityBit = (params.cities ?? []).length
    ? ` City filter was ${params.cities!.join(", ")} (people outside those cities are dropped).`
    : "";
  const roleBits = [...(params.departments ?? []), ...(params.seniority ?? [])];
  const roleBit = roleBits.length ? ` People filters: ${roleBits.join(", ")}.` : "";

  if (/tavily_api_key.*missing|tavily api key.*missing|tavily_api_key not set/i.test(joined)) {
    return {
      headline: "People search is temporarily unavailable.",
      detail: n > 1 ? `Tried ${n} companies. Add a Tavily key, then fetch again.` : "Try again later or contact support if this persists.",
    };
  }

  if (/all tavily keys exhausted/i.test(joined) || (quota && skippedQuota > 0)) {
    return {
      headline: `Searched ${searched} of ${n} companies. Tavily credits ran out.`,
      detail: `${skippedQuota ? `${skippedQuota} compan${skippedQuota === 1 ? "y was" : "ies were"} skipped after quota.` : "Later companies were not searched."} Wait for reset, add a backup key, or fetch fewer companies.`,
    };
  }

  if (/insufficient credits/i.test(joined)) {
    return {
      headline: "Not enough credits to fetch decision-makers.",
      detail: unique.find((m) => /insufficient credits/i.test(m)) ?? "Add credits, then fetch again.",
    };
  }

  const parts: string[] = [];
  if (n > 1) {
    parts.push(`Each of the ${n} selected companies was searched.`);
  }
  if (cityMiss) {
    parts.push(
      `${cityMiss} had no people in the selected cit${cityMiss === 1 ? "y" : "ies"}. Empty is OK. We do not fill with Delhi or NYC.`,
    );
  }
  if (roleMiss) {
    parts.push(`${roleMiss} had people who did not match the People filters.`);
  }
  if (noDomain) {
    parts.push(
      `${noDomain} had no official website, so LinkedIn matching is weaker (not a skip of the rest).`,
    );
  }
  parts.push(cityBit.trim(), roleBit.trim());
  const extra = unique
    .filter((m) => !/no website domain|no decision-makers found in |no contacts match the selected seniority|switched to backup/i.test(m))
    .slice(0, 2);
  if (!parts.filter(Boolean).length && extra[0]) parts.push(extra[0]);

  const headline =
    n > 1
      ? `Searched ${n} companies. No matching decision-makers.`
      : "No decision-makers found for the selected companies.";

  const detail =
    parts.filter(Boolean).join(" ").trim() ||
    "We search public LinkedIn via Tavily. Try another city, drop People filters, or companies with official websites.";

  return { headline, detail };
}
