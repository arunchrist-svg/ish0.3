export function buildOccasionIntelSystemPrompt(targetCity?: string): string {
  const cityRule = targetCity?.trim()
    ? `\nTARGET_CITY: ${targetCity.trim()}\nWhen TARGET_CITY is set, only mark is_target_occasion_event true if the company's office, HQ, or new location is in that city.`
    : "";

  return `You are an OSINT extraction agent. Find companies announcing a public occasion that often leads to bulk sweets or namkeen: new store or office, grand opening, foundation day, funding, plant inauguration.

${cityRule}

RULES:
1. Extract the company (giver) that opened a store/office or announced the milestone. Not the mall, not a job board, not a directory listing.
2. Reject personal "I opened my cafe" posts with no registered company.
3. Reject hiring ads even if they say "we are expanding / opening".
4. Sweets or mithai mentioned in the post are a bonus, not required. The event itself is enough.
5. occasion_type must be one of: store_opening, office_inauguration, foundation_day, milestone.
6. If the opening date is in the past, still extract it and set timeframe as YYYY-MM. Set timing to "recent". If the date is in the future or the copy says opening soon / will open, set timing to "upcoming".
7. office_inauguration only if this is clearly an HQ, campus, plant, or office. A retail shop is store_opening.

Output ONLY a valid JSON array. Each element:
{
  "is_target_occasion_event": true,
  "confidence_score": 0.9,
  "extraction_data": {
    "giving_company": "Reliance Retail",
    "brand_identified": "",
    "specific_product_details": "New Trend store, Whitefield",
    "product_category": "Sweets",
    "occasion_or_context": "New store inauguration",
    "occasion_type": "store_opening",
    "timeframe": "2026-08",
    "timing": "recent",
    "giving_company_city": "Bengaluru"
  },
  "evidence_rationale": "Retail chain announced a new store opening in Whitefield."
}

Return one object per input post, in the same order. No markdown.`;
}

export function buildOccasionIntelUserPrompt(
  posts: { index: number; url: string; text: string; sourceId: string }[],
  targetCity?: string,
): string {
  const blocks = posts.map((p) => {
    return `--- POST ${p.index} ---
Source: ${p.sourceId}
URL: ${p.url}
Content:
${p.text}`;
  });
  const cityNote = targetCity?.trim() ? `\nFilter to companies located in ${targetCity.trim()}.\n` : "";
  return `Analyze these ${posts.length} posts for store/office openings or company milestones.${cityNote}\n\n${blocks.join("\n\n")}`;
}

export function buildComingSoonIntelSystemPrompt(targetCity?: string): string {
  const cityRule = targetCity?.trim()
    ? `\nTARGET_CITY: ${targetCity.trim()}\nWhen TARGET_CITY is set, only mark is_target_occasion_event true if the new unit, job location, mall, or expansion is in that city or region.`
    : "";

  return `You are an OSINT extraction agent for LEADING indicators of retail store openings in India. The sales team needs companies 1 to 2 months BEFORE opening week, not inaugurations that already happened.

${cityRule}

KEEP (need a location AND a new-unit implication):
- Hiring for a NEW store or outlet: store manager, store staff, "new store", "opening soon", city or mall named.
- Retailer pipeline: "coming soon" on locators, "will open / to launch / new store in [city]".
- Mall or landlord leasing: Phoenix, Brigade, Prestige, Forum, Lulu, tenant mix, shopfit for a named retailer.
- Business press that a chain will open stores this quarter in a named city.

REJECT:
- Job ads for an existing store with no new unit.
- Warehouse, DC, fulfilment, or logistics hiring.
- "We just opened yesterday" or any opening already held.
- Generic "we are expanding" with no city and no store or outlet.
- Personal "I opened my cafe" with no company.
- The mall as the giving_company unless the tenant retailer is unknown. Prefer the tenant brand.

MAP:
- Retail shop, showroom, outlet, format store: occasion_type store_opening.
- HQ, campus, plant, corporate office only: occasion_type office_inauguration.
- timing is almost always "upcoming" for this sweep. Use "recent" only if the source clearly says it already opened.
- signal_type: hiring | coming_soon | mall_lease | press_expansion.
- timeframe: expected opening window if mentioned (YYYY-MM or "Q3 2026"). Else omit.

Output ONLY a valid JSON array. Each element:
{
  "is_target_occasion_event": true,
  "confidence_score": 0.9,
  "extraction_data": {
    "giving_company": "Reliance Retail",
    "brand_identified": "",
    "specific_product_details": "Trend store, Phoenix Mall Whitefield",
    "product_category": "Sweets",
    "occasion_or_context": "Store opening soon, hiring store manager",
    "occasion_type": "store_opening",
    "timeframe": "2026-10",
    "timing": "upcoming",
    "signal_type": "hiring",
    "giving_company_city": "Bengaluru"
  },
  "evidence_rationale": "LinkedIn job for store manager at a new Trend store opening soon in Whitefield."
}

Return one object per input post, in the same order. No markdown.`;
}

export function buildComingSoonIntelUserPrompt(
  posts: { index: number; url: string; text: string; sourceId: string; signalType?: string }[],
  targetCity?: string,
): string {
  const blocks = posts.map((p) => {
    const hint = p.signalType ? `\nSignal hint: ${p.signalType}` : "";
    return `--- POST ${p.index} ---
Source: ${p.sourceId}${hint}
URL: ${p.url}
Content:
${p.text}`;
  });
  const cityNote = targetCity?.trim()
    ? `\nFilter to openings in ${targetCity.trim()}. Require a location plus a new store or outlet implication.\n`
    : "\nRequire a location plus a new store or outlet implication.\n";
  return `Analyze these ${posts.length} posts for upcoming store openings (hiring, coming soon, mall lease, expansion press).${cityNote}\n\n${blocks.join("\n\n")}`;
}
