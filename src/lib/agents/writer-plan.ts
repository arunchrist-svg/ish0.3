import { z } from "zod";
import { callLLM, type LLMProvider } from "@/lib/llm";
import { tierForAgentStep } from "@/lib/llm/routing-policy";
import { db, leadResearch, leads, contacts, accounts } from "@/db";
import { eq } from "drizzle-orm";
import type { WriterPlan } from "@/db/schema";
import { parseJsonObjectFromLLM } from "@/lib/llm/parse-json";
import { getResolvedEmailConfig } from "@/lib/settings/email-settings";
import type { BrandConfig } from "@/lib/email/config";
import type { CompanyOverview } from "@/lib/company-overview";
import {
  buildPersonalizationContext,
  formatPersonalizationContextForPrompt,
} from "@/lib/agents/personalization-context";

export const writerPlanSchema = z.object({
  hook: z.string().min(8),
  valueProp: z.string().min(8),
  cta: z.string().min(8),
});

export type ParsedWriterPlan = z.infer<typeof writerPlanSchema>;

export class ResearchNotReadyError extends Error {
  code = "RESEARCH_NOT_READY" as const;
  missing: string[];

  constructor(missing: string[]) {
    super(`Research brief incomplete: missing ${missing.join(", ")}`);
    this.name = "ResearchNotReadyError";
    this.missing = missing;
  }
}

export function getResearchQualityGaps(research: {
  outreachHook?: string | null;
  decisionChain?: string[] | null;
} | null | undefined): string[] {
  const gaps: string[] = [];
  if (!research?.outreachHook?.trim()) gaps.push("outreachHook");
  if (!research?.decisionChain?.length) gaps.push("decisionChain");
  return gaps;
}

export function assertResearchReadyForWriter(
  research: { outreachHook?: string | null; decisionChain?: string[] | null } | null | undefined,
): void {
  const gaps = getResearchQualityGaps(research);
  if (gaps.length) throw new ResearchNotReadyError(gaps);
}

export function fallbackResearchBrief(params: {
  contactName: string;
  contactTitle?: string | null;
  accountName: string;
  brandName: string;
}): { outreachHook: string; decisionChain: string[] } {
  return {
    outreachHook: `Seasonal corporate gifting for ${params.accountName}`,
    decisionChain: [params.contactName],
  };
}

export async function ensureResearchBriefForWriter(params: {
  leadId: string;
  contactName: string;
  contactTitle?: string | null;
  accountName: string;
  brandName: string;
  existing?: {
    id: string;
    outreachHook?: string | null;
    decisionChain?: string[] | null;
  } | null;
}): Promise<{ outreachHook: string; decisionChain: string[] }> {
  const fallback = fallbackResearchBrief(params);
  const outreachHook = params.existing?.outreachHook?.trim() || fallback.outreachHook;
  const decisionChain = params.existing?.decisionChain?.length
    ? params.existing.decisionChain
    : fallback.decisionChain;

  if (!params.existing) {
    await db.insert(leadResearch).values({
      leadId: params.leadId,
      confidenceTier: "low",
      outreachHook,
      decisionChain,
      outreachHooks: [outreachHook],
    });
  } else if (getResearchQualityGaps(params.existing).length) {
    await db
      .update(leadResearch)
      .set({ outreachHook, decisionChain })
      .where(eq(leadResearch.id, params.existing.id));
  }

  return { outreachHook, decisionChain };
}

export function formatWriterPlanForPrompt(plan: WriterPlan): string {
  return `Outreach plan (follow this structure):
- Hook: ${plan.hook}
- Value: ${plan.valueProp}
- CTA: ${plan.cta}`;
}

function brandAwareFallbackPlan(
  brand: BrandConfig,
  accountName: string,
  outreachHook?: string | null,
): ParsedWriterPlan {
  const product =
    brand.productSummary?.trim() ||
    `Corporate outreach options from ${brand.brandName}.`;

  return {
    hook: outreachHook?.trim() || `Thoughtful festive gifting for ${accountName}`,
    valueProp: product.split(".")[0].trim() + ".",
    cta: "Open to a tasting sample for your team?",
  };
}

