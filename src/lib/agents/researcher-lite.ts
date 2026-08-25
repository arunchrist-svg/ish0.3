import { callLLM } from "@/lib/llm";
import { db, leadResearch, leads, contacts, accounts, yieldFunnel } from "@/db";
import { eq } from "drizzle-orm";
import { assertCredits, deductCredits } from "@/lib/billing/credits";
import { parseResearcherOutput } from "@/lib/agents/schemas/researcher-output";
import { notifyLeadEvent } from "@/lib/push/notify-workspace";
import { getResolvedEmailConfig } from "@/lib/settings/email-settings";
import { companyNameForEmail } from "@/lib/email/company-display-name";

export async function runResearcherLite(leadId: string): Promise<void> {
  const lead = await db.query.leads.findFirst({
    where: eq(leads.id, leadId),
    with: { contact: true, account: true },
  });

  if (!lead) throw new Error(`Lead ${leadId} not found`);

  const existing = await db.query.leadResearch.findFirst({
    where: eq(leadResearch.leadId, leadId),
  });
  if (existing) return;

  if (lead.status !== "scouted" || !lead.researcherEligible) return;

  await assertCredits(lead.tenantId, "research.brief", 1);

  const contact = lead.contact as typeof contacts.$inferSelect;
  const account = lead.account as typeof accounts.$inferSelect;
  const companyDisplayName = companyNameForEmail(account.name);
  const emailConfig = await getResolvedEmailConfig(lead.workspaceId, lead.createdByUserId || undefined);
  const brand = emailConfig.brandConfig;

  const confidenceScore = lead.score ?? 55;
  const confidenceTier =
    confidenceScore >= 75 ? "high" : confidenceScore >= 50 ? "medium" : "low";

  const productHint = brand.productSummary?.trim() || `products from ${brand.brandName}`;

  const websiteBlock = brand.websiteInsights
    ? `
Website value prop: ${brand.websiteInsights.valueProposition ?? "n/a"}
Product writeup: ${brand.websiteInsights.productWriteup ?? "n/a"}
Email keywords: ${(brand.websiteInsights.emailKeywords ?? []).join("; ") || "n/a"}
Differentiators: ${(brand.websiteInsights.differentiators ?? []).join("; ") || "n/a"}
Buyer personas: ${brand.websiteInsights.buyerPersonas.join(", ")}
`
    : "";

  const prompt = `You are a B2B sales intelligence analyst. Write a structured brief for this corporate outreach lead.

Seller brand: ${brand.brandName} (${brand.vertical})
Seller product: ${brand.productSummary || productHint}
${websiteBlock}
Company: ${companyDisplayName}
City: ${account.city ?? "India"}
Industry: ${account.industry ?? "Corporate"}
Employees: ${account.employees ?? "Unknown"}
Budget: ${account.budgetBand ?? "Unknown"}
Intel: ${account.intelNotes ?? "No intel available"}

Contact: ${contact.name}, ${contact.title ?? "Unknown title"}
Confidence tier: ${confidenceTier}

Rules:
- Outreach hooks must match the seller brand/product above.
- Prefer email keywords and writeup themes when they fit this buyer.
- Never invent products, categories, or seasonal angles the seller does not sell.
- Use company name "${companyDisplayName}" only. Never append Pvt Ltd, Private Limited, Ltd, or other legal suffixes.

Output ONLY valid JSON with this shape:
{
  "outreachHook": "one sentence specific to this company/contact and seller product",
  "estimatedOrderValue": "₹X–Y lakhs",
  "decisionChain": ["Name/Title", ...],
  "outreachHooks": ["hook 1", "hook 2"],
  "scoreFactors": [
    { "label": "Purchase timeframe is", "bold": "..." },
    { "label": "Purchase process is", "bold": "..." },
    { "label": "Estimated budget is", "bold": "..." }
  ]
}`;

  const raw = await callLLM({
    tier: "quality",
    system: "You output only valid JSON. No markdown, no commentary.",
    prompt,
    maxTokens: 512,
    trace: {
      agent: "researcher-lite",
      tenantId: lead.tenantId,
      workspaceId: lead.workspaceId,
      leadId,
    },
  });

  const fallbackHooks = ["Corporate opportunity", brand.brandName];

  const { data: validated, valid } = parseResearcherOutput(raw);
  const parsed = validated ?? {
    outreachHook: `${companyDisplayName} corporate opportunity for ${contact.title ?? "HR/Admin"} team with ${brand.brandName}`,
    estimatedOrderValue: "₹2–8 lakhs",
    decisionChain: [contact.name],
    outreachHooks: fallbackHooks,
    scoreFactors: [
      { label: "Purchase timeframe is", bold: "Upcoming buying cycle" },
      { label: "Estimated budget is", bold: account.budgetBand ?? "unknown" },
    ],
  };
  if (!valid) {
    console.warn("[researcher-lite] LLM output failed schema validation for lead", leadId);
  }

  await db.insert(leadResearch).values({
    leadId,
    confidenceTier,
    confidenceScore,
    outreachHook: parsed.outreachHook,
    estimatedOrderValue: parsed.estimatedOrderValue,
    decisionChain: parsed.decisionChain ?? [],
    outreachHooks: parsed.outreachHooks ?? [],
    scoreFactors: parsed.scoreFactors ?? [],
    rawBrief: raw,
  });

  await db.update(leads).set({ status: "researched" }).where(eq(leads.id, leadId));
  await db.insert(yieldFunnel).values({ leadId, stage: "researched" });

  await deductCredits({
    tenantId: lead.tenantId,
    action: "research.brief",
    referenceId: leadId,
    idempotencyKey: `research-${leadId}`,
  });

  void notifyLeadEvent(leadId, "research.complete");
}
