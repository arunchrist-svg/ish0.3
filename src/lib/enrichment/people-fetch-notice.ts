/** Empty Fetch Leads copy: always say how many companies were searched. */

export function summarizeEmptyPeopleFetch(params: {
  companyCount: number;
  warnings: string[];
  cities?: string[];
  seniority?: string[];
  departments?: string[];
  indiaOnly?: boolean;
  searchKind?: "industry" | "business";
}): { headline: string; detail: string } {
  const n = Math.max(0, params.companyCount);
  const unique = [...new Set(params.warnings.filter(Boolean))];
  const joined = unique.join(" ");
  const localOperators = params.searchKind === "business";
  const plantAndCorridorEmpty = unique.some((m) =>
    /searched plant city .+ and nearby hq corridor/i.test(m),
  );
  const hqFallbackEmpty = unique.some((m) =>
    /no plant linkedin in .+showing nearby hq/i.test(m),
  );

  const noDomain = unique.filter((m) => /no website domain/i.test(m)).length;
  const cityMiss = unique.filter((m) =>
    /no decision-makers found in |hr\/procurement people found at .* but all had cities outside|no people found in |searched plant city .+ and nearby hq corridor/i.test(
      m,
    ),
  ).length;
  const focusAreaBlock = unique.some((m) => /switch to area of interest/i.test(m));
  const roleMiss = unique.filter((m) =>
    /no contacts match the selected seniority|no hr, procurement, admin, or facilities people found/i.test(m),
  ).length;
  const rateLimited = unique.some((m) => /rate-limiting|credits are still available/i.test(m));
  const quota = unique.some((m) => /quota|usage limit|exhausted|people search needs tavily/i.test(m));
  const skippedQuota = unique.filter((m) => /skipped .*: tavily quota/i.test(m)).length;
  const searched = Math.max(0, n - skippedQuota);

  const cityBit =
    params.indiaOnly
      ? " Decision-makers can be anywhere in India."
      : (params.cities ?? []).length === 0
        ? ""
        : localOperators
          ? ` Searched ${params.cities!.join(", ")} for local seniors at that branch, not distant HQ.`
          : focusAreaBlock
            ? ` Focus Area is on: only people in ${params.cities!.join(", ")} are shown. Switch to Area of Interest to also include nearby HQ (e.g. Bengaluru for Hosur).`
            : plantAndCorridorEmpty
              ? ` Searched plant city ${params.cities!.join(", ")} first, then nearby HQ corridor. Both were empty. We do not fill with Delhi or NYC.`
              : cityMiss
                ? ` City filter was ${params.cities!.join(", ")} plus nearby HQ (not Delhi or NYC). LinkedIn often omits plant location.`
                : ` Searched ${params.cities!.join(", ")} plant-first, then nearby HQ for Head of HR if the plant was empty.`;
  const roleBits = [...(params.departments ?? []), ...(params.seniority ?? [])];
  const roleBit = roleBits.length ? ` People filters: ${roleBits.join(", ")}.` : "";

  if (/tavily_api_key.*missing|tavily api key.*missing|tavily_api_key not set/i.test(joined)) {
    return {
      headline: "People search is temporarily unavailable.",
      detail:
        n > 1
          ? `Tried ${n} companies. Add a Tavily key, then fetch again.`
          : "Try again later or contact support if this persists.",
    };
  }

  if (rateLimited && !quota) {
    return {
      headline: n > 1 ? `Searched ${n} companies. Tavily asked us to slow down.` : "Tavily asked us to slow down.",
      detail: "This key still has credits. Wait a few seconds and fetch again.",
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
  if (plantAndCorridorEmpty) {
    parts.push(
      "Plant city and nearby HQ corridor were both searched. Empty means no public LinkedIn match, not a soft fill from far metros.",
    );
  } else if (cityMiss && !params.indiaOnly) {
    parts.push(
      `${cityMiss} had no people in the selected cit${cityMiss === 1 ? "y" : "ies"}${hqFallbackEmpty ? " after nearby HQ fallback" : ""}. We do not fill with Delhi or NYC.`,
    );
  }
  if (roleMiss) {
    parts.push(
      `${roleMiss} had no HR, Procurement, Admin, or Facilities contacts. LinkedIn may not list plant buyers publicly. Try a larger or better-known brand in this city.`,
    );
  }
  if (noDomain) {
    parts.push(
      `${noDomain} had no official website. Paste the company site below. Zauba and IndiaMART listings are not the company website.`,
    );
  }
  parts.push(cityBit.trim(), roleBit.trim());
  const extra = unique
    .filter(
      (m) =>
        !/no website domain|no decision-makers found in |no contacts match the selected seniority|no hr or procurement people found|switched to backup|searched plant city/i.test(
          m,
        ),
    )
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
