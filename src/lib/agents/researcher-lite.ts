import { callLLM } from "@/lib/llm";
import { db, leadResearch, leads, contacts, accounts, yieldFunnel } from "@/db";
import { eq } from "drizzle-orm";
import { assertCredits, deductCredits } from "@/lib/billing/credits";
import { parseResearcherOutput } from "@/lib/agents/schemas/researcher-output";
import { generateWriterPlan } from "@/lib/agents/writer-plan";
import { notifyLeadEvent } from "@/lib/push/notify-workspace";

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

  const confidenceScore = lead.score ?? 55;
  const confidenceTier =
    confidenceScore >= 75 ? "high" : confidenceScore >= 50 ? "medium" : "low";

  const prompt = `You are a B2B gifting intelligence analyst. Write a structured brief for this corporate gifting lead.

Company: ${account.name}
City: ${account.city ?? "India"}
Industry: ${account.industry ?? "Corporate"}
Employees: ${account.employees ?? "Unknown"}
Budget: ${account.giftBudget ?? "Unknown"}
Intel: ${account.intelNotes ?? "No intel available"}

Contact: ${contact.name}, ${contact.title ?? "Unknown title"}
Confidence tier: ${confidenceTier}

Output ONLY valid JSON with this shape:
{
  "giftingHook": "one sentence specific to this company/contact",
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

  const { data: validated, valid } = parseResearcherOutput(raw);
  const parsed = validated ?? {
    giftingHook: `${account.name} corporate gifting opportunity for ${contact.title ?? "HR/Admin"} team`,
    estimatedOrderValue: "₹2–8 lakhs",
    decisionChain: [contact.name],
    outreachHooks: ["Diwali season", "Premium mithai"],
    scoreFactors: [
      { label: "Purchase timeframe is", bold: "Diwali season" },
      { label: "Estimated budget is", bold: account.giftBudget ?? "unknown" },
    ],
  };
  if (!valid) {
    console.warn("[researcher-lite] LLM output failed schema validation for lead", leadId);
  }

  await db.insert(leadResearch).values({
    leadId,
    confidenceTier,
    confidenceScore,
    giftingHook: parsed.giftingHook,
    estimatedOrderValue: parsed.estimatedOrderValue,
    decisionChain: parsed.decisionChain ?? [],
    outreachHooks: parsed.outreachHooks ?? [],
    scoreFactors: parsed.scoreFactors ?? [],
    rawBrief: raw,
  });

  await db.update(leads).set({ status: "researched" }).where(eq(leads.id, leadId));
  await db.insert(yieldFunnel).values({ leadId, stage: "researched" });

  try {
    await generateWriterPlan(leadId);
  } catch (e) {
    console.warn("[researcher-lite] writer plan generation failed", leadId, e);
  }

  await deductCredits({
    tenantId: lead.tenantId,
    action: "research.brief",
    referenceId: leadId,
    idempotencyKey: `research-${leadId}`,
  });

  void notifyLeadEvent(leadId, "research.complete");
}