export async function generateWriterPlan(
  leadId: string,
  options?: { llmProvider?: LLMProvider },
): Promise<WriterPlan> {
  const lead = await db.query.leads.findFirst({
    where: eq(leads.id, leadId),
    with: { contact: true, account: true },
  });
  if (!lead) throw new Error(`Lead ${leadId} not found`);

  const research = await db.query.leadResearch.findFirst({
    where: eq(leadResearch.leadId, leadId),
  });

  const contact = lead.contact as typeof contacts.$inferSelect;
  const account = lead.account as typeof accounts.$inferSelect;
  const emailConfig = await getResolvedEmailConfig(lead.workspaceId);
  const brand = emailConfig.brandConfig;
  const persona = buildPersonalizationContext({
    industry: account.industry,
    city: account.city,
    accountName: account.name,
    contactTitle: contact.title,
    intelNotes: account.intelNotes,
    overview: (account.companyOverview as CompanyOverview | null) ?? null,
    campaignMode: emailConfig.campaignMode,
    campaignNotes: emailConfig.campaignNotes,
    buyerPersonas: brand.buyerPersonas,
    decisionChain: research?.decisionChain,
  });

  const prompt = `Create a 3-part cold email plan for B2B corporate outreach.

Brand: ${brand.brandName} (${brand.vertical})
Product: ${brand.productSummary || "(use brand vertical only)"}
Writeup: ${brand.websiteInsights?.productWriteup || "(use product summary)"}
Email keywords: ${(brand.websiteInsights?.emailKeywords ?? []).join("; ") || "(none)"}
Tone: ${brand.toneNotes || "Friendly but professional. Plain and direct. Not salesy."}
${brand.websiteInsights?.valueProposition ? `Value prop: ${brand.websiteInsights.valueProposition}` : ""}
${brand.websiteInsights?.differentiators?.length ? `Differentiators: ${brand.websiteInsights.differentiators.join("; ")}` : ""}

${formatPersonalizationContextForPrompt(persona)}

Company: ${account.name}
Contact: ${contact.name}, ${contact.title ?? "unknown role"}
Outreach hook (do not copy verbatim): ${research?.outreachHook ?? "none"}
Intel (do not copy verbatim): ${account.intelNotes ?? "none"}

Rules:
- Value prop must match the brand product above. Never invent products the brand does not sell.
- Hook and value should use at most 1-2 email keywords when they fit.
- Translate industry, role, and market dynamics. Never invent numbers.
- Never use em dashes.

Output ONLY JSON:
{
  "hook": "one specific opening angle (no em dashes)",
  "valueProp": "one sentence on why our offer matters to them",
  "cta": "one soft CTA question for email 1"
}`;

  const raw = await callLLM({
    tier: tierForAgentStep("writer.plan"),
    system: "You output only valid JSON. No markdown.",
    prompt,
    maxTokens: 256,
    provider: options?.llmProvider,
    trace: {
      agent: "writer-plan",
      tenantId: lead.tenantId,
      workspaceId: lead.workspaceId,
      leadId,
      promptVersion: "v2-brand-aware",
    },
  });

  let plan: ParsedWriterPlan;
  try {
    const obj = parseJsonObjectFromLLM(raw);
    const parsed = writerPlanSchema.safeParse(obj);
    if (!parsed.success) throw parsed.error;
    plan = parsed.data;
  } catch {
    plan = brandAwareFallbackPlan(brand, account.name, research?.outreachHook);
  }

  const writerPlan: WriterPlan = {
    ...plan,
    source: "llm",
    updatedAt: new Date().toISOString(),
  };

  if (research) {
    await db
      .update(leadResearch)
      .set({ writerPlan })
      .where(eq(leadResearch.leadId, leadId));
  }

  return writerPlan;
}

export async function ensureWriterPlan(
  leadId: string,
  options?: { llmProvider?: LLMProvider },
): Promise<WriterPlan | null> {
  const research = await db.query.leadResearch.findFirst({
    where: eq(leadResearch.leadId, leadId),
  });
  if (!research) return null;

  const existing = research.writerPlan as WriterPlan | null;
  if (existing?.hook && existing.valueProp && existing.cta) {
    return existing;
  }

  if (options?.llmProvider === "openrouter") {
    return null;
  }

  return generateWriterPlan(leadId, options);
}

export async function updateWriterPlan(leadId: string, plan: ParsedWriterPlan): Promise<WriterPlan> {
  const writerPlan: WriterPlan = {
    ...plan,
    source: "user",
    updatedAt: new Date().toISOString(),
  };

  await db.update(leadResearch).set({ writerPlan }).where(eq(leadResearch.leadId, leadId));
  return writerPlan;
}
