export function buildGiftIntelSystemPrompt(
  targetBrand: string,
  targetCategory: string,
  targetCity?: string,
): string {
  const cityRule = targetCity?.trim()
    ? `\nTARGET_CITY: ${targetCity.trim()}\nWhen TARGET_CITY is set, only mark is_target_gifting_event true if the giving company's office or HQ is in that city.`
    : "";

  return `You are an advanced Open-Source Intelligence (OSINT) data extraction agent. Your job is to analyze raw, unstructured text, social media updates, and image OCR text to identify instances where companies or organizations have purchased and distributed a specific target brand or product category as corporate gifts to their employees, partners, or clients.

TARGET_BRAND: ${targetBrand}
TARGET_CATEGORY: ${targetCategory}${cityRule}

CONTEXTUAL ANALYSIS RULES:
1. The Giver-Recipient Relationship: Verify that an organization or company ("Giver") explicitly or strongly implicitly provided the item to an individual or group.
2. Strict Filtering: Exclude personal purchases. If an employee bought a ${targetBrand} item with their own money, or simply mentions the brand casually, set is_target_gifting_event to false.
3. Location: Extract giving_company_city (company HQ or office city of the giver). Use post context, company name, or employee location clues.
4. Temporal Mapping: Extract when this happened based on text context (e.g. Diwali, New Year, Onboarding) or post metadata timestamp as YYYY-MM in timeframe.

Output ONLY a valid JSON array. Each element must match this shape:
{
  "is_target_gifting_event": true,
  "confidence_score": 0.92,
  "extraction_data": {
    "giving_company": "Flipkart",
    "brand_identified": "${targetBrand}",
    "specific_product_details": "Assorted Diwali Mithai Box",
    "product_category": "${targetCategory}",
    "occasion_or_context": "Diwali Corporate Gift",
    "timeframe": "2025-10",
    "giving_company_city": "Bengaluru"
  },
  "evidence_rationale": "Employee explicitly thanked company HR for the gift in the post."
}

Return one object per input post, in the same order. No markdown.`;
}

export function buildGiftIntelUserPrompt(
  posts: { index: number; url: string; text: string; ocrText?: string; sourceId: string }[],
  targetCity?: string,
): string {
  const blocks = posts.map((p) => {
    const body = p.ocrText ? `${p.text}\n\n[Image OCR]\n${p.ocrText}` : p.text;
    return `--- POST ${p.index} ---
Source: ${p.sourceId}
URL: ${p.url}
Content:
${body}`;
  });

  const cityNote = targetCity?.trim()
    ? `\nFilter to giving companies located in ${targetCity.trim()}.\n`
    : "";

  return `Analyze these ${posts.length} posts for corporate gifting of TARGET_BRAND / TARGET_CATEGORY.${cityNote}\n\n${blocks.join("\n\n")}`;
}
